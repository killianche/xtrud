// Auth API уровня lib.
//
// Sprint 1 решение:
// - Если номер совпадает с demo-паттерном `+79000…` (предзаведённые тестовые
//   аккаунты Алина/Магомед и др.) — логинимся через signInWithPassword
//   с фиксированным паролем 'xtrud' (см. миграцию 0045_demo_users_password).
//   Тогда сессия попадает в существующего пользователя со всеми его заказами,
//   чатами и сообщениями.
// - Иначе — анонимная сессия + UPDATE users_private.phone. Это «новый клиент».
//
// Sprint 2 заменит обе ветки на реальный supabase.auth.signInWithOtp + verifyOtp.
//
// Требование к Supabase: Anonymous Sign-Ins должно быть включено в Dashboard:
//   Authentication → Providers / Sign-In Settings → "Allow anonymous sign-ins" = ON

import { unregisterCurrentPushToken } from "@/features/notifications/use-register-push-token";
import { looksLikeEmail, normalizePhone } from "@/features/auth/validation";
import { supabase } from "./supabase";

/** Префиксы телефонов, у которых на сервере уже заведены auth.users + пароль. */
const DEMO_PHONE_PREFIX = "+79000";
const DEMO_PASSWORD = "xtrud";

/**
 * Отдельные «настоящие» номера, заведённые под demo-вход (email+пароль).
 * Очищено 2026-06-04: подключён реальный SMS-вход (SMS.ru), номер владельца
 * +79289204029 убран — теперь он входит по настоящему OTP, как все.
 */
const DEMO_EXTRA_PHONES: string[] = [];

/**
 * P0-02 (LAUNCH_READINESS): demo-flow закрыт за env flag. По умолчанию
 * disabled. Чтобы включить локально для preview/dev — в `.env.local`:
 *   `EXPO_PUBLIC_ENABLE_DEMO=true`
 * В production submit-сборке (eas.json → build.production.env) demo НЕ
 * включается, что предотвращает попадание пароля «xtrud» в публичный bundle
 * с возможностью входа под чужим demo-аккаунтом.
 */
function isDemoEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_DEMO === "true";
}

function isDemoPhone(phone: string): boolean {
  if (!isDemoEnabled()) return false;
  // Сравниваем по нормализованной форме без пробелов/тире — на этом этапе
  // phone уже прошёл normalizePhone (см. features/auth/validation).
  return phone.startsWith(DEMO_PHONE_PREFIX) || DEMO_EXTRA_PHONES.includes(phone);
}

/**
 * Конвертирует +79000000001 → 79000000001@xtrud-demo.local.
 * См. миграцию 0046_demo_users_email_login — у каждого demo-аккаунта
 * выставлен соответствующий email + identity 'email'.
 */
function demoPhoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@xtrud-demo.local`;
}

/**
 * Sprint 1 sign-in:
 * - demo phone → e-mail/password sign-in в существующий аккаунт.
 *   (Phone-provider в Supabase Auth отключён, поэтому fronend логинится
 *   через email, который синтетически назначен каждому demo-телефону.)
 * - иначе → анонимная сессия + UPDATE users_private.phone.
 */
export async function signInAnonymouslyWithPhone(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoPhone(phone)) {
    const email = demoPhoneToEmail(phone);
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    });
    if (error) {
      return {
        ok: false,
        error:
          `Не удалось войти как тестовый аккаунт (${phone}).\n` +
          `${error.message}\n` +
          "Проверь миграции 0045-0047 (пароль 'xtrud' + email mapping).",
      };
    }
    if (!data.session) {
      return { ok: false, error: "Сессия не создана" };
    }
    // Фидбэк user 2026-05-16: «если у аккаунта есть режим мастера — пускай
    // сразу открывается мастер, а не вид клиента». Для всех is_master=true
    // ставим active_role='master' на каждом логине. .eq("is_master", true)
    // работает как guard: для чистых клиентов UPDATE затронет 0 строк (no-op).
    // CHECK-constraint user_active_role_consistent (active_role='master' ⇒
    // is_master=true) выполняется автоматически.
    await supabase
      .from("users")
      .update({ active_role: "master" })
      .eq("id", data.user.id)
      .eq("is_master", true);
    return { ok: true };
  }

  // 1. Анонимный sign-in
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();

  if (authError) {
    // Самая частая ошибка — Anonymous Sign-Ins выключено в Dashboard
    if (authError.message?.toLowerCase().includes("anonymous")) {
      return {
        ok: false,
        error:
          "Анонимный вход выключен в Supabase Dashboard.\n" +
          "Зайди: Authentication → Sign In / Up → Allow anonymous sign-ins.",
      };
    }
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: "Не удалось создать сессию" };
  }

  // 2. Триггер handle_new_auth_user уже создал записи. Просто UPDATE phone.
  // RLS users_private.update_own разрешает auth.uid() = user_id.
  const { error: updateError } = await supabase
    .from("users_private")
    .update({ phone })
    .eq("user_id", authData.user.id);

  if (updateError) {
    // Не фатально — сессия создана, phone не сохранился. Логируем и продолжаем.
    console.warn("[auth] phone update failed:", updateError.message);
  }

  return { ok: true };
}

/**
 * Отправка OTP-кода (реальный SMS через Supabase phone auth → Send SMS Hook →
 * SMS.ru). См. supabase/functions/send-sms + дашборд Auth Hooks.
 *
 * - Demo-телефон (+79000…, флаг включён): код НЕ шлём — на verify-экране вход
 *   произойдёт через email/пароль (signInAnonymouslyWithPhone). Это dev/preview.
 * - Реальный номер: supabase.auth.signInWithOtp({ phone }) — Supabase сгенерит
 *   код, вызовет наш hook, hook отправит SMS.
 * - Test-номера ревью Apple (настроены в дашборде Supabase как Test OTP) идут
 *   тем же путём signInWithOtp, но Supabase возвращает фикс-код БЕЗ вызова hook.
 */
export async function sendOtpToPhone(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoPhone(phone)) {
    // Demo: SMS не нужен, вход по email/паролю на шаге verify.
    return { ok: true };
  }
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Проверка OTP-кода и вход.
 *
 * - Demo-телефон (флаг включён): код игнорируется, вход по email/паролю в
 *   существующий demo-аккаунт (signInAnonymouslyWithPhone).
 * - Реальный номер: supabase.auth.verifyOtp({ phone, token, type:'sms' }).
 *   Для новых пользователей триггер handle_new_auth_user создаёт users/
 *   users_private. Для мастеров ставим active_role='master' (как в demo-ветке).
 */
export async function verifyOtpCode(
  phone: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isDemoPhone(phone)) {
    return signInAnonymouslyWithPhone(phone);
  }
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token: code,
    type: "sms",
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data.session || !data.user) {
    return { ok: false, error: "Сессия не создана" };
  }
  // Мастер с is_master=true → сразу в master-режим (как в demo-ветке выше).
  // Для клиентов UPDATE затронет 0 строк (guard .eq is_master true).
  await supabase
    .from("users")
    .update({ active_role: "master" })
    .eq("id", data.user.id)
    .eq("is_master", true);
  return { ok: true };
}

// ============================================================================
// Вход по номеру/почте + пароль (2026-06-05).
//
// SMS-OTP заменён на пароль (не платим операторам за branded-SMS). Почта —
// для восстановления пароля и как альтернативный логин. Auth-идентичность —
// РЕАЛЬНАЯ почта (нужно для Supabase resetPasswordForEmail). Телефон хранится
// в users_private.phone. Вход по номеру → почта через RPC resolve_login_email.
//
// Demo-номера (+79000…, флаг ON) по-прежнему входят по email/паролю (demo).
// SMS-функции (sendOtpToPhone/verifyOtpCode) и экран verify оставлены дормантом
// для будущего возврата SMS.
// ============================================================================


/**
 * Регистрация: почта + пароль + телефон.
 *
 * Идёт через серверную функцию `register-user` (admin createUser с
 * email_confirm:true), потому что в Supabase включено «Confirm email» — при
 * обычном signUp сессия не создалась бы до подтверждения письма, а письма мы
 * не шлём (продукт телефоно-ориентированный). Функция создаёт сразу
 * подтверждённого пользователя + сохраняет телефон в профиль; затем здесь
 * сразу входим по паролю → появляется сессия, и корневой AuthGate уводит в
 * онбординг/табы. Логика функции — supabase/functions/register-user/index.ts.
 */
export async function registerWithCredentials(input: {
  phone: string;
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);

  // 1. Создаём подтверждённый аккаунт на сервере.
  const { data, error } = await supabase.functions.invoke("register-user", {
    body: { email, password: input.password, phone },
  });
  if (error) {
    console.warn("[auth] register-user invoke failed:", error.message);
    return {
      ok: false,
      error: "Не удалось создать аккаунт. Проверьте соединение и попробуйте ещё раз.",
    };
  }
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: result?.error ?? "Не удалось создать аккаунт" };
  }

  // 2. Входим по паролю — сессия появляется сразу (аккаунт уже подтверждён).
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (signInErr || !signInData.session) {
    return {
      ok: false,
      error: "Аккаунт создан, но войти не удалось. Попробуйте войти вручную.",
    };
  }
  return { ok: true };
}

/**
 * Вход: «почта ИЛИ телефон» + пароль.
 * - demo-телефон (флаг ON) → старый demo email/пароль.
 * - почта → signInWithPassword напрямую.
 * - телефон → resolve_login_email (RPC) → signInWithPassword.
 */
export async function loginWithCredentials(input: {
  login: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = input.login.trim();

  // Demo-телефон — старый путь (dev/preview).
  if (!looksLikeEmail(trimmed)) {
    const phone = normalizePhone(trimmed);
    if (isDemoPhone(phone)) {
      return signInAnonymouslyWithPhone(phone);
    }
  }

  // Сопоставляем логин → auth-email (почта as-is; телефон → email по users_private).
  const { data: resolved, error: rpcErr } = await supabase.rpc("resolve_login_email", {
    p_login: trimmed,
  });
  if (rpcErr) {
    return { ok: false, error: rpcErr.message };
  }
  const email = resolved as string | null;
  if (!email) {
    return {
      ok: false,
      error: "Аккаунт не найден. Проверьте номер или почту, либо зарегистрируйтесь.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });
  if (error) {
    return { ok: false, error: "Неверный номер/почта или пароль" };
  }
  if (!data.session || !data.user) {
    return { ok: false, error: "Сессия не создана" };
  }
  // Мастер → сразу master-режим (как в других ветках).
  await supabase
    .from("users")
    .update({ active_role: "master" })
    .eq("id", data.user.id)
    .eq("is_master", true);
  return { ok: true };
}

/**
 * Запрос сброса пароля.
 *
 * Идёт через серверную функцию `send-reset-email` (она формирует recovery-ссылку
 * и шлёт письмо через интернет-API Unisender), а НЕ через
 * supabase.auth.resetPasswordForEmail: SMTP между зарубежным Supabase и
 * российским Unisender не работает (таймаут), а HTTPS-API Unisender — работает.
 * Логика — supabase/functions/send-reset-email/index.ts.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("send-reset-email", {
    body: { email: email.trim().toLowerCase() },
  });
  if (error) {
    console.warn("[auth] send-reset-email invoke failed:", error.message);
    return { ok: false, error: "Не удалось отправить письмо. Попробуйте позже." };
  }
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: result?.error ?? "Не удалось отправить письмо" };
  }
  return { ok: true };
}

/**
 * Установить новый пароль. Вызывается на экране /reset-password, когда Supabase
 * уже подхватил recovery-сессию из ссылки письма (PASSWORD_RECOVERY).
 */
export async function updatePassword(
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Logout — снимает push-токен этого устройства, затем обнуляет сессию.
 *
 * Порядок важен: токен удаляется ДО auth.signOut, пока ещё есть auth.uid()
 * (RLS notification_tokens требует владельца).
 */
export async function signOut(): Promise<{ ok: true } | { ok: false; error: string }> {
  await unregisterCurrentPushToken();
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
