import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import {
  type AssistDeps,
  buildAssistMessages,
  loadOrderTitleAsStaff,
  PerUserWindow,
  parseAssistAnswer,
  type QueryClient,
  registerAiAssistRoutes,
} from "../src/ai/assist.js";
import type { CatalogItem } from "../src/ai/classifier.js";
import { Tokens } from "../src/auth/jwt.js";
import type { Claims } from "../src/db.js";

const KEY = "sk-test-0123456789abcdef";
const SECRET = "s".repeat(40);
const ORDER = "c17f2662-fe32-4f4c-b6f2-7854225fa340";
const ADMIN = "659a21f8-0000-4058-9abd-e5e77ec5d5f8";
const CATALOG: CatalogItem[] = [
  {
    l2_id: "lawn-mowing",
    name_ru: "Покос травы",
    section: "Строительство и участок",
    section_id: "construction",
    services: "Покос триммером",
    terms: "косить",
  },
  {
    l2_id: "plumbing",
    name_ru: "Сантехника",
    section: "Сантехника и электрика",
    section_id: "utilities",
    services: "",
    terms: "",
  },
];

describe("parseAssistAnswer", () => {
  it("assign: id из каталога — с названиями", () => {
    expect(
      parseAssistAnswer(
        '{"action":"assign","l2_id":"plumbing","explanation":"Течёт кран"}',
        CATALOG,
      ),
    ).toEqual({
      action: "assign",
      l2_id: "plumbing",
      l2_name: "Сантехника",
      section_id: "utilities",
      section_name: "Сантехника и электрика",
      explanation: "Течёт кран",
    });
  });
  it("assign: неизвестный или заглушка — unclear unknown_category", () => {
    for (const id of ["uncategorized", "nope", ""]) {
      const p = parseAssistAnswer(`{"action":"assign","l2_id":"${id}"}`, CATALOG);
      expect(p).toMatchObject({ action: "unclear", problem: "unknown_category" });
    }
  });
  it("create: проверенное предложение, иконка из белого списка, синонимы чистятся", () => {
    const p = parseAssistAnswer(
      JSON.stringify({
        action: "create",
        section_id: "construction",
        name: "  Бурение  скважин ",
        icon: "Shovel",
        terms: [
          "Скважина",
          "скважина",
          "x",
          "y".repeat(41),
          "звоните 89281234567",
          42,
          "колодец",
          "бурение",
          "вода",
          "насос",
          "обсадная труба",
          "артезиан",
          "гидробур",
          "водоснабжение",
          "лишний",
        ],
        explanation: "Такой подкатегории нет",
      }),
      CATALOG,
    );
    expect(p).toEqual({
      action: "create",
      section_id: "construction",
      section_name: "Строительство и участок",
      name: "Бурение скважин",
      icon: "Shovel",
      terms: [
        "скважина",
        "колодец",
        "бурение",
        "вода",
        "насос",
        "обсадная труба",
        "артезиан",
        "гидробур",
        "водоснабжение",
        "лишний",
      ],
      explanation: "Такой подкатегории нет",
    });
  });
  it("create: иконка не из списка — null (будет иконка раздела)", () => {
    const p = parseAssistAnswer(
      '{"action":"create","section_id":"construction","name":"Колодцы","icon":"Skull","terms":[]}',
      CATALOG,
    );
    expect(p).toMatchObject({ action: "create", icon: null, terms: [] });
  });
  it("create: чужой раздел и плохое название отвергаются", () => {
    expect(
      parseAssistAnswer('{"action":"create","section_id":"nope","name":"Колодцы"}', CATALOG),
    ).toMatchObject({ action: "unclear", problem: "unknown_section" });
    for (const name of ["К", "x".repeat(61), "123", "Сайт https://a.ru", "Колодцы‮"]) {
      expect(
        parseAssistAnswer(
          JSON.stringify({ action: "create", section_id: "construction", name }),
          CATALOG,
        ),
      ).toMatchObject({ action: "unclear", problem: "bad_name" });
    }
  });
  it("create существующей подкатегории — assign на неё", () => {
    const p = parseAssistAnswer(
      '{"action":"create","section_id":"construction","name":"покос  ТРАВЫ"}',
      CATALOG,
    );
    expect(p).toMatchObject({ action: "assign", l2_id: "lawn-mowing" });
  });
  it("unclear, пустой, кривой, неизвестное действие", () => {
    expect(
      parseAssistAnswer('{"action":"unclear","message":"Непонятно, что нужно"}', CATALOG),
    ).toEqual({
      action: "unclear",
      message: "Непонятно, что нужно",
      explanation: "",
      problem: null,
    });
    expect(parseAssistAnswer("", CATALOG)).toMatchObject({ problem: "empty_answer" });
    expect(parseAssistAnswer(null, CATALOG)).toMatchObject({ problem: "empty_answer" });
    expect(parseAssistAnswer("не json", CATALOG)).toMatchObject({ problem: "invalid_json" });
    expect(parseAssistAnswer("[1]", CATALOG)).toMatchObject({ problem: "invalid_json" });
    expect(parseAssistAnswer('{"action":"delete"}', CATALOG)).toMatchObject({
      problem: "unknown_action",
    });
  });
  it("пояснение обрезается и без контактов", () => {
    const p = parseAssistAnswer(
      JSON.stringify({
        action: "assign",
        l2_id: "plumbing",
        explanation: `т. 89281234567 ${"а".repeat(400)}`,
      }),
      CATALOG,
    );
    expect(p.explanation).not.toContain("928");
    expect(p.explanation.length).toBeLessThanOrEqual(300);
  });
});

