/**
 * BannedScreen — аккаунт заблокирован администратором. DECISION владельца
 * 2026-09-07 (Р3): «заблокированному запрещено пользоваться приложением —
 * при заходе писать, что забанен, и обратиться в поддержку». На сервере
 * публикация, отклики и отзывы уже закрыты триггером
 * guard_content_author_active; этот экран закрывает интерфейс целиком.
 */

import { Prohibit } from "phosphor-react-native";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GlassButton } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { useThemeColors } from "@/lib/use-theme-color";

export const SUPPORT_URL = "https://t.me/xtrud_support";

export function BannedScreen() {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["error"]);
  return (
    <View
      className="flex-1 items-center justify-center bg-surface-page px-6"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <View className="h-20 w-20 items-center justify-center rounded-full bg-error-soft">
        <Prohibit size={40} weight="bold" color={tc.error} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-ios-title1 text-ink">
        Аккаунт заблокирован
      </AppText>
      <AppText className="mt-2 text-center text-ios-body text-mute">
        Пользоваться приложением с этого аккаунта нельзя. Если считаете, что это ошибка, напишите в
        поддержку.
      </AppText>
      <View className="mt-8 w-full gap-3">
        <GlassButton
          label="Написать в поддержку"
          onPress={() => void Linking.openURL(SUPPORT_URL)}
        />
        <GlassButton label="Выйти из аккаунта" onPress={() => void signOut()} secondary />
      </View>
    </View>
  );
}
