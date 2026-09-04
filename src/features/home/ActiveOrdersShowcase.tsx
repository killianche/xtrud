// Блок «Актуальные задания» на клиентской главной.
//
// Ставится сразу под созданием задания и показывает НАСТОЯЩИЕ открытые заказы
// карточками, а не ярлыки категорий с иконками: человек должен увидеть, какие
// задачи здесь живут и по каким ценам, прежде чем публиковать свою.
//
// Данные не выдумываются. Пустая база даёт честное пустое состояние, а не
// подставные примеры: интерфейс не утверждает того, что не подтверждено
// данными (.claude/rules/design-quality.md §5).

import { useRouter } from "expo-router";
import { CloudSlash, Tray } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { Button } from "@/components/ui";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { describeQueryError } from "@/lib/describe-query-error";
import { useThemeColor } from "@/lib/use-theme-color";

const MAX_ITEMS = 4;

/** Не больше одного задания на категорию: срез должен показывать РАЗНЫЕ
 *  задачи, а не четыре сантехники подряд. Лента уже отсортирована сервером
 *  по created_at DESC, поэтому порядок «свежее сверху» сохраняется. */
function pickVariety(rows: OrderWithRefs[], max: number): OrderWithRefs[] {
  const seen = new Set<string>();
  const out: OrderWithRefs[] = [];
  for (const row of rows) {
    if (out.length >= max) break;
    const key = row.l2_id ?? row.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function ActiveOrdersShowcase({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const accentColor = useThemeColor("accent");

  const {
    data: feed,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useAllOpenOrders({ userId, l2Ids: null });

  const items = useMemo(
    () =>
      pickVariety(
        (feed?.pages ?? []).flatMap((p) => p.rows),
        MAX_ITEMS,
      ),
    [feed],
  );

  // Ошибку теперь показываем — но спокойно, без красной плашки. Раньше блок
  // просто исчезал (`return null`), и владелец видел пустое место без
  // объяснения; до этого — вечный скелетон. DECISION владельца 2026-09-03:
  // «если ошибка — понятный retry, не серые полоски».
  const errorText = error ? describeQueryError(error) : null;

  return (
    <View className="mt-10">
      <View className="flex-row items-end justify-between px-5">
        <AppText weight="bold" className="text-display-sm text-ink">
          Актуальные задания
        </AppText>
        {items.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Показать все задания"
            hitSlop={12}
            onPress={() => router.navigate("/(tabs)/find")}
          >
            <AppText weight="semibold" className="text-body-md text-accent">
              Все
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <AppText className="mt-1 px-5 text-body-md text-mute">Что сейчас ищут люди рядом</AppText>

      <View className="mt-4">
        {isLoading ? (
          <OrderRowsSkeleton count={3} />
        ) : errorText ? (
          <View className="mx-4 items-center rounded-2xl border border-hairline bg-surface-card px-5 py-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <CloudSlash size={30} weight="bold" color={accentColor} />
            </View>
            <AppText weight="bold" className="mt-4 text-center text-title-lg text-ink">
              {errorText.title}
            </AppText>
            <AppText className="mt-2 text-center text-body-md text-body">{errorText.hint}</AppText>
            <View className="mt-5 self-stretch">
              <Button
                variant="secondary"
                size="lg"
                fullWidth
                loading={isRefetching}
                onPress={() => void refetch()}
              >
                Повторить
              </Button>
            </View>
          </View>
        ) : items.length === 0 ? (
          <View className="mx-4 items-center rounded-2xl border border-hairline bg-surface-card px-5 py-8">
            <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-soft">
              <Tray size={30} weight="bold" color={accentColor} />
            </View>
            <AppText weight="bold" className="mt-4 text-center text-title-lg text-ink">
              Пока заданий нет
            </AppText>
            <AppText className="mt-2 text-center text-body-md text-body">
              Ваше может стать первым — опишите задачу, и исполнители увидят её.
            </AppText>
          </View>
        ) : (
          items.map((o) => (
            <OrderRow
              key={o.id}
              id={o.id}
              title={o.title}
              description={o.description}
              categoryName={o.l2?.name_ru ?? o.l2_id}
              categoryIcon={o.l2?.icon ?? null}
              categoryL2Id={o.l2_id}
              cityName={o.city?.name ?? o.city_id ?? "Вся Ингушетия"}
              district={o.district}
              urgency={o.urgency}
              preferredDate={o.preferred_date}
              responsesCount={o.responses_count}
              createdAt={o.created_at}
              status={o.status}
              budgetKind={o.budget_kind}
              budgetValue={o.budget_value}
              onPress={() => router.push(`/orders/${o.id}` as never)}
            />
          ))
        )}
      </View>
    </View>
  );
}
