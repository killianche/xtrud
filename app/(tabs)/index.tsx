import { LogOut } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CategoryTile } from "@/components/CategoryTile";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { signOut } from "@/lib/auth";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const { data: categories, isLoading, error, refetch } = useVisibleCategories();

  const greeting = user?.first_name ? `Привет, ${user.first_name}` : "С чего начнём?";

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View className="flex-row items-start justify-between px-6">
        <View className="flex-1">
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            {greeting}
          </AppText>
          {user?.active_role && (
            <AppText className="mt-2 text-caption text-muted">
              Режим: {user.active_role === "client" ? "Клиент" : "Мастер"}
            </AppText>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Выйти"
          onPress={() => signOut()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
        >
          <LogOut size={18} strokeWidth={1.75} color="#374151" />
        </Pressable>
      </View>

      {/* Section title */}
      <View className="mt-10 px-6">
        <AppText weight="semibold" className="text-title-lg text-ink">
          Категории
        </AppText>
        <AppText className="mt-1 text-body-sm text-muted">Выберите, какой мастер вам нужен</AppText>
      </View>

      {/* Loading / error / grid */}
      {isLoading && (
        <View className="mt-8 items-center px-6">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить категории. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {categories && categories.length > 0 && (
        <View className="mt-4 flex-row flex-wrap gap-3 px-6">
          {categories.map((cat) => (
            <View key={cat.id} className="w-[48%] md:w-[31%] lg:w-[23%]">
              <CategoryTile
                name={cat.name_ru}
                iconName={cat.icon}
                onPress={() => {
                  // Sprint 3 — навигация к /(tabs)/category/[id]
                  // Sprint 2.3 — no-op (логировать опасно: попадает в production-логи)
                }}
              />
            </View>
          ))}
        </View>
      )}

      {categories && categories.length === 0 && !isLoading && !error && (
        <View className="mt-8 px-6">
          <AppText className="text-body-md text-muted">
            Категории ещё не настроены. Свяжитесь с поддержкой.
          </AppText>
        </View>
      )}
    </ScrollView>
  );
}