describe("промпт помощника", () => {
  it("содержит каталог, разделы, иконки, задание и пожелание", () => {
    const [system, user] = buildAssistMessages("Выкопать колодец", CATALOG, "сделай новую");
    expect(system?.content).toContain("json");
    expect(system?.content).toContain("WashingMachine");
    expect(user?.content).toContain("lawn-mowing — Покос травы (Строительство и участок) | услуги");
    expect(user?.content).toContain("construction — Строительство и участок");
    expect(user?.content).toContain("Выкопать колодец");
    expect(user?.content).toContain("сделай новую");
  });
});

/** Поддельный клиент: is_staff_session() и admin_order_card. */
function fakeClient(
  isAdmin: boolean,
  title: string | null = "Выкопать колодец",
  l2Id = "uncategorized",
) {
  const sql: string[] = [];
  const client: QueryClient = {
    query: async (text: string) => {
      sql.push(text);
      if (text.includes("is_staff_session")) return { rows: [{ ok: isAdmin }] };
      if (text.includes("admin_order_card")) {
        if (!isAdmin) throw Object.assign(new Error("forbidden"), { code: "42501" });
        return { rows: [{ card: title === null ? null : { order: { title, l2_id: l2Id } } }] };
      }
      throw new Error(`unexpected sql ${text}`);
    },
  };
  return { client, sql };
}

describe("loadOrderTitleAsStaff", () => {
  it("задание с категорией — 409: в DeepSeek уходит лишь «без категории» (№282)", async () => {
    const f = fakeClient(true, "Поменять розетку", "electrical");
    const err = await loadOrderTitleAsStaff(f.client, ORDER).catch((e) => e);
    expect(err).toMatchObject({ status: 409 });
  });

  it("не сотрудник — 403 до чтения задания", async () => {
    const f = fakeClient(false);
    const err = await loadOrderTitleAsStaff(f.client, ORDER).catch((e) => e);
    expect(err.status).toBe(403);
    expect(f.sql).toHaveLength(1);
  });
  it("админ или управляющий (is_staff_session, 0239) — название задания", async () => {
    const f = fakeClient(true);
    expect(await loadOrderTitleAsStaff(f.client, ORDER)).toBe("Выкопать колодец");
    // Доступ решает база: is_staff_session(), а не is_admin_session() (№286).
    expect(f.sql[0]).toContain("public.is_staff_session()");
    expect(f.sql.join("\n")).not.toContain("is_admin_session");
  });
});

