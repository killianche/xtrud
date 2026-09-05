/**
 * Auth-wall при отклике гостя — контент route'а `orders/respond-auth`.
 *
 * DECISION владельца 2026-09-06: «если я не зарегистрирован, кнопка
 * „Откликнуться“ всё равно должна быть; по нажатию — просит зарегистрироваться
 * и перекидывает на регистрацию; после — обратно к заданию».
 *
 * Правило Apple (HIG «Managing accounts»): дать людям пользоваться
 * приложением до аккаунта, а вход просить в момент, когда он действительно
 * нужен, и объяснить зачем. Здесь ровно этот момент: чтобы откликнуться,
 * нужен аккаунт — заказчику надо знать, кто ему пишет.
 *
 * Компонент только фиксирует безопасный return-intent (`/orders/<id>` есть в
 * allowlist auth-return.ts) и отправляет в существующий вход/регистрацию. После
 * входа человек возвращается на это же задание, форма отклика уже на экране.
 */

import { useRouter } from "expo-router";
import { ChatCenteredText, X } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { parseAuthReturnTo } from "@/features/auth/auth-return";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { useThemeColors } from "@/lib/use-theme-color";

export interface RespondAuthSheetProps {
  orderId: string;
  onClose: () => void;
}

export function RespondAuthSheet({ orderId, onClose }: RespondAuthSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["accent", "mute"]);
  const returnTo = parseAuthReturnTo(`/orders/${orderId}`);

  const continueTo = (pathname: "/(auth)/phone" | "/(auth)/register") => {
    if (returnTo) useAuthReturnUrlStore.getState().setReturnUrl(returnTo);
    onClose();
    router.push({
      pathname,
      params: returnTo ? { returnTo } : {},
    } as never);
  };

  return (
    <View className="w-full bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-3 px-5 py-3">
        <AppText
          weight="bold"
          className="flex-1 text-display-sm tracking-tight text-ink"
          numberOfLines={2}
        >
          Войдите, чтобы откликнуться
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={onClose}
          hitSlop={10}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft"
        >
          <X size={22} weight="bold" color={tc.mute} />
        </Pressable>
      </View>

      <View className="gap-6 px-5 pb-6 pt-1">
        <View className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas-soft px-4 py-4">
          <ChatCenteredText size={24} weight="fill" color={tc.accent} />
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-ink">
              Заказчику важно знать, кто пишет
            </AppText>
            <AppText className="mt-1 text-body-sm text-body">
              Аккаунт создаётся за минуту: имя, номер и пароль. После входа вы вернётесь к этому
              заданию и сразу сможете ответить.
            </AppText>
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Создать аккаунт и вернуться к заданию"
            onPress={() => continueTo("/(auth)/register")}
            className="min-h-14 items-center justify-center rounded-pill bg-accent active:opacity-85"
          >
            <AppText weight="semibold" className="text-button-lg text-on-accent">
              Создать аккаунт
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Войти и вернуться к заданию"
            onPress={() => continueTo("/(auth)/phone")}
            className="min-h-14 items-center justify-center rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-lg text-ink">
              У меня уже есть аккаунт
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
