/**
 * Экран подразделов раздела — второй уровень каталога (владелец,
 * 2026-10-03: «при нажатии открывается следующая полностью страница»).
 * Используется «Специалистами» (раньше и «Найти задание», до 2026-10-05)
 * (/specialists/category): крупный заголовок — раздел, системная «назад» и
 * свайп от края, список как в «Настройках». Тап по строке — третий уровень
 * (задания или специалисты), его выбирает вызывающий экран.
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { SquaresFour } from "phosphor-react-native";
import { Animated, View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow } from "@/components/ui/InsetList";
import { LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui/LargeTitle";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useThemeColors } from "@/lib/use-theme-color";

export function SubcategoryScreen({
  valueFor,
  labelFor,
  allRow,
  onPick,
}: {
  /** Значение справа у подраздела (число заданий); undefined — пусто. */
  valueFor?: (l2Id: string) => string | undefined;
  labelFor?: (l2Id: string, name: string) => string | undefined;
  /** Первая строка «весь раздел» — только там, где она нужна. */
  allRow?: { title: string; onPress: (l1Id: string) => void };
  onPick: (l2Id: string) => void;
}) {
  const router = useRouter();
  const large = useLargeTitle();
  const tabBarSpace = useTabBarSpace();
  const tc = useThemeColors(["ink", "accent"]);
  const params = useLocalSearchParams<{ l1?: string }>();
  const l1Id = typeof params.l1 === "string" ? params.l1 : "";
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();

  const section = (l1.data ?? []).find((s) => s.id === l1Id) ?? null;
  const rows = (categories.data ?? []).filter((c) => c.l1_id === l1Id);
  const title = section?.name_ru ?? "Раздел";
  const loading = l1.isLoading || categories.isLoading;
  const failed = !loading && (l1.error || categories.error);

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        contentContainerStyle={{ paddingTop: large.contentTop, paddingBottom: tabBarSpace }}
        onScroll={large.onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <LargeTitleBlock title={title} />
        {loading ? (
          <View className="mx-4 overflow-hidden rounded-2xl bg-surface-card">
            {[0, 1, 2, 3].map((i) => (
              <View key={i} className="flex-row items-center gap-3 px-4 py-3.5">
                <Skeleton width={36} height={36} className="rounded-lg" />
                <Skeleton height={17} className="flex-1 rounded" />
              </View>
            ))}
          </View>
        ) : failed ? (
          <InsetGroup footer="Не удалось загрузить категории. Проверьте связь.">
            <InsetRow
              title="Повторить"
              onPress={() => {
                void l1.refetch();
                void categories.refetch();
              }}
              last
            />
          </InsetGroup>
        ) : rows.length === 0 && !allRow ? (
          // Раздел без подразделов (или неизвестный раздел по ссылке).
          <AppText className="px-8 pt-4 text-center text-ios-body text-mute">
            В этом разделе пока нет подразделов.
          </AppText>
        ) : (
          <InsetGroup>
            {allRow ? (
              <InsetRow
                title={allRow.title}
                // Иконка — чтобы текст строки стоял ровно с подразделами ниже.
                icon={<SquaresFour size={18} weight="bold" color={tc.accent} />}
                navigates
                onPress={() => allRow.onPress(l1Id)}
                last={rows.length === 0}
              />
            ) : null}
            {rows.map((c, i) => {
              const Icon = getCategoryIcon(c.icon);
              return (
                <InsetRow
                  key={c.id}
                  title={c.name_ru}
                  icon={<Icon size={18} weight="bold" color={tc.ink} />}
                  value={valueFor?.(c.id)}
                  accessibilityLabel={labelFor?.(c.id, c.name_ru)}
                  navigates
                  onPress={() => onPick(c.id)}
                  last={i === rows.length - 1}
                />
              );
            })}
          </InsetGroup>
        )}
      </Animated.ScrollView>
      <LargeTitleBar
        title={title}
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        onBack={() =>
          router.canGoBack() ? router.back() : router.replace("/(tabs)/find" as never)
        }
      />
    </View>
  );
}
