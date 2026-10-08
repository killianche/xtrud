/**
 * /(tabs)/profile — пятая вкладка, «Аккаунт».
 *
 * Переделано с нуля 2026-10-03. Владелец: «пятая кнопка открывает
 * суперстарую версию — её нужно полностью удалить и сделать по нашей
 * логике; правильный аккаунт — тот, что открывается с аватара на Главной».
 * Старый экран (своя шапка-карточка, «Редактировать профиль», «Мои отзывы»,
 * «Тема», кнопка «Выйти» отдельной плашкой) удалён целиком; вкладка
 * показывает тот же AccountBody, что /account: «Я специалист», «Принимаю
 * задания», «Аккаунт», «Выйти». Тема — в «Настройках», отзывы — в «Я
 * специалист».
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
        <LargeTitleBlock title="Аккаунт" />
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
        title="Аккаунт"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
      />
    </View>
  );
}
