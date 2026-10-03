/**
 * Контакты — только после входа (владелец, 2026-10-03: «как гость я могу
 * позвонить клиенту — это неправильно»; «у специалиста нужна надпись: чтобы
 * позвонить или увидеть контакты — зарегистрируйтесь»). Вместо кнопок
 * «Позвонить»/WhatsApp гость видит этот блок: номер не показывается, после
 * входа человек возвращается на тот же экран (auth-return, только
 * /orders/<uuid> и /master/<uuid>).
 *
 * Тот же путь в вход, что у RespondAuthSheet: безопасный return-intent и
 * /(auth)/phone или /(auth)/register.
 */

import { useRouter } from "expo-router";
import { LockSimple } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { parseAuthReturnTo } from "@/features/auth/auth-return";
import { useAuthReturnUrlStore } from "@/lib/auth-return-url-store";
import { useThemeColors } from "@/lib/use-theme-color";

export function GuestContactGate({
  returnPath,
  title,
}: {
  /** Экран, куда вернуть после входа: `/orders/<id>` или `/master/<id>`. */
  returnPath: string;
  /** «Войдите, чтобы позвонить клиенту» и т.п. */
  title: string;
}) {
  const router = useRouter();
  const tc = useThemeColors(["accent"]);
  const returnTo = parseAuthReturnTo(returnPath);

  const continueTo = (pathname: "/(auth)/phone" | "/(auth)/register") => {
    if (returnTo) useAuthReturnUrlStore.getState().setReturnUrl(returnTo);
    router.push({ pathname, params: returnTo ? { returnTo } : {} } as never);
  };

  return (
    <View className="mt-4">
      <View className="flex-row items-center gap-3">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-soft">
          <LockSimple size={18} weight="bold" color={tc.accent} />
        </View>
        <AppText weight="semibold" className="min-w-0 flex-1 text-body-md text-ink">
          {title}
        </AppText>
      </View>
      <View className="mt-3 flex-row gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Войти"
          onPress={() => continueTo("/(auth)/phone")}
          className="min-h-12 flex-1 items-center justify-center rounded-pill bg-accent px-3 active:opacity-85"
        >
          <AppText weight="semibold" className="text-body-md text-on-accent">
            Войти
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Зарегистрироваться"
          onPress={() => continueTo("/(auth)/register")}
          className="min-h-12 flex-1 items-center justify-center rounded-pill border border-hairline-strong px-3 active:bg-canvas-soft-2"
        >
          <AppText weight="semibold" className="text-body-md text-ink">
            Регистрация
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
