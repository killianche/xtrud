// Второй шаг входа — пароль для известного номера (№202, 2026-10-04).
// Номер уже введён на «Ваш номер» и показан сверху; здесь одно поле.
// «Забыли пароль?» — заявка «перезвоните мне» с этим номером.

import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, Eye, EyeSlash } from "phosphor-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, Input } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { useLogin } from "@/features/auth/use-auth-mutations";
import { normalizeRuPhoneDigits } from "@/features/auth/validation";
import { useBackGestureLock } from "@/lib/use-back-gesture-lock";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["ink", "mute"]);
  const goBack = useSafeBack("/(auth)/welcome" as const);
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = normalizeRuPhoneDigits(params.phone ?? "");
  const login = useLogin();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBackGestureLock(login.isPending);

  const submit = async () => {
    setError(null);
    try {
      await login.mutateAsync({ login: `+7${phone}`, password });
      // Дальше ведёт AuthGate: онбординг или приложение.
      router.replace("/(tabs)" as never);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти");
    }
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
          <NavCircleButton label="Назад" onPress={goBack} disabled={login.isPending}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="mt-6 text-ios-large-title text-ink"
          >
            Введите пароль
          </AppText>
          <AppText className="mt-2 text-ios-body text-mute">
            Аккаунт с номером{" "}
            <AppText weight="semibold" className="text-ios-body text-ink">
              +7 {formatRuPhone(phone)}
            </AppText>
          </AppText>

          <View className="mt-8">
            <Input
              size="lg"
              accessibilityLabel="Пароль"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (error) setError(null);
              }}
              placeholder="Пароль"
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              autoFocus
              editable={!login.isPending}
              onSubmitEditing={() => password.length > 0 && void submit()}
              returnKeyType="go"
              error={error ?? undefined}
              rightIcon={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={show ? "Скрыть пароль" : "Показать пароль"}
                  onPress={() => setShow((v) => !v)}
                  hitSlop={12}
                >
                  {show ? (
                    <EyeSlash size={22} weight="bold" color={tc.mute} />
                  ) : (
                    <Eye size={22} weight="bold" color={tc.mute} />
                  )}
                </Pressable>
              }
            />
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: "/(auth)/forgot-password", params: { phone } } as never)
              }
              hitSlop={8}
              className="mt-3 min-h-11 justify-center self-start active:opacity-70"
            >
              <AppText weight="semibold" className="text-ios-callout text-accent">
                Забыли пароль?
              </AppText>
            </Pressable>
          </View>
        </View>

        <View className="px-6 pb-8 pt-8">
          <Button
            variant="accent"
            size="lg"
            fullWidth
            disabled={password.length === 0 || login.isPending}
            loading={login.isPending}
            onPress={() => void submit()}
          >
            Войти
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
