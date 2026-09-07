/**
 * FilterSheetPage — системная шторка фильтров, как у Apple (App Store, Карты,
 * Почта): строка «Сбросить · Заголовок · Готово», под ней inset-группы.
 * Значения применяются сразу — отдельной кнопки «Применить» нет.
 * DECISION владельца 2026-09-07: «фильтры — полностью редизайн под Apple; на
 * «Специалистах» такие же».
 */

import type { ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { hapticSelection } from "@/lib/haptics";

export interface FilterSheetPageProps {
  title: string;
  /** Закрыть шторку (обычно `router.back()`). */
  onDone: () => void;
  /** Сбросить все фильтры; кнопка видна только когда есть что сбрасывать. */
  onReset?: () => void;
  resetVisible?: boolean;
  children: ReactNode;
}

export function FilterSheetPage({
  title,
  onDone,
  onReset,
  resetVisible = false,
  children,
}: FilterSheetPageProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <View className="h-14 flex-row items-center px-4">
        <View className="w-24">
          {resetVisible && onReset ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Сбросить фильтры"
              hitSlop={8}
              onPress={() => {
                hapticSelection();
                onReset();
              }}
              className="min-h-11 justify-center active:opacity-60"
            >
              <AppText className="text-ios-body text-accent">Сбросить</AppText>
            </Pressable>
          ) : null}
        </View>
        <AppText
          accessibilityRole="header"
          weight="semibold"
          className="flex-1 text-center text-ios-title text-ink"
          numberOfLines={1}
        >
          {title}
        </AppText>
        <View className="w-24 items-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Готово"
            hitSlop={8}
            onPress={onDone}
            className="min-h-11 justify-center active:opacity-60"
          >
            <AppText weight="semibold" className="text-ios-body text-accent">
              Готово
            </AppText>
          </Pressable>
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
