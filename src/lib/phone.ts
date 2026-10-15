/**
 * Каноническая форма телефона — зеркало `canonicalPhone` в
 * `server/src/auth/phone.ts`: РФ/КЗ → +7XXXXXXXXXX, международный с «+» —
 * как есть (только цифры и «+»).
 *
 * Номер для связи человек пишет как привык: «8 928…», «928…», «+7 928…».
 * Без кода страны iPhone набирал его как местный и показывал
 * «Позвонить (650) 499-28-04» вместо российского номера (владелец,
 * 2026-10-15, №344). Поэтому и при сохранении, и при звонке/WhatsApp номер
 * проходит через эту функцию — старые записи в базе тоже звонят верно.
 */
export function canonicalPhone(input: string | null | undefined): string {
  const trimmed = (input ?? "").trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (hasPlus && !digits.startsWith("7") && !digits.startsWith("8")) return `+${digits}`;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+7${digits}`;
  return `+${digits}`;
}

/** Номер для `tel:` или null, если номера нет. */
export function dialPhone(input: string | null | undefined): string | null {
  return canonicalPhone(input) || null;
}
