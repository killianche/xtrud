import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Аудит №298: на Android promptAsync возвращал null, и админские «Скрыть»,
// «Заблокировать», решения по жалобам молча не работали. Теперь — окно
// PromptHost; контракт: запрос открывается и отдаёт введённое.
vi.mock("react-native", () => ({ Platform: { OS: "android" }, Alert: {} }));

describe("promptAsync на Android", () => {
  it("открывает окно и возвращает введённое", async () => {
    const { promptAsync, usePromptStore } = await import("./prompt");
    const pending = promptAsync({ title: "Причина" });
    expect(usePromptStore.getState().request?.title).toBe("Причина");
    usePromptStore.getState().close("спам");
    await expect(pending).resolves.toBe("спам");
    expect(usePromptStore.getState().request).toBeNull();
  });

  it("отмена — null", async () => {
    const { promptAsync, usePromptStore } = await import("./prompt");
    const pending = promptAsync({ title: "Причина" });
    usePromptStore.getState().close(null);
    await expect(pending).resolves.toBeNull();
  });

  it("окно подключено в корне приложения", () => {
    expect(readFileSync("app/_layout.tsx", "utf8")).toContain("<PromptHost />");
  });
});
