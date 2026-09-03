// /find/filters — full-screen экран фильтров для глобального поиска заданий.
//
// Эталон UX (фидбек user 2026-05-15 + референс-скриншоты):
//   - Полный экран (не expandable inline) — больше места, удобнее на mobile.
//   - Header через <ScreenHeader> (back + title display-md + опц. action).
//   - Категория НЕ перечислена сразу — кнопка-trigger «Выберите категории»
//     с chevron, при тапе → full-screen picker (переиспользует /orders/category-select).
//   - Сортировка через крупные pill chips.
//   - Sticky footer с большой primary-кнопкой «Применить» + ссылкой «Сбросить».
//
// State через Zustand (orders-search-filters-store) — переживает переход
// на category-select и обратно.

import { useFocusEffect, useRouter } from "expo-router";
import { CaretDown, Check, MapPin, Tag } from "phosphor-react-native";
import { useCallback, useMemo } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Button, ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useCities } from "@/features/cities/use-cities";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import {
  countActiveFilters,
  useOrdersSearchFiltersStore,
} from "@/features/orders/orders-search-filters-store";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function OrdersSearchFiltersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/find" as const);
  const muteColor = useThemeColor("mute");
  const inkColor = useThemeColor("ink");
  // Галочка лежит на акцентной заливке → токен on-accent (белый в обеих
  // темах). on-primary в тёмной теме чёрный и терялся на розовом кружке.
  const onAccentColor = useThemeColor("on-accent");

  // Скрываем TabBar — full-screen фильтры.
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  const filters = useOrdersSearchFiltersStore();
  const { l2Ids, cityId, district, clearAll, toggleL2 } = filters;

  const { data: l2List } = useVisibleCategories();
  const { data: cities } = useCities();
  // «Вся Ингушетия» = локация-фильтр снят (ни город, ни район не выбраны).
  const isAllLoc = !cityId && !district;

  // Категории мастера из его профиля — для блока «Из вашего профиля»
  // (быстрый toggle без захода в полный picker). Скрыт если у мастера
  // 0 категорий в профиле (например, ещё не прошёл онбординг).
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: myCategories } = useMyMasterCategories(userId);

  const profileCategoryRows = useMemo(() => {
    if (!myCategories || !l2List) return [];
    return myCategories
      .map((mc) => {
        const cat = l2List.find((c) => c.id === mc.l2_id);
        if (!cat) return null;
        return { id: cat.id, name_ru: cat.name_ru };
      })
      .filter((x): x is { id: string; name_ru: string } => !!x);
  }, [myCategories, l2List]);

  // Показываем имена выбранных L2 в trigger (первые 2 + «и ещё N»).
  const selectedL2Names = useMemo(() => {
    if (!l2List || l2Ids.length === 0) return null;
    const names = l2Ids
      .map((id) => l2List.find((c) => c.id === id)?.name_ru)
      .filter((x): x is string => !!x);
    if (names.length === 0) return null;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2}`;
  }, [l2List, l2Ids]);

  // Имя выбранной локации для trigger (город или район). Пусто → «Вся Ингушетия».
  const selectedCityName = cityId ? (cities?.find((c) => c.id === cityId)?.name ?? null) : null;
  const locationValue = selectedCityName ?? (district || null);

  const activeCount = countActiveFilters(filters);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Фильтры" onBack={goBack} />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* КАТЕГОРИЯ — кнопка-trigger в picker */}
        <View className="px-5 pt-4">
          <AppText weight="semibold" className="text-body-md text-ink">
            Категория
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выбрать категории"
            onPress={() => router.push("/find/category-select" as never)}
            className="mt-3 flex-row items-center gap-3 rounded-md border border-hairline bg-canvas px-4 min-h-14 active:opacity-70"
          >
            <View className="flex-1">
              {selectedL2Names ? (
                <>
                  <AppText className="text-caption text-muted">Выбрано {l2Ids.length}</AppText>
                  <AppText
                    weight="medium"
                    className="text-body-md text-ink mt-0.5"
                    numberOfLines={1}
                  >
                    {selectedL2Names}
                  </AppText>
                </>
              ) : (
                <AppText className="text-body-md text-mute">Выберите категории</AppText>
              )}
            </View>
            <CaretDown size={20} weight="bold" color={muteColor} />
          </Pressable>

          {/* Quick-select chips из категорий мастера (master_categories).
              Тап = toggle прямо в store. Если у мастера 0 категорий в
              профиле — блок скрыт. */}
          {profileCategoryRows.length > 0 ? (
            <View className="mt-4">
              <AppText className="text-caption text-mute">Из вашего профиля</AppText>
              <View className="mt-2 flex-row flex-wrap gap-2">
                {profileCategoryRows.map((cat) => {
                  const selected = l2Ids.includes(cat.id);
                  return (
                    <ProfileCategoryChip
                      key={cat.id}
                      l2Id={cat.id}
                      name={cat.name_ru}
                      selected={selected}
                      onPress={() => toggleL2(cat.id)}
                      selectedIconColor={onAccentColor}
                      fallbackIconColor={muteColor}
                    />
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>

        {/* ЛОКАЦИЯ — кнопка-trigger в полную страницу выбора (как «Категория»).
            Раньше города/районы были инлайн; вынесено на /find/location-select
            по фидбэку владельца 2026-05-24 («сделай локацию кнопкой как
            категорию»). Пусто = «Вся Ингушетия» (фильтр локации снят). */}
        <View className="mt-8 px-5">
          <AppText weight="semibold" className="text-body-md text-ink">
            Локация
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Выбрать локацию"
            onPress={() => router.push("/find/location-select" as never)}
            className="mt-3 flex-row items-center gap-3 rounded-md border border-hairline bg-canvas px-4 min-h-14 active:opacity-70"
          >
            <MapPin size={20} weight="bold" color={isAllLoc ? muteColor : inkColor} />
            <View className="flex-1">
              {isAllLoc ? (
                <AppText className="text-body-md text-ink">Вся Ингушетия</AppText>
              ) : (
                <>
                  <AppText className="text-caption text-muted">Локация</AppText>
                  <AppText
                    weight="medium"
                    className="text-body-md text-ink mt-0.5"
                    numberOfLines={1}
                  >
                    {locationValue}
                  </AppText>
                </>
              )}
            </View>
            <CaretDown size={20} weight="bold" color={muteColor} />
          </Pressable>
        </View>

        {/* Блок «Разделы» (L1) удалён 2026-05-15 (фидбэк user: «убери разделы,
            у нас есть категории, этого достаточно — категории, подкатегории
            и так далее»). L1 это организационная группа категорий
            (Строительство и ремонт / Дом и быт), а не самостоятельный фильтр.
            User фильтрует по конкретным L2 (Сантехника, Электрика и т.д.). */}

        {/* RESET-ссылка */}
        {activeCount > 0 ? (
          <View className="mt-8 px-5">
            <Pressable
              accessibilityRole="button"
              onPress={clearAll}
              className="self-start active:opacity-70"
              hitSlop={8}
            >
              <AppText weight="medium" className="text-body-md text-link">
                Сбросить все фильтры
              </AppText>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky footer с primary-кнопкой */}
      <View
        className="border-hairline-soft border-t bg-canvas px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button variant="primary" size="lg" fullWidth onPress={goBack}>
          {activeCount > 0 ? `Применить · ${activeCount}` : "Применить"}
        </Button>
      </View>
    </View>
  );
}

interface ProfileCategoryChipProps {
  l2Id: string;
  name: string;
  selected: boolean;
  onPress: () => void;
  selectedIconColor: string;
  fallbackIconColor: string;
}

/**
 * Chip быстрого выбора категории из профиля мастера.
 * - selected → accent-soft фон + Check-иконка слева
 * - !selected → canvas + hairline border + цветная Iconify-иконка категории
 *
 * Иконка категории намеренно цветная (twemoji/fluent-color через
 * getCategoryColorIconUrl) — это user-friendly «узнаваемые шорткаты»,
 * не нейтральный фильтр. См. docs/ICONS.md.
 */
function ProfileCategoryChip({
  l2Id,
  name,
  selected,
  onPress,
  selectedIconColor,
  fallbackIconColor,
}: ProfileCategoryChipProps) {
  const colorIconUrl = getCategoryColorIconUrl(l2Id);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={name}
      onPress={onPress}
      className={`h-11 flex-row items-center gap-2 rounded-pill border pl-2 pr-3 active:opacity-70 ${
        selected ? "border-accent bg-accent-soft" : "border-hairline bg-canvas hover:bg-surface-2"
      }`}
    >
      {selected ? (
        <View className="h-6 w-6 items-center justify-center rounded-full bg-accent">
          <Check size={14} weight="bold" color={selectedIconColor} />
        </View>
      ) : colorIconUrl ? (
        <Image source={{ uri: colorIconUrl }} style={{ width: 20, height: 20 }} />
      ) : (
        <Tag size={20} weight="bold" color={fallbackIconColor} />
      )}
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
        numberOfLines={1}
      >
        {name}
      </AppText>
    </Pressable>
  );
}
