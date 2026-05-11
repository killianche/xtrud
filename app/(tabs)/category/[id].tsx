import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Shield } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import {
  type CategoryL3,
  formatAvgCheck,
  urgencyLabel,
  useCategoryDetail,
} from "@/features/categories/use-category-detail";

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
        >
          {/* Title block */}
          <View className="px-6 pt-2 pb-6">
            <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
              {data.category.name_ru}
            </AppText>
            <AppText className="mt-2 text-body-md text-muted">
              {data.services.length === 0
                ? "В этой категории пока нет услуг."
                : `${data.services.length} ${pluralizeServices(data.services.length)}`}
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
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Склонение слова "услуга" по количеству.
 * 1 — услуга, 2-4 — услуги, 5+ — услуг (с учётом особенностей >20).
 */
function pluralizeServices(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return "услуг";
  if (mod10 === 1) return "услуга";
  if (mod10 >= 2 && mod10 <= 4) return "услуги";
  return "услуг";
}
