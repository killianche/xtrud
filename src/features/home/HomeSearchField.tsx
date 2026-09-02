// Закреплённое поле поиска над главной (образец владельца 2026-09-02).
//
// Это не настоящий инпут, а кнопка в форме поля: тап открывает экран
// поиска категорий с клавиатурой и подсказками. Так поле не спорит с
// прокруткой главной за фокус и не держит вторую клавиатуру.
//
// Ищет категории — единственный поиск, который у продукта есть
// (RPC search_categories: синонимы, полнотекст, триграммы, раскладка).
// Свободный текст в аналитику не уходит (см. use-search-analytics.test).

import { useRouter } from "expo-router";
import { MagnifyingGlass } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export function HomeSearchField() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["mute", "ink"]);

  return (
    <View className="bg-canvas px-5 pb-3" style={{ paddingTop: insets.top + 8 }}>
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Поиск категории"
        accessibilityHint="Откроет поиск по категориям услуг"
        onPress={() => router.push("/search" as never)}
        className="min-h-12 flex-row items-center gap-3 rounded-pill border border-hairline bg-canvas-soft px-4 active:bg-canvas-soft-2"
      >
        <MagnifyingGlass size={20} weight="bold" color={tc.ink} />
        <AppText className="flex-1 text-body-md text-mute" numberOfLines={1}>
          Что нужно сделать?
        </AppText>
      </Pressable>
    </View>
  );
}
