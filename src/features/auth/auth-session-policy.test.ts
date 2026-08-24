import { describe, expect, it } from "vitest";
import { resolveAuthStateAfterDraft } from "./auth-session-policy";

describe("auth session resolution", () => {
  it("keeps an authenticated session when draft hydration rejects", async () => {
    const session = { user: { id: "user-a" } };
    await expect(
      resolveAuthStateAfterDraft(session, async () => {
        throw new Error("SecureStore unavailable");
      }),
    ).resolves.toEqual({ session, status: "authenticated" });
  });

  it("keeps unauthenticated status when guest draft recovery rejects", async () => {
    await expect(
      resolveAuthStateAfterDraft(null, async () => {
        throw new Error("corrupt draft");
      }),
    ).resolves.toEqual({ session: null, status: "unauthenticated" });
  });
});
