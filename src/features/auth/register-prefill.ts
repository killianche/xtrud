/**
 * Вход по номеру, которого нет, ведёт сразу в регистрацию с уже введёнными
 * номером и паролем (владелец, 2026-09-12: «перекидывать на регистрацию с
 * предзаполненным паролем и номером»).
 *
 * Передаём только в памяти, не параметрами маршрута: адрес экрана попадает в
 * журнал навигации и отчёты об ошибках, а пароль туда попадать не должен.
 * Забирается один раз — повторный заход в регистрацию открывает пустую форму.
 */

import { normalizeRuPhoneDigits } from "./validation";

export interface RegisterPrefill {
  /** Десять цифр после +7. */
  phone: string;
  password: string;
}

let pending: RegisterPrefill | null = null;

/** Запоминает введённое на входе. Номер не из 10 цифр — не запоминаем. */
export function setRegisterPrefill(login: string, password: string): boolean {
  const phone = normalizeRuPhoneDigits(login);
  if (login.includes("@") || phone.length !== 10) {
    pending = null;
    return false;
  }
  pending = { phone, password };
  return true;
}

export function peekRegisterPrefill(): RegisterPrefill | null {
  return pending;
}

export function clearRegisterPrefill(): void {
  pending = null;
}
