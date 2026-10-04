// Экран «Забыли пароль» (route /(auth)/forgot-password).
//
// DECISION владельца 2026-10-04: SMS под авторизацию не нужен —
// «при восстановлении пускай нам приходит заявка от клиента, мы с ним
// созвонимся и восстановим ему пароль». Человек оставляет номер и нажимает
// «Перезвоните мне»; админы получают push (0214), перезванивают на номер
// аккаунта и задают временный пароль в админке
// (docs/PASSWORD_RECOVERY_RUNBOOK.md).
//
// Одно действие на экране, как «Заказать звонок» у банков и сервисов: поле
// номера и кнопка. После отправки — подтверждение, что заявка принята и на
// какой номер позвонят. WhatsApp поддержки остаётся запасным путём.

import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, CheckCircle } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, GlassButton, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { normalizeRuPhoneDigits } from "@/features/auth/validation";
import { requestPasswordRecovery } from "@/lib/auth";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["ink", "accent"]);
  const goBack = useSafeBack("/(auth)/phone" as const);
  const params = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(() => normalizeRuPhoneDigits(params.phone ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; noAccount: boolean } | null>(null);
  const [sent, setSent] = useState<{ again: boolean } | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const r = await requestPasswordRecovery(`+7${phone}`);
    setBusy(false);
    if (!r.ok) {
      setError({ text: r.error, noAccount: r.code === "account_not_found" });
      return;
    }
    setSent({ again: r.alreadyRequested });
  };

  const back = (
    <View className="px-6 pt-4">
      <NavCircleButton label="Назад" onPress={goBack} disabled={busy}>
        <SystemIcon
          sf="chevron.left"
          fallback={CaretLeft}
          size={20}
          weight="semibold"
          color={tc.ink}
        />
      </NavCircleButton>
    </View>
  );

  if (sent) {
    return (
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        {back}
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
            <CheckCircle size={44} weight="fill" color={tc.accent} />
          </View>
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-center text-ios-title1 text-ink"
          >
            {sent.again ? "Заявка уже у нас" : "Заявка принята"}
          </AppText>
          <AppText className="mt-2 text-center text-ios-body text-mute">
            Перезвоним на номер{" "}
            <AppText weight="semibold" className="text-ios-body text-ink">
              +7 {formatRuPhone(phone)}
            </AppText>
            . Чтобы убедиться, что аккаунт ваш, спросим имя и что вы публиковали в xtrud, затем
            продиктуем временный пароль.
          </AppText>
        </View>
        <View className="px-6">
          <GlassButton label="К входу" onPress={goBack} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {back}
        <View className="flex-1 px-6">
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-display-lg text-ink"
          >
            Восстановление пароля
          </AppText>
          <AppText className="mt-2 text-ios-body text-mute">
            Оставьте номер, на который зарегистрирован аккаунт. Мы перезвоним и поможем войти.
          </AppText>

          <View className="mt-8 flex-row items-start gap-2">
            <View
              className="flex-row items-center rounded-xl border-hairline-strong bg-canvas-soft px-4"
              style={{ minHeight: 54, borderWidth: 1.5 }}
            >
              <AppText weight="semibold" className="text-body-lg text-ink">
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
                autoFocus={phone.length < 10}
              />
            </View>
          </View>

          {error ? (
            <View className="mt-4">
              <AppText accessibilityRole="alert" className="text-ios-subheadline text-error">
                {error.text}
              </AppText>
              {error.noAccount ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.replace("/(auth)/register" as never)}
                  hitSlop={8}
                  className="mt-1 min-h-11 justify-center self-start active:opacity-60"
                >
                  <AppText weight="semibold" className="text-ios-subheadline text-accent">
                    Зарегистрироваться
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        <View className="px-6 pb-8 pt-8">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={phone.length !== 10 || busy}
            loading={busy}
            onPress={() => void submit()}
          >
            Перезвоните мне
          </Button>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL(SUPPORT_URL)}
            hitSlop={8}
            className="mt-4 min-h-11 items-center justify-center active:opacity-60"
          >
            <AppText className="text-ios-subheadline text-mute">
              Или{" "}
              <AppText className="text-ios-subheadline text-accent">
                напишите нам в WhatsApp
              </AppText>
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
