import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// №276: прямой ActionSheetIOS на Android падал «ActionSheetManager doesn't
// exist» (рабочая 1.0.5). Меню действий — только через src/lib/action-menu.ts;
// исключение — use-composer-close.ts, где вызов под Platform.OS === "ios".
const ALLOWED = new Set([
  "src/lib/action-menu.ts",
  "src/features/task-composer/use-composer-close.ts",
]);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !name.includes(".test.") ? [p] : [];
  });
}

describe("ActionSheetIOS — только через общее меню", () => {
  it("нет прямых вызовов вне action-menu.ts", () => {
    const offenders = [...files("src"), ...files("app")].filter(
      (p) =>
        !ALLOWED.has(p) &&
        /ActionSheetIOS\.showActionSheetWithOptions/.test(readFileSync(p, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
