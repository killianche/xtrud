// Раскладка-фикс «rfvthf → камера» (P0-NEW).
//
// Тривиальная char-map QWERTY ↔ ЙЦУКЕН. Когда клиент забыл переключить
// раскладку, useServiceSearch делает 2 параллельных запроса (исходный +
// flipped). Если исходный = 0 hits → показываем результат flipped + баннер
// «Возможно, вы искали: *камера*».
//
// Эталон: convert-layout NPM (архивирован, но идея — 30 строк) +
// research/SEARCH_AUDIT.md §4 «Раскладка-фикс на клиенте JS».

const EN_TO_RU: Record<string, string> = {
  q: "й",
  w: "ц",
  e: "у",
  r: "к",
  t: "е",
  y: "н",
  u: "г",
  i: "ш",
  o: "щ",
  p: "з",
  "[": "х",
  "]": "ъ",
  a: "ф",
  s: "ы",
  d: "в",
  f: "а",
  g: "п",
  h: "р",
  j: "о",
  k: "л",
  l: "д",
  ";": "ж",
  "'": "э",
  z: "я",
  x: "ч",
  c: "с",
  v: "м",
  b: "и",
  n: "т",
  m: "ь",
  ",": "б",
  ".": "ю",
  "`": "ё",
};

// Обратное направление: «rfvthf» (EN) и наоборот «крамеры» в кириллицу.
const RU_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_RU).map(([k, v]) => [v, k]),
);

/**
 * Меняет раскладку строки на противоположную (EN↔RU).
 * Если в строке есть кириллица — конвертируем в EN, иначе в RU.
 * Сохраняет регистр (пытается) и символы, которых нет в map (пробелы, цифры).
 */
export function flipLayout(input: string): string {
  if (!input) return input;
  const isCyrillic = /[а-яА-ЯёЁ]/.test(input);
  const map = isCyrillic ? RU_TO_EN : EN_TO_RU;
  return input
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const flipped = map[lower];
      if (!flipped) return ch;
      // Восстанавливаем регистр: если исходный был заглавный — flipped тоже.
      return ch === lower ? flipped : flipped.toUpperCase();
    })
    .join("");
}

/**
 * Проверяет, выглядит ли строка как "латиница в русской раскладке".
 * Полезно для принятия решения «делать ли запасной flipped-запрос».
 */
export function looksLikeWrongLayout(input: string): boolean {
  if (!input || input.trim().length < 2) return false;
  // Если в строке есть кириллица — скорее всего раскладка правильная.
  if (/[а-яА-ЯёЁ]/.test(input)) return false;
  // Только латиница + пробелы/цифры? Возможно, нужный flip.
  return /^[a-zA-Z0-9\s[\]\\;',./`]+$/.test(input);
}
