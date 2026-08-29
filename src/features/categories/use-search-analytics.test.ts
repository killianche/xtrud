import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc },
}));

import { logSearchQuery } from "./use-search-analytics";

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

  it("stays disconnected from raw free-text search until the privacy contract exists", () => {
    const searchSource = readFileSync(resolve(process.cwd(), "app/(details)/search.tsx"), "utf8");
    expect(searchSource).not.toContain("use-search-analytics");
    expect(searchSource).not.toContain("useLogSearchQuery");
    expect(searchSource).not.toContain("usePopularQueries");
  });
});
