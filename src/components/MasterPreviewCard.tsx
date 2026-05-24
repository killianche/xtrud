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
import { Star } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { realAvatarUrl } from "@/lib/avatar";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
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
  // Только настоящее фото (Storage). DiceBear-заглушка → null → ниже сработает
  // <Avatar> с инициалами (решение владельца 2026-05-23, src/lib/avatar.ts).
  const photo = realAvatarUrl(avatarUrl);
  // Safari-fallback: если фото не загрузилось (CORS / 404 / тайм-аут) —
  // показываем инициалы через Avatar вместо пустого серого квадрата.
  // Сбрасывается при смене фото, чтобы новая попытка не была
  // заблокирована предыдущей ошибкой.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [photo]);

  // Telemetry: impression при появлении карточки. Server-side dedup в RPC
  // (24h по session_id) защищает от накрутки в горизонтальной карусели.
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (id) recordView(id, "impression");
  }, [id, recordView]);

  if (variant === "horizontal") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Профиль мастера ${fullName}`}
        onPress={onPress}
        className="w-[180px] rounded-lg border border-hairline bg-canvas p-3 active:opacity-80 hover:bg-surface-2"
      >
        <View className="aspect-square w-full overflow-hidden rounded-md bg-surface-2">
          {photo && !imageFailed ? (
            <Image
              source={{ uri: photo }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={150}
              onError={() => setImageFailed(true)}
              priority="high"
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
        {/* Rating-row — скрываем когда отзывов нет (фидбэк user 2026-05-20).
            Раньше показывался «Без отзывов» — выглядел как негативный
            маркер у новичков. Паттерн Airbnb/TaskRabbit: при 0 отзывов
            строки нет вовсе. */}
        {ratingAvg != null && ratingCount > 0 ? (
          <View className="mt-1 flex-row items-center gap-1">
            <Star size={12} weight="fill" color={warningColor} />
            <AppText weight="semibold" className="text-caption text-ink">
              {ratingAvg.toFixed(1)}
            </AppText>
            <AppText className="text-caption text-muted">({ratingCount})</AppText>
          </View>
        ) : null}
        {(closedDeals > 0 || cityName) && (
          <AppText className="mt-0.5 text-caption text-muted" numberOfLines={1}>
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
      className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas p-3 active:opacity-70 hover:bg-surface-2"
    >
      {/* Фото 92×92 cover вместо круглой аватарки */}
      <View className="h-[92px] w-[92px] overflow-hidden rounded-md bg-surface-2">
        {photo && !imageFailed ? (
          <Image
            source={{ uri: photo }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
            onError={() => setImageFailed(true)}
            priority="high"
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
        {/* Rating + closed deals. Rating-блок скрыт при ratingCount === 0
            (фидбэк user 2026-05-20: «если отзывов нет — ничего не показывать»).
            closedDeals остаётся как trust-маркер «работал реально». */}
        {(ratingAvg != null && ratingCount > 0) || closedDeals > 0 ? (
          <View className="mt-1 flex-row items-center gap-2">
            {ratingAvg != null && ratingCount > 0 ? (
              <View className="flex-row items-center gap-1">
                <Star size={12} weight="fill" color={warningColor} />
                <AppText weight="semibold" className="text-caption text-ink">
                  {ratingAvg.toFixed(1)}
                </AppText>
                <AppText className="text-caption text-muted">({ratingCount})</AppText>
              </View>
            ) : null}
            {closedDeals > 0 ? (
              <AppText className="text-caption text-muted">{closedDeals} работ</AppText>
            ) : null}
          </View>
        ) : null}
        {(experienceYears != null && experienceYears > 0) || cityName ? (
          <AppText className="mt-1 text-caption text-muted" numberOfLines={1}>
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
