// MasterStatsBlock — полноценный блок статистики мастера на главной.
//
// Заменяет компактный <ResponseLimitBadge /> (фидбек user 2026-05-15:
// «добавь больше информации, статистики какой-нибудь, сделай полноценный
// блок»). Показывает 4 ключевые метрики:
//   1. Лимит откликов сегодня (X / 5)
//   2. Всего откликов отправлено
//   3. Раз меня выбрали (accepted)
//   4. Завершённых сделок
//
// Layout: компактные tile-карточки 2x2 grid. Цифра большая mono, label
// маленький. Лимит откликов — с прогресс-баром.

import { CheckCircle2, MessageSquare, Trophy, Zap } from "lucide-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useMasterStats } from "@/features/master-view/use-master-stats";
import { useThemeColor } from "@/lib/use-theme-color";

export function MasterStatsBlock() {
  const { data, isLoading } = useMasterStats();
  const successColor = useThemeColor("success");
  const warningColor = useThemeColor("warning");
  const accentColor = useThemeColor("accent");
  const muteColor = useThemeColor("mute");

  if (isLoading || !data) {
    // Скелетон высотой ~110px чтобы layout не дёргался.
    return <View style={{ height: 188 }} className="rounded-xl bg-surface-2" />;
  }

  const remaining = Math.max(0, data.today_max - data.today_used);
  // Цвет лимита по remaining: зелёный → жёлтый → красный
  const limitIconColor = remaining === 0 ? muteColor : remaining <= 2 ? warningColor : successColor;

  return (
    <View className="gap-2">
      {/* Top row — большая карточка с лимитом откликов + прогресс */}
      <View className="rounded-xl border border-hairline bg-canvas p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Zap size={16} strokeWidth={2} color={limitIconColor} fill={limitIconColor} />
            <AppText weight="medium" className="text-caption text-muted">
              Отклики сегодня
            </AppText>
          </View>
          <AppText weight="mono" className="text-mono-md text-ink">
            {data.today_used} / {data.today_max}
          </AppText>
        </View>
        {/* Простой прогресс-бар */}
        <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <View
            style={{
              width: `${(data.today_used / data.today_max) * 100}%`,
              height: "100%",
              backgroundColor: limitIconColor,
            }}
          />
        </View>
        {remaining === 0 ? (
          <AppText className="mt-2 text-caption text-muted">
            Лимит исчерпан. Завтра в 00:00 (МСК) появятся новые.
          </AppText>
        ) : (
          <AppText className="mt-2 text-caption text-muted">
            Осталось {remaining} {remaining === 1 ? "отклик" : "откликов"} на сегодня
          </AppText>
        )}
      </View>

      {/* Bottom row — 3 tile-карточки */}
      <View className="flex-row gap-2">
        <StatTile
          Icon={MessageSquare}
          iconColor={accentColor}
          value={data.responses_total}
          label="Отправил откликов"
        />
        <StatTile
          Icon={Trophy}
          iconColor={warningColor}
          value={data.picked_total}
          label="Меня выбрали"
        />
        <StatTile
          Icon={CheckCircle2}
          iconColor={successColor}
          value={data.completed_total}
          label="Завершил сделок"
        />
      </View>
    </View>
  );
}

interface StatTileProps {
  Icon: typeof Zap;
  iconColor: string;
  value: number;
  label: string;
}

function StatTile({ Icon, iconColor, value, label }: StatTileProps) {
  return (
    <View className="flex-1 rounded-xl border border-hairline bg-canvas p-3">
      <Icon size={16} strokeWidth={2} color={iconColor} />
      <AppText weight="bold" className="mt-2 text-display-sm text-ink">
        {value}
      </AppText>
      <AppText className="mt-0.5 text-caption text-muted" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}
