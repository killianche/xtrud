/**
 * Цвет карточки задания по его состоянию (владелец, 2026-09-13: «открыто —
 * одним цветом, выбран мастер — другим, завершено — третьим, закрыто без
 * исполнителя — затухшая; у мастера — своя подсветка, если выбрали его»).
 *
 * Правило одно для всех списков «Моих заданий». В ленте «Найти» все
 * задания открыты — там обводка не нужна и не показывается.
 *
 *   open                         → «Открыто», синяя обводка (link)
 *   in_progress                  → «Исполнитель выбран», оранжевая (warning)
 *   completed                    → «Завершено», зелёная (success)
 *   cancelled / expired / draft  → «Закрыто» / «Истекло», без обводки, приглушена
 *   выбрали меня (как мастера)   → «Вас выбрали», фирменная (accent) — при любом
 *                                  статусе, даже если задание уже закрыто
 *   выбрали другого              → «Выбран другой», приглушена
 */

export type OrderCardToneKind =
  | "open"
  | "picked"
  | "completed"
  | "closed"
  | "chosenMe"
  | "chosenOther";

export interface OrderCardTone {
  kind: OrderCardToneKind;
  label: string;
  dimmed: boolean;
}

export interface OrderToneInput {
  status: string;
  picked_master_id?: string | null;
}

/** Взгляд автора задания («Как клиент»). */
export function clientOrderTone(order: OrderToneInput): OrderCardTone {
  switch (order.status) {
    case "open":
      return { kind: "open", label: "Открыто", dimmed: false };
    case "in_progress":
    case "awaiting_confirmation":
      return { kind: "picked", label: "Исполнитель выбран", dimmed: false };
    case "completed":
      return { kind: "completed", label: "Завершено", dimmed: false };
    case "expired":
      return { kind: "closed", label: "Истекло", dimmed: true };
    case "draft":
      return { kind: "closed", label: "Черновик", dimmed: true };
    default:
      return { kind: "closed", label: "Закрыто", dimmed: true };
  }
}

/** Взгляд откликнувшегося специалиста («Как мастер»). */
export function masterOrderTone(
  order: OrderToneInput,
  me: string,
  responseStatus: string,
): OrderCardTone {
  if (order.picked_master_id && order.picked_master_id === me) {
    const label =
      order.status === "completed"
        ? "Вы выполнили"
        : order.status === "cancelled" || order.status === "expired"
          ? "Вас выбрали · отменено"
          : "Вас выбрали";
    return { kind: "chosenMe", label, dimmed: false };
  }
  if (order.picked_master_id || order.status === "completed" || order.status === "in_progress") {
    return { kind: "chosenOther", label: "Выбран другой", dimmed: true };
  }
  if (order.status === "cancelled")
    return { kind: "closed", label: "Задание закрыто", dimmed: true };
  if (order.status === "expired") return { kind: "closed", label: "Истекло", dimmed: true };
  if (responseStatus === "rejected") return { kind: "closed", label: "Отклонён", dimmed: true };
  if (responseStatus === "withdrawn") return { kind: "closed", label: "Отозван", dimmed: true };
  return { kind: "open", label: "Открыто", dimmed: false };
}

/** Класс обводки (токены темы). У закрытых обводки нет — только приглушение. */
export const TONE_BORDER_CLASS: Record<OrderCardToneKind, string | null> = {
  open: "border-link",
  picked: "border-warning",
  completed: "border-success",
  chosenMe: "border-accent",
  closed: null,
  chosenOther: null,
};

/** Плашка статуса: фон и текст. */
export const TONE_PILL_CLASS: Record<OrderCardToneKind, { bg: string; text: string }> = {
  open: { bg: "bg-link-bg-soft", text: "text-link" },
  picked: { bg: "bg-warning-soft", text: "text-warning-deep" },
  completed: { bg: "bg-success-soft", text: "text-success" },
  chosenMe: { bg: "bg-accent-soft", text: "text-accent" },
  closed: { bg: "bg-surface-2", text: "text-mute" },
  chosenOther: { bg: "bg-surface-2", text: "text-mute" },
};
