// ResponseLimitBadge — компактный бейдж в шапке master-главной с дневным
// лимитом откликов мастера (P0-5).
//
// Эталон: Яндекс Услуги — «осталось 4 отклика сегодня», Thumbtack Pro
// Rewards с цифрой в шапке. Бейдж даёт мастеру понимание сколько он уже
// откликнулся и сколько осталось без open'а отдельного экрана.
//
// Цвета: зелёный — осталось ≥3, жёлтый — 1-2, серый/красный — 0.

import { Zap } from "lucide-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useResponseLimit } from "@/features/orders/use-response-limit";
import { useThemeColor } from "@/lib/use-theme-color";

export function ResponseLimitBadge() {
  const { data, isLoading } = useResponseLimit();
  const successColor = useThemeColor("success");
  const warningColor = useThemeColor("warning");
  const errorColor = useThemeColor("error");
  const muteColor = useThemeColor("mute");

  if (isLoading || !data) {
    return null; // Не показываем skeleton — компактный бейдж, для UX лучше «появиться когда готов»
  }

  // Цветовая схема по remaining
  const remaining = data.remaining;
  let iconColor = successColor;
  let bgClass = "bg-canvas-soft border border-hairline";
  let textClass = "text-ink";
  if (remaining === 0) {
    iconColor = errorColor;
    bgClass = "bg-canvas-soft border border-hairline";
    textClass = "text-ink";
  } else if (remaining <= 2) {
    iconColor = warningColor;
  }

  // Если совсем нет откликов сегодня — короткий вариант «5 откликов на сегодня».
  // Иначе показываем «X из 5».
  const text =
    data.used === 0
      ? `${data.max} откликов сегодня`
      : `${data.used} из ${data.max} откликов`;

  return (
    <View className={`flex-row items-center gap-1.5 self-start rounded-pill px-3 py-1.5 ${bgClass}`}>
      <Zap size={12} strokeWidth={2} color={iconColor} fill={iconColor} />
      <AppText weight="medium" className={`text-caption ${textClass}`}>
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
