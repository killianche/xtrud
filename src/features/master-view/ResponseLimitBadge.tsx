// ResponseLimitBadge — отображение дневного лимита откликов мастера (P0-5).
//
// Эталон: Яндекс Услуги — «осталось 4 отклика сегодня», Thumbtack Pro
// Rewards с цифрой в шапке. Дневной лимит = 5 откликов (МСК-сутки).
// Trigger в БД (migration 0059) блокирует INSERT >5, RPC get_response_limit_today
// возвращает {used, max, remaining}.
//
// Два варианта рендера:
//   - `variant="pill"` (default) — компактный chip для шапки / inline-меток.
//     Цвета: зелёный — осталось ≥3, жёлтый — 1-2, серый/красный — 0.
//   - `variant="card"` — full-width карточка с прогресс-баром, для главной
//     мастера. Шире, заметнее, с подсказкой про reset.

import { Lightning } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useResponseLimit } from "@/features/orders/use-response-limit";
import { useThemeColor } from "@/lib/use-theme-color";

interface ResponseLimitBadgeProps {
  /** Layout-вариант. По умолчанию pill (короткий chip). */
  variant?: "pill" | "card";
}

export function ResponseLimitBadge({ variant = "pill" }: ResponseLimitBadgeProps) {
  const { data, isLoading } = useResponseLimit();
  const successColor = useThemeColor("success");
  const warningColor = useThemeColor("warning");
  const errorColor = useThemeColor("error");

  if (isLoading || !data) {
    return null;
  }

  const { used, max, remaining } = data;

  // Цветовая схема по remaining (общая для pill и card)
  let iconColor = successColor;
  let accentTextClass = "text-success";
  if (remaining === 0) {
    iconColor = errorColor;
    accentTextClass = "text-error";
  } else if (remaining <= 2) {
    iconColor = warningColor;
    accentTextClass = "text-warning";
  }

  // ============== PILL variant ==============
  if (variant === "pill") {
    const text =
      used === 0 ? `${max} откликов сегодня` : `${used} из ${max} откликов`;
    return (
      <View className="flex-row items-center gap-1.5 self-start rounded-pill bg-canvas-soft border border-hairline px-3 py-1.5">
        <Lightning size={12} weight="fill" color={iconColor} />
        <AppText weight="medium" className="text-caption text-ink">
          {text}
        </AppText>
        {remaining === 0 ? (
          <AppText weight="medium" className="text-caption text-mute">
            · завтра новые
          </AppText>
        ) : null}
      </View>
    );
  }

  // ============== CARD variant — game-HUD style ==============
  // Inspired by Duolingo hearts / Wordle row / arcade-energy:
  //   ⚡  Отклики    ●●●○○   3/5
  // Все в одну строку, ~h-12. 5 «жизней-молний»: filled = осталось
  // (success/warning/error), empty = использовано (canvas-soft-2 outline).
  // Mono counter справа. Компактно, читабельно, ощущение «энергии».
  const dotFilledClass =
    remaining === 0
      ? "bg-error"
      : remaining <= 2
        ? "bg-warning"
        : "bg-success";

  return (
    <View className="flex-row items-center gap-3 rounded-pill border border-hairline bg-canvas-soft px-3 py-2">
      <Lightning size={14} weight="fill" color={iconColor} />
      <AppText weight="semibold" className="text-body-sm text-ink">
        Отклики
      </AppText>

      {/* Hearts/lives row — 5 точек. Каждая 8×8 кружок.
          remaining штук filled яркие, остальные — тусклые outline-кружки. */}
      <View className="flex-1 flex-row items-center justify-center gap-1.5">
        {Array.from({ length: max }).map((_, i) => {
          const isFilled = i < remaining;
          return (
            <View
              key={i}
              className={
                isFilled
                  ? `h-2 w-2 rounded-full ${dotFilledClass}`
                  : "h-2 w-2 rounded-full border border-hairline-strong"
              }
            />
          );
        })}
      </View>

      <AppText
        weight="mono"
        className={`text-mono-caption ${accentTextClass}`}
      >
        {remaining}/{max}
      </AppText>
    </View>
  );
}
