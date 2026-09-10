import { describe, expect, it } from "vitest";
import { pushPermissionState } from "./push-permission-state";

describe("pushPermissionState", () => {
  it("разрешено — строку не показываем", () => {
    expect(pushPermissionState({ granted: true, canAskAgain: false })).toBe("granted");
  });

  it("ещё не спрашивали — можно спросить из приложения", () => {
    expect(pushPermissionState({ granted: false, canAskAgain: true })).toBe("undetermined");
  });

  it("после «Не разрешать» — только настройки iPhone", () => {
    expect(pushPermissionState({ granted: false, canAskAgain: false })).toBe("denied");
  });
});
