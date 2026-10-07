import { describe, expect, it } from "vitest";
import { searchTaskPhrases } from "./task-phrase-search";
import { TASK_PHRASES } from "./task-phrases";

// Живые фразы по всем разделам каталога (№264): первая подсказка словаря
// ведёт в ту категорию, которую ждёт человек. С №281 категорию по тексту
// ставит нейросеть, а подсказка — по нажатию, но качество словаря то же.
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

describe("первая подсказка — нужная категория (№264, №281)", () => {
  it.each(CASES)("«%s» → %s", (text, want) => {
    expect(searchTaskPhrases(text, TASK_PHRASES, 6)[0]?.phrase.l2).toBe(want);
  });
});