async function makeApp(opts: { isAdmin: boolean; answer?: string; perUser?: PerUserWindow }) {
  const tokens = new Tokens(SECRET, "xtrud-api", 3600);
  const seenClaims: Claims[] = [];
  const ai: string[] = [];
  const db: AssistDeps["db"] = {
    asUser: (async (claims: Claims, fn: (c: QueryClient) => Promise<unknown>) => {
      seenClaims.push(claims);
      return fn(fakeClient(opts.isAdmin).client);
    }) as unknown as AssistDeps["db"]["asUser"],
  };
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    ai.push(String(init?.body ?? ""));
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: opts.answer ?? '{"action":"assign","l2_id":"plumbing"}' } },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const app = Fastify();
  await app.register(
    async (scope) => {
      await registerAiAssistRoutes(scope, {
        db,
        tokens,
        getCatalog: async () => CATALOG,
        ai: { apiKey: KEY, model: "deepseek-flash", fetchImpl },
        perUser: opts.perUser,
      });
    },
    { prefix: "/v2" },
  );
  const { token } = await tokens.signAccess({ id: ADMIN, email: null, phone: null }, "sess");
  return { app, token, seenClaims, ai };
}

describe("POST /v2/admin/ai/assist", () => {
  it("без токена — 401, нейросеть не зовётся", async () => {
    const t = await makeApp({ isAdmin: true });
    const res = await t.app.inject({
      method: "POST",
      url: "/v2/admin/ai/assist",
      payload: { order_id: ORDER, instruction: "" },
    });
    expect(res.statusCode).toBe(401);
    expect(t.ai).toHaveLength(0);
  });
  it("не админ (по базе) — 403, нейросеть не зовётся", async () => {
    const t = await makeApp({ isAdmin: false });
    const res = await t.app.inject({
      method: "POST",
      url: "/v2/admin/ai/assist",
      headers: { authorization: `Bearer ${t.token}` },
      payload: { order_id: ORDER, instruction: "назначь сантехнику" },
    });
    expect(res.statusCode).toBe(403);
    expect(t.ai).toHaveLength(0);
    expect(t.seenClaims[0]).toMatchObject({ sub: ADMIN, role: "authenticated" });
  });
  it("неверный order_id и слишком длинное пожелание — 400 до базы", async () => {
    const t = await makeApp({ isAdmin: true });
    const auth = { authorization: `Bearer ${t.token}` };
    const bad = await t.app.inject({
      method: "POST",
      url: "/v2/admin/ai/assist",
      headers: auth,
      payload: { order_id: "1; drop", instruction: "" },
    });
    expect(bad.statusCode).toBe(400);
    const long = await t.app.inject({
      method: "POST",
      url: "/v2/admin/ai/assist",
      headers: auth,
      payload: { order_id: ORDER, instruction: "а".repeat(501) },
    });
    expect(long.statusCode).toBe(400);
    expect(t.seenClaims).toHaveLength(0);
  });
  it("админ — предложение; контакты из пожелания и ключ наружу не уходят в тело", async () => {
    const t = await makeApp({ isAdmin: true });
    const res = await t.app.inject({
      method: "POST",
      url: "/v2/admin/ai/assist",
      headers: { authorization: `Bearer ${t.token}` },
      payload: { order_id: ORDER, instruction: "клиент 89281234567 просит сантехника" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      order_id: ORDER,
      model: "deepseek-flash",
      proposal: {
        action: "assign",
        l2_id: "plumbing",
        l2_name: "Сантехника",
        section_id: "utilities",
        section_name: "Сантехника и электрика",
        explanation: "",
      },
    });
    expect(t.ai[0]).not.toContain("928");
    expect(t.ai[0]).not.toContain(KEY);
    expect(t.ai[0]).toContain("Выкопать колодец");
  });
  it("лимит на админа — 429 после исчерпания окна", async () => {
    const t = await makeApp({ isAdmin: true, perUser: new PerUserWindow(1, 60_000) });
    const req = () =>
      t.app.inject({
        method: "POST",
        url: "/v2/admin/ai/assist",
        headers: { authorization: `Bearer ${t.token}` },
        payload: { order_id: ORDER },
      });
    expect((await req()).statusCode).toBe(200);
    expect((await req()).statusCode).toBe(429);
    expect(t.ai).toHaveLength(1);
  });
});

describe("PerUserWindow", () => {
  it("окно сдвигается", () => {
    let now = 0;
    const w = new PerUserWindow(2, 1000, () => now);
    expect(w.allow("a")).toBe(true);
    expect(w.allow("a")).toBe(true);
    expect(w.allow("a")).toBe(false);
    expect(w.allow("b")).toBe(true);
    now = 1500;
    expect(w.allow("a")).toBe(true);
  });
});
