// Экран «Забыли пароль» (route /(auth)/forgot-password).
//
// Раньше здесь была форма почты: Supabase присылал письмо со ссылкой на смену
// пароля. Supabase погашен 2026-09-08, писем больше нет, а форма осталась —
// поле почты и кнопка «Отправить ссылку», которая не могла сработать никогда:
// requestPasswordReset сразу отвечал «напишите в поддержку». Экран обещал то,
// чего нет (design-quality §5).
//
// DECISION владельца 2026-09-03: доступ восстанавливает поддержка вручную
// (docs/PASSWORD_RECOVERY_RUNBOOK.md). Экран говорит ровно это и ведёт туда
// же, что и /reset-password.

import { CaretLeft, LifebuoyIcon } from "phosphor-react-native";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GlassButton } from "@/components/ui";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "accent"]);
  const goBack = useSafeBack("/(auth)/phone" as const);

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
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
      <View className="flex-1 items-center justify-center px-6">
        <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
          <LifebuoyIcon size={40} weight="bold" color={tc.accent} />
        </View>
        <AppText weight="bold" className="mt-6 text-center text-ios-title1 text-ink">
          Восстановление пароля
        </AppText>
        <AppText className="mt-2 text-center text-ios-body text-mute">
          Напишите в поддержку с номера, на который зарегистрирован аккаунт. Укажите имя и фамилию,
          город или район и, если публиковали задание, его название — так мы убедимся, что аккаунт
          ваш. В ответ пришлём временный пароль; смените его после входа.
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
