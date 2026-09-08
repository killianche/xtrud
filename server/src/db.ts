// Доступ к PostgreSQL. Каждый запрос пользователя выполняется в транзакции с
// ролью anon|authenticated и claims JWT в request.jwt.claims — ровно так, как
// это делал PostgREST. Все политики RLS и функции SECURITY DEFINER в базе
// работают без изменений (docs/BACKEND_REWRITE_PLAN.md §2).
import pg from "pg";

export type Claims = { sub: string; role: "authenticated"; email?: string; phone?: string } | null;

export class Db {
  readonly pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }

  /** Выполнить fn под пользователем (или анонимом), в одной транзакции. */
  async asUser<T>(claims: Claims, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const role = claims ? "authenticated" : "anon";
      await client.query(`SET LOCAL ROLE ${role}`);
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(claims ? { ...claims, aud: "authenticated" } : { role: "anon" }),
      ]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /** Служебные операции самого API (вход, регистрация, refresh) — от роли xtrud_api. */
  async asService<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '15s'");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}

/** Ошибка PostgreSQL → HTTP-статус и текст для клиента. */
export function pgErrorToHttp(e: unknown): { status: number; message: string; code?: string } {
  const err = e as { code?: string; message?: string; detail?: string; hint?: string };
  const code = err.code ?? "";
  if (code === "42501") return { status: 403, message: err.message ?? "Нет доступа", code };
  if (code === "P0002") return { status: 404, message: err.message ?? "Не найдено", code };
  if (code === "23505") return { status: 409, message: err.message ?? "Уже существует", code };
  if (
    code === "P0001" ||
    code === "23514" ||
    code === "22023" ||
    code === "22P02" ||
    code === "22P05"
  ) {
    return { status: 422, message: err.message ?? "Неверные данные", code };
  }
  if (code === "28000") return { status: 401, message: err.message ?? "Нужен вход", code };
  return { status: 500, message: "Ошибка сервера", code };
}
