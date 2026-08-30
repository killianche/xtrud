/**
 * Безопасный return-intent после входа или регистрации.
 *
 * В URL и persisted state нельзя принимать произвольный redirect: иначе auth
 * превратится в open-redirect. Поэтому здесь один allowlist-маршрут для формы
 * задания, короткий TTL и pure consume, который всегда обнуляет intent.
 */

declare const authReturnToBrand: unique symbol;

export type AuthReturnTo = string & { readonly [authReturnToBrand]: true };

export const ORDER_CREATE_RETURN_TO = "/orders/new" as AuthReturnTo;
const LEGACY_ORDER_CREATE_RETURN_TO = "/(tabs)/orders/new";
export const AUTH_RETURN_TTL_MS = 60 * 60 * 1000;

export interface AuthReturnIntent {
  returnTo: AuthReturnTo;
  createdAt: number;
}

export function parseAuthReturnTo(raw: string | string[] | null | undefined): AuthReturnTo | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === ORDER_CREATE_RETURN_TO || value === LEGACY_ORDER_CREATE_RETURN_TO) {
    return ORDER_CREATE_RETURN_TO;
  }
  const match = value?.match(
    /^\/(?:\(tabs\)\/)?orders\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  return match ? (`/orders/${match[1]}` as AuthReturnTo) : null;
}

export function createAuthReturnIntent(returnTo: AuthReturnTo, now = Date.now()): AuthReturnIntent {
  return { returnTo, createdAt: now };
}

export function isAuthReturnIntentActive(
  intent: AuthReturnIntent | null | undefined,
  now = Date.now(),
): intent is AuthReturnIntent {
  if (!intent || !parseAuthReturnTo(intent.returnTo)) return false;
  return (
    Number.isFinite(intent.createdAt) &&
    now - intent.createdAt >= 0 &&
    now - intent.createdAt < AUTH_RETURN_TTL_MS
  );
}

export function consumeAuthReturnIntent(
  intent: AuthReturnIntent | null | undefined,
  now = Date.now(),
): { returnTo: AuthReturnTo | null; nextIntent: null } {
  return {
    returnTo: isAuthReturnIntentActive(intent, now) ? intent.returnTo : null,
    nextIntent: null,
  };
}
