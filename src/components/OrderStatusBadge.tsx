// OrderStatusBadge — pill-плашка для отображения статуса заказа.
//
// Используется везде, где видна карточка/детали заказа: orders/index, orders/[id],
// OrderRow. Цвета через токены: success-soft, surface-2, warning-soft, error-soft
// + текст соответствующего semantic-цвета.
//
// 2026-09-13 (0196): выбор исполнителя и завершение вернулись. Статусы:
//   open        — «Открыто», синий: ждёт откликов
//   in_progress — «Исполнитель выбран», оранжевый
//   completed   — «Завершено», зелёный: можно оставить отзыв
//   cancelled / expired / disputed — серые «Закрыто» / «Истекло».
//
// 2026-05-21 (полировка дизайна):
//   - убран `text-caption-xs` (10px, нарушение §C design-quality) — теперь
//     минимум 12px (text-caption) даже для size="sm".
//   - добавлена статус-точка (6px) слева от лейбла — Linear/DoorDash паттерн,
//     помогает «прочитать» статус с одного взгляда без чтения текста.
//   - open использует accent-soft (единственный цветной), остальные —
//     нейтральный surface-2 (фидбэк user: «слишком много цветов»).

import { View } from "react-native";
import { AppText } from "@/components/AppText";

export type OrderStatusValue =
  | "draft"
  | "open"
  | "in_progress"
  | "awaiting_confirmation"
  | "completed"
  | "disputed"
  | "cancelled"
  | "expired";

export interface OrderStatusBadgeProps {
  status: OrderStatusValue;
  /** Размер: sm = компактная пилюля, md = крупнее (для hero detail-экрана). */
  size?: "sm" | "md";
}

interface BadgeStyle {
  label: string;
  bgClass: string;
  textClass: string;
  /** Цвет статус-точки. accent для активной, нейтральный — для закрытых. */
  dotClass: string;
}

const CLOSED_LEGACY: BadgeStyle = {
  label: "Закрыто",
  bgClass: "bg-surface-2",
  textClass: "text-mute",
  dotClass: "bg-muted-soft",
};

// Цвета совпадают с обводкой карточек «Моих заданий» (order-card-tone.ts,
// владелец 2026-09-13): открыто — синий, исполнитель выбран — оранжевый,
// завершено — зелёный, закрыто и истекло — серые.
const PICKED: BadgeStyle = {
  label: "Исполнитель выбран",
  bgClass: "bg-warning-soft",
  textClass: "text-warning-deep",
  dotClass: "bg-warning",
};

const STYLES: Record<OrderStatusValue, BadgeStyle> = {
  draft: {
    label: "Черновик",
    bgClass: "bg-surface-2",
    textClass: "text-mute",
    dotClass: "bg-muted-soft",
  },
  open: {
    label: "Открыто",
    bgClass: "bg-link-bg-soft",
    textClass: "text-link",
    dotClass: "bg-link",
  },
  in_progress: PICKED,
  awaiting_confirmation: PICKED,
  completed: {
    label: "Завершено",
    bgClass: "bg-success-soft",
    textClass: "text-success",
    dotClass: "bg-success",
  },
  disputed: CLOSED_LEGACY,
  cancelled: CLOSED_LEGACY,
  expired: {
    label: "Истекло",
    bgClass: "bg-surface-2",
    textClass: "text-mute",
    dotClass: "bg-muted-soft",
  },
};

export function OrderStatusBadge({ status, size = "sm" }: OrderStatusBadgeProps) {
  const s = STYLES[status] ?? CLOSED_LEGACY;
  const padding = size === "sm" ? "h-6 px-2.5" : "h-7 px-3";
  const dotSize = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <View
      className={`flex-row items-center gap-1.5 self-start rounded-pill ${s.bgClass} ${padding}`}
    >
      <View className={`rounded-full ${s.dotClass} ${dotSize}`} />
      <AppText weight="semibold" className={`text-caption ${s.textClass}`}>
        {s.label}
      </AppText>
    </View>
  );
}
