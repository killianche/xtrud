// Вход и регистрация — замена GoTrue. Данные совместимы: строки auth.users и
// auth.identities создаются так же, как их создавал GoTrue (bcrypt, синтетическая
// почта phone@…), поэтому при откате старый стек видит те же аккаунты.
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { type Db, pgErrorToHttp } from "../db.js";
import { CallChecks, type CallPurpose, type PendingCheck } from "./call-checks.js";
import { hashRefresh, newRefreshToken, type Tokens } from "./jwt.js";
import { FailureWindow, LoginAttempts, loginAttemptKey } from "./login-attempts.js";
import { canonicalPhone, isPhoneLogin, phoneKey, phoneToAuthEmail } from "./phone.js";
import type { CallCheckProvider } from "./smsru-callcheck.js";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  // Фамилия необязательна (DECISION владельца 2026-09-22); пустая → NULL.
  lastName: z.string().trim().max(60).optional().default(""),
  phone: z.string().trim().min(10).max(20),
  // 8 знаков — как в приложении (2026-09-12). Вход старых паролей
  // не ломается: при входе длина не проверяется.
  password: z.string().min(8).max(200),
  /** Подтверждение номера обратным звонком (/auth/call/status), если включено. */
  verificationToken: z.string().min(20).max(100).optional(),
});
const callStartSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  secret: z.string().max(64).optional(),
  /** Регистрация (по умолчанию), восстановление пароля, смена номера. */
  purpose: z.enum(["register", "recover", "change_phone"]).optional().default("register"),
});
const recoverSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  verificationToken: z.string().min(20).max(100),
  newPassword: z.string().min(8).max(200),
});
const changePhoneSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  verificationToken: z.string().min(20).max(100),
});
const callStatusSchema = z.object({
  phone: z.string().trim().min(10).max(20),
  secret: z.string().min(16).max(64),
});
/** Звонок — только на мобильные номера России. */
const RU_MOBILE = /^\+79\d{9}$/;
const CALL_LIMIT_TEXT: Record<"phone_daily" | "ip_hourly" | "global", string> = {
  phone_daily: "Для этого номера сегодня уже много попыток. Попробуйте завтра.",
  ip_hourly: "Слишком много запросов. Попробуйте через час.",
  global: "Подтверждение звонком временно недоступно. Попробуйте позже.",
};
const loginSchema = z.object({
  login: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
});
const recoverySchema = z.object({ phone: z.string().trim().min(10).max(20) });
const phoneStatusSchema = z.object({ phone: z.string().trim().min(10).max(20) });
/** Проверок номера с одного адреса — не больше 30 в час. */
const PHONE_STATUS_PER_IP = 30;
/** Заявок с одного адреса — не больше 5 в час: форма без входа. */
const RECOVERY_PER_IP = 5;
const RECOVERY_WINDOW_MS = 60 * 60_000;
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
  recoveryWindow: FailureWindow = new FailureWindow(RECOVERY_PER_IP, RECOVERY_WINDOW_MS),
  phoneStatusWindow: FailureWindow = new FailureWindow(PHONE_STATUS_PER_IP, RECOVERY_WINDOW_MS),
  callProvider: CallCheckProvider | null = null,
  calls: CallChecks = new CallChecks(cfg.CALLCHECK_DAILY_CAP, cfg.CALLCHECK_HOURLY_CAP),
) {
  // С ключом SMS.ru регистрация требует подтверждения номера звонком.
  const callRequired = callProvider !== null;
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
  // Push владельцу «Пароль изменён / Номер изменён — если не вы, в
  // поддержку» (ревью xtrud-security, M1: восстановление одним звонком).
  // Тексты — в базе (0220); сбой уведомления не отменяет само действие.
  const notifySecurity = async (userId: string, kind: "password_changed" | "phone_changed") => {
    try {
      await db.asService(async (c) => {
        await c.query("SELECT xtrud_private.notify_security_event($1, $2)", [userId, kind]);
      });
    } catch (e) {
      app.log.warn({ code: (e as { code?: string }).code, kind }, "security notify failed");
    }
  };
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
    if (callRequired) {
      if (!RU_MOBILE.test(phone)) {
        return reply.code(422).send({
          error: "Регистрация — по мобильному номеру России",
          code: "phone_not_supported",
        });
      }
      // Подтверждение — для полного номера; без него — только старые сборки.
      if (
        !(input.verificationToken && calls.tokenValid(input.verificationToken, phone, "register"))
      ) {
        return reply.code(428).send({
          error: "Подтвердите номер звонком. Если такого шага не было — обновите приложение.",
          code: "phone_verification_required",
        });
      }
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
      // Аккаунт записан — подтверждение номера израсходовано.
      if (input.verificationToken) {
        calls.consumeToken(input.verificationToken, phone, "register");
      }
      return reply.code(201).send(await issueSession(user));
    } catch (e) {
      const http = pgErrorToHttp(e);
      req.log.error({ err: e }, "register failed");
      // Номер уже занят — подтверждение больше ни к чему.
      if (http.status === 409 && input.verificationToken) {
        calls.consumeToken(input.verificationToken, phone, "register");
      }
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

  /**
   * «Забыли пароль?» — заявка «перезвоните мне» (DECISION владельца
   * 2026-10-04: SMS не нужен, восстанавливаем по звонку). База находит
   * аккаунт так же, как вход, записывает номер АККАУНТА и шлёт push админам
   * (0214). Ответ — тот же для новой и повторной заявки.
   */
  app.post("/auth/recovery-request", async (req, reply) => {
    const parsed = recoverySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!phoneKey(phone)) return reply.code(422).send({ error: "Введите номер полностью" });
    if (recoveryWindow.blocked(req.ip)) {
      return reply.code(429).send({
        error: "Слишком много заявок. Попробуйте через час.",
        code: "recovery_rate_limited",
      });
    }
    recoveryWindow.fail(req.ip);
    const result = await db.asService(async (c) => {
      const r = await c.query<{ create_recovery_request: string }>(
        "SELECT xtrud_private.create_recovery_request($1)",
        [phone],
      );
      return r.rows[0]?.create_recovery_request ?? "not_found";
    });
    if (result === "not_found") {
      return reply
        .code(404)
        .send({ error: "Аккаунта с этим номером нет", code: "account_not_found" });
    }
    if (result === "blocked") {
      return reply.code(403).send({
        error: "Восстановить доступ не получится. Напишите в поддержку.",
        code: "recovery_blocked",
      });
    }
    return reply.send({ ok: true, alreadyRequested: result === "exists" });
  });

  /**
   * Первый шаг входа (№202, 2026-10-04): «Ваш номер» → есть аккаунт —
   * пароль, нет — регистрация. Что номер занят, и так видно по входу
   * (account_not_found) и регистрации (409); здесь — тот же ответ без
   * пароля, под своим лимитом на адрес.
   */
  app.post("/auth/phone-status", async (req, reply) => {
    const parsed = phoneStatusSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!phoneKey(phone)) return reply.code(422).send({ error: "Введите номер полностью" });
    if (phoneStatusWindow.blocked(req.ip)) {
      return reply.code(429).send({
        error: "Слишком много попыток. Попробуйте через час.",
        code: "phone_status_rate_limited",
      });
    }
    phoneStatusWindow.fail(req.ip);
    const user = await findByLogin(phone);
    return reply.send({ exists: user !== null });
  });

  /** Что включено: приложение по этому решает, спрашивать ли звонок. */
  app.get("/auth/options", async () => ({
    phoneCallAtRegistration: callRequired,
    // С тем же ключом SMS.ru — восстановление пароля и смена номера звонком
    // (№215, №220); без него — заявка «Перезвоните мне» и смена номера
    // недоступна.
    phoneCallRecovery: callRequired,
    phoneCallPhoneChange: callRequired,
  }));

  /** Выдать номер, на который человек позвонит для подтверждения (№209). */
  app.post("/auth/call/start", async (req, reply) => {
    if (!callProvider) {
      return reply
        .code(503)
        .send({ error: "Подтверждение звонком выключено", code: "call_disabled" });
    }
    const parsed = callStartSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!RU_MOBILE.test(phone)) {
      return reply.code(422).send({
        error: "Подтверждаем только мобильные номера России",
        code: "phone_not_supported",
      });
    }
    // Ответ «номер занят» — под тем же лимитом, что проверка номера (ревью L1).
    if (phoneStatusWindow.blocked(req.ip)) {
      return reply.code(429).send({
        error: "Слишком много попыток. Попробуйте через час.",
        code: "phone_status_rate_limited",
      });
    }
    phoneStatusWindow.fail(req.ip);
    const purpose: CallPurpose = parsed.data.purpose;
    const account = await findByLogin(phone);
    let userId: string | null = null;
    if (purpose === "register" && account) {
      return reply
        .code(409)
        .send({ error: "Этот номер уже зарегистрирован. Войдите.", code: "phone_taken" });
    }
    if (purpose === "recover") {
      if (!account) {
        return reply.code(404).send({
          error: "Аккаунта с этим номером нет. Зарегистрируйтесь.",
          code: "account_not_found",
        });
      }
      // Блокировку не раскрываем до звонка (ревью L5) — её проверит
      // /auth/recover. Подтверждение — только этому аккаунту (ревью L4).
      userId = account.id;
    }
    if (purpose === "change_phone") {
      // Смена номера — только из своего аккаунта, на свободный номер.
      const claims = await tokens.verify(bearer(req.headers.authorization));
      if (!claims) return reply.code(401).send({ error: "Нужен вход" });
      userId = claims.sub;
      const me = await findById(userId);
      const blocked = me ? blockedMessage(me) : "Нужен вход";
      if (blocked) return reply.code(403).send({ error: blocked, code: "account_blocked" });
      if (account && account.id === userId) {
        return reply.code(422).send({ error: "Это ваш текущий номер.", code: "phone_same" });
      }
      if (account) {
        return reply
          .code(409)
          .send({ error: "Этот номер уже занят другим аккаунтом.", code: "phone_taken" });
      }
    }
    const now = Date.now();
    const toClient = (c: PendingCheck) => ({
      secret: c.secret,
      callPhone: c.callPhone,
      callPhonePretty: c.callPhonePretty,
      expiresInSec: Math.max(1, Math.round((c.expiresAt - now) / 1000)),
    });
    // Номер уже выдан и ещё действует: тому же клиенту — тот же номер, другому —
    // отказ до конца срока (см. call-checks.ts, «привязка к тому, кто начал»).
    const existing = calls.active(phone);
    if (existing) {
      if (calls.owns(existing, parsed.data.secret)) {
        // Тот же клиент, та же цель — тот же номер. Другая цель (передумал:
        // не регистрация, а «Забыли пароль?») — прежняя проверка снимается.
        if (existing.purpose === purpose && existing.userId === userId) {
          return reply.send(toClient(existing));
        }
        calls.forget(phone);
      } else {
        const retryInSec = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
        req.log.info({ tail: phone.slice(-2) }, "call check busy");
        return reply.code(429).send({
          error: `Этот номер уже ждёт звонка. Попробуйте через ${Math.ceil(retryInSec / 60)} мин.`,
          code: "call_busy",
          retryInSec,
        });
      }
    }
    const can = calls.canStart(phone, req.ip);
    if (!can.ok) {
      req.log.warn({ reason: can.reason, tail: phone.slice(-2) }, "call check limited");
      return reply
        .code(429)
        .send({ error: CALL_LIMIT_TEXT[can.reason], code: "call_rate_limited" });
    }
    calls.countStart(phone, req.ip, purpose, userId);
    const added = await callProvider.add(phone, req.ip || null);
    if (!added.ok) {
      req.log.warn(
        { reason: added.reason, code: added.code, tail: phone.slice(-2) },
        "call check start failed",
      );
      calls.forget(phone);
      return reply.code(added.reason === "invalid_number" ? 422 : 503).send({
        error:
          added.reason === "invalid_number"
            ? "Этот номер не подходит. Проверьте его."
            : "Подтверждение звонком сейчас недоступно. Попробуйте через минуту.",
        code: added.reason === "invalid_number" ? "phone_invalid" : "call_unavailable",
      });
    }
    const entry = calls.remember(phone, {
      checkId: added.checkId,
      callPhone: added.callPhone,
      callPhonePretty: added.callPhonePretty,
    });
    return reply.send(toClient(entry));
  });

  /**
   * Был ли звонок: приложение спрашивает раз в 3 с. Свой лимит: общий
   * лимит /auth (20 в минуту с адреса) опрос выбрал бы за минуту и закрыл
   * вход соседям за тем же адресом оператора (ревью M1). К SMS.ru — не чаще
   * раза в 2 с на номер (shouldPoll).
   */
  app.post(
    "/auth/call/status",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!callProvider) {
        return reply
          .code(503)
          .send({ error: "Подтверждение звонком выключено", code: "call_disabled" });
      }
      const parsed = callStatusSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
      const phone = canonicalPhone(parsed.data.phone);
      const entry = calls.active(phone);
      if (!entry || !calls.owns(entry, parsed.data.secret)) {
        return reply
          .code(410)
          .send({ error: "Время вышло — получите новый номер", code: "call_expired" });
      }
      if (!calls.shouldPoll(entry)) return reply.send({ confirmed: false });
      const status = await callProvider.status(entry.checkId);
      if (status === "confirmed") {
        const verificationToken = calls.confirm(phone, entry);
        if (!verificationToken) {
          return reply
            .code(410)
            .send({ error: "Время вышло — получите новый номер", code: "call_expired" });
        }
        return reply.send({ confirmed: true, verificationToken });
      }
      if (status === "expired") {
        calls.forget(phone);
        return reply
          .code(410)
          .send({ error: "Время вышло — получите новый номер", code: "call_expired" });
      }
      if (status === "provider_error") {
        req.log.warn({ tail: phone.slice(-2) }, "call check status: provider error");
      }
      // Сбой провайдера — тоже «ждём»: следующий опрос спросит снова.
      return reply.send({ confirmed: false });
    },
  );

  /**
   * Восстановление пароля после подтверждения номера звонком (№215):
   * новый пароль, все прежние входы отзываются, человек сразу входит.
   */
  app.post("/auth/recover", async (req, reply) => {
    if (!callProvider) {
      return reply
        .code(503)
        .send({ error: "Подтверждение звонком выключено", code: "call_disabled" });
    }
    const parsed = recoverSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(422).send({ error: "Новый пароль — от 8 символов" });
    }
    const phone = canonicalPhone(parsed.data.phone);
    if (!RU_MOBILE.test(phone)) return reply.code(422).send({ error: "Введите номер полностью" });
    const user = await findByLogin(phone);
    if (!user || !calls.tokenValid(parsed.data.verificationToken, phone, "recover", user.id)) {
      return reply.code(428).send({
        error: "Подтвердите номер звонком ещё раз.",
        code: "phone_verification_required",
      });
    }
    const blocked = blockedMessage(user);
    if (blocked) {
      calls.consumeToken(parsed.data.verificationToken, phone, "recover", user.id);
      return reply.code(403).send({ error: blocked, code: "account_blocked" });
    }
    const hash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.asService(async (c) => {
      await c.query("SELECT xtrud_api.set_password_hash($1, $2)", [user.id, hash]);
      await c.query(
        "UPDATE xtrud_api.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [user.id],
      );
    });
    calls.consumeToken(parsed.data.verificationToken, phone, "recover", user.id);
    await notifySecurity(user.id, "password_changed");
    // Счётчик неудачных входов с этого адреса — сброшен: пароль новый.
    loginAttempts.succeed(loginAttemptKey(phone), req.ip);
    req.log.info({ tail: phone.slice(-2) }, "password recovered by call");
    return reply.send(await issueSession(user));
  });

  /**
   * Смена номера после подтверждения звонком с нового номера (№220). Номер —
   * это и вход: меняется вместе с синтетическим адресом входа, прежние входы
   * отзываются, текущему устройству выдаётся новый вход.
   */
  app.post("/auth/phone", async (req, reply) => {
    const claims = await tokens.verify(bearer(req.headers.authorization));
    if (!claims) return reply.code(401).send({ error: "Нужен вход" });
    if (!callProvider) {
      return reply
        .code(503)
        .send({ error: "Подтверждение звонком выключено", code: "call_disabled" });
    }
    const parsed = changePhoneSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: "Введите номер полностью" });
    const phone = canonicalPhone(parsed.data.phone);
    if (!RU_MOBILE.test(phone)) {
      return reply.code(422).send({
        error: "Подтверждаем только мобильные номера России",
        code: "phone_not_supported",
      });
    }
    if (!calls.tokenValid(parsed.data.verificationToken, phone, "change_phone", claims.sub)) {
      return reply.code(428).send({
        error: "Подтвердите новый номер звонком ещё раз.",
        code: "phone_verification_required",
      });
    }
    const user = await findById(claims.sub);
    if (!user) return reply.code(401).send({ error: "Нужен вход" });
    const blocked = blockedMessage(user);
    if (blocked) return reply.code(403).send({ error: blocked, code: "account_blocked" });
    try {
      await db.asService(async (c) => {
        await c.query("SELECT xtrud_private.change_account_phone($1, $2)", [user.id, phone]);
      });
    } catch (e) {
      const http = pgErrorToHttp(e);
      // Только код: текст ошибки индекса содержит номер (ревью L6).
      req.log.warn(
        { code: (e as { code?: string }).code, tail: phone.slice(-2) },
        "change phone failed",
      );
      return reply.code(http.status).send({
        error: http.status === 409 ? "Этот номер уже занят другим аккаунтом." : http.message,
        code: http.status === 409 ? "phone_taken" : undefined,
      });
    }
    calls.consumeToken(parsed.data.verificationToken, phone, "change_phone", claims.sub);
    await notifySecurity(user.id, "phone_changed");
    const updated = await findById(user.id);
    if (!updated) return reply.code(500).send({ error: "Ошибка сервера" });
    req.log.info({ tail: phone.slice(-2) }, "phone changed by call");
    return reply.send(await issueSession(updated));
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
    await notifySecurity(user.id, "password_changed");
    return reply.send(await issueSession(user));
  });
}

export function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
}
