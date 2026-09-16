import { describe, expect, it } from "vitest";
import {
  buildOrderSections,
  buildResponseList,
  countActiveOrders,
  countPendingResponses,
} from "./order-list-sections";
import type { OrderWithRefs } from "./use-my-orders";
import type { MyResponseWithOrder } from "./use-my-responses";

// Минимум полей, которых требует orderStatusView({role:"client"|"master"}) +
// created_at для сортировки. Остальное OrderWithRefs/MyResponseWithOrder не
// используется этими функциями, приводим типы через unknown как в фикстурах
// соседних тестов feature-модуля.
function order(id: string, status: string, createdAt: string): OrderWithRefs {
  return { id, status, created_at: createdAt, picked_master_id: null } as unknown as OrderWithRefs;
}

function response(
  id: string,
  orderId: string,
  responseStatus: string,
  orderStatus: string,
  createdAt: string,
): MyResponseWithOrder {
  return {
    response: { id, status: responseStatus, created_at: createdAt, master_id: "me" } as never,
    order: { id: orderId, status: orderStatus, picked_master_id: null } as never,
  } as MyResponseWithOrder;
}

describe("buildOrderSections — «Как клиент»", () => {
  it("без архива — заголовка нет, активные сначала confirmed, потом по дате", () => {
    const list = [
      order("a", "open", "2026-01-01T00:00:00Z"),
      order("b", "in_progress", "2026-01-02T00:00:00Z"),
      order("c", "open", "2026-01-03T00:00:00Z"),
    ];
    const sections = buildOrderSections(list);
    expect(sections.every((s) => s.kind === "row")).toBe(true);
    expect(sections.map((s) => (s.kind === "row" ? s.id : null))).toEqual(["b", "c", "a"]);
  });

  it("с архивом — заголовок ровно один раз, перед архивом", () => {
    const list = [
      order("a", "open", "2026-01-01T00:00:00Z"),
      order("b", "completed", "2026-01-05T00:00:00Z"),
      order("c", "cancelled", "2026-01-03T00:00:00Z"),
    ];
    const sections = buildOrderSections(list);
    const headerIdx = sections.findIndex((s) => s.kind === "archiveHeader");
    expect(headerIdx).toBeGreaterThan(-1);
    expect(sections.filter((s) => s.kind === "archiveHeader")).toHaveLength(1);
    // Активная "a" перед заголовком, архивные "b"/"c" после, по дате убыв.
    expect(sections[0]).toMatchObject({ kind: "row", id: "a" });
    expect(sections[headerIdx + 1]).toMatchObject({ kind: "row", id: "b" });
    expect(sections[headerIdx + 2]).toMatchObject({ kind: "row", id: "c" });
  });

  it("все элементы архивные — заголовок всё равно показывается", () => {
    const list = [order("a", "completed", "2026-01-01T00:00:00Z")];
    const sections = buildOrderSections(list);
    expect(sections[0]).toEqual({ kind: "archiveHeader" });
    expect(sections[1]).toMatchObject({ kind: "row", id: "a" });
  });

  it("пустой список — пустые секции, без заголовка", () => {
    expect(buildOrderSections([])).toEqual([]);
  });
});

describe("buildResponseList — «Как мастер» (§0.3)", () => {
  it("один плоский список: «Вас выбрали» сверху, дальше по дате, без заголовка архива", () => {
    const list = [
      response("r1", "o1", "sent", "open", "2026-01-05T00:00:00Z"),
      response("r2", "o2", "accepted", "completed", "2026-01-01T00:00:00Z"),
      response("r3", "o3", "withdrawn", "cancelled", "2026-01-07T00:00:00Z"),
    ];
    const items = buildResponseList(list);
    expect(items.every((i) => i.kind === "row")).toBe(true);
    expect(items.map((i) => (i.kind === "row" ? i.id : null))).toEqual(["r2", "r3", "r1"]);
  });

  it("исполнитель задания — я, даже если отклик отозван старой схемой закрытия", () => {
    const r = response("r1", "o1", "withdrawn", "cancelled", "2026-01-01T00:00:00Z");
    (r.order as { picked_master_id: string | null }).picked_master_id = "me";
    const [item] = buildResponseList([r]);
    expect(item?.kind === "row" && item.statusView.label).toBe("Вас выбрали");
  });
});

describe("countActiveOrders / countPendingResponses", () => {
  it("считает только активные (cardArchived === false)", () => {
    const list = [
      order("a", "open", "2026-01-01T00:00:00Z"),
      order("b", "in_progress", "2026-01-01T00:00:00Z"),
      order("c", "completed", "2026-01-01T00:00:00Z"),
    ];
    expect(countActiveOrders(list)).toBe(2);
  });

  it("0 активных → null, не 0 (счётчик скрывается совсем)", () => {
    const list = [order("a", "completed", "2026-01-01T00:00:00Z")];
    expect(countActiveOrders(list)).toBeNull();
  });

  it("пустой список → null", () => {
    expect(countActiveOrders([])).toBeNull();
  });

  it("отклики: считаются только ждущие решения клиента (задание открыто, отклик живой)", () => {
    const list = [
      response("r1", "o1", "sent", "open", "2026-01-01T00:00:00Z"),
      response("r2", "o2", "viewed", "open", "2026-01-01T00:00:00Z"),
      response("r3", "o3", "sent", "in_progress", "2026-01-01T00:00:00Z"),
      response("r4", "o4", "rejected", "open", "2026-01-01T00:00:00Z"),
      response("r5", "o5", "accepted", "completed", "2026-01-01T00:00:00Z"),
    ];
    expect(countPendingResponses(list)).toBe(2);
    expect(countPendingResponses([])).toBeNull();
  });
});
