import { describe, expect, it, vi } from "vitest";
import { createDebouncedStorage } from "./debounced-storage";

function fakeBase() {
  const disk = new Map<string, string>();
  return {
    disk,
    storage: {
      getItem: vi.fn(async (k: string) => disk.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        disk.set(k, v);
      }),
      removeItem: vi.fn(async (k: string) => {
        disk.delete(k);
      }),
    },
  };
}

describe("createDebouncedStorage", () => {
  it("пишет на диск один раз — последнее значение", async () => {
    vi.useFakeTimers();
    const base = fakeBase();
    const s = createDebouncedStorage(base.storage, 400);
    for (const ch of ["п", "по", "пок", "покл"]) s.setItem("draft", ch);
    expect(base.storage.setItem).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(base.storage.setItem).toHaveBeenCalledTimes(1);
    expect(base.disk.get("draft")).toBe("покл");
    vi.useRealTimers();
  });

  it("чтение отдаёт ещё не записанное значение", async () => {
    vi.useFakeTimers();
    const base = fakeBase();
    const s = createDebouncedStorage(base.storage, 400);
    s.setItem("draft", "свежее");
    expect(await s.getItem("draft")).toBe("свежее");
    vi.useRealTimers();
  });

  it("удаление отменяет отложенную запись", async () => {
    vi.useFakeTimers();
    const base = fakeBase();
    const s = createDebouncedStorage(base.storage, 400);
    s.setItem("draft", "будет удалено");
    await s.removeItem("draft");
    vi.advanceTimersByTime(500);
    expect(base.storage.setItem).not.toHaveBeenCalled();
    expect(base.disk.has("draft")).toBe(false);
    vi.useRealTimers();
  });
});
