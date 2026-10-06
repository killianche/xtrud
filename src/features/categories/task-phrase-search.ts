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
 *  - слова «нужно», «надо», «срочно»… не сужают поиск.
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
  ["установк", ["установ", "подключ", "монтаж"]],
  ["монтаж", ["установ", "монтаж"]],
  ["подключ", ["подключ", "установ"]],
  ["вывоз", ["вывез", "вывоз"]],
  ["вывез", ["вывез", "вывоз"]],
  ["уборк", ["убор", "убра"]],
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
  const all = words(query);
  if (all.length === 0) return [];
  const endsWithSpace = /\s$/.test(query);
  const significant = all.filter(
    (w, i) => !STOP.has(w) || (i === all.length - 1 && !endsWithSpace),
  );
  const q = significant.length > 0 ? significant : all;
  const lastIndex = q.length - 1;

  const hits: PhraseHit<T>[] = [];
  for (const phrase of phrases) {
    const pw = words(phrase.text);
    let ok = true;
    for (let i = 0; i < q.length && ok; i++) {
      // Печатаемое слово: синонимы работы (SAME_WORK) — только для законченного.
      const typing = i === lastIndex && !endsWithSpace;
      const qw = q[i] as string;
      const alts = typing ? null : alternatives(qw);
      ok = pw.some((w) => wordMatches(qw, w) || (alts?.some((a) => w.startsWith(a)) ?? false));
    }
    if (!ok) continue;
    // Начинается с первого слова запроса — выше, но не настолько, чтобы
    // перебить частоту: «уборка» → и «Уборка квартиры», и «Генеральная уборка».
    const startsWithFirst = (pw[0] ?? "").startsWith(q[0] as string) ? 150 : 0;
    const score = startsWithFirst + phrase.weight * 5 - pw.length;
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
