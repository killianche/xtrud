// Resolve итоговый WhatsApp-номер мастера для отображения кнопки.
//
// Логика по docs (sprint 0079):
//   1. Если whatsappSameAsPhone === true → используем основной телефон мастера.
//   2. Если есть явный whatsappPhone (не пустой) → используем его.
//   3. Иначе → null (кнопка WhatsApp не отображается).
//
// Возвращает чистые цифры без `+` для wa.me URL: «79991234567».

export interface WhatsappInput {
  /** master_profiles.whatsapp_phone — явный номер. */
  whatsappPhone: string | null | undefined;
  /** master_profiles.whatsapp_same_as_phone. */
  whatsappSameAsPhone: boolean | null | undefined;
  /** Основной телефон мастера из get_master_phone RPC. */
  masterPhone: string | null | undefined;
}

/** Возвращает digits-only номер для wa.me URL, либо null если WhatsApp недоступен. */
export function resolveWhatsappDigits(input: WhatsappInput): string | null {
  const { whatsappPhone, whatsappSameAsPhone, masterPhone } = input;

  if (whatsappSameAsPhone === true) {
    return normalizeWhatsappDigits(masterPhone);
  }

  if (whatsappPhone && whatsappPhone.trim().length >= 5) {
    return normalizeWhatsappDigits(whatsappPhone);
  }

  return null;
}

/** Очищает номер до digits-only, отбрасывая `+`, пробелы, скобки, дефисы.
 *  Возвращает null если меньше 5 цифр (невалидно). */
export function normalizeWhatsappDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 5 ? digits : null;
}

/** Маска WhatsApp-номера для отображения в форме (frontend-only).
 *  Пример: «79991234567» → «+7 (999) 123-45-67». Если формат не RU,
 *  возвращает as-is. */
export function formatWhatsappDisplay(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    const d = "7" + digits.slice(1);
    return `+${d.slice(0, 1)} (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9, 11)}`;
  }
  return raw.startsWith("+") ? raw : `+${raw}`;
}
