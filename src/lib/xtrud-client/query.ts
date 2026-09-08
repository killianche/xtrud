/**
 * Построитель запросов к PostgREST через /v2/rest — то подмножество API
 * supabase-js, которым пользуется приложение (инвентаризация 2026-09-08):
 * select/eq/neq/in/is/not/or/gt/gte/lt/lte/contains/match/order/limit/range/
 * maybeSingle/single/insert/update/delete/upsert/abortSignal, count+head.
 * Синтаксис параметров — PostgREST (postgrest.org/en/stable/references/api).
 */

import type { ApiError, QueryResult } from "./types";

export interface Transport {
  request(input: {
    method: string;
    path: string;
    query: URLSearchParams;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; headers: Headers; text: string }>;
}

type Method = "GET" | "HEAD" | "POST" | "PATCH" | "DELETE";

const RESERVED = /[,()."\s]/;

function literal(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string")
    return RESERVED.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  return String(value);
}

function cleanSelect(columns: string): string {
  // Как postgrest-js: убираем пробелы и переносы вне кавычек.
  let quoted = false;
  let out = "";
  for (const ch of columns) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && /\s/.test(ch)) continue;
    out += ch;
  }
  return out;
}

// biome-ignore lint/suspicious/noExplicitAny: строки таблиц типизирует Database, встроенные связи — any
export class QueryBuilder<Row = any, Result = Row[]> implements PromiseLike<QueryResult<Result>> {
  private method: Method = "GET";
  private readonly query = new URLSearchParams();
  private readonly headers: Record<string, string> = {};
  private body: string | undefined;
  private wantCount = false;
  private headOnly = false;
  private singleMode: "single" | "maybe" | null = null;
  private signal: AbortSignal | undefined;

  constructor(
    private readonly transport: Transport,
    private readonly table: string,
  ) {}

  select(
    columns = "*",
    opts?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.query.set("select", cleanSelect(columns));
    if (opts?.count) {
      this.wantCount = true;
      this.addPrefer(`count=${opts.count}`);
    }
    if (opts?.head) this.headOnly = true;
    if (this.method !== "GET") this.addPrefer("return=representation");
    return this;
  }

  insert(values: Partial<Row> | Partial<Row>[], opts?: { count?: "exact" }): this {
    this.method = "POST";
    this.body = JSON.stringify(values);
    if (opts?.count) {
      this.wantCount = true;
      this.addPrefer(`count=${opts.count}`);
    }
    return this;
  }

  upsert(
    values: Partial<Row> | Partial<Row>[],
    opts?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.method = "POST";
    this.body = JSON.stringify(values);
    this.addPrefer(
      opts?.ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates",
    );
    if (opts?.onConflict) this.query.set("on_conflict", opts.onConflict);
    return this;
  }

  update(values: Partial<Row>): this {
    this.method = "PATCH";
    this.body = JSON.stringify(values);
    return this;
  }

  delete(): this {
    this.method = "DELETE";
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.filter(column, "eq", value);
  }
  neq(column: string, value: unknown): this {
    return this.filter(column, "neq", value);
  }
  gt(column: string, value: unknown): this {
    return this.filter(column, "gt", value);
  }
  gte(column: string, value: unknown): this {
    return this.filter(column, "gte", value);
  }
  lt(column: string, value: unknown): this {
    return this.filter(column, "lt", value);
  }
  lte(column: string, value: unknown): this {
    return this.filter(column, "lte", value);
  }
  like(column: string, pattern: string): this {
    return this.filter(column, "like", pattern);
  }
  ilike(column: string, pattern: string): this {
    return this.filter(column, "ilike", pattern);
  }
  is(column: string, value: null | boolean): this {
    return this.filter(column, "is", value);
  }
  in(column: string, values: readonly unknown[]): this {
    this.query.append(column, `in.(${values.map(literal).join(",")})`);
    return this;
  }
  contains(column: string, value: unknown[] | Record<string, unknown> | string): this {
    const v = Array.isArray(value)
      ? `{${value.map(literal).join(",")}}`
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
    this.query.append(column, `cs.${v}`);
    return this;
  }
  not(column: string, operator: string, value: unknown): this {
    this.query.append(column, `not.${operator}.${literal(value)}`);
    return this;
  }
  or(filters: string, opts?: { foreignTable?: string }): this {
    this.query.append(opts?.foreignTable ? `${opts.foreignTable}.or` : "or", `(${filters})`);
    return this;
  }
  match(criteria: Record<string, unknown>): this {
    for (const [k, v] of Object.entries(criteria)) this.eq(k, v);
    return this;
  }
  filter(column: string, operator: string, value: unknown): this {
    this.query.append(column, `${operator}.${literal(value)}`);
    return this;
  }

