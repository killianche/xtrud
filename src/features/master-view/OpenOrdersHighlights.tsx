/**
 * OpenOrdersHighlights — «Актуальные задания», блок на главной мастера ниже
 * фото-героя (редизайн главной + нижней навигации, 2026-08-30).
 *
 * Why. Заменяет MasterRecommendationsSection («Подобрали для вас», фильтр по
 * категориям мастера) и MyResponsesEntry (pill «Мои отклики») — оба удалены:
 * теперь у отклики мастера — отдельный таб «Мои задания», а персонализация
 * по категориям доступна фильтрами на табе «Найти задание» (/find). Цель
 * ЭТОГО блока другая — честный срез «что вообще есть сейчас», не подборка
 * под профиль. Источник — тот же `useAllOpenOrders`, что питает /find, БЕЗ
 * фильтра по l2Ids мастера.
 *
 * Отбор: не больше ОДНОГО задания на категорию, максимум 4 (см.
 * `pickOneOrderPerCategory`). Если открытых категорий меньше 4 — показываем
 * сколько есть, НИКОГДА не добираем до 4 повторами одной категории.
 *
 * Честность интерфейса (design-quality §5). На момент редизайна открытых
 * заданий в базе 0 — это основной сценарий, не крайний случай. Пустое
 * состояние здесь не «скрыть блок», а явный текст с той же формулировкой,
 * что и на /find (единый факт — один текст, не два разных обещания).
 *
 * Loading — skeleton (OrderRowsSkeleton), Error — компактная строка +
 * «Повторить» (как на /find), без отдельного «оффлайн»-состояния — в
 * проекте нет детекции сети нигде.
 */

import { useRouter } from "expo-router";
import { Tray, WarningCircle } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { useAllOpenOrders } from "@/features/orders/use-all-open-orders";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";
import { useMyResponses } from "@/features/orders/use-my-responses";
import { useThemeColor } from "@/lib/use-theme-color";

interface OpenOrdersHighlightsProps {
  userId: string | undefined;
}

/** Не больше одного задания на категорию, максимум `max`. Ленту отдаёт
 *  сервер уже отсортированной created_at DESC — берём первое попавшееся
 *  задание каждой новой категории, порядок «свежее сверху» сохраняется. */
function pickOneOrderPerCategory(rows: OrderWithRefs[], max: number): OrderWithRefs[] {
  const seenCategories = new Set<string>();
  const result: OrderWithRefs[] = [];
  for (const row of rows) {
    if (result.length >= max) break;
    const categoryKey = row.l2_id ?? row.id;
    if (seenCategories.has(categoryKey)) continue;
    seenCategories.add(categoryKey);
    result.push(row);
  }
  return result;
}

const MAX_ITEMS = 4;

export function OpenOrdersHighlights({ userId }: OpenOrdersHighlightsProps) {
  const router = useRouter();
  const accentColor = useThemeColor("accent");

  // Без l2Ids — это честный срез «что вообще есть», не подборка под мастера.
  const {
    data: feed,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useAllOpenOrders({
    userId,
    l2Ids: null,
  });

  const highlights = useMemo(() => {
    const rows = (feed?.pages ?? []).flatMap((p) => p.rows);
    return pickOneOrderPerCategory(rows, MAX_ITEMS);
  }, [feed]);

  // Отклики мастера — чтобы карточка сразу показывала чип «Вы откликнулись»
  // вместо кнопки, если он уже откликнулся (тот же паттерн, что на /find).
  const myResponsesQ = useMyResponses(userId);
  const respondedOrderIds = new Set(
    (myResponsesQ.data ?? [])
      .filter((r) => r.response.status !== "withdrawn")
      .map((r) => r.response.order_id),
  );

  return (
    <View>
      <View className="mx-4 mb-4">
        <AppText
          weight="bold"
          className="tracking-tight text-ink"
          style={{ fontSize: 32, lineHeight: 36 }}
        >
          Актуальные задания
        </AppText>
      </View>

      {isLoading ? (
        <OrderRowsSkeleton count={3} />
      ) : error ? (
        <View className="mx-4">
          <View className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-canvas-soft px-4 py-3.5">
            <WarningCircle size={20} weight="bold" color={accentColor} />
            <View className="min-w-0 flex-1">
              <AppText weight="semibold" className="text-body-md text-ink">
                Не удалось загрузить задания
              </AppText>
              <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={2}>
                {error.message}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Повторить загрузку заданий"
              disabled={isRefetching}
              onPress={() => void refetch()}
              className="min-h-11 items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft-2"
            >
              <AppText weight="semibold" className="text-button-sm text-ink">
                {isRefetching ? "Загружаем…" : "Повторить"}
              </AppText>
            </Pressable>
          </View>
        </View>
      ) : highlights.length === 0 ? (
        <View className="mx-4 items-center rounded-2xl border border-hairline bg-canvas-soft px-5 py-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas">
            <Tray size={26} weight="bold" color={accentColor} />
          </View>
          <AppText weight="bold" className="mt-4 text-center text-title-md text-ink">
            Открытых заданий сейчас нет
          </AppText>
          <AppText className="mt-2 text-center text-body-sm text-mute">
            Задания клиентов появляются здесь по мере публикации. Загляните позже.
          </AppText>
        </View>
      ) : (
        <View>
          {highlights.map((o) => (
            <OrderRow
              key={o.id}
              id={o.id}
              title={o.title}
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
              showRespondButton
              alreadyResponded={respondedOrderIds.has(o.id)}
              onPress={() => router.push(`/orders/${o.id}` as never)}
            />
          ))}
        </View>
      )}
    </View>
  );
}
