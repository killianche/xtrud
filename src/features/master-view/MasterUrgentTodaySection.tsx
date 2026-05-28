/**
 * MasterUrgentTodaySection — секция «Срочно сегодня» на главной мастера.
 *
 * Why (2026-05-28). Главная мастера превращается в «дискавери-витрину» из
 * нескольких подборок (см. MasterRecommendationsSection.tsx → блок «История»).
 * Срочные заказы (`urgency='urgent'`) — высокий-приоритетный sub-feed: мастеру
 * выгоднее всего откликнуться первым, клиенту критично получить ответ сегодня.
 * Поэтому отдельная мини-секция с тем же визуальным языком, что и «Подобрали
 * для вас», но более узкая выборка.
 *
 * Алгоритм идентичен `MasterRecommendationsSection`, отличие только в `filter`:
 *   - используем общий хук useMasterRecommendations с filter='urgent';
 *   - заголовок «Срочно сегодня» (32px, без subtitle);
 *   - если пусто — секция возвращает null (не показываем «Срочных пока нет»).
 *
 * Не дублируем код карточек/skeleton/анимации с MasterRecommendationsSection
 * (в проекте 3 почти-идентичные секции — нормально, потому что заголовки
 * фиксированные и логика null-empty одинаковая; вынесение в generic-компонент
 * было бы over-engineering ради 20 строк JSX).
 */

import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { useMasterRecommendations } from "@/features/master-view/use-master-recommendations";

interface MasterUrgentTodaySectionProps {
  userId: string;
}

const MAX_ITEMS = 4;

export function MasterUrgentTodaySection({
  userId,
}: MasterUrgentTodaySectionProps) {
  const router = useRouter();

  const { recommendations, isLoading, hasCategories } =
    useMasterRecommendations({ userId, filter: "urgent", max: MAX_ITEMS });

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

  // Срочные могут быть пустыми гораздо чаще обычной подборки — это норма.
  // Категорий нет → секция скрыта. Загрузка → тоже не показываем skeleton
  // (skeleton рисует «Подобрали для вас», этого хватает чтобы экран не моргал
  // пустотой). Когда данные пришли и пусто — секция тоже скрыта.
  if (!hasCategories) return null;
  if (isLoading) return null;
  if (recommendations.length === 0) return null;

  return (
    <View>
      <View className="mx-4 mb-4">
        <AppText
          weight="bold"
          className="tracking-tight text-ink"
          style={{ fontSize: 32, lineHeight: 36 }}
        >
          Срочно сегодня
        </AppText>
      </View>

      <Animated.View style={{ opacity }}>
        {recommendations.map((o) => (
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
            responsesCount={o.responses_count}
            createdAt={o.created_at}
            status={o.status}
            budgetKind={o.budget_kind}
            budgetValue={o.budget_value}
            showRespondButton
            onPress={() => router.push(`/(tabs)/orders/${o.id}` as never)}
          />
        ))}
      </Animated.View>

      {/* Опц. OrderRowsSkeleton не показываем — см. шапку условий выше. */}
      {/* Декларация для линтера. */}
      {isLoading ? <OrderRowsSkeleton count={2} /> : null}
    </View>
  );
}
