import { describe, expect, it } from "vitest";
import {
  AI_CHANNEL,
  AiCallError,
  askDeepSeek,
  buildMessages,
  type CatalogItem,
  type ClaimedTask,
  type ClassifierStore,
  cachedCatalog,
  DEEPSEEK_URL,
  orderText,
  parseAnswer,
  processOne,
  stripContacts,
  type Verdict,
} from "../src/ai/classifier.js";
import { loadConfig } from "../src/config.js";

const KEY = "sk-test-0123456789abcdef";
const CATALOG: CatalogItem[] = [
  { l2_id: "lawn-mowing", name_ru: "Покос травы", section: "Сад" },
  { l2_id: "plumbing", name_ru: "Сантехника", section: "Ремонт" },
];
const ALLOWED = new Set(CATALOG.map((c) => c.l2_id));
const silent = { info: () => undefined, warn: () => undefined };

describe("stripContacts", () => {
  it("вырезает телефоны в разных записях", () => {
    expect(stripContacts("звоните +7 (928) 123-45-67 вечером")).toBe("звоните [телефон] вечером");
    expect(stripContacts("тел 89281234567")).toBe("тел [телефон]");
    expect(stripContacts("8 928 123 45 67")).toBe("[телефон]");
  });
  it("короткие числа не трогает", () => {
    expect(stripContacts("покосить 20 соток за 3000 руб")).toBe("покосить 20 соток за 3000 руб");
  });
  it("вырезает почту и ссылки", () => {
    expect(stripContacts("пишите ivan.petrov@mail.ru")).toBe("пишите [почта]");
    expect(stripContacts("фото https://example.com/a?b=1 тут")).toBe("фото [ссылка] тут");
    expect(stripContacts("www.site.ru")).toBe("[ссылка]");
    expect(stripContacts("t.me/someone")).toBe("[ссылка]");
  });
  it("кириллические сокращения не считает ссылками", () => {
    expect(stripContacts("ул.Ленина, т.д.")).toBe("ул.Ленина, т.д.");
  });
});

describe("orderText и промпт", () => {
  it("название + описание без контактов, с ограничением длины", () => {
    expect(orderText({ title: "Покос", description: "звоните 89281234567" })).toBe(
      "Покос\nзвоните [телефон]",
    );
    expect(orderText({ title: "a", description: "б".repeat(5000) }).length).toBe(2000);
  });
  it("промпт содержит слово json, пример формата и список id", () => {
    const [system, user] = buildMessages("Покосить траву", CATALOG);
    expect(system?.content).toContain("json");
    expect(system?.content).toContain('"l2_id"');
    expect(system?.content).toContain("ингушском");
    expect(user?.content).toContain("lawn-mowing — Покос травы (Сад)");
    expect(user?.content).toContain("Покосить траву");
  });
});

describe("parseAnswer", () => {
  it("уверенный ответ с id из списка — назначить", () => {
    expect(parseAnswer('{"l2_id":"lawn-mowing","confidence":0.92}', ALLOWED, 0.8)).toEqual({
      outcome: "assigned",
      l2_id: "lawn-mowing",
      confidence: 0.92,
      error: null,
    });
  });
  it("ровно на пороге — назначить", () => {
    expect(parseAnswer('{"l2_id":"plumbing","confidence":0.8}', ALLOWED, 0.8).outcome).toBe(
      "assigned",
    );
  });
  it("низкая уверенность — не уверена, подсказка сохраняется", () => {
    expect(parseAnswer('{"l2_id":"plumbing","confidence":0.5}', ALLOWED, 0.8)).toEqual({
      outcome: "unsure",
      l2_id: "plumbing",
      confidence: 0.5,
      error: null,
    });
  });
  it("id не из списка — не уверена", () => {
    const v = parseAnswer('{"l2_id":"uncategorized","confidence":0.99}', ALLOWED, 0.8);
    expect(v.outcome).toBe("unsure");
    expect(v.l2_id).toBeNull();
    expect(v.error).toBe("unknown_category");
  });
  it("пустой, кривой, null и мусорная уверенность — не уверена", () => {
    expect(parseAnswer("", ALLOWED, 0.8).outcome).toBe("unsure");
    expect(parseAnswer(null, ALLOWED, 0.8).outcome).toBe("unsure");
    expect(parseAnswer("не json", ALLOWED, 0.8).outcome).toBe("unsure");
    expect(parseAnswer('{"l2_id":null,"confidence":0}', ALLOWED, 0.8).outcome).toBe("unsure");
    expect(parseAnswer('{"l2_id":"plumbing","confidence":1.7}', ALLOWED, 0.8)).toMatchObject({
      outcome: "unsure",
      confidence: null,
    });
    expect(parseAnswer('{"l2_id":"plumbing"}', ALLOWED, 0.8).outcome).toBe("unsure");
    expect(parseAnswer("[1,2]", ALLOWED, 0.8).outcome).toBe("unsure");
  });
  it("уверенность строкой тоже понимается", () => {
    expect(parseAnswer('{"l2_id":"plumbing","confidence":"0.9"}', ALLOWED, 0.8).outcome).toBe(
      "assigned",
    );
  });
});

