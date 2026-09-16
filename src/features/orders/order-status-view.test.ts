import { describe, expect, it } from "vitest";
import { orderStatusView } from "./order-status-view";

// Таблицы §2.1 (заказчик) и §2.2 (специалист) docs/ORDER_STATUS_DESIGN.md —
// каждая строка проверена отдельным кейсом, включая решения 2026-09-14
// (красный XCircle только у заказчика на «Закрыто»).

describe("orderStatusView — заказчик (§2.1)", () => {
  const order = (status: string) => ({ status: status as never });

  it("open — «Открыто», без цвета, не архив", () => {
    expect(orderStatusView({ role: "client", order: order("open") })).toMatchObject({
      label: "Открыто",
      pillTone: "neutral",
      cardArchived: false,
    });
  });

  it("in_progress — «Исполнитель выбран», зелёная, не архив", () => {
    expect(orderStatusView({ role: "client", order: order("in_progress") })).toMatchObject({
      label: "Исполнитель выбран",
      pillTone: "confirmed",
      cardArchived: false,
    });
  });

  it("completed — «Завершено», архивная карточка, зелёная плашка", () => {
    const v = orderStatusView({ role: "client", order: order("completed") });
    expect(v).toMatchObject({ label: "Завершено", pillTone: "confirmed", cardArchived: true });
    expect(v.iconKey).toBe("check");
  });

  it("cancelled — «Закрыто», архив, красный XCircle (DECISION 2026-09-14)", () => {
    expect(orderStatusView({ role: "client", order: order("cancelled") })).toMatchObject({
      label: "Закрыто",
      pillTone: "cancelled",
      cardArchived: true,
    });
  });

  it("expired — «Истекло», архив, серая", () => {
    expect(orderStatusView({ role: "client", order: order("expired") })).toMatchObject({
      label: "Истекло",
      pillTone: "archive",
      cardArchived: true,
    });
  });

  it("draft — «Черновик», архив, без иконки (отдельная ветка, не default)", () => {
    const v = orderStatusView({ role: "client", order: order("draft") });
    expect(v).toMatchObject({ label: "Черновик", pillTone: "archive", cardArchived: true });
    expect(v.iconKey).toBeUndefined();
  });

  it("disputed (легаси, недостижим из приложения) — «Закрыто», архив, без иконки, НЕ «Черновик»", () => {
    const v = orderStatusView({ role: "client", order: order("disputed") });
    expect(v).toMatchObject({ label: "Закрыто", pillTone: "archive", cardArchived: true });
    expect(v.iconKey).toBeUndefined();
  });

  it("неизвестная строка статуса — тот же честный дефолт «Закрыто», не выдумывает факт", () => {
    const v = orderStatusView({ role: "client", order: order("some_future_status") });
    expect(v).toMatchObject({ label: "Закрыто", pillTone: "archive", cardArchived: true });
    expect(v.iconKey).toBeUndefined();
  });
});

describe("orderStatusView — специалист: отклик как сообщение (§0.2, 2026-09-16)", () => {
  const order = (status: string) => ({ status: status as never });
  const all = [
    "open",
    "in_progress",
    "awaiting_confirmation",
    "completed",
    "cancelled",
    "expired",
    "draft",
    "disputed",
    "some_future_status",
  ];

  it("не выбрали — всегда «Отклик отправлен», нейтрально, без архива, при любом статусе задания", () => {
    for (const status of all) {
      for (const resp of ["sent", "viewed", "rejected", "withdrawn"]) {
        const v = orderStatusView({
          role: "master",
          order: order(status),
          myResponseStatus: resp as never,
        });
        expect(v).toMatchObject({
          label: "Отклик отправлен",
          pillTone: "neutral",
          cardArchived: false,
        });
        expect(v.iconKey).toBeUndefined();
      }
    }
  });

  it("выбрали — «Вас выбрали», зелёная с галочкой, при любом статусе задания", () => {
    for (const status of all) {
      expect(
        orderStatusView({ role: "master", order: order(status), myResponseStatus: "accepted" }),
      ).toMatchObject({
        label: "Вас выбрали",
        pillTone: "confirmed",
        cardArchived: false,
        iconKey: "check",
      });
    }
  });

  it("выбрали, потом отказались (accepted → rejected) — снова нейтрально, без архивного тона", () => {
    expect(
      orderStatusView({ role: "master", order: order("open"), myResponseStatus: "rejected" }),
    ).toMatchObject({ label: "Отклик отправлен", pillTone: "neutral" });
  });
});
