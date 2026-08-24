/** Auth must remain available even when private draft recovery fails. */

export type ResolvedAuthStatus = "authenticated" | "unauthenticated";

export async function resolveAuthStateAfterDraft<T>(
  session: T | null,
  bindDraft: (session: T | null) => Promise<void>,
): Promise<{ session: T | null; status: ResolvedAuthStatus }> {
  try {
    await bindDraft(session);
  } catch {
    // Draft recovery is fail-closed and must never block the Supabase session.
  }
  return { session, status: session ? "authenticated" : "unauthenticated" };
}
