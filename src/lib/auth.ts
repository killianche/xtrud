// Auth API уровня lib.
//
// Sprint 1 решение: anonymous sign-in под капотом + phone сохраняется в users_private
// без OTP-верификации. UI выглядит как phone-OTP flow для будущего sprint 2.
//
// Требование к Supabase: Anonymous Sign-Ins должно быть включено в Dashboard:
//   Authentication → Providers / Sign-In Settings → "Allow anonymous sign-ins" = ON
//
// Если выключено — signInAnonymously() вернёт error "Anonymous sign-ins are disabled".
// Это обрабатывается в use-auth-mutations с понятным сообщением.

import { unregisterCurrentPushToken } from "@/features/notifications/use-register-push-token";
import { supabase } from "./supabase";

/**
 * Sprint 1 sign-in:
 * 1. Создаём анонимную сессию Supabase
 * 2. Триггер handle_new_auth_user уже вставил пустые записи users + users_private
 * 3. Обновляем users_private.phone с введённым номером
 *
 * Возвращает {ok: true} либо {ok: false, error: human-readable}.
 */
export async function signInAnonymouslyWithPhone(
  phone: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
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
