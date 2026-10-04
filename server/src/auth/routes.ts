// Вход и регистрация — замена GoTrue. Данные совместимы: строки auth.users и
// auth.identities создаются так же, как их создавал GoTrue (bcrypt, синтетическая
// почта phone@…), поэтому при откате старый стек видит те же аккаунты.
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { type Db, pgErrorToHttp } from "../db.js";
import type { SmsSender } from "../sms/smsru.js";
import { hashRefresh, newRefreshToken, type Tokens } from "./jwt.js";
import { LoginAttempts, loginAttemptKey } from "./login-attempts.js";
import { canonicalPhone, isPhoneLogin, phoneKey, phoneToAuthEmail } from "./phone.js";
import { type CodePurpose, PhoneCodes } from "./phone-codes.js";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  // Фамилия необязательна (DECISION владельца 2026-09-22); пустая → NULL.
  lastName: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().min(10).max(20),
  // 8 знаков — как в приложении (2026-09-12). Вход старых паролей
  // не ломается: при входе длина не проверяется.
  password: z.string().min(8).max(200),
  /** Подтверждение номера кодом из SMS (/auth/code/verify), если требуется. */
  verificationToken: z.string().min(20).max(100).optional(),
});
const purposeSchema = z.enum(["register", "reset"]);
const sendCodeSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  purpose: purposeSchema,
});
const verifyCodeSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  purpose: purposeSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
const resetSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  verificationToken: z.string().min(20).max(100),
  newPassword: z.string().min(8).max(200),
});
/** SMS-код — только на мобильные номера России: защита от отправок за рубеж за наш счёт. */
const RU_MOBILE = /^\+79\d{9}$/;
const SEND_LIMIT_TEXT: Record<"phone_daily" | "ip_hourly" | "global_daily", string> = {
  phone_daily: "На этот номер сегодня уже отправлено много кодов. Попробуйте завтра.",
  ip_hourly: "Слишком много запросов кода. Попробуйте через час.",
  global_daily: "Отправка SMS временно недоступна. Попробуйте позже.",
};
/** Общий текст: статус бана или удаления по одному номеру не раскрываем (L1). */
const RESET_BLOCKED_TEXT = "Восстановить доступ не получится. Напишите в поддержку — поможем.";
const RESET_UNAVAILABLE = {
  error:
    "Восстановить пароль по SMS для этого номера не получится. Напишите в поддержку — поможем.",
  code: "reset_unavailable",
};
const VERIFY_TEXT: Record<"invalid" | "expired" | "too_many", string> = {
  invalid: "Неверный код",
  expired: "Код истёк — запросите новый",
  too_many: "Слишком много попыток — запросите новый код",
};
const loginSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
});
const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

interface AuthUserRow {
  id: string;
  email: string | null;
  phone: string | null;
  encrypted_password: string | null;
  banned_until: string | null;
  deleted_at: string | null;
  /** public.users.status — бан админкой живёт здесь (0177f). */
  user_status: string | null;
}

// Хеш-пустышка: сравнение выполняется и для несуществующего аккаунта, чтобы
// по времени ответа нельзя было перечислять номера.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Y7p4E7g0vX3s6f1G9o7z4h1j2k3l4";

