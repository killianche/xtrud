/**
 * Поиск мастеров — full-screen search со SearchBar + фильтрами + результатами.
 *
 * MVP-stub: показывает SearchBar с auto-focus + empty state.
 * Полная реализация (запросы к Supabase с фильтрами по категории/городу/рейтингу/
 * опыту, debounced search) — отдельной задачей. Сейчас просто рабочий route
 * чтобы тап на «Имя или категория мастера» на главной не падал.
 */

import { useRouter } from "expo-router";
import { ChevronLeft, Search } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Input } from "@/components/ui";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar: back + search input */}
      <View className="flex-row items-center gap-2 px-4 py-2 border-b border-hairline">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full active:opacity-70 text-ink"
        >
          <ChevronLeft size={22} strokeWidth={2} color="currentColor" />
        </Pressable>
        <View className="flex-1">
          <Input
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Имя или категория мастера"
            leftIcon={<Search size={18} strokeWidth={1.75} color="currentColor" />}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Empty / placeholder state */}
      <View className="flex-1 items-center justify-center px-8">
        <AppText className="text-mute text-body-md text-center">
          Поиск мастеров в работе. Пока используйте категории на главной.
        </AppText>
      </View>
    </View>
  );
}
