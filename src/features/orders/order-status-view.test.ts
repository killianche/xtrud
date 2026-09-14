import { describe, expect, it } from "vitest";
import { orderStatusView } from "./order-status-view";

// Таблицы §2.1 (заказчик) и §2.2 (специалист) docs/ORDER_STATUS_DESIGN.md —
// каждая строка проверена отдельным кейсом, включая решения 2026-09-14
// (красный XCircle только у заказчика на «Закрыто»).

describe("orderStatusView — заказчик (§2.1)", () => {
  const order = (status: string) => ({
    status: status as never,
    picked_master_id: null,
  });

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
});

describe("orderStatusView — специалист (§2.2)", () => {
  const order = (status: string) => ({
    status: status as never,
    picked_master_id: null,
  });

  it("open + sent — «Отклик отправлен», без цвета", () => {
    expect(
      orderStatusView({ role: "master", order: order("open"), myResponseStatus: "sent" }),
    ).toMatchObject({ label: "Отклик отправлен", pillTone: "neutral", cardArchived: false });
  });

  it("open + viewed — «Клиент прочитал», без цвета", () => {
    expect(
      orderStatusView({ role: "master", order: order("open"), myResponseStatus: "viewed" }),
    ).toMatchObject({ label: "Клиент прочитал", pillTone: "neutral", cardArchived: false });
  });

  it("open + rejected — «Отклонён», архив", () => {
    expect(
      orderStatusView({ role: "master", order: order("open"), myResponseStatus: "rejected" }),
    ).toMatchObject({ label: "Отклонён", pillTone: "archive", cardArchived: true });
  });

  it("open + withdrawn — «Отозван», архив, иконка ArrowUUpLeft (bold)", () => {
    const v = orderStatusView({
      role: "master",
      order: order("open"),
      myResponseStatus: "withdrawn",
    });
    expect(v).toMatchObject({ label: "Отозван", pillTone: "archive", cardArchived: true });
    expect(v.iconWeight).toBe("bold");
  });

  it("in_progress, выбрали меня — «Вы исполнитель», зелёная, НЕ архив", () => {
    expect(
      orderStatusView({
        role: "master",
        order: order("in_progress"),
        myResponseStatus: "accepted",
      }),
    ).toMatchObject({ label: "Вы исполнитель", pillTone: "confirmed", cardArchived: false });
  });

  it("in_progress, выбрали другого — «Выбран другой», архив", () => {
    expect(
      orderStatusView({ role: "master", order: order("in_progress"), myResponseStatus: "sent" }),
    ).toMatchObject({ label: "Выбран другой", pillTone: "archive", cardArchived: true });
  });

  it("completed, выбрали меня — «Вы выполнили», архивная карточка, зелёная плашка", () => {
    expect(
      orderStatusView({ role: "master", order: order("completed"), myResponseStatus: "accepted" }),
    ).toMatchObject({ label: "Вы выполнили", pillTone: "confirmed", cardArchived: true });
  });

  it("completed, выбрали другого — «Выбран другой», архив, серая", () => {
    expect(
      orderStatusView({ role: "master", order: order("completed"), myResponseStatus: "sent" }),
    ).toMatchObject({ label: "Выбран другой", pillTone: "archive", cardArchived: true });
  });

  it("cancelled/expired, был выбран я — «Отменено», архив, НЕ зелёная (серая, не cancelled-тон)", () => {
    for (const status of ["cancelled", "expired"]) {
      expect(
        orderStatusView({ role: "master", order: order(status), myResponseStatus: "accepted" }),
      ).toMatchObject({ label: "Отменено", pillTone: "archive", cardArchived: true });
    }
  });

  it("cancelled, не был выбран — «Задание закрыто», архив, серая (не красная — привилегия заказчика)", () => {
    expect(
      orderStatusView({ role: "master", order: order("cancelled"), myResponseStatus: "sent" }),
    ).toMatchObject({ label: "Задание закрыто", pillTone: "archive", cardArchived: true });
  });

  it("expired, не был выбран — «Истекло», архив", () => {
    expect(
      orderStatusView({ role: "master", order: order("expired"), myResponseStatus: "sent" }),
    ).toMatchObject({ label: "Истекло", pillTone: "archive", cardArchived: true });
  });
});
