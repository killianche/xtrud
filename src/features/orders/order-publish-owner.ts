/**
 * Async publication can outlive the session that started it. Its success UI
 * belongs only to that exact still-active account.
 */
export function isOrderPublishResultForActiveUser(
  publishingUserId: string,
  renderedUserId: string | undefined,
  authoritativeSessionUserId: string | undefined,
): boolean {
  return renderedUserId === publishingUserId && authoritativeSessionUserId === publishingUserId;
}

export function isOrderPublishSuccessVisible(
  publishedForUserId: string | null,
  renderedUserId: string | undefined,
): boolean {
  return !!renderedUserId && publishedForUserId === renderedUserId;
}

export type CommittedOrderPublishOwnerResolution = "confirmed" | "unknown" | "mismatch";

/** A session-read failure after commit is terminal but cannot expose an order
 * id. A proven mismatch suppresses all success UI for the stale renderer. */
export async function resolveCommittedOrderPublishOwner(
  publishingUserId: string,
  renderedUserId: string | undefined,
  readCurrentSession: () => Promise<{ userId: string | undefined; error: unknown }>,
): Promise<CommittedOrderPublishOwnerResolution> {
  if (renderedUserId !== publishingUserId) return "mismatch";
  try {
    const current = await readCurrentSession();
    if (current.error) return "unknown";
    return current.userId === publishingUserId ? "confirmed" : "mismatch";
  } catch {
    return "unknown";
  }
}
