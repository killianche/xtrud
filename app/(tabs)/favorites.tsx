/**
 * /(tabs)/favorites — список сохранённых (избранных) мастеров клиента.
 *
 * История: ранее жил в `/profile/favorites` как подэкран стека «Профиль».
 * Перенесён в собственный root 2026-05-27 (фидбэк владельца): когда экран
 * был подпунктом профиля, TabBar считал профиль-таб активным на /favorites,
 * а тап по «Профилю» с этого экрана не возвращал на /profile/index. Теперь
 * favorites — независимый таб-роут уровня (tabs), скрыт из автоматической
 * нижней панели через `href: null` в _layout.tsx; кнопка «закладки» в
 * TabBar (центральная для клиента) push'ит сюда напрямую.
 *
 * Заголовок без кнопки «Назад» — это полноценная страница, не модал.
 *
 * Источник: useMyFavorites (join к public.users + master_profiles).
 * Empty state — иллюстрация + CTA в каталог.
 * Тап по карточке → /master/[id].
 * Сердечко на карточке убирает из избранного (optimistic update).
 */

import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { BookmarkSimple, MagnifyingGlass } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar, normalizeAvatarUrl, ScreenHeader, Skeleton } from "@/components/ui";
import {
  type FavoriteMasterRow,
  useMyFavorites,
  useToggleFavorite,
} from "@/features/favorites/use-favorites";
import { useThemeColors } from "@/lib/use-theme-color";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const favorites = useMyFavorites();
  const toggle = useToggleFavorite();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Сохранённые мастера" />

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
        <EmptyState onSearch={() => router.push("/(tabs)/" as never)} />
      ) : (
        <FlashList
          style={{ flex: 1 }}
          data={favorites.data ?? []}
          keyExtractor={(it) => it.masterId}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 32,
          }}
          // FlashList не поддерживает `gap` в contentContainerStyle — ячейки
          // позиционируются абсолютно (см. docs/IOS_FOUNDATION.md §6). Отступ
          // между карточками — через ItemSeparatorComponent, как раньше через gap.
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          renderItem={({ item }) => (
            <FavoriteRow
              item={item}
              onPress={() => router.push(`/master/${item.masterId}` as never)}
              onUnfavorite={() => toggle.mutate({ masterId: item.masterId, nextValue: false })}
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
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <Avatar name={fullName} seed={item.masterId} size="md" />
      )}

      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {fullName}
        </AppText>
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
  const tc = useThemeColors(["muted-soft", "on-primary"]);
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-canvas-soft">
        <BookmarkSimple size={32} weight="bold" color={tc["muted-soft"]} />
      </View>
      <AppText weight="semibold" className="mt-4 text-title-lg text-ink text-center">
        Пока никого
      </AppText>
      <AppText className="mt-2 text-body-md text-body text-center">
        Нажмите на закладку на странице мастера — он появится здесь, и вы найдёте его одним тапом,
        когда понадобится.
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onSearch}
        className="mt-6 min-h-12 flex-row items-center justify-center gap-2 rounded-md bg-primary px-5 active:opacity-80"
      >
        <MagnifyingGlass size={18} weight="bold" color={tc["on-primary"]} />
        <AppText weight="semibold" className="text-button text-on-primary">
          Найти мастеров
        </AppText>
      </Pressable>
    </View>
  );
}
