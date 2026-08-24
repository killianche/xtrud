/**
 * Auth-wall при публикации задания гостем.
 *
 * Sheet не создаёт аккаунт и не публикует автоматически. Он фиксирует только
 * безопасный return-intent, после чего отправляет в существующий password-auth
 * flow. Черновик и фото текущей сессии остаются в Zustand до явного повторного
 * нажатия «Опубликовать задание» уже авторизованным пользователем.
 */

import { useRouter } from "expo-router";
import { CheckCircle } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { ORDER_CREATE_RETURN_TO } from "@/features/auth/auth-return";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { beginGuestDraftAuthJourney } from "@/lib/order-draft-store";
import { useThemeColors } from "@/lib/use-theme-color";

export interface PublishAuthSheetProps {
  open: boolean;
  onClose: () => void;
}

export function PublishAuthSheet({ open, onClose }: PublishAuthSheetProps) {
  const router = useRouter();
  const tc = useThemeColors(["success"]);

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
    <BottomSheet open={open} onClose={onClose} title="Войдите, чтобы опубликовать">
      <View className="gap-6 px-5 pt-4">
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
            className="h-14 items-center justify-center rounded-pill bg-primary active:opacity-80"
          >
            <AppText weight="semibold" className="text-button-lg text-on-primary">
              Войти
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Создать аккаунт и вернуться к заданию"
            onPress={() => continueTo("/(auth)/register")}
            className="h-14 items-center justify-center rounded-pill border border-hairline bg-canvas active:bg-canvas-soft"
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
    </BottomSheet>
  );
}
