/**
 * MasterDashboardOrders — встроенный в главную мастера список «Я откликнулся».
 *
 * Why (2026-05-20). Переход на classified-ads модель: «accept master» убран,
 * клиент сам звонит / пишет в WhatsApp выбранному мастеру. Lifecycle упростился —
 * «Меня выбрали» больше не может наполниться. Оставили один список откликов
 * мастера, без табов.
 *
 * До этого (2026-05-15): два таба «Я откликнулся» / «Меня выбрали (N)»
 * + collapsible архив завершённых для assigned-таба.
 *
 * Что показываем:
 *   - Hero-заголовок «Ваши отклики»
 *   - Список откликов (response.status в sent/viewed) с OrderRow variant='responded'
 *
 * Tap по карточке → /orders/[id] (полный экран с деталями и формой отклика).
 */

import { useRouter } from "expo-router";
import { CaretDown, ChatCenteredText, ClockCounterClockwise } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Animated, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import {
  isActiveResponse,
  isHistoryResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useThemeColor } from "@/lib/use-theme-color";

interface MasterDashboardOrdersProps {
  userId: string;
}

export function MasterDashboardOrders({ userId }: MasterDashboardOrdersProps) {
  const router = useRouter();
  const accentColor = useThemeColor("accent");
  const muteColor = useThemeColor("mute");

  const { data: myResponses, isLoading } = useMyResponses(userId);
  const all = myResponses ?? [];
  const activeResponses = all.filter(isActiveResponse);
  // «Исторические» отклики (закрытые/завершённые) считаем из тех же данных —
  // без второго запроса. Ссылка «История» показывается только если их ≥ 1.
  const historyCount = all.filter(isHistoryResponse).length;
  const isEmpty = activeResponses.length === 0;

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
    <View>
      {/* Шапка секции (фидбэк владельца 2026-05-24): заголовок «Ваши отклики»
          32px + стрелка слева по левому краю, кнопка «История» справа напротив. */}
      <View className="mx-4 mb-4 flex-row items-center justify-between gap-3">
        <View className="flex-row items-center gap-2">
          <AppText
            weight="bold"
            className="tracking-tight text-ink"
            style={{ fontSize: 32, lineHeight: 36 }}
          >
            Ваши отклики
          </AppText>
          {/* Декоративная стрелка вниз — намёк, что ниже идёт список откликов
              (не кнопка, просто индикатор). Запрошено владельцем 2026-05-24. */}
          <CaretDown size={22} weight="bold" color={muteColor} />
        </View>

        {/* Кнопка «История» — справа напротив заголовка. Ведёт на
            /orders/responses-history (закрытые/завершённые отклики). Secondary-
            стиль: нейтральная pill-кнопка. Показываем только если история не пуста. */}
        {!isLoading && historyCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`История откликов, ${historyCount}`}
            onPress={() =>
              router.push("/(tabs)/orders/responses-history" as never)
            }
            hitSlop={8}
            className="h-8 shrink-0 flex-row items-center gap-1.5 rounded-full border border-hairline bg-canvas px-3 active:opacity-70"
          >
            <ClockCounterClockwise size={14} weight="bold" color={muteColor} />
            <AppText weight="medium" className="text-body-sm text-ink">
              История
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {/* Content */}
      {isLoading ? (
        <View>
          <OrderRowsSkeleton count={3} />
        </View>
      ) : isEmpty ? (
        <EmptyState accentColor={accentColor} />
      ) : (
        <Animated.View style={{ opacity }} className="mt-3">
          {activeResponses.map((r) => (
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
              responsesCount={r.order.responses_count}
              createdAt={r.response.created_at}
              status={r.order.status}
              variant="responded"
              showResponsesCount={false}
              // Все заказы в «Ваши отклики» — те, на которые мастер уже
              // откликнулся, поэтому показываем плашку «Вы откликнулись»
              // (как в ленте «Поиск заказов»). Фидбэк владельца 2026-05-24.
              alreadyResponded
              budgetKind={r.order.budget_kind}
              budgetValue={r.order.budget_value}
              onPress={() => router.push(`/(tabs)/orders/${r.order.id}` as never)}
            />
          ))}
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// EmptyState — hero-иллюстрация (UI_PATTERNS §3.5 + §3.8).
// ============================================================================

function EmptyState({ accentColor }: { accentColor: string }) {
  return (
    <View className="mt-6 items-center px-2">
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
          <ChatCenteredText size={26} weight="bold" color={accentColor} />
        </View>
      </View>

      <AppText weight="bold" className="mt-5 text-center text-title-md text-ink">
        Откликов пока нет
      </AppText>
      <AppText className="mt-2 text-center text-body-sm text-mute">
        Найдите интересную заявку через поиск и отправьте отклик.
      </AppText>
    </View>
  );
}
