/** Типы своего клиента xtrud-api (замена supabase-js). */

export interface SessionUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix-время (секунды) истечения access-токена. */
  expires_at: number;
  user: SessionUser;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
}

export type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";

/**
 * Результат запроса — как PostgrestResponse: после `if (error) throw error`
 * TypeScript сужает `data` до значения.
 */
// biome-ignore lint/suspicious/noExplicitAny: форму результата задаёт вызывающий хук
export type QueryResult<T = any> =
  | { data: T; error: null; count: number | null; status: number }
  | { data: null; error: ApiError; count: number | null; status: number };
