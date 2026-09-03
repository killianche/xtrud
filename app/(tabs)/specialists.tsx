// /(tabs)/specialists — «Специалисты».
//
// DECISION владельца 2026-09-03: «можешь в нижнее меню добавить кнопку
// специалисты, где можно искать аккаунты по именам или категориям или ещё по
// другим вариантам. Должно быть просто и быстро».
//
// Одно поле поиска вместо набора фильтров: сервер ищет и по имени, и по
// названию категории сразу, поэтому «электрик», «Магомед» и «сантех» находят
// нужное одинаково. Отдельные чипы категорий были бы вторым способом сделать
// то же самое — лишний элемент (design-quality §1.1).
//
// Экран открывается витриной по рейтингу, а не пустотой: пустой запрос —
// это тоже запрос (§1.2).

import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { MagnifyingGlass, Star, UsersThree, X } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/ui";
import {
  type MasterSearchResult,
  useSearchMasters,
} from "@/features/master-view/use-search-masters";
import { describeQueryError } from "@/lib/describe-query-error";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useThemeColors } from "@/lib/use-theme-color";

function fullName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Специалист";
}

/** Карточка специалиста — тот же язык, что у карточки задания:
 *  рамка, жирное имя 18, факты 16, ничего мельче 14. */
function MasterCard({ master, onPress }: { master: MasterSearchResult; onPress: () => void }) {
  const tc = useThemeColors(["mute", "warning"]);
  const name = fullName(master.first_name, master.last_name);
  const place = [master.city_name, master.district].filter(Boolean).join(" · ");
  const hasRating = master.rating_avg !== null && (master.rating_count ?? 0) > 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${master.categories.join(", ")}`}
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl border border-hairline bg-canvas p-4 active:bg-canvas-soft"
    >
      <View className="flex-row items-center gap-3">
        <Avatar url={master.avatar_url} name={name} seed={name} size="md" />
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-title-lg text-ink" numberOfLines={1}>
            {name}
          </AppText>
          {place ? (
            <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
              {place}
            </AppText>
          ) : null}
        </View>
        {hasRating ? (
          <View className="flex-row items-center gap-1">
            <Star size={16} weight="fill" color={tc.warning} />
            <AppText weight="mono" className="text-mono-body text-ink">
              {master.rating_avg?.toFixed(1)}
            </AppText>
          </View>
        ) : null}
      </View>

      {master.categories.length > 0 ? (
        <AppText weight="medium" className="mt-3 text-body-md text-ink" numberOfLines={2}>
          {master.categories.join(" · ")}
        </AppText>
      ) : null}

      {master.bio?.trim() ? (
        <AppText className="mt-1 text-body-md text-body" numberOfLines={2}>
          {master.bio.trim()}
        </AppText>
      ) : null}

      {master.experience_years ? (
        <AppText className="mt-2 text-body-sm text-mute">
          Опыт {master.experience_years} лет
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function SpecialistsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["mute", "ink", "accent"]);
  const [query, setQuery] = useState("");
  // Поиск не дёргает сервер на каждую букву, но и не заставляет ждать:
  // 250 мс — та же задержка, что на первом шаге создания задания.
  const debounced = useDebouncedValue(query.trim(), 250);
  const { data, isLoading, error, refetch, isFetching } = useSearchMasters(debounced);

  const list = data ?? [];

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="px-5 pt-2">
        <AppText weight="bold" className="text-display-lg text-ink">
          Специалисты
        </AppText>
      </View>

      <View className="px-4 pt-4 pb-2">
        <View
          className="min-h-14 flex-row items-center gap-3 rounded-xl border-hairline-strong bg-canvas-soft px-4"
          style={{ borderWidth: 1.5 }}
        >
          <MagnifyingGlass size={20} weight="bold" color={tc.mute} />
          <TextInput
            accessibilityLabel="Поиск специалистов"
            value={query}
            onChangeText={setQuery}
            placeholder="Имя или услуга — например, электрик"
            placeholderTextColor={tc.mute}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            className="min-h-12 flex-1 py-3 text-body-lg text-ink"
          />
          {query.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Очистить поиск"
              hitSlop={10}
              onPress={() => setQuery("")}
              className="h-11 w-11 items-center justify-center rounded-full active:bg-canvas-soft-2"
            >
              <X size={20} weight="bold" color={tc.mute} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlashList
        data={list}
        keyExtractor={(m) => m.user_id}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <MasterCard
            master={item}
            onPress={() => router.push(`/master/${item.user_id}` as never)}
          />
        )}
        ListEmptyComponent={
          isLoading || isFetching ? (
            <SpecialistsSkeleton />
          ) : error ? (
            <ErrorBlock
              title={describeQueryError(error).title}
              hint={describeQueryError(error).hint}
              onRetry={() => void refetch()}
            />
          ) : (
            <EmptyBlock hasQuery={debounced.length > 0} accent={tc.accent} />
          )
        }
      />
    </View>
  );
}

function SpecialistsSkeleton() {
  return (
    <View className="pt-1">
      {[0, 1, 2, 3].map((i) => (
        <View key={i} className="mx-4 mb-3 rounded-2xl border border-hairline bg-canvas p-4">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 rounded-full bg-canvas-soft-2" />
            <View className="flex-1 gap-2">
              <View className="h-4 w-1/2 rounded bg-canvas-soft-2" />
              <View className="h-3 w-1/3 rounded bg-canvas-soft-2" />
            </View>
          </View>
          <View className="mt-4 h-4 w-3/4 rounded bg-canvas-soft-2" />
        </View>
      ))}
    </View>
  );
}

function EmptyBlock({ hasQuery, accent }: { hasQuery: boolean; accent: string }) {
  return (
    <View className="mt-16 items-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
        <UsersThree size={36} weight="bold" color={accent} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        {hasQuery ? "Никого не нашли" : "Специалистов пока нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">
        {hasQuery
          ? "Попробуйте другое слово — например, название услуги."
          : "Здесь появятся исполнители, когда заполнят профиль."}
      </AppText>
    </View>
  );
}

function ErrorBlock({
  title,
  hint,
  onRetry,
}: {
  title: string;
  hint: string;
  onRetry: () => void;
}) {
  return (
    <View className="mt-16 items-center px-8">
      <AppText weight="bold" className="text-center text-display-sm text-ink">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">{hint}</AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-6 min-h-12 items-center justify-center rounded-pill border border-hairline bg-canvas px-5 active:bg-canvas-soft"
      >
        <AppText weight="semibold" className="text-body-md text-ink">
          Повторить
        </AppText>
      </Pressable>
    </View>
  );
}
