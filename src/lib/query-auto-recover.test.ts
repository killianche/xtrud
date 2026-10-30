import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_RECOVER_DELAYS_MS,
  refetchErroredOnFocus,
  startQueryAutoRecover,
} from "./query-auto-recover";

function networkError() {
  return Object.assign(new Error("Сервер не ответил за 12 с."), { code: "ETIMEDOUT" });
}

function setup(fetcher: () => Promise<string>, quiet = () => 0) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let active = true;
  let activeListener: ((a: boolean) => void) | undefined;
  const observer = new QueryObserver(client, { queryKey: ["proposals"], queryFn: fetcher });
  const unsubscribeObserver = observer.subscribe(() => undefined);
  const stop = startQueryAutoRecover(client, {
    isActive: () => active,
    onActiveChange: (l) => {
      activeListener = l;
      return () => undefined;
    },
    quietRemainingMs: quiet,
  });
  return {
    client,
    observer,
    setActive(a: boolean) {
      active = a;
      activeListener?.(a);
    },
    stop() {
      stop();
      unsubscribeObserver();
      client.clear();
    },
  };
}

describe("startQueryAutoRecover", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("сам загружает экран после сбоя связи, без нажатия «Повторить»", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue("данные");
    const t = setup(fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.observer.getCurrentResult().status).toBe("error");

    await vi.advanceTimersByTimeAsync(AUTO_RECOVER_DELAYS_MS[0]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(t.observer.getCurrentResult().data).toBe("данные");
    t.stop();
  });

  it("повторяет с растущей паузой, пока связи нет", async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockRejectedValue(networkError());
    const t = setup(fetcher);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
    t.stop();
  });

  it("ждёт паузу тишины после таймаута (заморозка соединений, №278)", async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockRejectedValue(networkError());
    const t = setup(fetcher, () => 60_000);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    t.stop();
  });

  it("в фоне не повторяет", async () => {
    const fetcher = vi.fn<() => Promise<string>>().mockRejectedValue(networkError());
    const t = setup(fetcher);
    await vi.advanceTimersByTimeAsync(0);
    t.setActive(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t.stop();
  });

  it("ошибку сервера (не связи) сам не повторяет", async () => {
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(Object.assign(new Error("permission denied"), { code: "42501" }));
    const t = setup(fetcher);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    t.stop();
  });
});

describe("refetchErroredOnFocus", () => {
  it("при возврате в приложение перезапрашивает только упавшее", () => {
    const client = new QueryClient();
    const cache = client.getQueryCache();
    const failed = cache.build(client, { queryKey: ["a"] });
    failed.setState({ status: "error", error: networkError() });
    const ok = cache.build(client, { queryKey: ["b"] });
    ok.setState({ status: "success", data: 1 });
    expect(refetchErroredOnFocus(failed)).toBe("always");
    expect(refetchErroredOnFocus(ok)).toBe(false);
  });
});
