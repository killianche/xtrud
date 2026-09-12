// Auth API уровня lib — поверх своего клиента xtrud-api (src/lib/xtrud-client).
//
// С 2026-09-08 регистрация и вход идут через /v2/auth/* на Beget
// (docs/BACKEND_REWRITE_PLAN.md, этап 1): телефон + пароль. Сервер сам
// находит аккаунт по последним десяти цифрам номера или по почте.
// Demo-номера (+79000…, только под env-флагом) входят по заранее созданной
// почте и паролю. Вход по SMS и письма восстановления отключены:
// DECISION владельца 2026-09-03 — доступ восстанавливает администратор.

import { looksLikeEmail, normalizePhone } from "@/features/auth/validation";
import { unregisterCurrentPushToken } from "@/features/notifications/use-register-push-token";
import { supabase } from "./supabase";

/** Префиксы телефонов, у которых на сервере уже заведены auth.users + пароль. */
const DEMO_PHONE_PREFIX = "+79000";
const DEMO_PASSWORD = "xtrud";
const DEMO_EXTRA_PHONES: string[] = [];

/**
 * P0-02 (LAUNCH_READINESS): demo-flow закрыт за env flag. По умолчанию
 * disabled; в production submit-сборке demo не включается.
 */
function isDemoEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_DEMO === "true";
}

function isDemoPhone(phone: string): boolean {
  if (!isDemoEnabled()) return false;
  return phone.startsWith(DEMO_PHONE_PREFIX) || DEMO_EXTRA_PHONES.includes(phone);
}

/** +79000000001 → 79000000001@xtrud-demo.local (миграция 0046). */
function demoPhoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@xtrud-demo.local`;
}

async function markMasterRole(userId: string): Promise<void> {
  // Мастер открывается в своей роли; для клиента UPDATE затронет 0 строк.
  await supabase
    .from("users")
    .update({ active_role: "master" })
    .eq("id", userId)
    .eq("is_master", true);
}

async function signInWithDemoPhone(
  phone: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  if (!isDemoPhone(phone)) {
    return { ok: false, error: "Тестовый вход выключен" };
  }
  const { data, error } = await supabase.auth.signInWithPassword({
    login: demoPhoneToEmail(phone),
    password: DEMO_PASSWORD,
  });
  if (error || !data.user) {
    return { ok: false, error: `Не удалось войти как тестовый аккаунт (${phone}).` };
  }
  await markMasterRole(data.user.id);
  return { ok: true, userId: data.user.id };
}

/** Вход по SMS отключён — функции оставлены для экрана verify (дормант). */
export async function sendOtpToPhone(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoPhone(phone)) return { ok: true };
  return { ok: false, error: "Вход по SMS отключён. Войдите по телефону и паролю." };
}

export async function verifyOtpCode(
  phone: string,
  _code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoPhone(phone)) return signInWithDemoPhone(phone);
  return { ok: false, error: "Вход по SMS отключён. Войдите по телефону и паролю." };
}

/**
 * Регистрация: имя, фамилия, телефон, пароль. xtrud-api создаёт аккаунт,
 * записывает имя и телефон, закрывает онбординг и сразу отдаёт сессию.
 */
export async function registerWithCredentials(input: {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.auth.register({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: normalizePhone(input.phone),
    password: input.password,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Не удалось создать аккаунт" };
  }
  return { ok: true, userId: data.user.id };
}

/** Вход: телефон или почта + пароль. */
export async function loginWithCredentials(input: {
  login: string;
  password: string;
}): Promise<{ ok: true; userId: string } | { ok: false; error: string; code?: string }> {
  const trimmed = input.login.trim();

  if (!looksLikeEmail(trimmed)) {
    const phone = normalizePhone(trimmed);
    if (isDemoPhone(phone)) {
      return signInWithDemoPhone(phone);
    }
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    login: trimmed,
    password: input.password,
  });
  if (error || !data.session || !data.user) {
    return {
      ok: false,
      error: error?.message ?? "Неверный номер/почта или пароль",
      code: error?.code,
    };
  }
  await markMasterRole(data.user.id);
  return { ok: true, userId: data.user.id };
}

/** Писем восстановления нет: доступ возвращает администратор через панель. */
export async function requestPasswordReset(
  _email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return { ok: false, error: "Напишите в поддержку — мы восстановим доступ." };
}

/** Смена пароля из настроек: нужен текущий пароль. */
export async function updatePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!currentPassword) return { ok: false, error: "Введите текущий пароль" };
  const { error } = await supabase.auth.changePassword(currentPassword, newPassword);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Logout — снимает push-токен этого устройства, затем обнуляет сессию.
 * Порядок важен: токен удаляется ДО signOut, пока ещё есть auth.uid().
 */
export async function signOut(): Promise<{ ok: true } | { ok: false; error: string }> {
  await unregisterCurrentPushToken();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
