/**
 * /(tabs)/profile — пятая вкладка, «Профиль».
 *
 * Слияние 2026-10-23 (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md): вкладка
 * сразу показывает настройки специалиста — видимость в каталоге, категории,
 * о себе, фото работ, контакты, — а не общий «Аккаунт» с отдельной карточкой-
 * переходом в хаб. Заголовок сменён с «Аккаунт» на «Профиль», тело — тот же
 * AccountBody, что и /account.
 *
 * Верх — как у остальных вкладок: крупный заголовок в начале списка,
 * компактный с размытием при прокрутке. Гость — вход и регистрация.
 */

import { type RefObject, useEffect, useRef } from "react";
import { Animated, type FlatList, type ScrollView, View } from "react-native";
import { InsetGroup } from "@/components/ui/InsetList";
import { LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui/LargeTitle";
import { AccountBody } from "@/features/account/AccountBody";
import { GuestContactGate } from "@/features/auth/GuestContactGate";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";

export default function ProfileTab() {
  const large = useLargeTitle(0);
  const tabBarSpace = useTabBarSpace();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // Повторный тап по вкладке — к началу.
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("profile");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef as unknown as RefObject<FlatList | null>);
  }, [resetCounter]);

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleBlock title="Профиль" />
        {userId ? (
          <AccountBody userId={userId} />
        ) : (
          <InsetGroup>
            <View className="px-4 pb-4">
              <GuestContactGate
                returnPath=""
                title="Войдите, чтобы публиковать задания, предлагать услуги и видеть контакты"
              />
            </View>
          </InsetGroup>
        )}
      </Animated.ScrollView>
      <LargeTitleBar
        title="Профиль"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