  order(
    column: string,
    opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string },
  ): this {
    const dir = opts?.ascending === false ? "desc" : "asc";
    const nulls =
      opts?.nullsFirst === undefined ? "" : opts.nullsFirst ? ".nullsfirst" : ".nullslast";
    const key = opts?.foreignTable ? `${opts.foreignTable}.order` : "order";
    const prev = this.query.get(key);
    this.query.set(key, `${prev ? `${prev},` : ""}${column}.${dir}${nulls}`);
    return this;
  }
  limit(count: number, opts?: { foreignTable?: string }): this {
    this.query.set(opts?.foreignTable ? `${opts.foreignTable}.limit` : "limit", String(count));
    return this;
  }
  range(from: number, to: number): this {
    this.query.set("offset", String(from));
    this.query.set("limit", String(to - from + 1));
    return this;
  }
  abortSignal(signal: AbortSignal): this {
    this.signal = signal;
    return this;
  }
  maybeSingle(): QueryBuilder<Row, Row | null> {
    this.singleMode = "maybe";
    return this as unknown as QueryBuilder<Row, Row | null>;
  }
  /** Ровно одна строка, иначе ошибка PGRST116 — как у postgrest-js. */
  single(): QueryBuilder<Row, Row> {
    this.singleMode = "single";
    return this as unknown as QueryBuilder<Row, Row>;
  }

  private addPrefer(value: string): void {
    const prev = this.headers.Prefer;
    if (prev?.split(",").includes(value)) return;
    this.headers.Prefer = prev ? `${prev},${value}` : value;
  }

  async execute(): Promise<QueryResult<Result>> {
    const method: Method = this.headOnly ? "HEAD" : this.method;
    const headers: Record<string, string> = { ...this.headers, Accept: "application/json" };
    if (this.body !== undefined) headers["Content-Type"] = "application/json";
    let res: { status: number; headers: Headers; text: string };
    try {
      res = await this.transport.request({
        method,
        path: this.table,
        query: this.query,
        headers,
        body: this.body,
        signal: this.signal,
      });
    } catch (e) {
      const err = e as { message?: string; code?: string; name?: string };
      return {
        data: null,
        error: { message: err.message ?? "Нет связи с сервером", code: err.code ?? err.name },
        count: null,
        status: 0,
      };
    }
    const range = res.headers.get("content-range");
    const count = this.wantCount && range ? Number(range.split("/")[1]) : null;
    if (res.status >= 400) {
      let parsed: Partial<ApiError> = {};
      try {
        parsed = JSON.parse(res.text) as Partial<ApiError>;
      } catch {
        parsed = { message: res.text };
      }
      return {
        data: null,
        error: {
          message: parsed.message ?? "Ошибка сервера",
          code: parsed.code,
          details: parsed.details ?? null,
          hint: parsed.hint ?? null,
          status: res.status,
        },
        count: Number.isFinite(count) ? count : null,
        status: res.status,
      };
    }
    let data: unknown = null;
    if (!this.headOnly && res.text.length > 0) {
      try {
        data = JSON.parse(res.text);
      } catch {
        data = null;
      }
    }
    if (this.singleMode) {
      const rows = Array.isArray(data) ? data : data == null ? [] : [data];
      if (rows.length > 1 || (this.singleMode === "single" && rows.length === 0)) {
        return {
          data: null,
          error: {
            message: rows.length === 0 ? "Строка не найдена" : "Ожидалась одна строка",
            code: "PGRST116",
            details: `${rows.length} rows`,
            hint: null,
            status: 406,
          },
          count: null,
          status: 406,
        };
      }
      data = rows[0] ?? null;
    }
    return {
      data: data as Result,
      error: null,
      count: Number.isFinite(count) ? count : null,
      status: res.status,
    };
  }

  // biome-ignore lint/suspicious/noThenProperty: построитель — thenable, как postgrest-js: `await supabase.from(...)`
  then<R1 = QueryResult<Result>, R2 = never>(
    onfulfilled?: ((value: QueryResult<Result>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}
