/**
 * Сессия xtrud-api: access-токен (JWT, 1 час) + refresh-токен в защищённом
 * хранилище. Один экземпляр на приложение; события — как у supabase-js
 * (INITIAL_SESSION / SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED), чтобы
 * auth-session-store не менялся.
 *
 * Переезд без повторного входа: если своей сессии нет, но в хранилище лежит
 * сессия supabase-js (ключ sb-api-auth-token), её refresh-токен меняется на
 * нашу сессию через /v2/auth/exchange, старая запись удаляется.
 */

import type { ApiError, AuthEvent, Session } from "./types";

export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const KEY = "xtrud.session.v1";
const LEGACY_KEY = "sb-api-auth-token";
/** За сколько секунд до истечения обновляем access-токен. */
const REFRESH_MARGIN_S = 90;

type Listener = (event: AuthEvent, session: Session | null) => void;

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; email: string | null; phone: string | null };
}

export function sessionFromTokens(r: TokenResponse): Session {
  return {
    access_token: r.accessToken,
    refresh_token: r.refreshToken,
    expires_at: r.expiresAt,
    user: { id: r.user.id, email: r.user.email ?? null, phone: r.user.phone ?? null },
  };
}

export class SessionManager {
  private session: Session | null = null;
  private loaded: Promise<void> | null = null;
  private refreshing: Promise<Session | null> | null = null;
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: SessionStorage,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** Загрузка из хранилища (один раз), с переездом старой сессии. */
  ready(): Promise<void> {
    if (!this.loaded) {
      this.loaded = (async () => {
        try {
          const raw = await this.storage.getItem(KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Session;
            if (parsed?.access_token && parsed?.refresh_token && parsed?.user?.id)
              this.session = parsed;
          }
        } catch {
          this.session = null;
        }
        if (!this.session) await this.migrateLegacy();
        this.emit("INITIAL_SESSION");
      })();
    }
    return this.loaded;
  }

  private async migrateLegacy(): Promise<void> {
    try {
      const raw = await this.storage.getItem(LEGACY_KEY);
      if (!raw) return;
      const legacy = JSON.parse(raw) as { refresh_token?: string };
      await this.storage.removeItem(LEGACY_KEY);
      if (!legacy?.refresh_token) return;
      const res = await this.fetchImpl(`${this.baseUrl}/v2/auth/exchange`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gotrueRefreshToken: legacy.refresh_token }),
      });
      if (!res.ok) return;
      const tokens = (await res.json()) as TokenResponse;
      await this.set(sessionFromTokens(tokens), null);
    } catch {
      /* без переезда — человек войдёт заново */
    }
  }

  get current(): Session | null {
    return this.session;
  }

  async get(): Promise<Session | null> {
    await this.ready();
    return this.session;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AuthEvent): void {
    for (const l of this.listeners) l(event, this.session);
  }

  async set(session: Session | null, event: AuthEvent | null): Promise<void> {
    this.session = session;
    try {
      if (session) await this.storage.setItem(KEY, JSON.stringify(session));
      else await this.storage.removeItem(KEY);
    } catch {
      /* хранилище недоступно — сессия живёт в памяти до перезапуска */
    }
    this.schedule();
    if (event) this.emit(event);
  }

  /** Действующий access-токен; при необходимости обновляет его. */
  async accessToken(): Promise<string | null> {
    await this.ready();
    const s = this.session;
    if (!s) return null;
    const now = Math.floor(Date.now() / 1000);
    if (s.expires_at - now > REFRESH_MARGIN_S) return s.access_token;
    const refreshed = await this.refresh();
    return refreshed?.access_token ?? null;
  }

  /** Обновление по refresh-токену. Один полёт на все параллельные запросы. */
  refresh(): Promise<Session | null> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const s = this.session;
      if (!s) return null;
      try {
        const res = await this.fetchImpl(`${this.baseUrl}/v2/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: s.refresh_token }),
        });
        if (res.status === 401) {
          await this.set(null, "SIGNED_OUT");
          return null;
        }
        if (!res.ok) return s; // временный сбой — оставляем как есть
        const tokens = (await res.json()) as TokenResponse;
        const next = sessionFromTokens(tokens);
        await this.set(next, "TOKEN_REFRESHED");
        return next;
      } catch {
        return s;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  /** Таймер фонового обновления (только пока приложение активно). */
  startAutoRefresh(): void {
    this.autoRefresh = true;
    this.schedule();
  }

  stopAutoRefresh(): void {
    this.autoRefresh = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private autoRefresh = false;

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.autoRefresh || !this.session) return;
    const now = Math.floor(Date.now() / 1000);
    const inMs = Math.max(5, this.session.expires_at - now - REFRESH_MARGIN_S) * 1000;
    this.timer = setTimeout(() => void this.refresh(), inMs);
  }
}

export function toApiError(status: number, body: unknown, fallback: string): ApiError {
  const b = (body ?? {}) as {
    error?: unknown;
    message?: unknown;
    code?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const message =
    typeof b.error === "string" ? b.error : typeof b.message === "string" ? b.message : fallback;
  return {
    message,
    code: typeof b.code === "string" ? b.code : undefined,
    details: typeof b.details === "string" ? b.details : null,
    hint: typeof b.hint === "string" ? b.hint : null,
    status,
  };
}
