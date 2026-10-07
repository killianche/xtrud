/**
 * Поиск по словарю формулировок задач (№248, `task-phrases.ts`) — подсказки
 * первого экрана создания задания, как у YouDo: «отремон» → «Отремонтировать
 * телефон», «Отремонтировать ноутбук»…; «отремонтировать ко» → «…компьютер»,
 * «…газовый котёл». Касание подсказки выбирает её категорию и делает её
 * названием задания.
 *
 * Правила совпадения (чистая функция, проверяется тестами):
 *  - регистр и ё/е не важны, знаки препинания — пробелы;
 *  - каждое слово запроса должно найтись в формулировке; порядок не важен;
 *  - любое слово совпадает началом («ко» → «котёл»); слова от пяти букв —
 *    ещё и по основе без окончания («котла» → «котёл», «розетку» → «розетки»,
 *    «мусора» → «мусор»), при близкой длине;
 *  - одна работа разными словами: «ремонт» = «отремонтировать»/«починить»,
 *    «замена» = «поменять», «вывоз» = «вывезти» (SAME_WORK);
 *  - слова «нужно», «надо», «срочно»… не сужают поиск, предлоги и союзы
 *    («в», «на», «для»…) — тоже: «убраться в комнате» не должно требовать
 *    слова на «в» и находить «Убрать вмятину» (№259).
 * Порядок: формулировка начинается с первого слова запроса → выше; затем
 * частота задачи (weight); затем короче.
 */

export interface PhraseLike {
  text: string;
  l2: string;
  weight: number;
}

export interface PhraseHit<T extends PhraseLike> {
  phrase: T;
  score: number;
}

const STOP = new Set([
  "нужно",
  "нужен",
  "нужна",
  "нужны",
  "надо",
  "мне",
  "нам",
  "хочу",
  "пожалуйста",
  "срочно",
  "чтобы",
  "кто",
  "может",
  "можно",
  "сделать",
  // Жалоба вместо задачи (№264): «не работает холодильник» — это про
  // холодильник, а слова поломки в формулировках обычно нет.
  "не",
  "работает",
  "работают",
  "сломался",
  "сломалась",
  "сломалось",
  "сломались",
  "барахлит",
]);

/** Предлоги и союзы не сужают поиск. */
const FUNCTION_WORDS = new Set([
  "в",
  "во",
  "на",
  "с",
  "со",
  "у",
  "к",
  "ко",
  "о",
  "об",
  "от",
  "до",
  "за",
  "из",
  "по",
  "под",
  "над",
  "при",
  "для",
  "без",
  "и",
  "или",
]);

/**
 * Одна работа — разные слова: «ремонт котла» = «отремонтировать котёл»,
 * «замена розетки» = «поменять розетку». Начало слова запроса → какими ещё
 * началами слов формулировки оно может быть.
 */
const SAME_WORK: readonly [string, readonly string[]][] = [
  ["ремонт", ["отремонт", "почин", "ремонт"]],
  ["почин", ["отремонт", "почин", "ремонт"]],
  ["отремонт", ["отремонт", "почин", "ремонт"]],
  ["замен", ["замен", "помен"]],
  ["помен", ["замен", "помен"]],
  ["установк", ["установ", "подключ", "монтаж", "постав"]],
  ["постав", ["постав", "установ", "монтаж"]],
  ["травит", ["травит", "потрав", "обработ", "вывест", "избав"]],
  ["потрав", ["травит", "потрав", "обработ", "вывест", "избав"]],
  ["монтаж", ["установ", "монтаж"]],
  ["подключ", ["подключ", "установ"]],
  ["вывоз", ["вывез", "вывоз"]],
  ["вывез", ["вывез", "вывоз"]],
  // Уборка: «убраться» и «прибраться» — только про уборку; простое «убрать»
  // бывает и «убрать вмятину», поэтому «уборка» его не тянет (№259).
  ["уборк", ["убор", "убратьс", "убира", "прибра"]],
  ["убратьс", ["убор", "убратьс", "убира", "прибра"]],
  ["прибра", ["убор", "убратьс", "убира", "прибра"]],
  ["убира", ["убор", "убратьс", "убира", "прибра"]],
  ["убрат", ["убор", "убра"]],
  ["покраск", ["покрас", "покраск"]],
  ["покрас", ["покрас", "покраск"]],
  ["мойк", ["помы", "мыт", "мойк"]],
  ["помыт", ["помы", "мыт", "мойк"]],
  ["сборк", ["собра", "сборк"]],
  ["собрат", ["собра", "сборк"]],
  ["перевозк", ["перевез", "перевозк"]],
  ["перевез", ["перевез", "перевозк"]],
  ["чистк", ["почист", "чистк", "очист"]],
  ["почист", ["почист", "чистк", "очист"]],
];

