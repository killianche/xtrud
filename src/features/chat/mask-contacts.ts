/**
 * Pure: маскировка контактных данных в тексте чата (Sprint I.3).
 *
 * Зачем: на платформе мы скрываем телефон клиента от мастера до его выбора
 * (см. PROJECT_MAP §5.3 «Скрытие телефона клиента»). Мастер может попытаться
 * обойти платформу, написав «звоните +7 999 …» прямо в чат. Маскируем при
 * рендере.
 *
 * Важно: маскируем **на отображение**, оригинал сохраняется в `messages.text`.
 * Это даёт нам:
 *  - возможность модерации (админ видит оригинал, если жалоба)
 *  - возможность в будущем включить «verified phone exchange» когда сделаем
 *    флаг согласия обеих сторон
 *
 * Что маскируем:
 *  - Российские телефоны (+7 / 8 / 7 + 10 цифр, с разделителями)
 *  - WhatsApp / Telegram ссылки (wa.me / t.me / telegram.me)
 *  - Email (хотя редко в чате о ремонте, но на всякий)
 */

// +7 / 8 / 7 + 10 цифр с возможными разделителями (пробел, дефис, скобки, точка).
// Захватываем «12 цифр в потоке» — даже если они разбиты.
const PHONE_RE =
  /(\+?[78][\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d[\s\-(). ]*\d)/g;

// Messenger-ссылки (полный URL с path, чтобы съесть и номера/имена внутри).
const MESSENGER_RE =
  /\b(?:https?:\/\/)?(?:wa\.me|t\.me|telegram\.me|telegram\.org)\/[A-Za-z0-9_+\-.]+/gi;

// Telegram @username (5+ символов после @, с латиницей/цифрами/подчёркиванием).
const TG_HANDLE_RE = /(^|[^\w@])@([a-zA-Z][a-zA-Z0-9_]{4,31})\b/g;

// Email (упрощённый).
const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

export const MASK_LABEL = "[контакт скрыт]";

/**
 * Маскирует контактные данные в произвольной строке. Идемпотентна:
 * повторное применение не вносит изменений.
 *
 * Чтобы не маскировать «12345678901» (произвольная последовательность 11 цифр
 * без префикса 7/8) — PHONE_RE требует чтобы первая цифра была 7 или 8 после
 * опционального +.
 */
export function maskContactsInText(text: string): string {
  if (!text) return text;
  // Порядок важен: messenger-ссылки сначала (чтобы их path с цифрами/именами
  // не съел PHONE_RE / TG_HANDLE_RE отдельно), потом всё остальное.
  return text
    .replace(MESSENGER_RE, MASK_LABEL)
    .replace(EMAIL_RE, MASK_LABEL)
    .replace(PHONE_RE, MASK_LABEL)
    .replace(TG_HANDLE_RE, (_match, before) => `${before}${MASK_LABEL}`);
}

/**
 * Помечен ли текст как «содержал контакт» (нужно ли показать предупреждение
 * пользователю). Принимает оригинал и проверяет наличие совпадения по любому
 * из паттернов.
 */
export function textHasContactInfo(text: string): boolean {
  if (!text) return false;
  PHONE_RE.lastIndex = 0;
  MESSENGER_RE.lastIndex = 0;
  TG_HANDLE_RE.lastIndex = 0;
  EMAIL_RE.lastIndex = 0;
  return (
    PHONE_RE.test(text) ||
    MESSENGER_RE.test(text) ||
    TG_HANDLE_RE.test(text) ||
    EMAIL_RE.test(text)
  );
}
