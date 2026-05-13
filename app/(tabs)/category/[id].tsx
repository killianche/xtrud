/**
 * Category detail — список мастеров в L2 категории.
 *
 * Vercel + TaskRabbit Select-a-Tasker:
 *   - Top bar: back + city chip
 *   - H1 категории + краткое описание + counter мастеров
 *   - Список мастеров card-row: фото + имя + рейтинг + город + опыт
 *   - Список услуг с avg ценой (compact rows, expandable accordion)
 *
 * Тап карточки мастера → /master/[id]
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Search, Shield, Star } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, Card, Chip } from "@/components/ui";
import {
  type CategoryL3,
  formatAvgCheck,
  urgencyLabel,
  useCategoryDetail,
} from "@/features/categories/use-category-detail";
import { type MasterInCategory, useMastersByL2 } from "@/features/master-view/use-masters-by-l2";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { pluralizeYears } from "@/lib/pluralize";

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = typeof id === "string" ? id : undefined;
  const { data, error } = useCategoryDetail(categoryId);
  const masters = useMastersByL2(categoryId ?? null);
  const refresh = usePullToRefresh();

  const categoryName = data?.category.name_ru ?? "Категория";
  const services = data?.services ?? [];
  const mastersList = masters.data ?? [];

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar — только back-кнопка. Заголовок дублировался с H1 ниже,
          убран по запросу. */}
      <View className="flex-row items-center px-4 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70 text-ink"
        >
          <ChevronLeft size={22} strokeWidth={2} color="currentColor" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* Header */}
        <View className="px-5 mt-6">
          <AppText weight="display" className="text-display-md tracking-tight text-ink">
            {categoryName}
          </AppText>
          {!masters.isLoading && mastersList.length > 0 ? (
            <View className="mt-3">
              <Chip mono size="sm">
                {mastersList.length} {mastersList.length === 1 ? "мастер" : "мастеров"} в категории
              </Chip>
            </View>
          ) : null}
        </View>

        {/* Список мастеров */}
        <View className="px-5 mt-6">
          <AppText weight="semibold" className="text-ink text-title-md mb-3">
            Мастера
          </AppText>

          {masters.isLoading ? (
            <View className="gap-3">
              {[0, 1, 2].map((i) => (
                <View key={i} className="h-20 rounded-xl bg-canvas-soft-2" />
              ))}
            </View>
          ) : mastersList.length === 0 ? (
            <View className="items-center py-6">
              <View className="h-24 w-24 items-center justify-center rounded-full bg-canvas-soft text-ink">
                <Search size={44} strokeWidth={1.25} color="currentColor" />
              </View>
              <AppText weight="semibold" className="mt-6 text-title-md text-ink text-center">
                Пока нет мастеров в этой категории
              </AppText>
              <AppText className="mt-2 text-body-md text-mute text-center">
                Опишите задачу — мастера откликнутся.
              </AppText>
            </View>
          ) : (
            <View className="gap-3">
              {mastersList.map((m) => (
                <MasterRow
                  key={m.user.id}
                  master={m}
                  onPress={() => router.push(`/master/${m.user.id}` as never)}
                />
              ))}
            </View>
          )}
        </View>

        {/* Услуги в категории с avg-чеком */}
        {services.length > 0 ? (
          <View className="px-5 mt-10">
            <AppText weight="semibold" className="text-ink text-title-md mb-3">
              Типичные услуги
            </AppText>
            <Card variant="soft" padding="none">
              {services.map((s, i) => (
                <ServiceRow
                  key={s.id}
                  service={s}
                  isLast={i === services.length - 1}
                />
              ))}
            </Card>
          </View>
        ) : null}

        {error ? (
          <View className="px-5 mt-6">
            <AppText className="text-error text-body-sm">
              Не удалось загрузить: {error.message}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MasterRow({
  master,
  onPress,
}: {
  master: MasterInCategory;
  onPress: () => void;
}) {
  const u = master.user;
  const profile = master.profile;
  const cityName = master.city?.name ?? null;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Мастер";
  const rating = profile?.rating_overall_avg ?? null;
  const ratingCount = profile?.rating_overall_count ?? 0;
  const experience = profile?.experience_years ?? null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={fullName}>
      <Card variant="default" padding="md">
        <View className="flex-row items-center gap-3">
          <Avatar url={u.avatar_url} name={fullName} seed={u.id} size="lg" />
          <View className="flex-1">
            <AppText weight="semibold" className="text-ink text-body-md" numberOfLines={1}>
              {fullName}
            </AppText>
            <View className="flex-row items-center gap-2 mt-1 flex-wrap">
              {rating !== null && ratingCount > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Star size={12} strokeWidth={2} color="currentColor" className="text-ink" />
                  <AppText weight="mono" className="text-ink text-mono-caption">
                    {rating.toFixed(1)}
                  </AppText>
                  <AppText weight="mono" className="text-mute text-mono-caption">
                    ({ratingCount})
                  </AppText>
                </View>
              ) : null}
              {cityName ? (
                <AppText className="text-mute text-body-sm">{cityName}</AppText>
              ) : null}
              {experience !== null && experience > 0 ? (
                <AppText className="text-mute text-body-sm">· {pluralizeYears(experience)}</AppText>
              ) : null}
            </View>
            {profile?.bio ? (
              <AppText className="text-body text-body-sm mt-1" numberOfLines={1}>
                {profile.bio}
              </AppText>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

function ServiceRow({ service, isLast }: { service: CategoryL3; isLast: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Услуга ${service.name_ru}`}
      className={`flex-row items-start justify-between gap-3 px-4 py-3 active:opacity-70 ${
        isLast ? "" : "border-b border-hairline"
      }`}
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <AppText weight="medium" className="text-body-md text-ink" numberOfLines={2}>
            {service.name_ru}
          </AppText>
          {service.requires_license ? (
            <Shield size={14} strokeWidth={1.75} color="currentColor" className="text-warning" />
          ) : null}
        </View>
        <AppText className="mt-1 text-caption text-mute">
          {urgencyLabel(service.urgency_typical)}
        </AppText>
      </View>
      <AppText weight="mono" className="text-body text-mono-sm">
        {formatAvgCheck(service.avg_check_rub)}
      </AppText>
    </Pressable>
  );
}
