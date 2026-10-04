/**
 * /profile/change-password — смена пароля из аккаунта (№219, владелец
 * 2026-10-04: «пусть в аккаунте будет смена пароля, как у больших
 * приложений»).
 *
 * Как в банках и у Apple ID: текущий пароль + новый. Забыли текущий — номер
 * аккаунта подтверждается обратным звонком (CallConfirmSheet, цель recover),
 * и задаётся новый без старого. В обоих случаях сервер отзывает входы на
 * других устройствах и выдаёт этому новый (/v2/auth/password, /v2/auth/recover).
 *
 * Системная модалка, как «Сменить номер»: отдельная отменяемая задача.
 */

import { Stack, useRouter } from "expo-router";
import { CheckCircle, X } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/ui";
import { useCallConfirm } from "@/features/auth/CallConfirmSheet";
import { PasswordField } from "@/features/auth/PasswordField";
import { fetchAuthOptions } from "@/features/auth/use-auth-options";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["mute", "success"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: userPrivate } = useUserPrivate(userId);
  const myPhone = userPrivate?.phone ?? session?.user?.phone ?? null;
  const call = useCallConfirm();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  // Забыли текущий: номер подтверждён звонком — нужен только новый пароль.
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canSave = next.length >= 8 && (resetToken !== null || current.length > 0) && !busy;
  // Начатое (особенно подтверждённый звонком номер) не теряется молча.
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges: !saved && (current.length > 0 || next.length > 0 || resetToken !== null),
    isBusy: busy,
    title: "Пароль не изменён",
    message: "Выйти, не сохранив новый пароль?",
  });

  const done = () => {
    allowLeave();
    setSaved(true);
  };

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    const r =
      resetToken && myPhone
        ? await supabase.auth.recover(myPhone, resetToken, next)
        : await supabase.auth.changePassword(current, next);
    setBusy(false);
    if (r.error) {
      if (r.error.code === "phone_verification_required") setResetToken(null);
      setError(r.error.message);
      return;
    }
    done();
  };

  const forgot = async () => {
    setError(null);
    if (!myPhone) {
      setError("Не нашли номер аккаунта. Напишите в поддержку.");
      return;
    }
    setBusy(true);
    const options = await fetchAuthOptions();
    setBusy(false);
    if (!options.phoneCallRecovery) {
      setError("Сейчас пароль без текущего меняем через поддержку — напишите нам.");
      return;
    }
    const token = await call.confirm(myPhone, "recover", { fixedPhone: true });
    if (token) {
      setResetToken(token);
      setCurrent("");
    }
  };

  return (
    <>
      <Stack.Screen options={{ presentation: "modal", gestureEnabled: !busy }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="flex-1 text-display-sm tracking-tight text-ink"
          >
            Сменить пароль
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            disabled={busy}
            onPress={() => router.back()}
            hitSlop={10}
            className={`h-11 w-11 items-center justify-center rounded-full active:bg-canvas-soft ${
              busy ? "opacity-40" : ""
            }`}
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        {saved ? (
          <View className="flex-1 px-5" style={{ paddingBottom: insets.bottom + 24 }}>
            <View className="flex-1 items-center justify-center">
              <CheckCircle size={64} weight="fill" color={tc.success} />
              <AppText
                accessibilityRole="alert"
                weight="bold"
                className="mt-4 text-center text-ios-title2 text-ink"
              >
                Пароль изменён
              </AppText>
              <AppText className="mt-2 text-center text-ios-body text-mute">
                На других устройствах нужно будет войти заново.
              </AppText>
            </View>
            <Button variant="accent" size="lg" fullWidth onPress={() => router.back()}>
              Готово
            </Button>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-4 px-5 pt-2">
              {resetToken ? (
                <AppText className="text-ios-subheadline text-mute">
                  Номер подтверждён. Придумайте новый пароль — текущий не нужен.
                </AppText>
              ) : (
                <PasswordField
                  kind="current"
                  label="Текущий пароль"
                  placeholder="Текущий пароль"
                  value={current}
                  onChangeText={(v) => {
                    setCurrent(v);
                    if (error) setError(null);
                  }}
                  editable={!busy}
                  autoFocus
                />
              )}
              <PasswordField
                kind="new"
                label="Новый пароль · минимум 8 символов"
                placeholder="Новый пароль"
                value={next}
                onChangeText={(v) => {
                  setNext(v);
                  if (error) setError(null);
                }}
                editable={!busy}
                autoFocus={resetToken !== null}
                onSubmitEditing={() => void save()}
              />
              {error ? (
                <AppText accessibilityRole="alert" className="text-ios-subheadline text-error">
                  {error}
                </AppText>
              ) : (
                <AppText className="text-ios-footnote text-mute">
                  После смены на других устройствах нужно будет войти заново.
                </AppText>
              )}
              <Button
                variant="accent"
                size="lg"
                fullWidth
                disabled={!canSave}
                loading={busy}
                onPress={() => void save()}
              >
                Сохранить
              </Button>
              {resetToken ? null : (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void forgot()}
                  disabled={busy}
                  hitSlop={8}
                  className="min-h-11 items-center justify-center active:opacity-60"
                >
                  <AppText weight="semibold" className="text-ios-subheadline text-accent">
                    Забыли текущий пароль?
                  </AppText>
                </Pressable>
              )}
            </View>
          </ScrollView>
        )}
        {call.sheet}
      </KeyboardAvoidingView>
    </>
  );
}
