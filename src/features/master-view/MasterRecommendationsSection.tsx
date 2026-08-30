/**
 * MasterRecommendationsSection — «Подобрали для вас», главная секция-витрина
 * на главной мастера.
 *
 * Why (2026-05-27, владелец продукта). Над «Ваши отклики» нужен блок с открытыми
 * заказами по категориям мастера, на которые он ЕЩЁ НЕ откликался. Это сокращает
 * путь «зайти в /orders/search → отфильтровать по своим категориям → отсеять
 * откликнутое» до одного скролла главного экрана.
 *
 * 2026-05-28 (текущая итерация). «Ваши отклики» с главной убраны (уехали на
 * /orders/my-responses). Теперь главная мастера — стэк ИЗ ТРЁХ подборок:
 *   1) «Подобрали для вас» (этот компонент) — все open-заказы по категориям
 *      мастера, отсортированные по свежести. Это основной фид-витрина.
 *   2) «Срочно сегодня» (MasterUrgentTodaySection) — отдельная секция для
 *      urgency='urgent'. Если пусто — секция скрыта.
 *   3) «Свежие за сутки» (MasterFreshTodaySection) — заказы за последние 24 ч.
 *      Если пусто — секция скрыта.
 *
 * Все три используют общий хук `useMasterRecommendations` с разным `filter`
 * (см. ./use-master-recommendations.ts) — один RPC-запрос, разная клиентская
 * фильтрация. Никаких новых RPC / миграций.
 *
 * Решения дизайна (после Lazyweb 2026-05-27 + 2026-05-28):
 *   - **Plain vertical list** из <OrderRow>, не горизонтальная карусель.
 *     Карусель прячет 60% контента под swipe и на десктопе вообще не видна.
 *     DoorDash / Yelp / Whatnot home — вертикальный стэк секций.
 *   - **Заголовок 32px** — единый визуальный язык со всеми остальными
 *     hero-заголовками xtrud. Subtitle под H1 запрещён (design-quality §G).
 *   - **Empty state — null** (компонент не рендерится). Никаких «Скоро
 *     будут рекомендации» — это шум. Решение «рендерить или нет» — на
 *     стороне компонента, хук просто возвращает данные.
 *   - **Loading — skeleton** через OrderRowsSkeleton (count 3).
 *
 * Не делаем (осознанно):
 *   - Никаких новых RPC / миграций — данных хватает в имеющихся хуках.
 *   - Никаких фильтров/чипов внутри секции (это лента-«рекомендация», для
 *     полного поиска есть /orders/search).
 *   - Никакой «История рекомендаций» — рекомендации эфемерны.
 *   - Никакого hairline-разделителя ВНУТРИ секции — на главной между
 *     соседними секциями работает gap-7 контейнера, отдельная линия лишняя.
 *
 * История:
 *   - 2026-05-27 — создан по запросу владельца.
 *   - 2026-05-28 — вынесена общая логика в useMasterRecommendations;
 *     добавлены родственные секции «Срочно сегодня» и «Свежие за сутки»;
 *     удалён внутренний hairline-разделитель (был нужен пока ниже шла «Ваши
 *     отклики», теперь её нет).
 */

import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { useMasterRecommendations } from "@/features/master-view/use-master-recommendations";

interface MasterRecommendationsSectionProps {
  userId: string;
}

// 10 карточек (фидбэк владельца 2026-05-28: «оставим только Подобрали для
// вас, туда внедрим срочные и недавние, 10 штук можно показать»). Раньше было
// 5 + отдельные секции «Срочно сегодня» / «Свежие за сутки», теперь они
// слиты в один список — filter:'all' уже даёт надмножество (все open-заказы
// по моим категориям, без откликов), просто увеличили лимит.
const MAX_ITEMS = 10;

export function MasterRecommendationsSection({ userId }: MasterRecommendationsSectionProps) {
  const router = useRouter();

  const { recommendations, isLoading, hasCategories, respondedOrderIds } = useMasterRecommendations(
    { userId, filter: "all", max: MAX_ITEMS },
  );

  // Animated fade-in (тот же паттерн, что в соседних секциях).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && recommendations.length > 0) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, recommendations.length, opacity]);

  // Empty state — секция не рендерится.
  if (!hasCategories) return null;
  if (!isLoading && recommendations.length === 0) return null;

  return (
    <View>
      <View className="mx-4 mb-4">
        <AppText
          weight="bold"
          className="tracking-tight text-ink"
          style={{ fontSize: 32, lineHeight: 36 }}
        >
          Подобрали для вас
        </AppText>
      </View>

      {isLoading ? (
        <OrderRowsSkeleton count={3} />
      ) : (
        <Animated.View style={{ opacity }}>
          {recommendations.map((o) => {
            // Откликнулся прямо в этой сессии → карточка ОСТАЁТСЯ (снимок в
            // хуке её не убирает), но кнопка «Откликнуться» сменяется чипом
            // «Вы откликнулись». OrderRow сам гасит кнопку при alreadyResponded.
            const responded = respondedOrderIds.has(o.id);
            return (
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
                alreadyResponded={responded}
                onPress={() => router.push(`/orders/${o.id}` as never)}
              />
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}