function blockedMessage(user: AuthUserRow): string | null {
  if (user.deleted_at) return "Аккаунт удалён";
  if (user.user_status === "banned" || user.user_status === "deleted") {
    return "Аккаунт заблокирован. Обратитесь в поддержку.";
  }
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    return "Аккаунт заблокирован. Обратитесь в поддержку.";
  }
  return null;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Db,
  tokens: Tokens,
  cfg: Config,
  loginAttempts: LoginAttempts = new LoginAttempts(),
  sms: SmsSender | null = null,
  codes: PhoneCodes = new PhoneCodes(cfg.SMS_DAILY_CAP),
) {
  const codeAtRegistration = sms !== null && cfg.SMS_REGISTRATION_REQUIRED === "true";
  const issueSession = async (user: AuthUserRow) => {
    const refresh = newRefreshToken();
    const sessionId = await db.asService(async (c) => {
      const r = await c.query<{ id: string }>(
        `INSERT INTO xtrud_api.refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + ($3 || ' days')::interval) RETURNING id`,
        [user.id, refresh.hash, String(cfg.REFRESH_TTL_DAYS)],
      );
      await c.query("SELECT xtrud_api.touch_sign_in($1)", [user.id]);
      return r.rows[0]?.id ?? "";
    });
    const access = await tokens.signAccess(
      { id: user.id, email: user.email, phone: user.phone },
      sessionId,
    );
    return {
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken: refresh.raw,
      user: { id: user.id, email: user.email, phone: user.phone },
    };
  };

  const findByLogin = async (login: string): Promise<AuthUserRow | null> =>
    db.asService(async (c) => {
      const r = await c.query<AuthUserRow>("SELECT * FROM xtrud_api.find_account($1)", [
        login.trim(),
      ]);
      return r.rows[0] ?? null;
    });
  const findById = async (id: string): Promise<AuthUserRow | null> =>
    db.asService(async (c) => {
      const r = await c.query<AuthUserRow>("SELECT * FROM xtrud_api.account_by_id($1)", [id]);
      return r.rows[0] ?? null;
    });

  app.post("/auth/register", async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(422)
        .send({ error: "Заполните имя, фамилию, телефон и пароль (от 8 символов)" });
    const input = parsed.data;
    const phone = canonicalPhone(input.phone);
    const key = phoneKey(phone);
    if (!key) return reply.code(422).send({ error: "Введите номер полностью" });
    if (codeAtRegistration && !RU_MOBILE.test(phone)) {
      return reply.code(422).send({
        error: "Регистрация — по мобильному номеру России",
        code: "phone_not_supported",
      });
    }
    // Подтверждение — для полного номера, не для последних 10 цифр (H1).
    if (
      codeAtRegistration &&
      !(input.verificationToken && codes.consumeToken(input.verificationToken, phone, "register"))
    ) {
      // Новые сборки подтверждают номер до этого запроса; сюда без токена
      // приходят только старые — им нужен текст про обновление.
      return reply.code(428).send({
        error: "Подтвердите номер кодом из SMS. Если кода не было — обновите приложение.",
        code: "phone_verification_required",
      });
    }
    const email = phoneToAuthEmail(phone, cfg.PHONE_EMAIL_DOMAIN);
    const hash = await bcrypt.hash(input.password, 10);
    try {
      const user = await db.asService(async (c) => {
        // Одна функция от владельца базы: auth.users, auth.identities, имя и
        // телефон (0177). Роль API имеет только EXECUTE на неё.
        const r = await c.query<{ register_account: string }>(
          "SELECT xtrud_api.register_account($1, $2, $3, $4, $5)",
          [email, hash, phone, input.firstName, input.lastName || null],
        );
        const id = r.rows[0]?.register_account;
        if (!id) throw new Error("register failed");
        const u = await c.query<AuthUserRow>("SELECT * FROM xtrud_api.account_by_id($1)", [id]);
        const row = u.rows[0];
        if (!row) throw new Error("register failed");
        return row;
      });
      return reply.code(201).send(await issueSession(user));
    } catch (e) {
      const http = pgErrorToHttp(e);
      req.log.error({ err: e }, "register failed");
      // Наружу — только заготовленный текст «номер уже занят»; остальное общее.
      return reply
        .code(http.status)
        .send({ error: http.status === 409 ? (e as Error).message : http.message });
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите телефон и пароль" });
    // Лимит неудач на номер: с этого адреса и в целом (auth/login-attempts.ts).
    // Точного времени не обещаем — окна у двух счётчиков разные.
    const attemptKey = loginAttemptKey(parsed.data.login);
    if (loginAttempts.blocked(attemptKey, req.ip)) {
      return reply.code(429).send({
        error: "Слишком много попыток входа. Попробуйте позже.",
        code: "login_rate_limited",
      });
    }
    const user = await findByLogin(parsed.data.login);
    const ok = await bcrypt.compare(parsed.data.password, user?.encrypted_password ?? DUMMY_HASH);
    // Номера нет вовсе — приложение сразу откроет регистрацию с этим номером.
    // Что номер свободен, и так видно по регистрации («номер уже занят»),
    // поэтому отдельный ответ ничего нового не раскрывает; перебор держит лимит.
    if (!user && isPhoneLogin(parsed.data.login)) {
      loginAttempts.fail(attemptKey, req.ip);
      return reply
        .code(404)
        .send({ error: "Аккаунта с этим номером нет", code: "account_not_found" });
    }
    if (!user || !ok) {
      loginAttempts.fail(attemptKey, req.ip);
      return reply.code(401).send({ error: "Неверный телефон или пароль" });
    }
    loginAttempts.succeed(attemptKey, req.ip);
    const blocked = blockedMessage(user);
    if (blocked) return reply.code(403).send({ error: blocked });
    return reply.send(await issueSession(user));
  });

  /** Что включено на сервере — приложение по этому решает, спрашивать ли код. */
  app.get("/auth/options", async () => ({
    phoneCodeAtRegistration: codeAtRegistration,
    passwordResetBySms: sms !== null,
  }));

  app.post("/auth/code/send", async (req, reply) => {
    if (!sms) {
      return reply
        .code(503)
        .send({ error: "Отправка SMS сейчас недоступна", code: "sms_disabled" });
    }
    const parsed = sendCodeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
    const phone = canonicalPhone(parsed.data.phone);
    const key = phoneKey(phone);
    if (!key || !RU_MOBILE.test(phone)) {
      return reply.code(422).send({
        error: "Код отправляем только на мобильные номера России",
        code: "phone_not_supported",
      });
    }
    const purpose: CodePurpose = parsed.data.purpose;
    const user = await findByLogin(phone);
    // Что номер занят или свободен, и так видно по регистрации и входу
    // (409 / account_not_found), поэтому здесь ответ тот же — а SMS на
    // заведомо бесполезный номер не тратится.
    if (purpose === "register" && user) {
      return reply
        .code(409)
        .send({ error: "Этот номер уже зарегистрирован. Войдите.", code: "phone_taken" });
    }
    if (purpose === "reset") {
      if (!user) {
        return reply
          .code(404)
          .send({ error: "Аккаунта с этим номером нет", code: "account_not_found" });
      }
      if (blockedMessage(user)) return reply.code(403).send({ error: RESET_BLOCKED_TEXT });
      // Аккаунт находится по последним 10 цифрам, а SMS уходит на номер из
      // запроса — поэтому номер аккаунта обязан совпасть полностью: иначе код
      // на +7 917… открыл бы аккаунт с номером +1 917… (ревью H1, 2026-10-04).
      if (canonicalPhone(user.phone ?? "") !== phone) {
        return reply.code(422).send(RESET_UNAVAILABLE);
      }
    }
    const check = codes.check(phone, purpose, req.ip);
    if (!check.ok) {
      return reply.code(429).send(
        check.reason === "cooldown"
          ? {
              error: `Новый код можно запросить через ${check.retryInSec} с`,
              code: "code_cooldown",
              retryInSec: check.retryInSec,
            }
          : { error: SEND_LIMIT_TEXT[check.reason], code: "code_rate_limited" },
      );
    }
    const code = codes.issue(phone, purpose, req.ip);
    if (codes.usage(purpose) === Math.ceil(cfg.SMS_DAILY_CAP * 0.8)) {
      req.log.warn({ purpose, cap: cfg.SMS_DAILY_CAP }, "sms daily cap 80% reached");
    }
    const sent = await sms.send(phone, `Код xtrud: ${code}. Никому его не сообщайте.`);
    if (!sent.ok) {
      codes.discard(phone, purpose);
      // Номер в журнал не пишем — только последние две цифры.
      req.log.warn({ reason: sent.reason, tail: key.slice(-2) }, "sms send failed");
      if (sent.reason === "invalid_number") {
        return reply
          .code(422)
          .send({ error: "Проверьте номер — на него нельзя отправить SMS", code: "phone_invalid" });
      }
      if (sent.reason === "unreachable") {
        return reply.code(502).send({
          error: "Не получилось отправить SMS на этот номер. Напишите в поддержку — поможем.",
          code: "sms_unreachable",
        });
      }
      return reply.code(503).send({
        error: "Отправка SMS временно недоступна. Попробуйте позже.",
        code: "sms_unavailable",
      });
    }
    return reply.send({ sent: true, resendInSec: 60 });
  });

  app.post("/auth/code/verify", async (req, reply) => {
    const parsed = verifyCodeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите 6 цифр из SMS" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!RU_MOBILE.test(phone)) return reply.code(422).send({ error: "Введите номер полностью" });
    const result = codes.verify(phone, parsed.data.purpose, parsed.data.code);
    if (!result.ok) {
      return reply
        .code(result.reason === "invalid" ? 400 : 410)
        .send({ error: VERIFY_TEXT[result.reason], code: `code_${result.reason}` });
    }
    return reply.send({ verificationToken: result.token });
  });

  /** Новый пароль по коду из SMS — «Забыли пароль?». */
  app.post("/auth/password/reset", async (req, reply) => {
    if (!sms) {
      return reply
        .code(503)
        .send({ error: "Отправка SMS сейчас недоступна", code: "sms_disabled" });
    }
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Новый пароль — от 8 символов" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!RU_MOBILE.test(phone)) return reply.code(422).send({ error: "Введите номер полностью" });
    if (!codes.consumeToken(parsed.data.verificationToken, phone, "reset")) {
      return reply.code(400).send({
        error: "Подтверждение устарело — запросите код заново",
        code: "verification_invalid",
      });
    }
    const user = await findByLogin(phone);
    if (!user) {
      return reply
        .code(404)
        .send({ error: "Аккаунта с этим номером нет", code: "account_not_found" });
    }
    if (blockedMessage(user)) return reply.code(403).send({ error: RESET_BLOCKED_TEXT });
    if (canonicalPhone(user.phone ?? "") !== phone) {
      return reply.code(422).send(RESET_UNAVAILABLE);
    }
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.asService(async (c) => {
      await c.query("SELECT xtrud_api.set_password_hash($1, $2)", [user.id, hash]);
      // Все прежние сессии — вон: пароль меняют, когда доступ потерян.
      await c.query(
        "UPDATE xtrud_api.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [user.id],
      );
    });
    loginAttempts.succeed(loginAttemptKey(phone), req.ip);
    return reply.send(await issueSession(user));
  });

  app.post("/auth/refresh", async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Нет refresh-токена" });
    const hash = hashRefresh(parsed.data.refreshToken);
    // Сначала проверяем аккаунт, и только затем сжигаем токен.
    const owner = await db.asService(async (c) => {
      const r = await c.query<{ user_id: string }>(
        "SELECT user_id FROM xtrud_api.refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()",
        [hash],
      );
      return r.rows[0]?.user_id ?? null;
    });
    const result = owner ? await findById(owner) : null;
    if (result && blockedMessage(result))
      return reply.code(403).send({ error: blockedMessage(result) });
    if (result) {
      const rotated = await db.asService(async (c) => {
        const r = await c.query(
          "UPDATE xtrud_api.refresh_tokens SET rotated_at = now(), revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL RETURNING id",
          [hash],
        );
        return (r.rowCount ?? 0) > 0;
      });
      if (!rotated) return reply.code(401).send({ error: "Сессия истекла. Войдите заново." });
    }
    if (!result) return reply.code(401).send({ error: "Сессия истекла. Войдите заново." });
    return reply.send(await issueSession(result));
  });

  /** Переезд сессии: refresh-токен GoTrue из старой сборки → наша сессия. */
  app.post("/auth/exchange", async (req, reply) => {
    const parsed = z.object({ gotrueRefreshToken: z.string().min(8).max(400) }).safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Нет токена" });
    const userId = await db.asService(async (c) => {
      const r = await c.query<{ consume_gotrue_refresh: string | null }>(
        "SELECT xtrud_api.consume_gotrue_refresh($1)",
        [parsed.data.gotrueRefreshToken],
      );
      return r.rows[0]?.consume_gotrue_refresh ?? null;
    });
    const user = userId ? await findById(userId) : null;
    if (!user || user.deleted_at)
      return reply.code(401).send({ error: "Сессия истекла. Войдите заново." });
    return reply.send(await issueSession(user));
  });

  app.post("/auth/logout", async (req, reply) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (parsed.success) {
      await db.asService((c) =>
        c.query(
          "UPDATE xtrud_api.refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
          [hashRefresh(parsed.data.refreshToken)],
        ),
      );
    }
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req, reply) => {
    const claims = await tokens.verify(bearer(req.headers.authorization));
    if (!claims) return reply.code(401).send({ error: "Нужен вход" });
    return reply.send({ id: claims.sub, email: claims.email ?? null, phone: claims.phone ?? null });
  });

  app.post("/auth/password", async (req, reply) => {
    const claims = await tokens.verify(bearer(req.headers.authorization));
    if (!claims) return reply.code(401).send({ error: "Нужен вход" });
    const parsed = passwordSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Новый пароль — от 8 символов" });
    const user = await findById(claims.sub);
    const ok = user?.encrypted_password
      ? await bcrypt.compare(parsed.data.currentPassword, user.encrypted_password)
      : false;
    if (!user || !ok) return reply.code(403).send({ error: "Текущий пароль неверный" });
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.asService(async (c) => {
      await c.query("SELECT xtrud_api.set_password_hash($1, $2)", [user.id, hash]);
      await c.query(
        "UPDATE xtrud_api.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [user.id],
      );
    });
    return reply.send(await issueSession(user));
  });
}

export function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}
