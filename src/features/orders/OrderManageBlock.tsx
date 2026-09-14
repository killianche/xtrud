/**
 * OrderManageBlock — «что дальше с моим заданием»: один блок на экране своего
 * задания вместо подсказки «Уже нашли мастера?» и пунктов в меню «⋯»
 * (владелец, 2026-09-13: «закрыть задание — кнопка не очень выглядит,
 * сделай отдельный блок, красиво, продумай функционал»).
 *
 * Содержимое зависит от состояния (0196):
 *   открыто, есть отклики  → «Нашли исполнителя?»: Выбрать исполнителя · Закрыть задание
 *   открыто, откликов нет  → «Задание открыто»: Закрыть задание
 *   исполнитель выбран     → Работа выполнена · Отказаться от исполнителя · Отменить задание
 *   завершено              → Оставить отзыв (или «Отзыв оставлен»)
 *   закрыто / истекло      → Открыть заново (7 дней) · Удалить задание
 *
 * Одно главное действие на состояние — акцентная капсула; остальное тише
 * (design-quality §1.1). Цвет плитки (`TILE`/`iconColor` ниже) — свой набор
 * для этого блока, не связан со статус-пилюлей (`StatusPill`,
 * `src/features/orders/order-status-view.ts`) и не обводка — обводки карточек
 * убраны совсем (docs/ORDER_STATUS_DESIGN.md §3.2).
 */

import {
  ArrowCounterClockwise,
  CheckCircle,
  Handshake,
  Star,
  XCircle,
} from "phosphor-react-native";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

export interface OrderManageBlockProps {
  status: string;
  /** Живые отклики (sent/viewed) — есть из кого выбирать. */
  activeResponsesCount: number;
  /** Можно открыть заново (окно 7 дней, canReopenOrder). */
  canReopen: boolean;
  /** Мой отзыв по заданию: оценка или null. undefined — ещё грузится. */
  myReviewRating: number | null | undefined;
  /** Какое действие сейчас выполняется — крутилка в его кнопке. */
  busyAction: "complete" | "unpick" | "cancel" | "reopen" | "delete" | null;
  onChooseMaster: () => void;
  onClose: () => void;
  onComplete: () => void;
  onUnpick: () => void;
  onCancel: () => void;
  onReview: () => void;
  onReopen: () => void;
  onDelete: () => void;
}

type Tone = "link" | "warning" | "success" | "neutral";

const TILE: Record<Tone, string> = {
  link: "bg-link-bg-soft",
  warning: "bg-warning-soft",
  success: "bg-success-soft",
  neutral: "bg-surface-2",
};

