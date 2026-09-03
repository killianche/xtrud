import { describe, expect, it } from "vitest";
import { groupByMaster } from "./group-by-master";

describe("groupByMaster", () => {
  it("раскладывает строки по мастерам", () => {
    const rows = [
      { master_id: "a", id: 1 },
      { master_id: "b", id: 2 },
      { master_id: "a", id: 3 },
    ];
    const grouped = groupByMaster(rows);
    expect(grouped.get("a")?.map((r) => r.id)).toEqual([1, 3]);
    expect(grouped.get("b")?.map((r) => r.id)).toEqual([2]);
  });

  it("сохраняет порядок, в котором строки пришли с сервера", () => {
    // Сортировку задаёт запрос (position, created_at). Группировка не имеет
    // права её менять, иначе услуги в карточке встанут не в том порядке.
    const rows = [
      { master_id: "a", id: 10 },
      { master_id: "a", id: 20 },
      { master_id: "a", id: 30 },
    ];
    expect(
      groupByMaster(rows)
        .get("a")
        ?.map((r) => r.id),
    ).toEqual([10, 20, 30]);
  });

  it("не выдумывает записи для мастера, которого нет в выдаче", () => {
    expect(groupByMaster([{ master_id: "a", id: 1 }]).get("b")).toBeUndefined();
  });

  it("переживает пустую выдачу", () => {
    expect(groupByMaster([]).size).toBe(0);
  });
});
