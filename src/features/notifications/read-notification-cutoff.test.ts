import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { READ_NOTIFICATION_KEEP_MS, readNotificationCutoff } from "./use-notifications";

describe("readNotificationCutoff", () => {
  it("прочитанные старше двух суток не показываются", () => {
    const now = Date.parse("2026-10-06T12:00:00.000Z");
    expect(READ_NOTIFICATION_KEEP_MS).toBe(48 * 60 * 60 * 1000);
    expect(readNotificationCutoff(now)).toBe("2026-10-04T12:00:00.000Z");
  });
});
