// /orders/responses-history — «История откликов» мастера.
//
// Why (2026-05-24). В ленте «Ваши отклики» на главной мастера
// (MasterDashboardOrders) показываются ТОЛЬКО активные отклики — заказ открыт,
// отклик живой. Когда клиент закрыл/завершил заказ, заказ истёк по сроку, или
// отклик отклонили/мастер отозвал — отклик раньше просто исчезал из списка без
// следа, и мастер не понимал, что случилось. Владелец выбрал: активные оставить
// на главной как есть, а закрытые/старые показывать на отдельном экране Истории.
//
// Данные. Переиспользуем useMyResponses(userId) — он отдаёт ВСЕ отклики мастера
// (и активные, и закрытые) с присоединённым заказом, sorted created_at desc.
// Фильтруем хелпером isHistoryResponse (= инверсия активного предиката,
// единый источник истины в use-my-responses.ts — не дублируем логику).
//
// UI. Detail-экран с back (ScreenHeader + useSafeBack), список переиспользует
// OrderRow (variant="responded") — единый вид с остальными лентами. Статус
// «мёртвого» отклика (Отклонён / Завершён / Истёк / …) передаём в OrderRow через
// statusOverrideLabel — он рисуется в РОДНОЙ статус-плашке карточки (один чип на
// строку, без дублирования). Override нужен, потому что родная логика pillFor
// знает только draft/completed/cancelled/expired + срочность и не покрывает
// статус самого ОТКЛИКА (rejected/withdrawn) и заказа (disputed/awaiting). Чип
// нейтральный (bg-surface-2 + text-mute) — это «мёртвые» отклики, не кричат.
//
// Empty-state — без CTA-кнопки (в отличие от EmptyState активных откликов на
// главной): историю нельзя «создать», она наполняется сама. Паттерн взят из
// Booking «Past» / Apple-Support «Activity» (Lazyweb 2026-05-24).

import { useRouter } from "expo-router";
import { ClockCounterClockwise } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Animated, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  historyResponseStatusLabel,
  isHistoryResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function ResponsesHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/orders" as const);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const accentColor = useThemeColor("accent");

  const { data: myResponses, isLoading } = useMyResponses(userId);
  const historyResponses = (myResponses ?? []).filter(isHistoryResponse);
  const isEmpty = historyResponses.length === 0;

  // Animated fade-in списка после загрузки (UI_PATTERNS §3.7).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading && !isEmpty) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, isEmpty, opacity]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="История откликов" onBack={goBack} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {isLoading ? (
          <OrderRowsSkeleton count={4} />
        ) : isEmpty ? (
          <EmptyState accentColor={accentColor} />
        ) : (
          <Animated.View style={{ opacity }} className="mt-2">
            {historyResponses.map((r) => (
              <OrderRow
                key={r.response.id}
                id={r.order.id}
                title={r.order.title}
                categoryName={r.order.l2?.name_ru ?? r.order.l2_id}
                categoryIcon={r.order.l2?.icon ?? null}
                categoryL2Id={r.order.l2_id}
                cityName={r.order.city?.name ?? r.order.city_id ?? "Вся Ингушетия"}
                district={r.order.district}
                urgency={r.order.urgency}
                preferredDate={r.order.preferred_date}
                responsesCount={r.order.responses_count}
                createdAt={r.response.created_at}
                status={r.order.status}
                variant="responded"
                showResponsesCount={false}
                budgetKind={r.order.budget_kind}
                budgetValue={r.order.budget_value}
                statusOverrideLabel={historyResponseStatusLabel(r)}
                onPress={() => router.push(`/orders/${r.order.id}` as never)}
              />
            ))}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// EmptyState — hero-иллюстрация (UI_PATTERNS §3.5 + §3.8), БЕЗ CTA.
// Историю нельзя «создать» — она наполняется сама, поэтому нет кнопки-призыва.
// ============================================================================

function EmptyState({ accentColor }: { accentColor: string }) {
  return (
    <View className="mt-10 items-center px-2">
      <View className="h-28 w-28 items-center justify-center rounded-2xl relative overflow-hidden bg-badge-amber">
        <View
          className="absolute rounded-full bg-canvas"
          style={{ top: -16, left: -14, width: 52, height: 52, opacity: 0.35 }}
        />
        <View
          className="absolute rounded-full bg-canvas"
          style={{ bottom: -12, right: -8, width: 40, height: 40, opacity: 0.45 }}
        />
        <View
          className="absolute rounded-md bg-canvas"
          style={{
            top: 14,
            right: 14,
            width: 14,
            height: 14,
            opacity: 0.55,
            transform: [{ rotate: "12deg" }],
          }}
        />
        <View className="h-14 w-14 items-center justify-center rounded-full bg-canvas">
          <ClockCounterClockwise size={26} weight="bold" color={accentColor} />
        </View>
      </View>

      <AppText weight="bold" className="mt-5 text-center text-title-md text-ink">
        Здесь будет история
      </AppText>
      <AppText className="mt-2 text-center text-body-sm text-mute">
        Закрытые и завершённые заявки, на которые вы откликались, появятся тут.
      </AppText>
    </View>
  );
}
