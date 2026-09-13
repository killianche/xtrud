import { describe, expect, it } from "vitest";
import { clientOrderTone, masterOrderTone } from "./order-card-tone";

describe("clientOrderTone", () => {
  it("четыре состояния автора", () => {
    expect(clientOrderTone({ status: "open" }).kind).toBe("open");
    expect(clientOrderTone({ status: "in_progress", picked_master_id: "m" }).kind).toBe("picked");
    expect(clientOrderTone({ status: "completed", picked_master_id: "m" }).kind).toBe("completed");
    expect(clientOrderTone({ status: "cancelled" })).toEqual({
      kind: "closed",
      label: "Закрыто",
      dimmed: true,
    });
    expect(clientOrderTone({ status: "expired" }).label).toBe("Истекло");
  });
});

describe("masterOrderTone", () => {
  it("выбрали меня — подсветка при любом статусе", () => {
    expect(
      masterOrderTone({ status: "in_progress", picked_master_id: "me" }, "me", "accepted"),
    ).toMatchObject({ kind: "chosenMe", label: "Вас выбрали", dimmed: false });
    expect(
      masterOrderTone({ status: "completed", picked_master_id: "me" }, "me", "accepted"),
    ).toMatchObject({ kind: "chosenMe", label: "Вы выполнили" });
    expect(
      masterOrderTone({ status: "cancelled", picked_master_id: "me" }, "me", "accepted").kind,
    ).toBe("chosenMe");
  });

  it("выбрали другого — приглушено", () => {
    expect(
      masterOrderTone({ status: "in_progress", picked_master_id: "x" }, "me", "sent"),
    ).toMatchObject({ kind: "chosenOther", dimmed: true });
  });

  it("открытое с живым откликом и закрытое без исполнителя", () => {
    expect(masterOrderTone({ status: "open" }, "me", "viewed").kind).toBe("open");
    expect(masterOrderTone({ status: "open" }, "me", "rejected").label).toBe("Отклонён");
    expect(masterOrderTone({ status: "cancelled" }, "me", "withdrawn").label).toBe(
      "Задание закрыто",
    );
  });
});
