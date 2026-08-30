/**
 * Раздел «Полезное» — список статей (Sprint I.9).
 *
 * Точка входа: ссылка с главной (добавит дизайн-агент или в профиле).
 * Tap по карточке → /useful/[slug].
 */

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { BookOpen, CaretLeft } from "phosphor-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { type Article, useArticles } from "@/features/articles/use-articles";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

function ArticleCard({ item, onPress }: { item: Article; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="overflow-hidden rounded-lg border border-hairline bg-canvas active:opacity-80"
    >
      {item.cover_url && (
        <Image
          source={{ uri: item.cover_url }}
          style={{ width: "100%", aspectRatio: 16 / 9 }}
          contentFit="cover"
          transition={200}
        />
      )}
      <View className="p-4">
        <AppText weight="semibold" className="text-title-md text-ink" numberOfLines={2}>
          {item.title}
        </AppText>
        {item.excerpt && (
          <AppText className="mt-2 text-body-sm text-muted" numberOfLines={3}>
            {item.excerpt}
          </AppText>
        )}
        {item.published_at && (
          <AppText className="mt-2 text-caption text-muted-soft">
            {new Date(item.published_at).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            })}
          </AppText>
        )}
      </View>
    </Pressable>
  );
}

export default function UsefulScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: items = [], isLoading, error, refetch } = useArticles();
  const tcInk = useThemeColor("ink");
  const goBack = useSafeBack("/" as const);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={28} weight="bold" color={tcInk} />
        </Pressable>
        <AppText weight="bold" className="flex-1 text-title-lg text-ink">
          Полезное
        </AppText>
      </View>

      {isLoading && (
        <View className="mt-8 items-center">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 min-h-11 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && items.length === 0 && (
        <View className="flex-1 items-center justify-center">
          <EmptyState icon={BookOpen} title="Скоро" hint="Полезных статей пока нет." />
        </View>
      )}

      {!isLoading && items.length > 0 && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 px-6 pt-2 pb-4">
            {items.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                onPress={() => router.push(`/useful/${item.slug}` as never)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
