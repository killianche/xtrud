// StatusPill — единственная плашка статуса задания/отклика в приложении.
//
// Раньше это было четыре разных места (OrderStatusBadge + order-card-tone.ts +
// responseStatusView в [id].tsx + historyResponseStatusLabel), каждое со своим
// выбором цвета для одного и того же факта — см. docs/ORDER_STATUS_DESIGN.md
// §1.2. Теперь вид определяет ТОЛЬКО `orderStatusView()`
// (src/features/orders/order-status-view.ts), а этот компонент просто рисует
// её результат: пилюля в карточке списка (OrderRow), в шапке экрана задания и
// в блоке «Ваш отклик».
//
// 2026-09-14 (docs/ORDER_STATUS_DESIGN.md §3, план §8 шаг 1-2): 4 тона —
// neutral / confirmed (зелёная, CheckCircle) / archive (серая) / cancelled
// (красная, XCircle, только «Закрыто» у заказчика). Обводки карточек убраны
// совсем (§3.2) — весь смысл несёт эта пилюля: текст + цвет + иконка, три
// независимых канала кодирования вместо прежних (цвет заливки + обводка).
// Контраст текста — из `-deep`-токенов (§3.3): text-success/text-mute на
// *-soft не проходят WCAG AA в light-теме, поэтому здесь всегда success-deep/
// error-deep/mute-deep, а не базовые success/error/mute.

import { ArrowUUpLeft, CheckCircle, ClockCountdown, XCircle } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import type { PillTone, StatusIconKey } from "@/features/orders/order-status-view";
import { useThemeColors } from "@/lib/use-theme-color";

export interface StatusPillProps {
  tone: PillTone;
  label: string;
  iconKey?: StatusIconKey;
  /** Насыщенность иконки — см. OrderStatusView.iconWeight (§3.1.1). */
  iconWeight?: "fill" | "bold";
  /** Размер: sm = компактная пилюля (карточка списка), md = крупнее (шапка
   *  экрана задания). */
  size?: "sm" | "md";
}

const TONE_CLASS: Record<PillTone, { bg: string; text: string }> = {
  neutral: { bg: "bg-surface-2", text: "text-mute-deep" },
  archive: { bg: "bg-surface-2", text: "text-mute-deep" },
  confirmed: { bg: "bg-success-soft", text: "text-success-deep" },
  cancelled: { bg: "bg-error-soft", text: "text-error-deep" },
};

// Резолв ключа из чистой (без UI-импортов) order-status-view.ts в реальный
// Phosphor-компонент — единственное место в приложении, которое это делает.
const ICON_BY_KEY: Record<StatusIconKey, typeof CheckCircle> = {
  check: CheckCircle,
  cancel: XCircle,
  expired: ClockCountdown,
  undo: ArrowUUpLeft,
};

export function StatusPill({
  tone,
  label,
  iconKey,
  iconWeight = "fill",
  size = "sm",
}: StatusPillProps) {
  const tc = useThemeColors(["success-deep", "error-deep", "mute-deep"]);
  const iconColor =
    tone === "confirmed"
      ? tc["success-deep"]
      : tone === "cancelled"
        ? tc["error-deep"]
        : tc["mute-deep"];
  const cls = TONE_CLASS[tone];
  const padding = size === "sm" ? "h-6 px-2.5" : "h-7 px-3";
  const iconSize = size === "sm" ? 13 : 15;
  const Icon = iconKey ? ICON_BY_KEY[iconKey] : null;
  return (
    <View className={`flex-row items-center gap-1 self-start rounded-pill ${cls.bg} ${padding}`}>
      {Icon ? <Icon size={iconSize} weight={iconWeight} color={iconColor} /> : null}
      <AppText weight="semibold" className={`text-caption ${cls.text}`}>
        {label}
      </AppText>
    </View>
  );
}
