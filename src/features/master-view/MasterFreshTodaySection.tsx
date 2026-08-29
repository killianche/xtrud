/**
 * MasterFreshTodaySection — секция «Недавно добавленные» (≤ 24 ч) на главной мастера.
 *
 * Why (2026-05-28). Третья подборка на главной мастера: подсвечивает свежий
 * приток заказов за последние сутки. Паттерн «Recently added / New today»
 * у marketplace-фидов (Vinted, eBay, Whatnot) — даёт мастеру понять что
 * платформа живая и стимулирует возвращаться на главную регулярно.
 *
 * Алгоритм идентичен MasterRecommendationsSection, отличие только в `filter`:
 *   - используем общий хук useMasterRecommendations с filter='fresh_24h';
 *   - заголовок «Недавно добавленные» (32px, без subtitle);
 *   - если пусто — секция возвращает null.
 *
 * Чем отличается от «Подобрали для вас»:
 *   - «Подобрали» — ВСЕ open-заказы по категориям (включая старые).
 *   - «Недавно добавленные» — только за последние 24 ч. Может пересекаться с
 *     «Подобрали» по контенту (одни и те же карточки) — это нормально, у
 *     каждой секции свой смысл фрейминга («подходящие тебе» vs «свежак»).
 */

import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { useMasterRecommendations } from "@/features/master-view/use-master-recommendations";

interface MasterFreshTodaySectionProps {
  userId: string;
}

const MAX_ITEMS = 4;

export function MasterFreshTodaySection({ userId }: MasterFreshTodaySectionProps) {
  const router = useRouter();

  const { recommendations, isLoading, hasCategories } = useMasterRecommendations({
    userId,
    filter: "fresh_24h",
    max: MAX_ITEMS,
  });

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
          Недавно добавленные
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
            preferredDate={o.preferred_date}
            responsesCount={o.responses_count}
            createdAt={o.created_at}
            status={o.status}
            budgetKind={o.budget_kind}
            budgetValue={o.budget_value}
            showRespondButton
            onPress={() => router.push(`/orders/${o.id}` as never)}
          />
        ))}
      </Animated.View>
    </View>
  );
}
