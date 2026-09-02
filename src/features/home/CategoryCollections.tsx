// Подборки категорий на главной — по образцу владельца 2026-09-02:
// ряд чипов сверху (один активный, в акценте), под ним список строк
// «плитка с иконкой + жирное название».
//
// Честно про данные: обложек-фотографий у категорий нет ни одной
// (бакет category-covers пуст), поэтому в плитке — иконка категории на
// мягком акцентном фоне, а не подставная картинка. У всех 50 категорий
// иконка есть.
//
// Чипы — разделы первого уровня, строки — категории выбранного раздела.
// Тап по строке ведёт в каталог мастеров категории.

import { useRouter } from "expo-router";
import { CaretRight } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/Skeleton";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_ROWS = 6;

export function CategoryCollections() {
  const router = useRouter();
  const tc = useThemeColors(["accent", "mute"]);
  const { data: l1, isLoading: l1Loading } = useCategoriesL1();
  const { data: l2, isLoading: l2Loading } = useVisibleCategories();

  const sections = useMemo(
    () => (l1 ?? []).filter((s) => (l2 ?? []).some((c) => c.l1_id === s.id)),
    [l1, l2],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? sections[0]?.id ?? null;

  const rows = useMemo(() => {
    if (!activeId) return [];
    const list = (l2 ?? []).filter((c) => c.l1_id === activeId);
    // Отмеченные как featured — первыми, остальные по порядку каталога.
    return [...list]
      .sort((a, b) => Number(b.is_featured) - Number(a.is_featured))
      .slice(0, MAX_ROWS);
  }, [l2, activeId]);

  // Загрузка — скелет по форме блока, а не пустота (design-quality §3):
  // иначе секция появляется рывком после ответа сети (QA 2026-09-02).
  // Ошибка сети — блок вторичен, красную плашку на главной не показываем
  // (то же решение, что у «Актуальных заданий»).
  if (l1Loading || l2Loading) return <CategoryCollectionsSkeleton />;
  if (sections.length === 0 || rows.length === 0) return null;

  return (
    <View className="mt-8">
      <AppText weight="bold" className="px-5 text-display-sm text-ink">
        Что нужно сделать
      </AppText>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingTop: 12 }}
      >
        {sections.map((s) => {
          const active = s.id === activeId;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={s.name_ru}
              onPress={() => setSelectedId(s.id)}
              className={`min-h-11 flex-row items-center rounded-pill border px-4 ${
                active ? "border-accent bg-accent" : "border-hairline bg-canvas"
              } active:opacity-80`}
            >
              <AppText
                weight="semibold"
                className={`text-body-md ${active ? "text-on-accent" : "text-ink"}`}
              >
                {s.name_ru}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View className="mt-2">
        {rows.map((c) => {
          const Icon = getCategoryIcon(c.icon);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={c.name_ru}
              accessibilityHint="Откроет мастеров этой категории"
              onPress={() => router.push(`/category/${c.id}` as never)}
              className="flex-row items-center gap-4 px-5 py-3 active:bg-canvas-soft"
            >
              <View className="h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft">
                <Icon size={26} weight="bold" color={tc.accent} />
              </View>
              <AppText weight="bold" className="flex-1 text-title-lg text-ink" numberOfLines={2}>
                {c.name_ru}
              </AppText>
              <CaretRight size={18} weight="bold" color={tc.mute} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Скелет блока: заголовок, ряд чипов, четыре строки «плитка + название». */
function CategoryCollectionsSkeleton() {
  return (
    <View className="mt-8">
      <View className="px-5">
        <Skeleton width="55%" height={20} className="rounded" />
      </View>
      <View className="mt-3 flex-row gap-2 px-5">
        {[96, 120, 88].map((w) => (
          <Skeleton key={w} width={w} height={44} className="rounded-pill" />
        ))}
      </View>
      <View className="mt-2">
        {[0, 1, 2, 3].map((i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
          <View key={i} className="flex-row items-center gap-4 px-5 py-3">
            <Skeleton width={64} height={64} className="rounded-2xl" />
            <Skeleton width="50%" height={18} className="rounded" />
          </View>
        ))}
      </View>
    </View>
  );
}
