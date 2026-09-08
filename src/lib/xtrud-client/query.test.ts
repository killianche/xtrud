import { describe, expect, it } from "vitest";
import { QueryBuilder, type Transport } from "./query";

function capture() {
  const calls: Array<{
    method: string;
    path: string;
    query: string;
    headers: Record<string, string>;
    body?: string;
  }> = [];
  const transport: Transport = {
    async request(input) {
      calls.push({
        method: input.method,
        path: input.path,
        query: input.query.toString(),
        headers: input.headers,
        body: input.body,
      });
      return { status: 200, headers: new Headers({ "content-range": "0-1/7" }), text: "[]" };
    },
  };
  return { calls, transport };
}

describe("QueryBuilder — синтаксис PostgREST", () => {
  it("select с фильтрами, порядком и лимитом", async () => {
    const { calls, transport } = capture();
    await new QueryBuilder(transport, "orders")
      .select("id, title, l2:categories_l2(id, name_ru)")
      .eq("status", "open")
      .in("l2_id", ["a", "b"])
      .is("read_at", null)
      .not("data->>kind", "eq", "new_order")
      .order("created_at", { ascending: false })
      .limit(20);
    const c = calls[0];
    expect(c?.method).toBe("GET");
    const q = new URLSearchParams(c?.query);
    expect(q.get("select")).toBe("id,title,l2:categories_l2(id,name_ru)");
    expect(q.get("status")).toBe("eq.open");
    expect(q.get("l2_id")).toBe("in.(a,b)");
    expect(q.get("read_at")).toBe("is.null");
    expect(q.get("data->>kind")).toBe("not.eq.new_order");
    expect(q.get("order")).toBe("created_at.desc");
    expect(q.get("limit")).toBe("20");
  });

  it("значения с запятыми и кавычками берутся в кавычки", async () => {
    const { calls, transport } = capture();
    await new QueryBuilder(transport, "users").select("id").eq("first_name", 'Иван, "Ваня"');
    expect(new URLSearchParams(calls[0]?.query).get("first_name")).toBe('eq."Иван, \\"Ваня\\""');
  });

  it("count/head — HEAD и Prefer count=exact, count из content-range", async () => {
    const { calls, transport } = capture();
    const res = await new QueryBuilder(transport, "orders").select("id", {
      count: "exact",
      head: true,
    });
    expect(calls[0]?.method).toBe("HEAD");
    expect(calls[0]?.headers.Prefer).toBe("count=exact");
    expect(res.count).toBe(7);
  });

  it("insert().select().single() — POST с return=representation, одна строка", async () => {
    const transport: Transport = {
      async request(input) {
        expect(input.method).toBe("POST");
        expect(input.headers.Prefer).toContain("return=representation");
        expect(input.body).toBe('{"title":"Дверь"}');
        return { status: 201, headers: new Headers(), text: '[{"id":"1","title":"Дверь"}]' };
      },
    };
    const res = await new QueryBuilder<{ id: string; title: string }>(transport, "orders")
      .insert({ title: "Дверь" })
      .select("*")
      .single();
    expect(res.error).toBeNull();
    expect(res.data?.title).toBe("Дверь");
  });

  it("maybeSingle без строк — null без ошибки; single без строк — PGRST116", async () => {
    const empty: Transport = {
      async request() {
        return { status: 200, headers: new Headers(), text: "[]" };
      },
    };
    const maybe = await new QueryBuilder(empty, "users").select("*").eq("id", "x").maybeSingle();
    expect(maybe.data).toBeNull();
    expect(maybe.error).toBeNull();
    const single = await new QueryBuilder(empty, "users").select("*").eq("id", "x").single();
    expect(single.error?.code).toBe("PGRST116");
  });

  it("ошибка PostgREST разбирается в code/message/details", async () => {
    const failing: Transport = {
      async request() {
        return {
          status: 403,
          headers: new Headers(),
          text: '{"code":"42501","message":"permission denied","details":null,"hint":null}',
        };
      },
    };
    const res = await new QueryBuilder(failing, "orders").select("*");
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("42501");
    expect(res.status).toBe(403);
  });

  it("update/delete — PATCH и DELETE с фильтром", async () => {
    const { calls, transport } = capture();
    await new QueryBuilder(transport, "users").update({ first_name: "Али" }).eq("id", "u1");
    await new QueryBuilder(transport, "user_blocks").delete().eq("blocker_id", "u1");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toBe('{"first_name":"Али"}');
    expect(calls[1]?.method).toBe("DELETE");
    expect(new URLSearchParams(calls[1]?.query).get("blocker_id")).toBe("eq.u1");
  });
});