export function OrderManageBlock(props: OrderManageBlockProps) {
  const tc = useThemeColors(["link", "warning-deep", "success", "mute", "on-accent", "ink"]);
  const iconColor: Record<Tone, string> = {
    link: tc.link,
    warning: tc["warning-deep"],
    success: tc.success,
    neutral: tc.mute,
  };

  const busy = props.busyAction !== null;

  const header = (tone: Tone, Icon: IconComponent, title: string, text: string) => (
    <View className="flex-row items-start gap-3">
      <View className={`h-11 w-11 items-center justify-center rounded-xl ${TILE[tone]}`}>
        <Icon size={24} weight="bold" color={iconColor[tone]} />
      </View>
      <View className="min-w-0 flex-1">
        <AppText accessibilityRole="header" weight="semibold" className="text-title-md text-ink">
          {title}
        </AppText>
        <AppText className="mt-1 text-body-md text-body">{text}</AppText>
      </View>
    </View>
  );

  const primary = (
    label: string,
    onPress: () => void,
    action?: OrderManageBlockProps["busyAction"],
  ) => {
    const isBusy = !!action && props.busyAction === action;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy: isBusy }}
        disabled={busy}
        onPress={onPress}
        className={`mt-4 min-h-12 flex-row items-center justify-center rounded-pill bg-accent px-4 ${
          busy && !isBusy ? "opacity-50" : "active:opacity-85"
        }`}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={tc["on-accent"]} />
        ) : (
          <AppText weight="semibold" className="text-body-lg text-on-accent">
            {label}
          </AppText>
        )}
      </Pressable>
    );
  };

  const secondary = (
    label: string,
    onPress: () => void,
    action?: OrderManageBlockProps["busyAction"],
  ) => {
    const isBusy = !!action && props.busyAction === action;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy: isBusy }}
        disabled={busy}
        onPress={onPress}
        className={`mt-2.5 min-h-12 flex-row items-center justify-center rounded-pill border border-hairline-strong bg-canvas px-4 ${
          busy && !isBusy ? "opacity-50" : "active:bg-canvas-soft"
        }`}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={tc.mute} />
        ) : (
          <AppText weight="semibold" className="text-body-lg text-ink">
            {label}
          </AppText>
        )}
      </Pressable>
    );
  };

  const quiet = (
    label: string,
    onPress: () => void,
    action?: OrderManageBlockProps["busyAction"],
  ) => {
    const isBusy = !!action && props.busyAction === action;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: busy, busy: isBusy }}
        disabled={busy}
        onPress={onPress}
        className={`mt-1.5 min-h-11 items-center justify-center ${busy ? "opacity-50" : "active:opacity-60"}`}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={tc.mute} />
        ) : (
          <AppText weight="medium" className="text-body-md text-error">
            {label}
          </AppText>
        )}
      </Pressable>
    );
  };

  let body: ReactNode;
  switch (props.status) {
    case "open":
      body =
        props.activeResponsesCount > 0 ? (
          <>
            {header(
              "link",
              Handshake,
              "Нашли исполнителя?",
              "Выберите того, с кем договорились: задание уйдёт из ленты, остальные узнают, что выбран другой.",
            )}
            {primary("Выбрать исполнителя", props.onChooseMaster)}
            {secondary("Закрыть задание", props.onClose)}
          </>
        ) : (
          <>
            {header(
              "link",
              Handshake,
              "Задание открыто",
              "Специалисты видят его в ленте и откликаются. Нашли исполнителя в другом месте или передумали — закройте задание.",
            )}
            {secondary("Закрыть задание", props.onClose)}
          </>
        );
      break;
    case "in_progress":
    case "awaiting_confirmation":
      body = (
        <>
          {header(
            "warning",
            Handshake,
            "Исполнитель выбран",
            "Когда работа будет готова, отметьте это — задание завершится, и вы сможете оставить отзыв.",
          )}
          {primary("Работа выполнена", props.onComplete, "complete")}
          {secondary("Отказаться от исполнителя", props.onUnpick, "unpick")}
          {quiet("Отменить задание", props.onCancel, "cancel")}
        </>
      );
      break;
    case "completed":
      body =
        props.myReviewRating === undefined ? (
          header("success", CheckCircle, "Работа выполнена", "Задание завершено.")
        ) : props.myReviewRating === null ? (
          <>
            {header(
              "success",
              CheckCircle,
              "Работа выполнена",
              "Оцените исполнителя — отзыв поможет другим заказчикам выбрать.",
            )}
            {primary("Оставить отзыв", props.onReview)}
          </>
        ) : (
          <>
            {header("success", CheckCircle, "Работа выполнена", "Спасибо за отзыв!")}
            <View
              className="mt-3 flex-row items-center gap-1"
              accessibilityLabel={`Ваша оценка: ${props.myReviewRating} из 5`}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <Star
                  key={i}
                  size={20}
                  weight={i <= (props.myReviewRating ?? 0) ? "fill" : "regular"}
                  color={tc["warning-deep"]}
                />
              ))}
            </View>
          </>
        );
      break;
    default:
      body = (
        <>
          {header(
            "neutral",
            props.status === "expired" ? ArrowCounterClockwise : XCircle,
            props.status === "expired" ? "Срок задания истёк" : "Задание закрыто",
            props.canReopen
              ? "Можно открыть заново в течение 7 дней — оно вернётся в ленту, откликнувшиеся получат уведомление."
              : "Если снова понадобится исполнитель, разместите новое задание.",
          )}
          {props.canReopen ? primary("Открыть заново", props.onReopen, "reopen") : null}
          {quiet("Удалить задание", props.onDelete, "delete")}
        </>
      );
  }

  return <View className="mx-5 mt-6 rounded-2xl bg-canvas-soft p-4">{body}</View>;
}
