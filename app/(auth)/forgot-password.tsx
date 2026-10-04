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
//
// С 2026-10-04 (№215, владелец: «восстановление пароля тоже через звонок»):
// если на сервере включён обратный звонок SMS.ru — номер подтверждается
// звонком на бесплатный номер, затем новый пароль, и человек сразу входит
// (как у больших сервисов: номер → подтверждение → новый пароль). Заявка
// «Перезвоните мне» остаётся запасным путём и единственным, пока звонок
// выключен.

import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, CheckCircle } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, GlassButton, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { useCallConfirm } from "@/features/auth/CallConfirmSheet";
import { PasswordField } from "@/features/auth/PasswordField";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { fetchAuthOptions } from "@/features/auth/use-auth-options";
import { normalizeRuPhoneDigits } from "@/features/auth/validation";
import { requestPasswordRecovery } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

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
  // Звонок включён на сервере — главный путь он; null — ещё не знаем.
  const [byCall, setByCall] = useState<boolean | null>(null);
  const call = useCallConfirm();
  // Номер подтверждён — второй шаг: новый пароль.
  const [verified, setVerified] = useState<{ phone: string; token: string } | null>(null);
  const [password, setPassword] = useState("");
  // Номер уже подтверждён звонком — уход без нового пароля спрашиваем (QA).
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges: verified !== null,
    isBusy: busy,
    title: "Пароль не изменён",
    message: "Выйти? Звонок для подтверждения придётся повторить.",
  });

  useEffect(() => {
    let alive = true;
    void fetchAuthOptions().then((o) => {
      if (alive) setByCall(o.phoneCallRecovery);
    });
    return () => {
      alive = false;
    };
  }, []);

  const confirmByCall = async () => {
    setError(null);
    const full = `+7${phone}`;
    const token = await call.confirm(full, "recover");
    if (token) setVerified({ phone: full, token });
  };

  const savePassword = async () => {
    if (!verified) return;
    setBusy(true);
    setError(null);
    // Успешный recover сразу входит, и AuthGate уводит с экранов входа ещё до
    // конца этой функции — уход разрешаем заранее, иначе гвард спросит
    // «Пароль не изменён» после успеха. При ошибке экран остаётся.
    allowLeave();
    const r = await supabase.auth.recover(verified.phone, verified.token, password);
    setBusy(false);
    if (r.error) {
      // Подтверждение устарело (15 минут) — вернуть к номеру.
      if (r.error.code === "phone_verification_required") {
        setVerified(null);
        setPassword("");
      }
      setError({ text: r.error.message, noAccount: r.error.code === "account_not_found" });
      return;
    }
    // Вход выполнен — AuthGate поведёт дальше; сразу на главную.
    router.replace("/(tabs)" as never);
  };

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

  if (verified) {
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
              Новый пароль
            </AppText>
            <AppText className="mt-2 text-ios-body text-mute">
              Номер +7 {formatRuPhone(phone)} подтверждён. Придумайте новый пароль — после
              сохранения сразу войдём.
            </AppText>
            <View className="mt-8">
              <PasswordField
                kind="new"
                label="Новый пароль · минимум 8 символов"
                placeholder="Новый пароль"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  if (error) setError(null);
                }}
                editable={!busy}
                autoFocus
                error={error?.text}
                onSubmitEditing={() => password.length >= 8 && void savePassword()}
              />
            </View>
          </View>
          <View className="px-6 pb-8 pt-8">
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={password.length < 8 || busy}
              loading={busy}
              onPress={() => void savePassword()}
            >
              Сохранить и войти
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
            {byCall
              ? "Введите номер аккаунта и подтвердите его звонком — затем придумаете новый пароль."
              : "Оставьте номер, на который зарегистрирован аккаунт. Мы перезвоним и поможем войти."}
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
          {byCall ? (
            <>
              <Button
                variant="accent"
                size="lg"
                fullWidth
                disabled={phone.length !== 10 || busy}
                onPress={() => void confirmByCall()}
              >
                Продолжить
              </Button>
              <Pressable
                accessibilityRole="button"
                onPress={() => void submit()}
                disabled={phone.length !== 10 || busy}
                hitSlop={8}
                className="mt-4 min-h-11 items-center justify-center active:opacity-60"
              >
                <AppText className="text-ios-subheadline text-mute">
                  Не получается?{" "}
                  <AppText className="text-ios-subheadline text-accent">Перезвоните мне</AppText>
                </AppText>
              </Pressable>
            </>
          ) : (
            <Button
              variant="accent"
              size="lg"
              fullWidth
              disabled={phone.length !== 10 || busy || byCall === null}
              loading={busy}
              onPress={() => void submit()}
            >
              Перезвоните мне
            </Button>
          )}
          {/* Со звонком запасной путь один — «Перезвоните мне»; «Напишите
              нам» есть в шторке звонка. */}
          {byCall ? null : (
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
          )}
        </View>
      </ScrollView>
      {call.sheet}
    </KeyboardAvoidingView>
  );
}
