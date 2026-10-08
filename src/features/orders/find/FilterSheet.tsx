/**
 * Каркас шторок фильтров «Найти задание» (№238): «Категория» и «Место».
 *
 * Наш стиль, как конструктор задания: сверху круглые кнопки — «назад» слева
 * (на вложенном экране) и «закрыть» справа, ниже крупный заголовок слева и
 * подпись. Шторка — системный лист со своим стеком (свайп «назад» и вниз).
 * Выбор закрывает шторку сразу (`closeFilterSheet`): список под ней уже
 * отфильтрован. Разбор и референсы — docs/FIND_FILTERS_2026-10.md.
 */

import type { useRouter } from "expo-router";
import { CaretLeft, X } from "phosphor-react-native";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { FLOATING_PILL_SPACE } from "@/components/ui/FloatingPillButton";
import { NAV_BUTTON_SIZE, NAV_ROW_HEIGHT, NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";

/**
 * Закрыть всю шторку. С первого экрана шторки — просто back: он закрывает
 * модалку. С вложенного (`section`, `district`) — dismissAll сворачивает
 * внутренний стек шторки до первого экрана, затем back закрывает модалку.
 * На первом экране dismissAll нельзя: там ближайший стек — корневой, и
 * dismissAll уже закрывает модалку, а следующий back уводит на другую
 * вкладку (найдено на снимках 2026-10-05).
 */
export function closeFilterSheet(
  router: ReturnType<typeof useRouter>,
  from: "first" | "nested",
): void {
  if (from === "nested") router.dismissAll();
  router.back();
}

export function FilterSheetScreen({
  title,
  subtitle,
  onBack,
  onClose,
  header,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Вложенный экран — «назад» слева. */
  onBack?: () => void;
  onClose: () => void;
  /** Под заголовком, до списка (поиск). */
  header?: ReactNode;
  /**
   * Плавающая кнопка внизу (FloatingPillButton, №320): получает отступ от
   * низа; список оставляет под ней место.
   */
  footer?: (bottom: number) => ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink"]);
  return (
    <View className="flex-1 bg-surface-page">
      <View className="flex-row items-center px-3 pt-2" style={{ minHeight: NAV_ROW_HEIGHT + 8 }}>
        {onBack ? (
          <NavCircleButton label="Назад" onPress={onBack}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
        ) : (
          <View style={{ width: NAV_BUTTON_SIZE }} />
        )}
        <View className="flex-1" />
        <NavCircleButton label="Закрыть" onPress={onClose}>
          <SystemIcon sf="xmark" fallback={X} size={18} weight="semibold" color={tc.ink} />
        </NavCircleButton>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingBottom: insets.bottom + (footer ? FLOATING_PILL_SPACE + 12 : 32),
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pb-4 pt-1">
          <AppText accessibilityRole="header" weight="bold" className="text-ios-title1 text-ink">
            {title}
          </AppText>
          {subtitle ? <AppText className="mt-1 text-ios-body text-mute">{subtitle}</AppText> : null}
        </View>
        {header}
        {children}
      </ScrollView>
      {footer ? footer(insets.bottom + 12) : null}
    </View>
  );
}
