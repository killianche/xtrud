/**
 * /admin/ratings — рейтинг мастеров по категориям (для админа/владельца).
 *
 * Показывает по каждой L2-категории список мастеров с их внутренним баллом
 * (ranking_score, MASTER_RANKING_PLAN.md), публичным рейтингом (★ + отзывы) и
 * статусом доступности. Внутри категории — по баллу убыванию (как в выдаче).
 *
 * Доступ только админу (users.is_admin). Данные — useAdminMastersRatings.
 */

import { CaretLeft, Star, Warning } from "phosphor-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import type { AdminMasterRating } from "@/features/admin/use-admin-ratings";
import { useAdminMastersRatings } from "@/features/admin/use-admin-ratings";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { AVAILABILITY_SHORT, effectiveStatus } from "@/features/master-view/availability";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

function MasterRatingRow({ m, rank }: { m: AdminMasterRating; rank: number }) {
  const tc = useThemeColors(["warning", "mute"]);
  const eff = effectiveStatus(m.availabilityStatus, m.availabilityUntil);
  const available = eff === "today" || eff === "this_week";

  return (
    <View className="flex-row items-center gap-3 border-b border-hairline py-3">
      {/* Балл — крупно, mono. */}
      <View className="w-12 items-center">
        <AppText weight="mono" className="text-title-md text-ink">
          {m.rankingScore}
        </AppText>
        <AppText className="text-caption text-muted-soft">балл</AppText>
      </View>

      {/* Имя + мета. */}
      <View className="flex-1 min-w-0">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {rank}. {m.name}
        </AppText>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          {m.ratingCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <Star size={12} weight="fill" color={tc.warning} />
              <AppText weight="mono" className="text-mono-caption text-body">
                {m.ratingAvg?.toFixed(1)}
              </AppText>
              <AppText className="text-caption text-mute">({m.ratingCount})</AppText>
            </View>
          ) : (
            <AppText className="text-caption text-mute">нет отзывов</AppText>
          )}
          {available ? (
            <>
              <AppText className="text-caption text-muted-soft">·</AppText>
              <AppText weight="medium" className="text-caption text-accent">
                {AVAILABILITY_SHORT[eff]}
              </AppText>
            </>
          ) : null}
          {m.hiddenFromSearch ? (
            <>
              <AppText className="text-caption text-muted-soft">·</AppText>
              <AppText className="text-caption text-mute">скрыт</AppText>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function AdminRatingsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const isAdmin = (user as { is_admin?: boolean } | null)?.is_admin === true;
  const tc = useThemeColors(["ink"]);
  const goBack = useSafeBack("/(tabs)/admin" as const);

  const { data, isLoading, error } = useAdminMastersRatings();

  if (user && !isAdmin) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top }}
      >
        <EmptyState
          icon={Warning}
          title="Доступ запрещён"
          hint="Эта страница только для админов."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={24} weight="bold" color={tc.ink} />
        </Pressable>
        <AppText weight="bold" className="flex-1 text-title-lg text-ink">
          Рейтинг мастеров
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && (
          <View className="px-6 pt-2">
            <OrderRowsSkeleton count={6} />
          </View>
        )}

        {error && (
          <View className="mt-8 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось загрузить. {error.message}
            </AppText>
          </View>
        )}

        {data && data.length === 0 && !isLoading && (
          <View className="mt-16">
            <EmptyState icon={Star} title="Пока пусто" hint="Нет мастеров с категориями." />
          </View>
        )}

        {data?.map((cat) => (
          <View key={cat.l2Id} className="mt-5 px-6">
            <View className="flex-row items-center justify-between">
              <AppText weight="bold" className="text-title-md text-ink">
                {cat.categoryName}
              </AppText>
              <AppText weight="mono" className="text-mono-caption text-mute">
                {cat.masters.length}
              </AppText>
            </View>
            <View className="mt-1">
              {cat.masters.map((m, idx) => (
                <MasterRatingRow key={m.masterId} m={m} rank={idx + 1} />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
