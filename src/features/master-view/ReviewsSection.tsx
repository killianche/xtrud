/**
 * Reviews section — общий блок для master/[id] и client/[id].
 *
 * Принимает результат `useReviewsForTarget` (useInfiniteQuery) и рендерит:
 *  - заголовок с count первой страницы
 *  - loading / empty / список ReviewRow по всем страницам
 *  - кнопку «Показать ещё» если есть nextPage.
 */

import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { Star } from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import type { ReviewWithAuthor } from "@/features/master-view/use-master-public";

type Page = { rows: ReviewWithAuthor[]; nextCursor: string | null };

interface ReviewsSectionProps {
  title: string;
  emptyText: string;
  query: UseInfiniteQueryResult<{ pages: Page[]; pageParams: unknown[] }, Error>;
}

export function ReviewsSection({ title, emptyText, query }: ReviewsSectionProps) {
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];
  const total = rows.length;
  const hasMore = query.hasNextPage;

  return (
    <View className="mt-8 px-6">
      <AppText weight="semibold" className="text-title-lg text-ink">
        {title}
        {total > 0 ? ` (${total}${hasMore ? "+" : ""})` : ""}
      </AppText>

      {query.isLoading && (
        <View className="mt-4 items-start">
          <ActivityIndicator />
        </View>
      )}

      {!query.isLoading && total === 0 && (
        <View className="mt-4 rounded-md bg-surface-2 px-4 py-6">
          <AppText className="text-center text-body-sm text-muted">{emptyText}</AppText>
        </View>
      )}

      {total > 0 && (
        <View className="mt-4 gap-4">
          {rows.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
        </View>
      )}

      {hasMore && (
        <Pressable
          accessibilityRole="button"
          disabled={query.isFetchingNextPage}
          onPress={() => query.fetchNextPage()}
          className="mt-4 h-11 flex-row items-center justify-center rounded-md border border-hairline active:opacity-70"
        >
          {query.isFetchingNextPage ? (
            <ActivityIndicator size="small" />
          ) : (
            <AppText weight="medium" className="text-button text-body">
              Показать ещё
            </AppText>
          )}
        </Pressable>
      )}
    </View>
  );
}

function ReviewRow({ review }: { review: ReviewWithAuthor }) {
  const authorName =
    [review.author?.first_name, review.author?.last_name].filter(Boolean).join(" ") || "Клиент";

  return (
    <View className="border-hairline-soft border-b pb-4">
      <View className="flex-row items-start gap-3">
        <Avatar
          url={review.author?.avatar_url ?? null}
          name={authorName}
          seed={review.author?.id ?? review.author_id}
          size="sm"
        />
        <View className="flex-1">
          <View className="flex-row items-center justify-between">
            <AppText weight="semibold" className="text-body-md text-ink">
              {authorName}
            </AppText>
            <AppText className="text-caption-xs text-muted">
              {formatDate(review.created_at)}
            </AppText>
          </View>
          <View className="mt-1 flex-row items-center gap-1.5">
            <View className="flex-row">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  size={12}
                  weight={n <= review.rating ? "fill" : "bold"}
                  color={n <= review.rating ? "#f59e0b" : "#e5e7eb"}
                />
              ))}
            </View>
            {review.l2?.name_ru && (
              <AppText className="text-caption-xs text-muted">· {review.l2.name_ru}</AppText>
            )}
          </View>
          {review.text && <AppText className="mt-2 text-body-sm text-body">{review.text}</AppText>}
        </View>
      </View>
    </View>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}
