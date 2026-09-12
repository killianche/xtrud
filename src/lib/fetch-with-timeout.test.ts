import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTimeoutFetch,
  REQUEST_TIMEOUT_MS,
  timeoutForRequest,
  UPLOAD_TIMEOUT_MS,
} from "./fetch-with-timeout";
import { isNetworkTransportError } from "./network-transport-error";

describe("createTimeoutFetch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("отклоняет молчащий запрос по таймауту вместо бесконечного ожидания", async () => {
    // Именно этот случай владелец видел как вечный скелетон: сервер не
    // отвечает, промис не отклоняется, react-query остаётся в загрузке.
    const hangs = vi.fn(
      () =>
        new Promise<Response>(() => {
          /* никогда не разрешается */
        }),
    );
    const timeoutFetch = createTimeoutFetch(1000, hangs);
    const promise = timeoutFetch("https://api.xtrud.pro/v2/rest/orders");
    const assertion = expect(promise).rejects.toMatchObject({ code: "ETIMEDOUT" });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("помечает таймаут как транспортную ошибку — иначе не сработает офлайн-каталог", async () => {
    const timeoutFetch = createTimeoutFetch(500, () => new Promise<Response>(() => {}));
    const promise = timeoutFetch("https://api.xtrud.pro/v2/rest/categories_l2").catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(500);
    expect(isNetworkTransportError(await promise)).toBe(true);
  });

  it("пропускает успешный ответ без изменений", async () => {
    const response = new Response("[]", { status: 200 });
    const timeoutFetch = createTimeoutFetch(1000, async () => response);
    await expect(timeoutFetch("https://api.xtrud.pro/v2/rest/orders")).resolves.toBe(response);
  });

  it("не отклоняет запрос, который успел ответить до таймаута", async () => {
    const timeoutFetch = createTimeoutFetch(1000, async () => new Response("ok", { status: 200 }));
    const promise = timeoutFetch("https://api.xtrud.pro/v2/rest/orders");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(promise).resolves.toMatchObject({ status: 200 });
  });

  it("сохраняет отмену вызывающей стороны и не подменяет её таймаутом", async () => {
    const controller = new AbortController();
    const abortError = Object.assign(new Error("Aborted"), { name: "AbortError" });
    const timeoutFetch = createTimeoutFetch(1000, (_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(abortError), { once: true });
      });
    });
    const promise = timeoutFetch("https://api.xtrud.pro/v2/rest/orders", {
      signal: controller.signal,
    });
    controller.abort();
    await expect(promise).rejects.toBe(abortError);
  });

  it("передаёт запрос дальше вместе с методом и заголовками", async () => {
    const impl = vi.fn(async () => new Response("{}", { status: 200 }));
    const timeoutFetch = createTimeoutFetch(1000, impl);
    await timeoutFetch("https://api.xtrud.pro/v2/auth/login", {
      method: "POST",
      headers: { "x-request-id": "test" },
    });
    expect(impl).toHaveBeenCalledTimes(1);
    const [, init] = impl.mock.calls[0] as unknown as [unknown, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-request-id"]).toBe("test");
    expect(init.signal).toBeDefined();
  });

  it("держит таймаут по умолчанию в разумных пределах", () => {
    // Слишком большой таймаут возвращает ту же болезнь: человек смотрит на
    // скелетон и не понимает, что связи нет.
    expect(REQUEST_TIMEOUT_MS).toBeGreaterThanOrEqual(5_000);
    expect(REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(20_000);
  });
});

describe("срок ожидания по типу запроса", () => {
  it("загрузка файла ждёт минуту: фото по мобильной связи не укладывается в 12 с", () => {
    expect(
      timeoutForRequest("https://api.xtrud.pro/v2/files/order-photos/a/b.jpg", {
        method: "POST",
      }),
    ).toBe(UPLOAD_TIMEOUT_MS);
  });

  it("чтение файла и обычные запросы — прежние 12 с", () => {
    expect(timeoutForRequest("https://api.xtrud.pro/v2/files/order-photos/a/b.jpg")).toBe(
      REQUEST_TIMEOUT_MS,
    );
    expect(timeoutForRequest("https://api.xtrud.pro/v2/rest/orders", { method: "POST" })).toBe(
      REQUEST_TIMEOUT_MS,
    );
  });
});
