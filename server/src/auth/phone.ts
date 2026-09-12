/**
 * Каноническая форма телефона — зеркало normalizePhone в приложении и
 * canonicalPhone в старой функции register-user: РФ/КЗ → +7XXXXXXXXXX,
 * другой международный номер с «+» — как есть (только цифры и «+»).
 */
export function canonicalPhone(input: string): string {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return "";
  if (hasPlus && !digits.startsWith("7") && !digits.startsWith("8")) return `+${digits}`;
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }
  if (digits.length === 10) return `+7${digits}`;
  if (hasPlus) return `+${digits}`;
  return `+${digits}`;
}

/** Последние 10 цифр — так ищет аккаунт resolve_login_email в базе. */
export function phoneKey(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const key = digits.slice(-10);
  return key.length === 10 ? key : null;
}

/** Логин — номер (не почта, 10+ цифр): так его понимает find_account (0177). */
export function isPhoneLogin(login: string): boolean {
  return !login.includes("@") && login.replace(/\D/g, "").length >= 10;
}

export function phoneToAuthEmail(phone: string, domain: string): string {
  return `${phone.replace(/\D/g, "")}@${domain}`;
}
