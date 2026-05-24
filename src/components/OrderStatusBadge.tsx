// OrderStatusBadge — pill-плашка для отображения статуса заказа.
//
// Используется везде, где видна карточка/детали заказа: orders/index, orders/[id],
// OrderRow. Цвета через токены: success-soft, surface-2, warning-soft, error-soft
// + текст соответствующего semantic-цвета.
//
// 2026-05-20 (classified-ads simplification): убрали accept-flow. В новом
// lifecycle используются только статусы:
//   draft     — серый (зарезервирован)
//   open      — accent (заявка опубликована, ждёт мастеров) — единственный
//               цветной статус: «активный» сигнал, который ловит взгляд
//   cancelled — нейтральный серый (закрыта клиентом)
//   expired   — нейтральный серый (истёк срок)
// Остальные (in_progress / awaiting_confirmation / completed / disputed)
// технически в БД ещё есть для legacy-данных, но недостижимы в новом UI —
// показываем нейтральный лейбл «Закрыт» (серый), не падаем.
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
  label: "Закрыт",
  bgClass: "bg-surface-2",
  textClass: "text-mute",
  dotClass: "bg-muted-soft",
};

const STYLES: Record<OrderStatusValue, BadgeStyle> = {
  draft: {
    label: "Черновик",
    bgClass: "bg-surface-2",
    textClass: "text-mute",
    dotClass: "bg-muted-soft",
  },
  // Единственный цветной статус — «активна, ждёт откликов». Accent ловит взгляд.
  open: {
    label: "Активна",
    bgClass: "bg-accent-soft",
    textClass: "text-accent",
    dotClass: "bg-accent",
  },
  // Legacy / недостижимы в новом UI — показываем как «Закрыт».
  in_progress: CLOSED_LEGACY,
  awaiting_confirmation: CLOSED_LEGACY,
  completed: CLOSED_LEGACY,
  disputed: CLOSED_LEGACY,
  cancelled: {
    label: "Закрыта",
    bgClass: "bg-surface-2",
    textClass: "text-mute",
    dotClass: "bg-muted-soft",
  },
  expired: {
    label: "Истекла",
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
