/**
 * Auth-wall при публикации задания гостем — контент route'а
 * `app/(details)/orders/publish-auth.tsx`.
 *
 * Раньше жил как `BottomSheet` внутри `orders/new.tsx`. Теперь — отдельный
 * route с нативной iOS `formSheet`-модальностью (`docs/IOS_FOUNDATION.md`
 * §2.4): самостоятельная карточка с двумя кнопками, предсказуемая по высоте →
 * `fitToContents`. Presentation/detents задаёт `Stack.Screen` route'а.
 *
 * Компонент не создаёт аккаунт и не публикует автоматически. Он фиксирует
 * только безопасный return-intent, после чего отправляет в существующий
 * password-auth flow. Черновик и фото текущей сессии остаются в Zustand до
 * явного повторного нажатия «Опубликовать задание» уже авторизованным
 * пользователем. Никакого результата обратно в `orders/new.tsx` возвращать не
 * нужно (это не пикер, а сквозная навигация) — store для handshake не нужен.
 */

import { useRouter } from "expo-router";
import { CheckCircle, X } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { beginGuestDraftAuthJourney } from "@/lib/order-draft-store";
import { useThemeColors } from "@/lib/use-theme-color";

export interface PublishAuthSheetProps {
  onClose: () => void;
}

export function PublishAuthSheet({ onClose }: PublishAuthSheetProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["success", "mute"]);

  const continueTo = (pathname: "/(auth)/phone" | "/(auth)/register") => {
    const draftJourney = beginGuestDraftAuthJourney();
    useAuthReturnUrlStore.getState().setReturnUrl(ORDER_CREATE_RETURN_TO);
    onClose();
    router.push({
      pathname,
      params: {
        returnTo: ORDER_CREATE_RETURN_TO,
        ...(draftJourney ? { draftJourney } : {}),
        ...(pathname === "/(auth)/register" ? { authOrigin: "sheet" } : {}),
      },
    } as never);
  };

  return (
    <View className="bg-canvas w-full" style={{ paddingTop: insets.top }}>
      {/* Header — тот же стиль, что у `PickerSheetPage` (bold title + close-X). */}
      <View className="flex-row items-center gap-3 px-5 py-3">
        <AppText
          weight="bold"
          className="flex-1 text-display-sm tracking-tight text-ink"
          numberOfLines={2}
        >
          Войдите, чтобы опубликовать
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
          <CheckCircle size={24} weight="fill" color={tc.success} />
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-ink">
              Черновик сохранён
            </AppText>
            <AppText className="mt-1 text-body-sm text-body">
              После входа вы вернётесь к заданию и подтвердите публикацию.
            </AppText>
          </View>
        </View>

        <View className="gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Войти и вернуться к заданию"
            onPress={() => continueTo("/(auth)/phone")}
            className="min-h-14 items-center justify-center rounded-pill bg-primary active:opacity-80"
          >
            <AppText weight="semibold" className="text-button-lg text-on-primary">
              Войти
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Создать аккаунт и вернуться к заданию"
            onPress={() => continueTo("/(auth)/register")}
            className="min-h-14 items-center justify-center rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-lg text-ink">
              Создать аккаунт
            </AppText>
          </Pressable>
        </View>

        <AppText className="text-center text-caption text-mute">
          Ваш номер скрыт. С мастером связываетесь только вы.
        </AppText>
      </View>
    </View>
  );
}