function fakeFetch(handler: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { fn, calls };
}

const okResponse = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

describe("askDeepSeek", () => {
  it("запрос в формате OpenAI: ключ в заголовке, JSON-режим, max_tokens", async () => {
    const f = fakeFetch(async () => okResponse('{"l2_id":"plumbing","confidence":0.9}'));
    const content = await askDeepSeek(
      { apiKey: KEY, model: "deepseek-flash", fetchImpl: f.fn },
      buildMessages("x", CATALOG),
    );
    expect(content).toBe('{"l2_id":"plumbing","confidence":0.9}');
    expect(f.calls[0]?.url).toBe(DEEPSEEK_URL);
    const headers = f.calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(f.calls[0]?.init.body));
    expect(body.model).toBe("deepseek-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBeGreaterThan(0);
  });
  it("HTTP-ошибка — код без тела и без ключа", async () => {
    const f = fakeFetch(async () => new Response(`bad key ${KEY}`, { status: 401 }));
    const err = await askDeepSeek({ apiKey: KEY, model: "m", fetchImpl: f.fn }, []).catch((e) => e);
    expect(err).toBeInstanceOf(AiCallError);
    expect(err.code).toBe("http_401");
    expect(String(err.message)).not.toContain(KEY);
  });
  it("таймаут — код timeout", async () => {
    const f = fakeFetch(
      (_u, init) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener("abort", () => rej(new Error("aborted")));
        }),
    );
    const err = await askDeepSeek(
      { apiKey: KEY, model: "m", fetchImpl: f.fn, timeoutMs: 10 },
      [],
    ).catch((e) => e);
    expect(err.code).toBe("timeout");
  });
  it("пустой content — null", async () => {
    const f = fakeFetch(async () => okResponse(null));
    expect(await askDeepSeek({ apiKey: KEY, model: "m", fetchImpl: f.fn }, [])).toBeNull();
  });
});

function fakeStore(tasks: ClaimedTask[]) {
  const results: Array<{ orderId: string; verdict: Verdict; model: string }> = [];
  let catalogCalls = 0;
  const store: ClassifierStore = {
    claim: async () => tasks.shift() ?? null,
    catalog: async () => {
      catalogCalls += 1;
      return CATALOG;
    },
    result: async (orderId, verdict, model) => {
      results.push({ orderId, verdict, model });
    },
  };
  return { store, results, catalogCalls: () => catalogCalls };
}

const TASK: ClaimedTask = {
  order_id: "c17f2662-fe32-4f4c-b6f2-7854225fa340",
  title: "Покосить траву на поле",
  description: "звоните +7 928 123 45 67",
};

