/**
 * Шапка и каркас экранов шторки «Фильтры» (`/find-filters`, №235).
 *
 * Системная шторка (pageSheet) со своим стеком: «Фильтры» → «Категория» →
 * раздел, «Место» → район. Как фильтры в «Почте» iOS: на первом экране
 * «Сбросить» слева и «Готово» справа, на вложенных — «назад» (и свайп).
 * Выбор применяется сразу — список под шторкой уже отфильтрован.
 */

import { CaretLeft } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";

export function FilterSheetScreen({
  title,
  onBack,
  onReset,
  onDone,
  children,
}: {
  title: string;
  /** Вложенный экран — кнопка «назад». */
  onBack?: () => void;
  /** Первый экран — «Сбросить» слева. */
  onReset?: () => void;
  /** Первый экран — «Готово» справа (закрыть шторку). */
  onDone?: () => void;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink"]);
  return (
    <View className="flex-1 bg-surface-page">
      <View className="min-h-14 flex-row items-center px-4 pt-2">
        <View className="min-w-24 items-start">
          {onBack ? (
            <NavCircleButton label="Назад" onPress={onBack}>
              <SystemIcon
                sf="chevron.left"
                fallback={CaretLeft}
                size={18}
                weight="semibold"
                color={tc.ink}
              />
            </NavCircleButton>
          ) : onReset ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сбросить фильтры"
              onPress={onReset}
              hitSlop={8}
              className="min-h-11 justify-center active:opacity-60"
            >
              <AppText className="text-ios-body text-accent">Сбросить</AppText>
            </Pressable>
          ) : null}
        </View>
        <AppText
          accessibilityRole="header"
          weight="semibold"
          numberOfLines={1}
          className="flex-1 text-center text-ios-headline text-ink"
        >
          {title}
        </AppText>
        <View className="min-w-24 items-end">
          {onDone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Готово"
              onPress={onDone}
              hitSlop={8}
              className="min-h-11 justify-center active:opacity-60"
            >
              <AppText weight="semibold" className="text-ios-body text-accent">
                Готово
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}
