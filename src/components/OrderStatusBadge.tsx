// OrderStatusBadge — pill-плашка для отображения статуса заказа.
//
// Используется везде, где видна карточка/детали заказа: orders/index, orders/[id],
// OrderRow, header чата (когда заказ-context). Цвета через токены: success-soft,
// surface-2, warning-soft, error-soft + текст соответствующего semantic-цвета.
//
// 6 статусов из docs/order-states.md:
//   draft     — серый
//   open      — синий (accent — заявка опубликована, ждёт мастеров)
//   in_progress — yellow/amber (работа идёт)
//   completed — зелёный (выполнено)
//   cancelled — серый (отменено)
//   expired   — серый (истёк срок)

import { View } from "react-native";
import { AppText } from "@/components/AppText";

export type OrderStatusValue =
  | "draft"
  | "open"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired";

export interface OrderStatusBadgeProps {
  status: OrderStatusValue;
  /** Размер: sm = пилюля 22px, md = 28px. */
  size?: "sm" | "md";
}

interface BadgeStyle {
  label: string;
  bgClass: string;
  textClass: string;
}

const STYLES: Record<OrderStatusValue, BadgeStyle> = {
  draft: { label: "Черновик", bgClass: "bg-surface-2", textClass: "text-muted" },
  open: { label: "Открыта", bgClass: "bg-accent-soft", textClass: "text-accent" },
  in_progress: { label: "В работе", bgClass: "bg-warning-soft", textClass: "text-warning" },
  completed: { label: "Завершён", bgClass: "bg-success-soft", textClass: "text-success" },
  cancelled: { label: "Отменён", bgClass: "bg-surface-2", textClass: "text-muted" },
  expired: { label: "Истёк", bgClass: "bg-surface-2", textClass: "text-muted" },
};

export function OrderStatusBadge({ status, size = "sm" }: OrderStatusBadgeProps) {
  const s = STYLES[status];
  const padding = size === "sm" ? "px-2.5 py-0.5" : "px-3 py-1";
  const textSize = size === "sm" ? "text-caption-xs" : "text-caption";
  return (
    <View className={`self-start rounded-pill ${s.bgClass} ${padding}`}>
      <AppText weight="semibold" className={`${textSize} ${s.textClass}`}>
        {s.label}
      </AppText>
    </View>
  );
}
