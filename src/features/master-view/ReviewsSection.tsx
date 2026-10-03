/**
 * Отзывы о специалисте — секция профиля (master/[id]).
 *
 * Редизайн 2026-10-03 (docs/MASTER_PROFILE_REDESIGN_2026-10.md): заголовок —
 * тем же стилем, что остальные секции профиля (подпись над группой, как в
 * Настройках iOS); сверху сводка — оценка крупно, звёзды и число отзывов,
 * как блок «Оценки и отзывы» в App Store; отзывы — строки одной карточки.
 * Раньше у секции был свой заголовок «Отзывы (2)» и свой отступ px-6 поверх
 * отступа страницы — она стояла дальше от края, чем всё остальное.
 *
 * Принимает результат `useReviewsForTarget` (useInfiniteQuery): загрузка,
 * пусто, список по всем страницам и «Показать ещё».
 */

import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { Flag, Star } from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import type { ReviewWithAuthor } from "@/features/master-view/use-master-public";
import { pluralizeReviews } from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

type Page = { rows: ReviewWithAuthor[]; nextCursor: string | null };

interface ReviewsSectionProps {
  title: string;
  emptyText: string;
  query: UseInfiniteQueryResult<{ pages: Page[]; pageParams: unknown[] }, Error>;
  /** Средняя оценка и число отзывов из профиля — для сводки сверху. */
  ratingAvg?: number | null;
  ratingCount?: number;
  /** Если задан — у каждого отзыва появляется ссылка «Обжаловать» (мастер на
   *  своей странице может пожаловаться на накрученный/оскорбительный отзыв). */
  onReport?: (review: ReviewWithAuthor) => void;
}

/** «4,8» — оценка по-русски, с запятой. */
export function formatRating(value: number | null | undefined): string {
  return Number(value ?? 0)
    .toFixed(1)
    .replace(".", ",");
}

function Stars({ value, size }: { value: number; size: number }) {
  const tc = useThemeColors(["warning", "muted-soft"]);
  return (
    <View className="flex-row">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          weight={n <= Math.round(value) ? "fill" : "bold"}
          color={n <= Math.round(value) ? tc.warning : tc["muted-soft"]}
        />
      ))}
    </View>
  );
}

export function ReviewsSection({
  title,
  emptyText,
  query,
  ratingAvg,
  ratingCount = 0,
  onReport,
}: ReviewsSectionProps) {
  const tc = useThemeColors(["accent"]);
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const hasMore = query.hasNextPage;
  const hasSummary = ratingCount > 0;

  return (
    <View className="mb-7 px-4">
      <AppText
        accessibilityRole="header"
        className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute"
      >
        {title}
      </AppText>
      <View className="overflow-hidden rounded-2xl bg-surface-card">
        {hasSummary ? (
          <View
            accessible
            accessibilityLabel={`Оценка ${formatRating(ratingAvg)} из 5, ${pluralizeReviews(ratingCount)}`}
            className="flex-row items-center gap-4 border-b border-b-hairline px-4 py-4"
          >
            <AppText weight="bold" className="text-ios-large-title text-ink">
              {formatRating(ratingAvg)}
            </AppText>
            <View className="gap-1">
              <Stars value={Number(ratingAvg ?? 0)} size={16} />
              <AppText className="text-ios-footnote text-mute">
                {pluralizeReviews(ratingCount)}
              </AppText>
            </View>
          </View>
        ) : null}

        {query.isLoading ? (
          <View className="items-center px-4 py-6">
            <ActivityIndicator />
          </View>
        ) : rows.length === 0 ? (
          <AppText className="px-4 py-4 text-ios-body text-mute">{emptyText}</AppText>
        ) : (
          rows.map((r, i) => (
            <ReviewRow
              key={r.id}
              review={r}
              onReport={onReport}
              last={i === rows.length - 1 && !hasMore}
            />
          ))
        )}

        {hasMore ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Показать ещё отзывы"
            disabled={query.isFetchingNextPage}
            onPress={() => query.fetchNextPage()}
            className="min-h-12 items-center justify-center active:bg-canvas-soft-2"
          >
            {query.isFetchingNextPage ? (
              <ActivityIndicator size="small" />
            ) : (
              <AppText weight="semibold" className="text-ios-body" style={{ color: tc.accent }}>
                Показать ещё
              </AppText>
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ReviewRow({
  review,
  onReport,
  last,
}: {
  review: ReviewWithAuthor;
  onReport?: (review: ReviewWithAuthor) => void;
  last: boolean;
}) {
  const tc = useThemeColors(["mute"]);
  const authorName =
    [review.author?.first_name, review.author?.last_name].filter(Boolean).join(" ") || "Клиент";

  return (
    <View className={`px-4 py-3.5 ${last ? "" : "border-b border-b-hairline"}`}>
      <View className="flex-row items-start gap-3">
        <Avatar
          url={review.author?.avatar_url ?? null}
          name={authorName}
          seed={review.author?.id ?? review.author_id}
          size="sm"
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <AppText
              weight="semibold"
              className="min-w-0 shrink text-ios-body text-ink"
              numberOfLines={1}
            >
              {authorName}
            </AppText>
            <AppText className="text-ios-footnote text-mute">
              {formatDate(review.created_at)}
            </AppText>
          </View>
          <View className="mt-1 flex-row items-center gap-1.5">
            <Stars value={review.rating} size={12} />
            {review.l2?.name_ru ? (
              <AppText className="text-ios-footnote text-mute" numberOfLines={1}>
                · {review.l2.name_ru}
              </AppText>
            ) : null}
          </View>
          {review.text ? (
            <AppText className="mt-2 text-ios-body text-ink">{review.text}</AppText>
          ) : null}

          {/* «Обжаловать» — только когда родитель передал onReport (мастер на
              своей странице). Тихая ghost-ссылка, не отвлекает от текста отзыва. */}
          {onReport ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Обжаловать отзыв"
              onPress={() => onReport(review)}
              hitSlop={8}
              className="mt-2 flex-row items-center gap-1 self-start py-1 active:opacity-60"
            >
              <Flag size={13} weight="bold" color={tc.mute} />
              <AppText weight="medium" className="text-ios-footnote text-mute">
                Обжаловать
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** «14 сент.» в этом году, «14 сент. 2025» — в прошлые. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}