function alternatives(queryWord: string): readonly string[] | null {
  for (const [start, alts] of SAME_WORK) if (queryWord.startsWith(start)) return alts;
  return null;
}

function norm(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/[^а-яa-z0-9]+/gi, " ")
    .trim();
}

function words(value: string): string[] {
  const n = norm(value);
  return n ? n.split(" ") : [];
}

/** Основа законченного слова: без двух последних букв, но не короче четырёх. */
function stem(word: string): string {
  return word.length <= 4 ? word : word.slice(0, Math.max(4, word.length - 2));
}

/** Согласные слова без конечных гласных: «котёл» и «котла» → «ктл». */
function skeleton(word: string): string {
  return word.replace(/[аеиоуыэюяьъй]+$/u, "").replace(/[аеиоуыэюяьъй]/gu, "");
}

function wordMatches(queryWord: string, phraseWord: string): boolean {
  if (phraseWord.startsWith(queryWord)) return true;
  // Остальное — для слов от пяти букв (уже напечатано целое слово, возможно
  // с другим окончанием) и только при близкой длине: «котла» не должно
  // находить «котлован».
  if (queryWord.length < 5 || Math.abs(queryWord.length - phraseWord.length) > 2) return false;
  if (phraseWord.startsWith(stem(queryWord))) return true;
  // Беглая гласная: «котла» — «котёл», «замка» — «замок». Тот же костяк
  // согласных; первые две буквы те же («перевезти» ≠ «привезти»).
  const qs = skeleton(queryWord);
  return (
    qs.length >= 3 &&
    queryWord.slice(0, 2) === phraseWord.slice(0, 2) &&
    skeleton(phraseWord).startsWith(qs)
  );
}

export function searchTaskPhrases<T extends PhraseLike>(
  query: string,
  phrases: readonly T[],
  limit = 6,
): PhraseHit<T>[] {
  const endsWithSpace = /\s$/.test(query);
  // Всё после первого предлога — уточнение места или предмета («поклеить
  // обои | в спальне», «течёт кран | на кухне»): совпасть должны слова до
  // него, уточнение лишь поднимает подходящие выше (№269). Печатаемое
  // последнее слово может оказаться началом другого («ко» → «котёл»): тогда
  // это не предлог — отбрасываем только однобуквенное «в», «с»…
  const raw = words(query);
  const items: { w: string; optional: boolean }[] = [];
  let afterPreposition = false;
  raw.forEach((w, i) => {
    const typing = i === raw.length - 1 && !endsWithSpace;
    if (FUNCTION_WORDS.has(w) && !(typing && w.length > 1)) {
      afterPreposition = true;
      return;
    }
    if (STOP.has(w) && !typing) return;
    items.push({ w, optional: afterPreposition });
  });
  if (items.length === 0) return [];
  const required = items.some((x) => !x.optional) ? items.filter((x) => !x.optional) : items;
  const optional = required === items ? [] : items.filter((x) => x.optional);
  const q = required.map((x) => x.w);
  const matches = (qw: string, pw: readonly string[]) => {
    // Синонимы работы (SAME_WORK) — и для печатаемого слова: начало в
    // SAME_WORK не короче пяти букв, значит слово уже узнаваемо
    // («убраться» без пробела после — уже уборка, №259).
    const alts = alternatives(qw);
    return pw.some((w) => wordMatches(qw, w) || (alts?.some((a) => w.startsWith(a)) ?? false));
  };

  const hits: PhraseHit<T>[] = [];
  for (const phrase of phrases) {
    const pw = words(phrase.text);
    if (!q.every((qw) => matches(qw, pw))) continue;
    // Начинается с первого слова запроса — выше, но не настолько, чтобы
    // перебить частоту: «уборка» → и «Уборка квартиры», и «Генеральная уборка».
    const startsWithFirst = (pw[0] ?? "").startsWith(q[0] as string) ? 150 : 0;
    // Совпавшее уточнение («в квартире») — выше остальных формулировок.
    const context = optional.filter((x) => matches(x.w, pw)).length * 200;
    const score = startsWithFirst + context + phrase.weight * 5 - pw.length;
    hits.push({ phrase, score });
  }
  hits.sort((a, b) => b.score - a.score || a.phrase.text.localeCompare(b.phrase.text, "ru"));
  // Одна и та же формулировка разными словами не нужна — уникальные тексты.
  const seen = new Set<string>();
  const out: PhraseHit<T>[] = [];
  for (const h of hits) {
    const key = norm(h.phrase.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
