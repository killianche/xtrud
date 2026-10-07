import { describe, expect, it } from "vitest";
import { searchTaskPhrases } from "@/features/categories/task-phrase-search";
import { TASK_PHRASES } from "@/features/categories/task-phrases";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { guessCategoryId } from "./guess-category";

const visible = new Set(TASK_PHRASES.map((p) => p.l2));
const guess = (text: string) =>
  guessCategoryId(
    searchTaskPhrases(text, TASK_PHRASES, 6).map((h) => h.phrase),
    visible,
  );

describe("guessCategoryId", () => {
  it("формулировка из словаря — её категория", () => {
    expect(guess("Убраться в комнате")).toBe("cleaning");
    expect(guess("ремонт котла")).toBe("climate");
  });

  it("не знаем наверняка — без категории, подберёт админ (снимки владельца №269)", () => {
    expect(guess("Переставить столы в кафе")).toBe(UNCATEGORIZED_L2_ID);
    expect(guess("абракадабра")).toBe(UNCATEGORIZED_L2_ID);
  });

  it("уточнение после предлога не мешает («в комнате 10 квадратов»)", () => {
    expect(guess("Убраться в комнате 10 квадратов")).toBe("cleaning");
  });

  it("скрытая категория не ставится", () => {
    expect(guessCategoryId([{ l2: "hidden" }], new Set(["a"]))).toBe(UNCATEGORIZED_L2_ID);
    expect(guessCategoryId([{ l2: "hidden" }, { l2: "a" }], new Set(["a"]))).toBe("a");
  });
});

// Живые фразы по всем разделам каталога (№264, после ошибки с уборкой и
// кондиционерами): «Далее» должна ставить ту категорию, которую ждёт человек.
const CASES: [string, string][] = [
  ["Убраться в комнате", "cleaning"],
  ["Убраться в квартире после гостей", "cleaning"],
  ["помыть окна на балконе", "cleaning"],
  ["уборка после ремонта", "cleaning-post-renovation"],
  ["вывезти мусор", "disposal"],
  ["вывезти старый диван на свалку", "disposal"],
  ["поменять розетку", "electrical"],
  ["нет света в комнате", "electrical"],
  ["повесить люстру", "electrical"],
  ["течёт кран на кухне", "plumbing"],
  ["поменять смеситель", "plumbing"],
  ["засор в раковине", "plumbing"],
  ["установить унитаз", "plumbing"],
  ["установить кондиционер", "climate-control"],
  ["заправить кондиционер", "climate-control"],
  ["ремонт котла", "climate"],
  ["не греет батарея", "climate"],
  ["поклеить обои в спальне", "wallpaper"],
  ["положить плитку в ванной", "tiling"],
  ["постелить ламинат", "floors"],
  ["покрасить стены", "painting"],
  ["шпаклёвка стен", "painting"],
  ["натяжной потолок в зале", "tension-ceilings"],
  ["установить межкомнатную дверь", "doors"],
  ["поменять окна", "windows"],
  ["собрать шкаф", "furniture"],
  ["повесить полку", "handyman"],
  ["перевезти диван", "cargo-transport"],
  ["нужны грузчики", "movers"],
  ["отремонтировать стиральную машину", "appliance-repair"],
  ["не работает холодильник", "appliance-repair"],
  ["настроить компьютер", "pc-repair"],
  ["отремонтировать телефон", "pc-repair"],
  ["поставить видеонаблюдение", "security-systems"],
  ["вскрыть замок", "locks-security"],
  ["построить забор", "fences-gates"],
  ["залить фундамент", "concrete"],
  ["перекрыть крышу", "roofing"],
  ["сварить ворота", "welding"],
  ["пробурить скважину", "drilling-wells"],
  ["покосить траву", "garden"],
  ["спилить дерево", "garden"],
  ["постирать шторы", "laundry"],
  ["травить тараканов", "pest-control"],
  ["откачать септик", "water-sewer"],
  ["нужен экскаватор", "machinery"],
  ["нужна няня", "caregivers"],
  ["репетитор по математике", "school-subjects"],
  ["подготовка к ЕГЭ", "exam-prep"],
  ["уроки английского", "languages"],
  ["нужен юрист", "lawyers"],
  ["составить декларацию", "accountants"],
  ["шиномонтаж", "tire-service"],
  ["помыть машину", "car-wash"],
  ["выровнять вмятину", "body-repair"],
  ["эвакуатор", "tow-truck"],
  ["доставить посылку", "courier-delivery"],
  ["дизайн проект квартиры", "interior-design"],
  ["утеплить дом", "insulation"],
];

describe("guessCategoryId — живые фразы по разделам (№264)", () => {
  it.each(CASES)("«%s» → %s", (text, want) => {
    expect(guess(text)).toBe(want);
  });
});
