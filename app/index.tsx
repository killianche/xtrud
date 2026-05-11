import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";

// Демо sprint 1.2 — проверка работы дизайн-токенов и переключения темы.
// В sprint 1.6 заменяется на protected route + (tabs).
export default function Index() {
  const { colorScheme, preference, setPreference } = useColorScheme();

  return (
    <View className="flex-1 items-center justify-center bg-canvas px-6">
      <AppText className="text-display-md font-bold tracking-tight text-ink">xtrud</AppText>
      <AppText className="mt-2 text-body-md text-body">Sprint 1.2: design tokens готовы.</AppText>
      <AppText className="mt-1 text-caption-xs text-muted-soft">
        Тема: {preference} (резолв: {colorScheme ?? "..."})
      </AppText>

      {/* Карточка surface-2 */}
      <View className="mt-8 w-full max-w-md rounded-lg border border-hairline bg-surface-2 p-6">
        <AppText className="text-title-md text-ink">Карточка</AppText>
        <AppText className="mt-1 text-body-sm text-muted">
          surface-2, hairline border, radius-lg
        </AppText>
      </View>

      {/* Тёмная категорийная плитка — сигнатурный category-tile */}
      <View className="mt-3 w-full max-w-md overflow-hidden rounded-xl bg-surface-dark p-5">
        <AppText className="text-title-lg text-on-dark">Сигнатурная плитка</AppText>
        <AppText className="mt-1 text-body-sm text-on-dark-soft">
          surface-dark, radius-xl (20dp)
        </AppText>
      </View>

      {/* Primary CTA */}
      <Pressable
        accessibilityRole="button"
        className="mt-6 h-12 items-center justify-center rounded-md bg-primary px-6 active:opacity-80"
      >
        <AppText className="text-button font-semibold text-on-primary">Primary CTA</AppText>
      </Pressable>

      {/* Свитчер темы */}
      <View className="mt-6 flex-row gap-2">
        {(["system", "light", "dark"] as const).map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            onPress={() => setPreference(p)}
            className={`h-10 items-center justify-center rounded-pill border px-4 ${
              preference === p
                ? "border-accent bg-accent-soft"
                : "border-hairline bg-canvas active:opacity-70"
            }`}
          >
            <AppText
              className={`text-caption font-medium ${
                preference === p ? "text-accent" : "text-body"
              }`}
            >
              {p}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
