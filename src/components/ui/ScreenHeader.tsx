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

import { CaretLeft } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

// Активный pill в правом углу (rightAction.active === true) рисуется
// с голубым accent-tint, НЕ с чёрной заливкой. Чёрные chip-кнопки запрещены
// (user 2026-05-15: «черные кнопки не делай»). Этот же accent-pattern
// применяется ко всем chip'ам с selected-состоянием в проекте.

export interface ScreenHeaderRightAction {
  /** Текст на pill-кнопке (например, «Фильтры»). */
  label: string;
  /** Lucide-иконка слева от текста. Опц. */
  Icon?: IconComponent;
  onPress: () => void;
  /** Если true — pill подсвечивается ink-цветом (есть активные фильтры). */
  active?: boolean;
  /** A11y label если отличается от label. */
  accessibilityLabel?: string;
}

/** Иконка-only кнопка (h-10 w-10 круг) — для overflow-меню («⋮»),
 *  share-кнопки, flag, edit-pencil и т.п. Альтернатива pill-rightAction. */
export interface ScreenHeaderIconAction {
  Icon: IconComponent;
  onPress: () => void;
  accessibilityLabel: string;
}

interface ScreenHeaderProps {
  title: string;
  onBack?: () => void;
  backDisabled?: boolean;
  /** Опц. pill-кнопка справа (Фильтры / Сохранить / Поделиться). */
  rightAction?: ScreenHeaderRightAction;
  /** Опц. круглая icon-кнопка справа (overflow «⋮» / share / edit и т.п.).
   *  Если переданы и rightAction и iconAction — рендерятся обе (icon правее). */
  iconAction?: ScreenHeaderIconAction;
}

const HEADER_HEIGHT = 64;

export function ScreenHeader({
  title,
  onBack,
  backDisabled = false,
  rightAction,
  iconAction,
}: ScreenHeaderProps) {
  const inkColor = useThemeColor("ink");
  const accentColor = useThemeColor("accent");

  return (
    // `minHeight`, не `height`: title раньше рендерился с глобальным
    // maxFontSizeMultiplier=1.3, который держал text-display-md в один
    // рост даже при увеличенном шрифте. После снятия капа (AppText.tsx,
    // 2026-08-30, docs/IOS_FOUNDATION.md §9.2 п.3) title растёт на
    // AX-размерах — фиксированная height обрезала бы его сверху/снизу.
    <View
      className="flex-row items-center gap-2 bg-canvas px-3"
      style={{ minHeight: HEADER_HEIGHT }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          accessibilityState={{ disabled: backDisabled }}
          disabled={backDisabled}
          onPress={onBack}
          hitSlop={8}
          className={`h-12 w-12 items-center justify-center rounded-full active:bg-canvas-soft ${
            backDisabled ? "opacity-40" : ""
          }`}
        >
          <CaretLeft size={28} weight="bold" color={inkColor} />
        </Pressable>
      ) : null}

      <View className="flex-1 min-w-0">
        <AppText
          weight="bold"
          className="text-display-md tracking-tight text-ink"
          numberOfLines={1}
        >
          {title}
        </AppText>
      </View>

      {rightAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rightAction.accessibilityLabel ?? rightAction.label}
          onPress={rightAction.onPress}
          // min-h, не h: на крупных accessibility-размерах текст растёт, а
          // пилюля растёт вместе с ним (та же логика, что у заголовка выше).
          className={`min-h-11 flex-row items-center gap-1.5 rounded-pill border px-4 py-2 active:opacity-70 ${
            rightAction.active
              ? "border-accent bg-accent-soft"
              : "border-hairline bg-canvas hover:bg-surface-2"
          }`}
        >
          {/* 18 px иконка и 16 px текст: 14 px «Фильтры» владелец назвал
              слишком мелким (DECISION 2026-09-02, единый стандарт). */}
          {rightAction.Icon ? (
            <rightAction.Icon
              size={18}
              weight="bold"
              color={rightAction.active ? accentColor : inkColor}
            />
          ) : null}
          <AppText
            weight="semibold"
            className={`text-body-md ${rightAction.active ? "text-accent" : "text-ink"}`}
          >
            {rightAction.label}
          </AppText>
        </Pressable>
      ) : null}

      {iconAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={iconAction.accessibilityLabel}
          onPress={iconAction.onPress}
          hitSlop={8}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-canvas-soft"
        >
          <iconAction.Icon size={20} weight="bold" color={inkColor} />
        </Pressable>
      ) : null}
    </View>
  );
}
