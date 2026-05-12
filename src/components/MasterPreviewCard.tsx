// MasterPreviewCard — компактная карточка мастера для горизонтального карусели
// на главной (Top Masters) и для категорий-листинга (улучшенная карточка по
// TaskRabbit Select-a-Tasker pattern).
//
// Структура:
//   фото-блок 92×92 (cover avatar_url или placeholder) + Trust-row (рейтинг,
//   сделки, город) + имя + experience-chip.
//
// 2 раз-варианта:
//   variant="horizontal" — фикс. width 200, под FlatList horizontal на главной.
//   variant="row" — full-width, для category-list (88-104px высоты).

import { Image } from "expo-image";
import { Star } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { useThemeColor } from "@/lib/use-theme-color";

export interface MasterPreviewCardProps {
  id: string;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  closedDeals: number;
  experienceYears: number | null;
  cityName: string | null;
  variant?: "horizontal" | "row";
  onPress: () => void;
}

export function MasterPreviewCard({
  id,
  avatarUrl,
  firstName,
  lastName,
  ratingAvg,
  ratingCount,
  closedDeals,
  experienceYears,
  cityName,
  variant = "horizontal",
  onPress,
}: MasterPreviewCardProps) {
  const warningColor = useThemeColor("warning");
  const fullName = [firstName, lastName].filter(Boolean).join(" ") || "Мастер";

  if (variant === "horizontal") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Профиль мастера ${fullName}`}
        onPress={onPress}
        className="w-[180px] rounded-lg border border-hairline bg-canvas p-3 active:opacity-80"
      >
        <View className="aspect-square w-full overflow-hidden rounded-md bg-surface-2">
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <View className="flex-1 items-center justify-center">
              <Avatar url={null} name={fullName} seed={id} size="lg" />
            </View>
          )}
        </View>
        <AppText weight="semibold" className="mt-3 text-body-md text-ink" numberOfLines={1}>
          {fullName}
        </AppText>
        <View className="mt-1 flex-row items-center gap-1">
          {ratingAvg != null && ratingCount > 0 ? (
            <>
              <Star size={12} strokeWidth={2} color={warningColor} fill={warningColor} />
              <AppText weight="semibold" className="text-caption text-ink">
                {ratingAvg.toFixed(1)}
              </AppText>
              <AppText className="text-caption-xs text-muted">({ratingCount})</AppText>
            </>
          ) : (
            <AppText className="text-caption-xs text-muted">Без отзывов</AppText>
          )}
        </View>
        {(closedDeals > 0 || cityName) && (
          <AppText className="mt-0.5 text-caption-xs text-muted" numberOfLines={1}>
            {closedDeals > 0 ? `${closedDeals} работ` : ""}
            {closedDeals > 0 && cityName ? " · " : ""}
            {cityName ?? ""}
          </AppText>
        )}
      </Pressable>
    );
  }

  // variant === "row" — full-width для category-list (TaskRabbit Select-a-Tasker).
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Профиль мастера ${fullName}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas p-3 active:opacity-70"
    >
      {/* Фото 92×92 cover вместо круглой аватарки */}
      <View className="h-[92px] w-[92px] overflow-hidden rounded-md bg-surface-2">
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Avatar url={null} name={fullName} seed={id} size="lg" />
          </View>
        )}
      </View>
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {fullName}
        </AppText>
        <View className="mt-1 flex-row items-center gap-2">
          {ratingAvg != null && ratingCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <Star size={12} strokeWidth={2} color={warningColor} fill={warningColor} />
              <AppText weight="semibold" className="text-caption text-ink">
                {ratingAvg.toFixed(1)}
              </AppText>
              <AppText className="text-caption-xs text-muted">({ratingCount})</AppText>
            </View>
          ) : (
            <AppText className="text-caption-xs text-muted">Без отзывов</AppText>
          )}
          {closedDeals > 0 && (
            <AppText className="text-caption-xs text-muted">{closedDeals} работ</AppText>
          )}
        </View>
        {(experienceYears != null && experienceYears > 0) || cityName ? (
          <AppText className="mt-1 text-caption-xs text-muted" numberOfLines={1}>
            {experienceYears != null && experienceYears > 0
              ? `Опыт ${experienceYears} ${pluralYears(experienceYears)}`
              : ""}
            {experienceYears != null && experienceYears > 0 && cityName ? " · " : ""}
            {cityName ?? ""}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "лет";
  if (mod10 === 1) return "год";
  if (mod10 >= 2 && mod10 <= 4) return "года";
  return "лет";
}
