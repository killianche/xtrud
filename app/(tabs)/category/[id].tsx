import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Shield, Star } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import {
  type CategoryL3,
  formatAvgCheck,
  urgencyLabel,
  useCategoryDetail,
} from "@/features/categories/use-category-detail";
import { type MasterInCategory, useMastersByL2 } from "@/features/master-view/use-masters-by-l2";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { pluralizeServices, pluralizeYears } from "@/lib/pluralize";

function ServiceRow({ service }: { service: CategoryL3 }) {
  const urgencyText = urgencyLabel(service.urgency_typical);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Услуга ${service.name_ru}`}
      // Sprint 4: создание заказа по тапу. Пока no-op.
      className="flex-row items-start justify-between gap-4 border-hairline-soft border-b px-6 py-4 active:opacity-70"
    >
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <AppText weight="medium" className="text-body-md text-ink" numberOfLines={2}>
            {service.name_ru}
          </AppText>
          {service.requires_license && <Shield size={14} strokeWidth={1.75} color="#f59e0b" />}
        </View>
        <AppText className="mt-1 text-caption text-muted">{urgencyText}</AppText>
      </View>
      <AppText weight="medium" className="text-body-sm text-body">
        {formatAvgCheck(service.avg_check_rub)}
      </AppText>
    </Pressable>
  );
}

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useCategoryDetail(id);
  const masters = useMastersByL2(id);
  const refresh = usePullToRefresh();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar with back */}
      <View className="flex-row items-center px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
      </View>

      {isLoading && (
        <View className="mt-8 items-center px-6">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить категорию. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {data === null && !isLoading && !error && (
        <View className="mt-8 px-6">
          <AppText className="text-body-md text-muted">Категория не найдена.</AppText>
        </View>
      )}

      {data && (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          refreshControl={refresh.control}
        >
          {/* Title block */}
          <View className="px-6 pt-2 pb-6">
            <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
              {data.category.name_ru}
            </AppText>
            <AppText className="mt-2 text-body-md text-muted">
              {data.services.length === 0
                ? "В этой категории пока нет услуг."
                : pluralizeServices(data.services.length)}
            </AppText>
          </View>

          {/* Services list */}
          {data.services.length > 0 && (
            <View className="border-hairline-soft border-t">
              {data.services.map((service) => (
                <ServiceRow key={service.id} service={service} />
              ))}
            </View>
          )}

          {data.services.length === 0 && (
            <View className="px-6">
              <AppText className="text-body-md text-muted">
                Скоро добавим услуги в эту категорию.
              </AppText>
            </View>
          )}

          {/* Masters section */}
          <View className="mt-10 px-6">
            <AppText weight="semibold" className="text-title-lg text-ink">
              Мастера
            </AppText>
            <AppText className="mt-1 text-body-sm text-muted">
              {masters.isLoading
                ? "Загружаем…"
                : (masters.data?.length ?? 0) === 0
                  ? "Пока никто не работает в этой категории."
                  : "Тапните карточку, чтобы открыть профиль."}
            </AppText>

            {masters.isLoading && (
              <View className="mt-4 items-start">
                <ActivityIndicator />
              </View>
            )}

            {!masters.isLoading && (masters.data?.length ?? 0) > 0 && (
              <View className="mt-4 gap-3">
                {masters.data?.map((m) => (
                  <MasterCardRow
                    key={m.master_id}
                    master={m}
                    onPress={() => router.push(`/master/${m.master_id}` as never)}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function MasterCardRow({ master, onPress }: { master: MasterInCategory; onPress: () => void }) {
  const fullName =
    [master.user.first_name, master.user.last_name].filter(Boolean).join(" ") || "Мастер";
  const rating = master.profile?.rating_overall_avg;
  const ratingCount = master.profile?.rating_overall_count ?? 0;
  const years = master.profile?.experience_years ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Профиль мастера ${fullName}`}
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas p-3 active:opacity-70"
    >
      <Avatar url={master.user.avatar_url} name={fullName} seed={master.user.id} size="md" />
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {fullName}
        </AppText>
        <View className="mt-1 flex-row items-center gap-2">
          {rating != null && ratingCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <Star size={12} strokeWidth={2} color="#f59e0b" fill="#f59e0b" />
              <AppText weight="semibold" className="text-caption text-ink">
                {rating.toFixed(1)}
              </AppText>
              <AppText className="text-caption-xs text-muted">({ratingCount})</AppText>
            </View>
          ) : (
            <AppText className="text-caption-xs text-muted">Без отзывов</AppText>
          )}
          {years > 0 && (
            <>
              <AppText className="text-caption-xs text-muted">·</AppText>
              <AppText className="text-caption-xs text-muted">
                {pluralizeYears(years)} опыта
              </AppText>
            </>
          )}
          {master.city?.name && (
            <>
              <AppText className="text-caption-xs text-muted">·</AppText>
              <AppText className="flex-shrink text-caption-xs text-muted" numberOfLines={1}>
                {master.city.name}
              </AppText>
            </>
          )}
        </View>
        {master.profile?.bio && (
          <AppText className="mt-1 text-caption text-muted" numberOfLines={2}>
            {master.profile.bio}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}
