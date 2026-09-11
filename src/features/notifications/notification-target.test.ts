import { describe, expect, it } from "vitest";
import { mergePushData, notificationTargetFromData } from "./notification-target";

const ORDER = "4f9ac7d8-5e15-4857-aa5d-fb92e9c183fb";
const ME = "c17f2662-fe32-4f4c-b6f2-7854225fa340";

describe("notificationTargetFromData", () => {
  it("отзыв ведёт в свой профиль", () => {
    expect(notificationTargetFromData({ type: "review_received", review_id: "r" }, ME)).toBe(
      `/master/${ME}`,
    );
  });

  it("отзыв без вошедшего — никуда", () => {
    expect(notificationTargetFromData({ type: "review_received" }, null)).toBeNull();
  });

  it("отклик и события задания ведут в задание", () => {
    expect(notificationTargetFromData({ type: "new_response", order_id: ORDER }, ME)).toBe(
      `/orders/${ORDER}`,
    );
  });

  it("не uuid вместо задания в адрес не превращается", () => {
    expect(notificationTargetFromData({ order_id: "../admin" }, ME)).toBeNull();
    expect(notificationTargetFromData({ order_id: 42 }, ME)).toBeNull();
  });

  it("без данных — никуда", () => {
    expect(notificationTargetFromData(null, ME)).toBeNull();
  });
});

describe("mergePushData", () => {
  it("берёт наши поля из корня тела push и отбрасывает aps", () => {
    expect(
      mergePushData({}, { aps: { alert: { title: "t" } }, type: "new_response", order_id: ORDER }),
    ).toEqual({ type: "new_response", order_id: ORDER });
  });

  it("content.data важнее тела", () => {
    expect(mergePushData({ type: "a" }, { type: "b" })).toEqual({ type: "a" });
  });

  it("не объект — пустые данные", () => {
    expect(mergePushData(null, "x")).toEqual({});
    expect(mergePushData([1], undefined)).toEqual({});
  });
});
