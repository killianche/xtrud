// Вход и регистрация — замена GoTrue. Данные совместимы: строки auth.users и
// auth.identities создаются так же, как их создавал GoTrue (bcrypt, синтетическая
// почта phone@…), поэтому при откате старый стек видит те же аккаунты.
import bcrypt from "bcryptjs";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Config } from "../config.js";
import { type Db, pgErrorToHttp } from "../db.js";
import { hashRefresh, newRefreshToken, type Tokens } from "./jwt.js";
import { canonicalPhone, phoneKey, phoneToAuthEmail } from "./phone.js";

const registerSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: z.string().trim().min(10).max(20),
  // 8 знаков — как в приложении (2026-09-12). Вход старых паролей
  // не ломается: при входе длина не проверяется.
  password: z.string().min(8).max(200),
});
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

export function registerAuthRoutes(app: FastifyInstance, db: Db, tokens: Tokens, cfg: Config) {
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
    const email = phoneToAuthEmail(phone, cfg.PHONE_EMAIL_DOMAIN);
    const hash = await bcrypt.hash(input.password, 10);
    try {
      const user = await db.asService(async (c) => {
        // Одна функция от владельца базы: auth.users, auth.identities, имя и
        // телефон (0177). Роль API имеет только EXECUTE на неё.
        const r = await c.query<{ register_account: string }>(
          "SELECT xtrud_api.register_account($1, $2, $3, $4, $5)",
          [email, hash, phone, input.firstName, input.lastName],
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
    const user = await findByLogin(parsed.data.login);
    const ok = await bcrypt.compare(parsed.data.password, user?.encrypted_password ?? DUMMY_HASH);
    if (!user || !ok) return reply.code(401).send({ error: "Неверный телефон или пароль" });
    const blocked = blockedMessage(user);
    if (blocked) return reply.code(403).send({ error: blocked });
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
    if (!parsed.success) return reply.code(422).send({ error: "Новый пароль — от 6 символов" });
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