describe("processOne", () => {
  it("нет задачи — false, DeepSeek не зовётся", async () => {
    const s = fakeStore([]);
    const f = fakeFetch(async () => okResponse("{}"));
    const opts = { apiKey: KEY, model: "m", fetchImpl: f.fn, minConfidence: 0.8 };
    expect(await processOne(s.store, opts, s.store.catalog, silent)).toBe(false);
    expect(f.calls).toHaveLength(0);
  });
  it("уверенно — assigned; телефон не уходит наружу", async () => {
    const s = fakeStore([{ ...TASK }]);
    const f = fakeFetch(async () => okResponse('{"l2_id":"lawn-mowing","confidence":0.95}'));
    const opts = { apiKey: KEY, model: "deepseek-flash", fetchImpl: f.fn, minConfidence: 0.8 };
    expect(await processOne(s.store, opts, s.store.catalog, silent)).toBe(true);
    expect(s.results[0]).toEqual({
      orderId: TASK.order_id,
      verdict: { outcome: "assigned", l2_id: "lawn-mowing", confidence: 0.95, error: null },
      model: "deepseek-flash",
    });
    expect(String(f.calls[0]?.init.body)).not.toContain("928");
  });
  it("ошибка API — failed с кодом, ключ не попадает ни в результат, ни в лог", async () => {
    const s = fakeStore([{ ...TASK }]);
    const f = fakeFetch(async () => new Response(KEY, { status: 500 }));
    const logged: string[] = [];
    const log = { info: (o: object) => logged.push(JSON.stringify(o)), warn: () => undefined };
    await processOne(
      s.store,
      { apiKey: KEY, model: "m", fetchImpl: f.fn, minConfidence: 0.8 },
      s.store.catalog,
      log,
    );
    expect(s.results[0]?.verdict).toEqual({
      outcome: "failed",
      l2_id: null,
      confidence: null,
      error: "http_500",
    });
    expect(JSON.stringify(s.results)).not.toContain(KEY);
    expect(logged.join("")).not.toContain(KEY);
  });
  it("сбой сети — failed network", async () => {
    const s = fakeStore([{ ...TASK }]);
    const f = fakeFetch(async () => {
      throw new Error("ECONNRESET");
    });
    await processOne(
      s.store,
      { apiKey: KEY, model: "m", fetchImpl: f.fn, minConfidence: 0.8 },
      s.store.catalog,
      silent,
    );
    expect(s.results[0]?.verdict.outcome).toBe("failed");
    expect(s.results[0]?.verdict.error).toBe("network");
  });
});

describe("cachedCatalog", () => {
  it("каталог читается раз в TTL", async () => {
    const s = fakeStore([]);
    let t = 0;
    const get = cachedCatalog(s.store, 1000, () => t);
    await get();
    await get();
    expect(s.catalogCalls()).toBe(1);
    t = 1500;
    await get();
    expect(s.catalogCalls()).toBe(2);
  });
});

describe("конфигурация", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    JWT_SECRET: "x".repeat(32),
  };
  it("без ключа — классификатор выключен, значения по умолчанию", () => {
    const cfg = loadConfig(base as unknown as NodeJS.ProcessEnv);
    expect(cfg.DEEPSEEK_API_KEY).toBeUndefined();
    expect(cfg.DEEPSEEK_MODEL).toBe("deepseek-flash");
    expect(cfg.AI_CONFIDENCE_MIN).toBe(0.8);
  });
  it("порог вне 0..1 и мусорная модель отвергаются", () => {
    expect(() =>
      loadConfig({ ...base, AI_CONFIDENCE_MIN: "1.5" } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
    expect(() =>
      loadConfig({ ...base, DEEPSEEK_MODEL: "a b" } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });
  it("канал LISTEN совпадает с pg_notify миграции 0236", () => {
    expect(AI_CHANNEL).toBe("order_ai_classify");
  });
});

describe("stripContacts — замечания ревью безопасности (№279)", () => {
  it("телефон через точки и полноширинными цифрами", () => {
    expect(stripContacts("звоните 8.928.123.45.67")).toBe("звоните [телефон]");
    expect(stripContacts("+7９２８１２３４５６７")).toBe("[телефон]");
  });
  it("ник, почта с [at], кириллический домен", () => {
    expect(stripContacts("пишите @ivan_petrov в телеграм")).toBe("пишите [ник] в телеграм");
    expect(stripContacts("ivan[at]mail.ru")).toBe("[почта]");
    expect(stripContacts("смотрите пример.рф/page")).toBe("смотрите [ссылка]");
  });
  it("обычный текст задания не трогает", () => {
    expect(stripContacts("Убраться в комнате 10 квадратов")).toBe(
      "Убраться в комнате 10 квадратов",
    );
    expect(stripContacts("Поменять 3 розетки, 2 выключателя")).toBe(
      "Поменять 3 розетки, 2 выключателя",
    );
  });
});
