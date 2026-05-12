/**
 * Публичная страница клиента `/client/[id]`.
 *
 * Sprint 9.2 — минималистичная карточка для мастеров и других клиентов:
 *  - hero (avatar + имя + role + city + рейтинг)
 *  - chip с числом завершённых заказов
 *  - отзывы мастеров (direction='master_to_client')
 *
 * Доступна по тапу на имя клиента в OrderInfoBlock (sprint 8.4) и
 * в chat header (если собеседник-клиент).
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, CircleAlert, MapPin, Star } from "lucide-react-native";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { useClientPublicProfile } from "@/features/client-view/use-client-public";
import { useReviewsForTarget } from "@/features/master-view/use-master-public";

export default function ClientPublicScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const clientId = typeof params.id === "string" ? params.id : null;

  const profile = useClientPublicProfile(clientId);
  const reviews = useReviewsForTarget(clientId, "master_to_client");

  const fullName = useMemo(() => {
    if (!profile.data?.user) return "";
    const u = profile.data.user;
    return [u.first_name, u.last_name].filter(Boolean).join(" ") || "Клиент";
  }, [profile.data]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {profile.isLoading && (
          <View className="mt-20 items-center">
            <ActivityIndicator />
          </View>
        )}

        {profile.error && (
          <View className="mt-20 items-center px-6">
            <CircleAlert size={32} strokeWidth={1.5} color="#ef4444" />
            <AppText className="mt-3 text-body-sm text-error">
              Не удалось загрузить профиль. {profile.error.message}
            </AppText>
          </View>
        )}

        {!profile.isLoading && !profile.error && !profile.data && (
          <View className="mt-20 items-center px-6">
            <AppText className="text-body-md text-muted">Профиль не найден.</AppText>
          </View>
        )}

        {profile.data?.user && (
          <>
            {/* Hero */}
            <View className="items-center px-6">
              <Avatar
                url={profile.data.user.avatar_url}
                name={fullName}
                seed={profile.data.user.id}
                size="xl"
              />
              <AppText weight="bold" className="mt-4 text-display-sm text-ink">
                {fullName}
              </AppText>

              <View className="mt-2 flex-row items-center gap-2">
                <View className="rounded-pill bg-surface-2 px-3 py-1">
                  <AppText weight="medium" className="text-caption text-body">
                    Клиент
                  </AppText>
                </View>
                {profile.data.completedOrdersCount > 0 && (
                  <View className="flex-row items-center gap-1 rounded-pill bg-success-soft px-2.5 py-1">
                    <CheckCircle2 size={12} strokeWidth={2} color="#10b981" />
                    <AppText weight="medium" className="text-caption-xs text-success">
                      {pluralizeCompleted(profile.data.completedOrdersCount)}
                    </AppText>
                  </View>
                )}
              </View>

              <View className="mt-3 flex-row items-center gap-1">
                {profile.data.user.rating_as_client_avg != null &&
                profile.data.user.rating_as_client_count > 0 ? (
                  <>
                    <Star size={16} strokeWidth={2} color="#f59e0b" fill="#f59e0b" />
                    <AppText weight="semibold" className="text-body-md text-ink">
                      {profile.data.user.rating_as_client_avg.toFixed(1)}
                    </AppText>
                    <AppText className="text-body-sm text-muted">
                      ({pluralizeReviews(profile.data.user.rating_as_client_count)})
                    </AppText>
                  </>
                ) : (
                  <AppText className="text-body-sm text-muted">
                    Пока нет отзывов от мастеров
                  </AppText>
                )}
              </View>

              {profile.data.city && (
                <View className="mt-2 flex-row items-center gap-1">
                  <MapPin size={14} strokeWidth={1.75} color="#71717a" />
                  <AppText className="text-body-sm text-muted">
                    {profile.data.city.name}
                    {profile.data.user.district ? `, ${profile.data.user.district}` : ""}
                  </AppText>
                </View>
              )}

              <AppText className="mt-2 text-caption-xs text-muted-soft">
                На xtrud с {formatJoinDate(profile.data.user.created_at)}
              </AppText>
            </View>

            {/* Reviews */}
            <View className="mt-8 px-6">
              <AppText weight="semibold" className="text-title-lg text-ink">
                Отзывы мастеров{" "}
                {reviews.data && reviews.data.length > 0 ? `(${reviews.data.length})` : ""}
              </AppText>

              {reviews.isLoading && (
                <View className="mt-4 items-start">
                  <ActivityIndicator />
                </View>
              )}

              {!reviews.isLoading && (reviews.data?.length ?? 0) === 0 && (
                <View className="mt-4 rounded-md bg-surface-2 px-4 py-6">
                  <AppText className="text-center text-body-sm text-muted">
                    Пока никто не оставил отзыв.
                  </AppText>
                </View>
              )}

              {(reviews.data?.length ?? 0) > 0 && (
                <View className="mt-4 gap-4">
                  {reviews.data?.map((r) => {
                    const authorName =
                      [r.author?.first_name, r.author?.last_name].filter(Boolean).join(" ") ||
                      "Мастер";
                    return (
                      <View key={r.id} className="border-hairline-soft border-b pb-4">
                        <View className="flex-row items-start gap-3">
                          <Avatar
                            url={r.author?.avatar_url ?? null}
                            name={authorName}
                            seed={r.author?.id ?? r.author_id}
                            size="sm"
                          />
                          <View className="flex-1">
                            <View className="flex-row items-center justify-between">
                              <AppText weight="semibold" className="text-body-md text-ink">
                                {authorName}
                              </AppText>
                              <AppText className="text-caption-xs text-muted">
                                {formatDate(r.created_at)}
                              </AppText>
                            </View>
                            <View className="mt-1 flex-row items-center gap-1.5">
                              <View className="flex-row">
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <Star
                                    key={n}
                                    size={12}
                                    strokeWidth={2}
                                    color={n <= r.rating ? "#f59e0b" : "#e5e7eb"}
                                    fill={n <= r.rating ? "#f59e0b" : "transparent"}
                                  />
                                ))}
                              </View>
                              {r.l2?.name_ru && (
                                <AppText className="text-caption-xs text-muted">
                                  · {r.l2.name_ru}
                                </AppText>
                              )}
                            </View>
                            {r.text && (
                              <AppText className="mt-2 text-body-sm text-body">{r.text}</AppText>
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function formatJoinDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function pluralizeReviews(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} отзыв`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} отзыва`;
  return `${count} отзывов`;
}

function pluralizeCompleted(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} заказ закрыт`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} заказа закрыто`;
  return `${count} заказов закрыто`;
}
