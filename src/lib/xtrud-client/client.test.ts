import { describe, expect, it } from "vitest";
import { createXtrudClient } from "./client";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: async (k: string) => data.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: async (k: string) => {
      data.delete(k);
    },
  };
}

function clientWith(fetchImpl: typeof fetch) {
  return createXtrudClient({
    baseUrl: "https://api.test",
    storage: memoryStorage(),
    fetch: fetchImpl,
  });
}

describe("вход без ответа сервера", () => {
  it("нет сети — понятная ошибка, а не падение на разборе сессии", async () => {
    const client = clientWith(async () => {
      throw new TypeError("Network request failed");
    });
    const { data, error } = await client.auth.signInWithPassword({
      login: "89001234567",
      password: "secret123",
    });
    expect(data.session).toBeNull();
    expect(error?.status).toBe(0);
    expect(error?.message).toBe("Нет связи с сервером. Проверьте интернет.");
    expect(error?.code).toBe("ENETUNREACH");
  });

  it("таймаут — остаётся текст таймаута", async () => {
    const client = clientWith(async () => {
      throw Object.assign(new Error("Сервер не ответил за 12 с. Проверьте интернет и повторите."), {
        code: "ETIMEDOUT",
      });
    });
    const { error } = await client.auth.register({
      firstName: "Иван",
      lastName: "Иванов",
      phone: "+79001234567",
      password: "secret123",
    });
    expect(error?.message).toBe("Сервер не ответил за 12 с. Проверьте интернет и повторите.");
    expect(error?.code).toBe("ETIMEDOUT");
  });

  it("неверный пароль — текст сервера", async () => {
    const client = clientWith(
      async () =>
        new Response(JSON.stringify({ error: "Неверный телефон или пароль" }), { status: 401 }),
    );
    const { error } = await client.auth.signInWithPassword({ login: "x", password: "y" });
    expect(error?.status).toBe(401);
    expect(error?.message).toBe("Неверный телефон или пароль");
  });

  it("номера нет — код account_not_found доходит до экрана", async () => {
    const client = clientWith(
      async () =>
        new Response(
          JSON.stringify({ error: "Аккаунта с этим номером нет", code: "account_not_found" }),
          { status: 404 },
        ),
    );
    const { data, error } = await client.auth.signInWithPassword({
      login: "89292980006",
      password: "secret1",
    });
    expect(data.session).toBeNull();
    expect(error?.code).toBe("account_not_found");
  });
});
