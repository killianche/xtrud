// ScreenHeader — единый header для full-screen экранов в xtrud.
//
// Используется на: master/[id], category/[id], orders/search, orders/[id],
// chats/[id], orders/category-select, profile/edit-master, useful/[slug],
// admin, и любых других detail-экранах с back-кнопкой.
//
// **Размеры — ЕДИНЫЙ СТАНДАРТ (фидбек user 2026-05-15):**
//   - height: 64px (визуально крупный, не «мелкий хедер»)
//   - back-кнопка: h-12 w-12 (48×48 touch target, минимум по a11y)
//   - back-иконка: 28px stroke 2.25 (заметная)
//   - title: text-display-md (24px) tracking-tight weight=700
//   - title gap от back: gap-2
//   - right action (опц.): h-11 px-4 rounded-pill border-hairline
//
// **Когда использовать:** на ЛЮБОМ full-screen detail-экране где нужен
// back и заголовок. Запрещено делать ad-hoc header'ы — ломает консистентность.
//
// API:
//   <ScreenHeader title="Поиск заказов" onBack={() => goBack()} />
//   <ScreenHeader
//     title="Поиск заказов"
//     onBack={goBack}
//     rightAction={{
//       label: "Фильтры",
//       Icon: SlidersHorizontal,
//       onPress: () => setOpen(true),
//       active: hasActiveFilters,
//     }}
//   />

import { ChevronLeft } from "lucide-react-native";
import type { ComponentType } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

export interface ScreenHeaderRightAction {
  /** Текст на pill-кнопке (например, «Фильтры»). */
  label: string;
  /** Lucide-иконка слева от текста. Опц. */
  Icon?: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
  /** Если true — pill подсвечивается ink-цветом (есть активные фильтры). */
  active?: boolean;
  /** A11y label если отличается от label. */
  accessibilityLabel?: string;
}

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  /** Опц. кнопка справа (Фильтры / Сохранить / Поделиться и т.д.). */
  rightAction?: ScreenHeaderRightAction;
}

const HEADER_HEIGHT = 64;

export function ScreenHeader({ title, onBack, rightAction }: ScreenHeaderProps) {
  const inkColor = useThemeColor("ink");
  const onPrimaryColor = useThemeColor("on-primary");

  return (
    <View
      className="flex-row items-center gap-2 bg-canvas px-3"
      style={{ height: HEADER_HEIGHT }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={onBack}
          hitSlop={8}
          className="h-12 w-12 items-center justify-center rounded-full active:bg-canvas-soft"
        >
          <ChevronLeft size={28} strokeWidth={2.25} color={inkColor} />
        </Pressable>
      ) : null}

      <AppText
        weight="bold"
        className="flex-1 text-display-md tracking-tight text-ink"
        numberOfLines={1}
      >
        {title}
      </AppText>

      {rightAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rightAction.accessibilityLabel ?? rightAction.label}
          onPress={rightAction.onPress}
          className={`h-11 flex-row items-center gap-1.5 rounded-pill border px-4 active:opacity-70 ${
            rightAction.active
              ? "border-ink bg-ink"
              : "border-hairline bg-canvas hover:bg-surface-2"
          }`}
        >
          {rightAction.Icon ? (
            <rightAction.Icon
              size={16}
              strokeWidth={2}
              color={rightAction.active ? onPrimaryColor : inkColor}
            />
          ) : null}
          <AppText
            weight="semibold"
            className={`text-button ${rightAction.active ? "text-on-primary" : "text-ink"}`}
          >
            {rightAction.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
