/**
 * Проверка имени и названия на подмену (№309, миграция 0248) — то же правило,
 * что в базе (xtrud_private.name_text_valid): без невидимых символов, без
 * смеси кириллицы и латиницы в одном слове (кроме латинских I и l — ими в
 * ингушских именах пишут палочку Ӏ) и без слов, которыми выдают себя за
 * площадку. Приложение показывает понятный текст до отправки; база — второй
 * рубеж.
 */

/** Управляющие, невидимые и bidi-символы — по кодам, как в базе (0248). */
function hasInvisible(v: string): boolean {
  for (const ch of v) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      c < 0x20 ||
      (c >= 0x7f && c <= 0x9f) ||
      c === 0xad ||
      c === 0x61c ||
      c === 0x180e ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2060 && c <= 0x206f) ||
      c === 0xfeff
    ) {
      return true;
    }
  }
  return false;
}
const MIXED = /[А-Яа-яЁёӀӏ][^\s]*[A-HJ-Za-km-z]|[A-HJ-Za-km-z][^\s]*[А-Яа-яЁёӀӏ]/u;
const IMPERSONATION =
  /(xtrud|икстру|поддержк|администра|админ|модерат|support|admin|moder|official|официальн|verified|подтвержд)/iu;

/** Текст ошибки для человека или null, если всё в порядке. */
export function nameProblem(value: string, what: "Имя" | "Фамилия" | "Название"): string | null {
  const v = value.trim();
  if (!v) return null;
  if (hasInvisible(v)) return `${what} содержит невидимые символы — наберите заново.`;
  if (MIXED.test(v)) {
    return `${what} — буквами одного алфавита: похоже, в слово попали латинские буквы.`;
  }
  if (IMPERSONATION.test(v)) {
    return `${what} не может содержать слова «поддержка», «админ», «модератор» или «xtrud».`;
  }
  return null;
}
