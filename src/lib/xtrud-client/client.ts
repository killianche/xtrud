/**
 * Клиент xtrud-api для приложения. Повторяет интерфейс supabase-js в том
 * объёме, которым пользуется код (auth / from / rpc / storage), поэтому
 * модуль `@/lib/supabase` остаётся тем же именем, а импорт supabase-js уходит.
 */

import type { Database } from "@/types/database";
import { QueryBuilder, type Transport } from "./query";
import { SessionManager, type SessionStorage, sessionFromTokens, toApiError } from "./session";
import type { ApiError, AuthEvent, QueryResult, Session } from "./types";

type Tables = Database["public"]["Tables"];
type Functions = Database["public"]["Functions"];
// biome-ignore lint/suspicious/noExplicitAny: встроенные связи (`l2:categories_l2(...)`) типизирует вызывающий хук
type RowOf<K extends keyof Tables> = Tables[K]["Row"] & Record<string, any>;

export interface XtrudClientOptions {
  baseUrl: string;
  storage: SessionStorage;
  fetch?: typeof fetch;
}

type AuthResult = {
  data: { session: Session | null; user: Session["user"] | null };
  error: ApiError | null;
};

export function createXtrudClient(opts: XtrudClientOptions) {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const fetchImpl = opts.fetch ?? fetch;
  const sessions = new SessionManager(opts.storage, baseUrl, fetchImpl);

  async function authHeader(): Promise<Record<string, string>> {
    const token = await sessions.accessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  /** Запрос с автоматическим повтором после обновления просроченного токена. */
  async function call(
    path: string,
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<Response> {
    const first = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { ...(await authHeader()), ...(init.headers ?? {}) },
    });
    if (first.status !== 401 || !sessions.current) return first;
    const refreshed = await sessions.refresh();
    if (!refreshed) return first;
    return fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${refreshed.access_token}`, ...(init.headers ?? {}) },
    });
  }

  const transport: Transport = {
    async request(input) {
      const qs = input.query.toString();
      const res = await call(`/v2/rest/${input.path}${qs ? `?${qs}` : ""}`, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        signal: input.signal,
      });
      return { status: res.status, headers: res.headers, text: await res.text() };
    },
  };

  async function postJson(
    path: string,
    body: unknown,
    withAuth = true,
  ): Promise<{ status: number; json: unknown }> {
    try {
      const init: RequestInit & { headers: Record<string, string> } = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      };
      const res = withAuth ? await call(path, init) : await fetchImpl(`${baseUrl}${path}`, init);
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { error: text };
      }
      return { status: res.status, json };
    } catch (e) {
      // Нет сети или таймаут: отдаём как ошибку 0, экран покажет «нет связи».
      const err = e as { message?: string; code?: string; name?: string };
      return {
        status: 0,
        json: { error: err.message ?? "Нет связи с сервером", code: err.code ?? err.name },
      };
    }
  }

  const auth = {
    async getSession(): Promise<{ data: { session: Session | null }; error: null }> {
      return { data: { session: await sessions.get() }, error: null };
    },
    /** Действующий access-токен (обновляется, если истекает) — для потока
     *  живых обновлений /v2/events, который идёт мимо call(). */
    async accessToken(): Promise<string | null> {
      return sessions.accessToken();
    },
    onAuthStateChange(cb: (event: AuthEvent, session: Session | null) => void) {
      const unsubscribe = sessions.onChange(cb);
      void sessions.ready();
      return { data: { subscription: { unsubscribe } } };
    },
    /** Вход по телефону или почте (сервер сам разбирает логин). */
    async signInWithPassword(input: {
      login?: string;
      email?: string;
      password: string;
    }): Promise<AuthResult> {
      const login = input.login ?? input.email ?? "";
      const { status, json } = await postJson(
        "/v2/auth/login",
        { login, password: input.password },
        false,
      );
      if (status >= 400) {
        return {
          data: { session: null, user: null },
          error: toApiError(status, json, "Не удалось войти"),
        };
      }
      const session = sessionFromTokens(json as Parameters<typeof sessionFromTokens>[0]);
      await sessions.set(session, "SIGNED_IN");
      return { data: { session, user: session.user }, error: null };
    },
    async register(input: {
      firstName: string;
      lastName: string;
      phone: string;
      password: string;
    }): Promise<AuthResult> {
      const { status, json } = await postJson("/v2/auth/register", input, false);
      if (status >= 400) {
        return {
          data: { session: null, user: null },
          error: toApiError(status, json, "Не удалось создать аккаунт"),
        };
      }
      const session = sessionFromTokens(json as Parameters<typeof sessionFromTokens>[0]);
      await sessions.set(session, "SIGNED_IN");
      return { data: { session, user: session.user }, error: null };
    },
    async changePassword(
      currentPassword: string,
      newPassword: string,
    ): Promise<{ error: ApiError | null }> {
      const { status, json } = await postJson("/v2/auth/password", {
        currentPassword,
        newPassword,
      });
      if (status >= 400) return { error: toApiError(status, json, "Не удалось сменить пароль") };
      await sessions.set(
        sessionFromTokens(json as Parameters<typeof sessionFromTokens>[0]),
        "TOKEN_REFRESHED",
      );
      return { error: null };
    },
    async signOut(): Promise<{ error: ApiError | null }> {
      const s = sessions.current;
      if (s) {
        try {
          await fetchImpl(`${baseUrl}/v2/auth/logout`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: s.refresh_token }),
          });
        } catch {
          /* сервер недоступен — локально всё равно выходим */
        }
      }
      await sessions.set(null, "SIGNED_OUT");
      return { error: null };
    },
    startAutoRefresh: () => sessions.startAutoRefresh(),
    stopAutoRefresh: () => sessions.stopAutoRefresh(),
  };

  function from<K extends keyof Tables & string>(table: K): QueryBuilder<RowOf<K>> {
    return new QueryBuilder<RowOf<K>>(transport, table);
  }

  async function rpc<F extends keyof Functions & string>(
    name: F,
    args?: Functions[F]["Args"] extends never ? undefined : Functions[F]["Args"],
  ): Promise<QueryResult<Functions[F]["Returns"]>> {
    let res: Response;
    try {
      res = await call(`/v2/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args ?? {}),
      });
    } catch (e) {
      const err = e as { message?: string; code?: string; name?: string };
      return {
        data: null,
        error: { message: err.message ?? "Нет связи с сервером", code: err.code ?? err.name },
        count: null,
        status: 0,
      };
    }
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (res.status >= 400)
      return {
        data: null,
        error: toApiError(res.status, json, "Ошибка сервера"),
        count: null,
        status: res.status,
      };
    return { data: json as Functions[F]["Returns"], error: null, count: null, status: res.status };
  }

  const storage = {
    from(bucket: string) {
      return {
        async upload(
          path: string,
          body: ArrayBuffer | Uint8Array,
          options?: { contentType?: string; upsert?: boolean; cacheControl?: string },
        ) {
          try {
            const res = await call(`/v2/files/${bucket}/${path}`, {
              method: "PUT",
              headers: { "Content-Type": options?.contentType ?? "application/octet-stream" },
              body: (body instanceof Uint8Array
                ? body
                : new Uint8Array(body)) as unknown as BodyInit,
            });
            if (res.status >= 400) {
              let json: unknown = null;
              try {
                json = await res.json();
              } catch {
                json = null;
              }
              return {
                data: null,
                error: toApiError(res.status, json, "Не удалось загрузить файл"),
              };
            }
            return { data: { path }, error: null };
          } catch (e) {
            return {
              data: null,
              error: { message: (e as Error).message || "Нет связи с сервером" } as ApiError,
            };
          }
        },
        async remove(paths: string[]) {
          for (const p of paths) {
            try {
              const res = await call(`/v2/files/${bucket}/${p}`, { method: "DELETE" });
              if (res.status >= 400 && res.status !== 404) {
                return {
                  data: null,
                  error: toApiError(res.status, null, "Не удалось удалить файл"),
                };
              }
            } catch (e) {
              return {
                data: null,
                error: { message: (e as Error).message || "Нет связи с сервером" } as ApiError,
              };
            }
          }
          return { data: paths.map((p) => ({ name: p })), error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `${baseUrl}/files/${bucket}/${path}` } };
        },
        async createSignedUrl(path: string, _expiresIn?: number) {
          const { status, json } = await postJson("/v2/files/sign", { bucket, path });
          if (status >= 400)
            return { data: null, error: toApiError(status, json, "Нет доступа к файлу") };
          return { data: { signedUrl: (json as { url: string }).url }, error: null };
        },
      };
    },
  };

  return { auth, from, rpc, storage, baseUrl };
}

export type XtrudClient = ReturnType<typeof createXtrudClient>;
