// Экран «Забыли пароль» (route /(auth)/forgot-password).
//
// С 2026-10-04 — по коду из SMS (владелец: «подключить SMS с кодом»): номер
// → шторка с кодом (PhoneCodeSheet) → новый пароль → сразу вход. Сервер
// меняет пароль, закрывает все прежние сессии и отдаёт новую.
//
// Без SMS на сервере (GET /v2/auth/options: passwordResetBySms=false) —
// прежний путь: доступ восстанавливает поддержка вручную
// (docs/PASSWORD_RECOVERY_RUNBOOK.md, DECISION владельца 2026-09-03).
// Ссылка на поддержку остаётся и в SMS-варианте: на 2026-10-04 SMS доходят
// только абонентам Билайна, остальным поможет поддержка.

import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, Eye, EyeSlash, LifebuoyIcon } from "phosphor-react-native";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, GlassButton, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { usePhoneCodeConfirm } from "@/features/auth/PhoneCodeSheet";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { useAuthOptions } from "@/features/auth/use-auth-options";
import { normalizeRuPhoneDigits } from "@/features/auth/validation";
import { resetPasswordBySms } from "@/lib/auth";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "accent", "mute"]);
  const goBack = useSafeBack("/(auth)/phone" as const);
  const options = useAuthOptions();

  const header = (
    <View className="px-6 pt-4">
      <NavCircleButton label="Назад" onPress={goBack}>
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

  if (options.isPending) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        {header}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tc.mute} />
        </View>
      </View>
    );
  }

  if (!options.data?.passwordResetBySms) {
    return (
      <View
        className="flex-1 bg-canvas"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
      >
        {header}
        <View className="flex-1 items-center justify-center px-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
            <LifebuoyIcon size={40} weight="bold" color={tc.accent} />
          </View>
          <AppText weight="bold" className="mt-6 text-center text-ios-title1 text-ink">
            Восстановление пароля
          </AppText>
          <AppText className="mt-2 text-center text-ios-body text-mute">
            Напишите в поддержку с номера, на который зарегистрирован аккаунт. Укажите имя и
            фамилию, город или район и, если публиковали задание, его название — так мы убедимся,
            что аккаунт ваш. В ответ пришлём временный пароль; смените его после входа.
          </AppText>
          <AppText className="mt-3 text-center text-ios-footnote text-mute">
            Пароль никто не видит — он хранится в зашифрованном виде. Восстановления по электронной
            почте нет.
          </AppText>
          <View className="mt-8 w-full gap-3">
            <GlassButton
              label="Написать в поддержку"
              onPress={() => void Linking.openURL(SUPPORT_URL)}
            />
            <GlassButton label="К входу" onPress={goBack} secondary />
          </View>
        </View>
      </View>
    );
  }

  return <SmsReset header={header} />;
}

function SmsReset({ header }: { header: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["mute"]);
  const params = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(() => normalizeRuPhoneDigits(params.phone ?? ""));
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = usePhoneCodeConfirm();
  useBackGestureLock(busy);

  const fullPhone = `+7${phone}`;

  const getCode = async () => {
    setError(null);
    const t = await code.confirm(fullPhone, "reset");
    if (t) setToken(t);
  };

  const save = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const r = await resetPasswordBySms({
      phone: fullPhone,
      verificationToken: token,
      newPassword: password,
    });
    setBusy(false);
    if (!r.ok) {
      // Подтверждение одноразовое и живёт 15 минут — после ошибки нужен новый код.
      setToken(null);
      setError(r.error);
      return;
    }
    router.replace("/(tabs)" as never);
  };

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
        {header}
        <View className="flex-1 px-6">
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-display-lg text-ink"
          >
            {token ? "Новый пароль" : "Восстановление пароля"}
          </AppText>
          <AppText className="mt-2 text-ios-body text-mute">
            {token
              ? `Номер +7 ${formatRuPhone(phone)} подтверждён. Придумайте новый пароль — после сохранения вы сразу войдёте.`
              : "Пришлём код в SMS на номер, к которому привязан аккаунт."}
          </AppText>

          {token ? (
            <View className="mt-8">
              <Input
                size="lg"
                label="Пароль · минимум 8 символов"
                value={password}
                onChangeText={setPassword}
                placeholder="Новый пароль"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                autoFocus
                editable={!busy}
                rightIcon={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    onPress={() => setShowPassword((v) => !v)}
                    hitSlop={12}
                  >
                    {showPassword ? (
                      <EyeSlash size={22} weight="bold" color={tc.mute} />
                    ) : (
                      <Eye size={22} weight="bold" color={tc.mute} />
                    )}
                  </Pressable>
                }
              />
            </View>
          ) : (
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
                  onChangeText={(raw) => setPhone(normalizeRuPhoneDigits(raw))}
                  placeholder="928 123-45-67"
                  keyboardType="phone-pad"
                  autoComplete="tel-national"
                  textContentType="telephoneNumber"
                  inputMode="tel"
                  autoFocus={phone.length < 10}
                />
              </View>
            </View>
          )}

          {error ? (
            <AppText accessibilityRole="alert" className="mt-4 text-ios-subheadline text-error">
              {error}
            </AppText>
          ) : null}
        </View>

        <View className="px-6 pb-8 pt-8">
          {token ? (
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={password.length < 8 || busy}
              loading={busy}
              onPress={() => void save()}
            >
              Сохранить и войти
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={phone.length !== 10}
              onPress={() => void getCode()}
            >
              Получить код
            </Button>
          )}
          <Pressable
            accessibilityRole="button"
            onPress={() => void Linking.openURL(SUPPORT_URL)}
            hitSlop={8}
            className="mt-4 min-h-11 items-center justify-center active:opacity-60"
          >
            <AppText className="text-ios-subheadline text-mute">
              Не приходит SMS?{" "}
              <AppText className="text-ios-subheadline text-accent">Написать в поддержку</AppText>
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
      {code.sheet}
    </KeyboardAvoidingView>
  );
}
