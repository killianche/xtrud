// Sticky предупреждение о безопасности — нет аванса/эскроу, не переходить
// в мессенджеры по подозрительным ссылкам. Защищает мастеров и клиентов
// от типового фрода (см. AUDIT.md риск №1 + Yandex Исполнители паттерн).

import { ShieldAlert } from "lucide-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";

export function SafetyBanner() {
  return (
    <View className="flex-row items-start gap-3 rounded-lg bg-surface-2 p-4">
      <View className="mt-0.5 h-8 w-8 items-center justify-center rounded-full bg-warning-soft">
        <ShieldAlert size={16} strokeWidth={2} color="#f59e0b" />
      </View>
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink">
          Без аванса и эскроу
        </AppText>
        <AppText className="mt-1 text-body-sm text-body">
          В xtrud нет функции предоплаты или безопасной сделки через сервис. Не переводите деньги по
          подозрительным ссылкам и не переносите общение в сторонние мессенджеры.
        </AppText>
      </View>
    </View>
  );
}
