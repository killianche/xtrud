/**
 * Ссылка специалиста — соцсеть или сайт с работами (0188).
 *
 * Человек пишет как привык: «instagram.com/ivan», «https://vk.com/ivan».
 * Сохраняем с https://, показываем без него. Проверка та же, что в базе
 * (master_profiles_link_url_format): http(s), хост с точкой, без пробелов,
 * до 300 символов. Разбор — регулярным выражением, а не `URL`: в React Native
 * у `URL` нет части свойств (hostname, pathname).
 */

export const LINK_MAX = 300;

const LINK = /^https?:\/\/([^\s/?#]+\.[^\s/?#]+)([/?#]\S*)?$/i;

/**
 * @returns строку с http(s) для сохранения; null — поле пустое;
 *          undefined — это не ссылка.
 */
export function normalizeLinkUrl(input: string): string | null | undefined {
  const s = input.trim();
  if (!s) return null;
  if (/\s/.test(s)) return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  if (withScheme.length > LINK_MAX || !LINK.test(withScheme)) return undefined;
  return withScheme;
}

/** «https://www.instagram.com/ivan/» → «instagram.com/ivan». */
export function linkLabel(url: string): string {
  const m = LINK.exec(url);
  if (!m) return url;
  const host = (m[1] ?? "").replace(/^www\./i, "");
  const path = (m[2] ?? "").replace(/\/+$/, "");
  return `${host}${path}`;
}
