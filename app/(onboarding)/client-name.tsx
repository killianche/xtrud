/**
 * /(onboarding)/client-name — обязательный шаг ввода имени для клиента.
 *
 * Flow (фидбэк user 2026-05-18 «нужно, чтобы человек обязательно ввёл своё
 * имя»):
 *   /auth/phone → /auth/verify → /(onboarding)/role
 *     → если 'client': push сюда → submit { role, firstName }
 *       → onboarding_completed_at=now() → AuthGate redirect /(tabs)
 *
 * Зачем отдельный экран, а не сразу в role.tsx:
 *   - Шаг «имя» обязателен только для клиента; мастер вводит имя в
 *     master-profile wizard (вместе с last_name, bio, opыт).
 *   - Принцип one-thing-per-screen: на role.tsx — выбор роли,
 *     здесь — только имя. Так пользователь не теряется.
 *
 * Имя обязательно (валидация ≥ 2 символа, иначе кнопка disabled).
 * Без back-кнопки — gestureEnabled=false на onboarding-стеке (см. _layout).
 */

import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { UsernameField } from "@/features/auth/UsernameField";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCompleteOnboarding } from "@/features/auth/use-complete-onboarding";
import { useExitOnboarding } from "@/features/auth/use-exit-onboarding";
import { setUsernameErrorMessage, useSetUsername } from "@/features/auth/use-username";

export default function ClientNameScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const completeOnboarding = useCompleteOnboarding();
  const setUsernameMut = useSetUsername();
  const { exit: exitOnboarding } = useExitOnboarding();

  const [firstName, setFirstName] = useState("");
  const [usernameValue, setUsernameValue] = useState("");
  const [usernameValid, setUsernameValid] = useState(false);

  const trimmed = firstName.trim();
  const nameValid = trimmed.length >= 2;
  const canSubmit = nameValid && usernameValid && !!userId;
  const isBusy = completeOnboarding.isPending || setUsernameMut.isPending;
  const error = setUsernameMut.error
    ? setUsernameErrorMessage(setUsernameMut.error.message)
    : completeOnboarding.error?.message;

  const onSubmit = async () => {
    if (!canSubmit || !userId || isBusy) return;
    try {
      // Сначала закрепляем юзернейм, потом завершаем онбординг. Если юзернейм
      // успели занять между проверкой и сабмитом — RPC бросит ошибку, и онбординг
      // не завершится (имя останется, можно поправить юзернейм).
      await setUsernameMut.mutateAsync({ username: usernameValue, userId });
      await completeOnboarding.mutateAsync({
        userId,
        role: "client",
        firstName: trimmed,
      });
      // AuthGate увидит onboarding_completed_at и сам редиректнет в (tabs).
      // Подстраховка на случай если кэш не успел инвалидироваться — push явно.
      router.replace("/(tabs)" as never);
    } catch (_e) {
      // Ошибка отображается через error в UI ниже.
    }
  };

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-row justify-end px-6 pb-4">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отменить регистрацию"
          onPress={exitOnboarding}
          hitSlop={8}
          className="active:opacity-60"
        >
          <AppText weight="medium" className="text-caption text-muted">
            Отмена
          </AppText>
        </Pressable>
      </View>

      <View className="flex-1 px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Как вас зовут?
        </AppText>

        <View className="mt-10">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Имя
          </AppText>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Например, Иса"
            placeholderTextColor="rgb(var(--muted-soft))"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="next"
            editable={!isBusy}
            className="mt-2 h-12 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
          />
        </View>

        {/* Юзернейм — уникальный публичный идентификатор, закрепляется за вами
            один раз. Помогает узнавать вас независимо от номера телефона. */}
        <View className="mt-6">
          <UsernameField
            value={usernameValue}
            onChange={setUsernameValue}
            onValidityChange={setUsernameValid}
            editable={!isBusy}
          />
        </View>

        {error ? (
          <AppText weight="medium" className="mt-4 text-caption text-error">
            {error}
          </AppText>
        ) : null}
      </View>

      <View className="px-6">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Продолжить"
          disabled={!canSubmit || isBusy}
          onPress={onSubmit}
          className={`h-12 items-center justify-center rounded-md ${
            canSubmit && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            {isBusy ? "Сохраняем..." : "Продолжить"}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
