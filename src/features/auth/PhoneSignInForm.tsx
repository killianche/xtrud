/**
 * «Ваш номер» — вход и регистрация по номеру без пароля (№380, владелец
 * 2026-11-09: «полностью убери пароль, вход просто по номеру с
 * подтверждением»).
 *
 * Один вопрос на экране — номер; дальше сервер (/v2/auth/phone-status):
 * аккаунт есть — подтверждение звонком и сразу вход, нет — подтверждение
 * звонком и регистрация с этим номером (останется имя). Пароль спрашивается,
 * только если его вернули флагом на сервере (`passwordLogin`) — тогда
 * вызывающий экран открывает прежний шаг пароля.
 *
 * Общая разметка для первого экрана входа (app/(auth)/welcome.tsx) и входа
 * из LoginWall и шторок (app/(auth)/phone.tsx): у них разная навигация после
 * входа, поэтому она — в колбэках.
 */

import { type ReactNode, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { FormScrollView } from "@/components/ui/KeyboardAware";
import { loginWithPhoneCall } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useCallConfirm } from "./CallConfirmSheet";
import { formatRuPhone } from "./RegisterFormFields";
import { fetchAuthOptions } from "./use-auth-options";
import { normalizeRuPhoneDigits } from "./validation";

export function PhoneSignInForm({
  topBar,
  onSignedIn,
  onNewUser,
  onPasswordNeeded,
}: {
  /** Кнопка «Назад» или пустое место того же размера. */
  topBar: (busy: boolean) => ReactNode;
  /** Вошли — навигация за вызывающим экраном (AuthGate, возврат к заданию). */
  onSignedIn: (userId: string) => void | Promise<void>;
  /** Номера нет — регистрация с ним; token — номер уже подтверждён звонком. */
  onNewUser: (phone: string, token: string | undefined) => void;
  /** Сервер вернул вход по паролю — прежний шаг пароля. */
  onPasswordNeeded: (phone: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const call = useCallConfirm();
  useBackGestureLock(busy);

  const next = async () => {
    setBusy(true);
    setError(null);
    const full = `+7${phone}`;
    const [status, options] = await Promise.all([
      supabase.auth.phoneStatus(full),
      fetchAuthOptions(),
    ]);
    setBusy(false);
    if (status.error || status.exists === null) {
      setError(status.error?.message ?? "Не удалось проверить номер");
      return;
    }
    if (status.exists) {
      if (options.passwordLogin) {
        onPasswordNeeded(phone);
        return;
      }
      const token = await call.confirm(full, "login");
      if (!token) return; // шторку закрыли — остаёмся на номере
      setBusy(true);
      const result = await loginWithPhoneCall(full, token);
      if (!result.ok) {
        setBusy(false);
        setError(result.error);
        return;
      }
      await onSignedIn(result.userId);
      setBusy(false);
      return;
    }
    // Новый человек — сначала подтвердить номер звонком (если включено),
    // потом регистрация с этим номером: остаётся имя.
    let token: string | undefined;
    if (options.phoneCallAtRegistration) {
      const t = await call.confirm(full, "register");
      if (!t) return;
      token = t;
    }
    onNewUser(phone, token);
  };

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <FormScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "space-between" }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-4">
          {topBar(busy)}
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-ios-large-title text-ink"
          >
            Ваш номер
          </AppText>
          <AppText className="mt-2 text-ios-body text-mute">
            Войдём в аккаунт или создадим новый — по номеру телефона, без пароля.
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
            Подтвердим номер бесплатным звонком с вашего телефона.
          </AppText>
        </View>
      </FormScrollView>
      {call.sheet}
    </View>
  );
}
