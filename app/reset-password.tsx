/**
 * /reset-password — раньше сюда вела ссылка из письма Supabase. Писем больше
 * нет (DECISION владельца 2026-09-03: доступ восстанавливает администратор,
 * сервер — свой, docs/BACKEND_REWRITE_PLAN.md). Маршрут оставлен для старых
 * ссылок и ведёт в поддержку.
 */

import { useRouter } from "expo-router";
import { LifebuoyIcon } from "phosphor-react-native";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GlassButton } from "@/components/ui";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["accent"]);
  return (
    <View
      className="flex-1 items-center justify-center bg-surface-page px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
        <LifebuoyIcon size={40} weight="bold" color={tc.accent} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-ios-title1 text-ink">
        Восстановление доступа
      </AppText>
      <AppText className="mt-2 text-center text-ios-body text-mute">
        Напишите в поддержку с номера, на который зарегистрирован аккаунт, — мы зададим новый пароль
        и пришлём его вам.
      </AppText>
      <View className="mt-8 w-full gap-3">
        <GlassButton
          label="Написать в поддержку"
          onPress={() => void Linking.openURL(SUPPORT_URL)}
        />
        <GlassButton
          label="К входу"
          onPress={() => router.replace("/(auth)/phone" as never)}
          secondary
        />
      </View>
    </View>
  );
}
