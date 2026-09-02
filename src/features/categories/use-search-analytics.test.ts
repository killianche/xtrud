import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

import { logSearchQuery } from "./use-search-analytics";

/** Все .ts/.tsx под каталогом, рекурсивно. */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("logSearchQuery", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("resolves after Supabase accepts the analytics event", async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expect(logSearchQuery({ query: "поклеить обои", hits: 4 })).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("log_search_query", {
      p_query: "поклеить обои",
      p_hits: 4,
    });
  });

  it("rejects when Supabase returns an RPC error", async () => {
    const error = {
      code: "42501",
      details: null,
      hint: null,
      message: "permission denied",
    };
    rpc.mockResolvedValue({ data: null, error });

    await expect(logSearchQuery({ query: "электрик", hits: 2 })).rejects.toBe(error);
  });

  it("не подключена ни к одному экрану, пока нет контракта приватности", () => {
    // Раньше проверка смотрела один экран app/(details)/search.tsx. Он удалён
    // как недостижимый, и проверка упала на отсутствующем файле. Инвариант при
    // этом никуда не делся: свободный текст поиска не должен уходить в логи,
    // пока для этого нет продуктового контракта.
    //
    // Теперь проверяется ВЕСЬ каталог экранов, а не один файл: это строже
    // прежнего и переживает удаление или переименование любого экрана.
    const screens = collectSourceFiles(resolve(process.cwd(), "app"));
    expect(screens.length).toBeGreaterThan(0);

    const wired = screens.filter((file) => {
      const src = readFileSync(file, "utf8");
      return (
        src.includes("use-search-analytics") ||
        src.includes("useLogSearchQuery") ||
        src.includes("usePopularQueries")
      );
    });

    expect(wired).toEqual([]);
  });
});
