// Первый экран входа «Ваш номер» (владелец, 2026-10-04, №202): «при входе
// сразу требуют номер; дальше пароль, если аккаунт есть, или создание
// пароля, если нет. Чтобы не было гостей».
//
// Один вопрос на экране — как вход в банках и сервисах по номеру: поле
// номера и «Продолжить». Сервер отвечает, есть ли аккаунт
// (/v2/auth/phone-status): есть — экран пароля, нет — регистрация с этим
// номером (останется имя и пароль). Новый номер сначала подтверждается
// обратным звонком (№217, если на сервере включено), затем имя и пароль —
// как у больших сервисов: номер → подтверждение → профиль. Пока включён обязательный вход
// (флаг require_login, админка → «Настройки»), закрыть экран нельзя.

import { useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useCallConfirm } from "@/features/auth/CallConfirmSheet";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { setRegisterPrefill } from "@/features/auth/register-prefill";
import { fetchAuthOptions } from "@/features/auth/use-auth-options";
import { normalizeRuPhoneDigits } from "@/features/auth/validation";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { supabase } from "@/lib/supabase";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const goBack = useSafeBack("/(tabs)" as const);
  const { requireLogin } = useAppFlags();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = useCallConfirm();

  const next = async () => {
    setBusy(true);
    setError(null);
    const r = await supabase.auth.phoneStatus(`+7${phone}`);
    setBusy(false);
    if (r.error || r.exists === null) {
      setError(r.error?.message ?? "Не удалось проверить номер");
      return;
    }
    if (r.exists) {
      router.push({ pathname: "/(auth)/sign-in", params: { phone } } as never);
      return;
    }
    // Новый человек — сначала подтвердить номер звонком (если включено),
    // потом регистрация с этим номером: имя и пароль.
    setBusy(true);
    const options = await fetchAuthOptions();
    setBusy(false);
    let token: string | undefined;
    if (options.phoneCallAtRegistration) {
      const t = await call.confirm(`+7${phone}`, "register");
      if (!t) return; // шторку закрыли — остаёмся на номере
      token = t;
    }
    setRegisterPrefill(phone, "", token);
    router.push("/(auth)/register" as never);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-4">
          {requireLogin ? (
            <View style={{ height: 44 }} />
          ) : (
            <NavCircleButton label="Назад" onPress={goBack} disabled={busy}>
              <SystemIcon
                sf="chevron.left"
                fallback={CaretLeft}
                size={20}
                weight="semibold"
                color={tc.ink}
              />
            </NavCircleButton>
          )}
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-ios-large-title text-ink"
          >
            Ваш номер
          </AppText>
          <AppText className="mt-2 text-ios-body text-mute">
            Войдём в аккаунт или создадим новый — по номеру телефона.
          </AppText>

          <View className="mt-8 flex-row items-start gap-2">
            <View
              className="flex-row items-center rounded-xl border-hairline-strong bg-canvas-soft px-4"
              style={{ minHeight: 54, borderWidth: 1.5 }}
            >
              <AppText weight="semibold" className="text-ios-body text-ink">
                +7
              </AppText>
            </View>
            <View className="flex-1">
              <Input
                size="lg"
                accessibilityLabel="Номер телефона"
                value={formatRuPhone(phone)}
                onChangeText={(raw) => {
                  setPhone(normalizeRuPhoneDigits(raw));
                  if (error) setError(null);
                }}
                placeholder="928 123-45-67"
                keyboardType="phone-pad"
                autoComplete="tel-national"
                textContentType="telephoneNumber"
                inputMode="tel"
                editable={!busy}
                autoFocus
                error={error ?? undefined}
              />
            </View>
          </View>
        </View>

        <View className="px-6 pb-8 pt-8">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={phone.length !== 10 || busy}
            loading={busy}
            onPress={() => void next()}
          >
            Продолжить
          </Button>
          <AppText className="mt-4 text-center text-ios-footnote text-mute">
            Номер нужен, чтобы клиенты и специалисты могли связаться друг с другом.
          </AppText>
        </View>
      </ScrollView>
      {call.sheet}
    </KeyboardAvoidingView>
  );
}
