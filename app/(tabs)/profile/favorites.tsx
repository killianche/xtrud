/**
 * /(tabs)/profile/favorites — список избранных мастеров.
 *
 * Sprint 0089 + AUDIT_LAUNCH_FUNCTIONAL_2026-05-19 #5.
 *
 * Источник: useMyFavorites (join к public.users + master_profiles).
 * Empty state — иллюстрация + CTA в каталог.
 * Тап по карточке → /master/[id].
 * Сердечко на карточке убирает из избранного (без modal — двойной свайп паттерн
 * не делаем, hit-feedback через optimistic update).
 */

import { useRouter } from "expo-router";
import { BookmarkSimple, MagnifyingGlass } from "phosphor-react-native";
import { FlatList, Image, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, ScreenHeader, Skeleton, normalizeAvatarUrl } from "@/components/ui";
import {
  type FavoriteMasterRow,
  useMyFavorites,
  useToggleFavorite,
} from "@/features/favorites/use-favorites";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const favorites = useMyFavorites();
  const toggle = useToggleFavorite();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Закладки" onBack={goBack} />

      {favorites.isLoading ? (
        <View className="px-5 pt-3 gap-3">
          <Skeleton style={{ height: 80, borderRadius: 12 }} />
          <Skeleton style={{ height: 80, borderRadius: 12 }} />
          <Skeleton style={{ height: 80, borderRadius: 12 }} />
        </View>
      ) : favorites.error ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="medium" className="text-body-md text-error text-center">
            Не удалось загрузить. {favorites.error.message}
          </AppText>
        </View>
      ) : (favorites.data ?? []).length === 0 ? (
        <EmptyState onSearch={() => router.push("/(tabs)/search" as never)} />
      ) : (
        <FlatList
          data={favorites.data ?? []}
          keyExtractor={(it) => it.masterId}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 32,
            gap: 12,
          }}
          renderItem={({ item }) => (
            <FavoriteRow
              item={item}
              onPress={() => router.push(`/(tabs)/master/${item.masterId}` as never)}
              onUnfavorite={() =>
                toggle.mutate({ masterId: item.masterId, nextValue: false })
              }
              disabled={toggle.isPending}
            />
          )}
        />
      )}
    </View>
  );
}

interface FavoriteRowProps {
  item: FavoriteMasterRow;
  onPress: () => void;
  onUnfavorite: () => void;
  disabled: boolean;
}

function FavoriteRow({ item, onPress, onUnfavorite, disabled }: FavoriteRowProps) {
  const tc = useThemeColors(["ink"]);
  const fullName = [item.firstName, item.lastName].filter(Boolean).join(" ") || "Мастер";
  // Только настоящее фото; DiceBear-заглушка → null → ниже сработает <Avatar> с инициалами.
  const avatarUrl = normalizeAvatarUrl(item.avatarUrl);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas-soft p-3 active:opacity-80"
    >
      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: 56, height: 56, borderRadius: 28 }}
          resizeMode="cover"
        />
      ) : (
        <Avatar name={fullName} seed={item.masterId} size="md" />
      )}

      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {fullName}
        </AppText>
        {/* Мета. Фидбэк user 2026-05-20: «если отзывов нет — ничего не
            показывать». Раньше выводилось «Без отзывов» как fallback —
            теперь блок просто отсутствует, как в Airbnb/TaskRabbit.
            ratingAvg !== null && ratingCount > 0 — иначе показываем
            только district (если он есть). */}
        <View className="mt-1 flex-row items-center gap-2">
          {item.ratingAvg !== null && item.ratingCount > 0 ? (
            <View className="flex-row items-center gap-1">
              <AppText weight="mono" className="text-mono-caption text-ink">
                ★ {item.ratingAvg.toFixed(1)}
              </AppText>
              <AppText weight="mono" className="text-mono-caption text-mute">
                · {item.ratingCount}
              </AppText>
            </View>
          ) : null}
          {item.district ? (
            <AppText className="text-body-sm text-mute" numberOfLines={1}>
              {item.ratingAvg !== null && item.ratingCount > 0 ? "· " : ""}
              {item.district}
            </AppText>
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Убрать из закладок"
        onPress={(e) => {
          // Не пробрасываем тап на родительский Pressable.
          e.stopPropagation?.();
          onUnfavorite();
        }}
        disabled={disabled}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft-2"
      >
        <BookmarkSimple size={22} weight="fill" color={tc.ink} />
      </Pressable>
    </Pressable>
  );
}

function EmptyState({ onSearch }: { onSearch: () => void }) {
  const tc = useThemeColors(["muted-soft"]);
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-canvas-soft">
        <BookmarkSimple size={32} weight="bold" color={tc["muted-soft"]} />
      </View>
      <AppText weight="semibold" className="mt-4 text-title-lg text-ink text-center">
        Пока никого
      </AppText>
      <AppText className="mt-2 text-body-md text-body text-center">
        Нажмите на закладку на странице мастера — он появится здесь, и вы найдёте его одним
        тапом, когда понадобится.
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onSearch}
        className="mt-6 h-12 flex-row items-center justify-center gap-2 rounded-md bg-primary px-5 active:opacity-80"
      >
        <MagnifyingGlass size={18} weight="bold" color="#fff" />
        <AppText weight="semibold" className="text-button text-on-primary">
          Найти мастеров
        </AppText>
      </Pressable>
    </View>
  );
}
