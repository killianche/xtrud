// /orders/my-responses — единый экран всех откликов мастера.
//
// Why (2026-05-28). Раньше «Ваши отклики» жили на главной мастера
// (MasterDashboardOrders в MasterHomeContent), а «История откликов» — на
// отдельном экране /orders/responses-history. Это было дублирующе:
//   - На главной висел блок откликов, который мастеру не нужен (после отклика
//     ему делать нечего, ждёт звонка клиента).
//   - История была спрятана за маленькую pill «История» в шапке этого блока.
//
// Решение (фидбэк владельца). Главная мастера ← только подборки новых заказов
// (это его JTBD на главной — найти работу, не следить за прошлым). А все
// отклики (активные + закрытые) объединены на ОДНОМ экране /orders/my-responses,
// вход — pill «Мои отклики» в шапке /orders/search.
//
// UI. Detail-экран с back (ScreenHeader + useSafeBack). ОДИН сплошной список
// всех откликов мастера (активных + истории), отсортированный по дате отклика
// (newest first) — фидбэк владельца 2026-05-28: «Убери активные/историю, просто
// сделай список по дате отклика». Прежнее разделение на две секции с
// отдельными заголовками убрано — это создавало визуальный шум на коротких
// лентах (у мастера обычно 1-5 активных + 5-20 истории).
//
// Чтобы не терялся контекст «этот отклик уже закрыт / отклонён / истёк», для
// history-откликов мы по-прежнему передаём `statusOverrideLabel` через
// `historyResponseStatusLabel(r)` — на самой карточке вместо «Вы откликнулись»
// показывается «Завершён / Заказ закрыли / Истёк / Отклонён».
//
// Empty state. Если откликов нет совсем — hero-иллюстрация + CTA «Найти
// заказ» → /orders/search.
//
// Источник данных. Один запрос useMyResponses(userId). Сортировка по
// response.created_at DESC выполняется на клиенте (сам хук уже отдаёт массив
// в порядке БД; явная сортировка здесь делает гарантию явной).
//
// EmptyState активных. Hero-иллюстрация (sky-tint фон, центр-иконка чата) +
// заголовок + объяснение + CTA «Найти заказ». Паттерн UI_PATTERNS §3.5+§3.8.

import { useRouter } from "expo-router";
import { ArrowRight, ChatCenteredText } from "phosphor-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  historyResponseStatusLabel,
  isActiveResponse,
  isHistoryResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

export default function MyResponsesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = useSafeBack("/(tabs)/orders/search" as const);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const accentColor = useThemeColor("accent");
  const onPrimary = useThemeColor("on-primary");

  const { data: myResponses, isLoading } = useMyResponses(userId);
  // Единый список откликов БЕЗ заголовков-секций (фидбэк владельца 2026-05-28).
  // Сортировка: сначала все активные (заказ ещё открыт — мастер может ждать
  // звонка) по дате отклика DESC, ниже все завершённые/отклонённые (история)
  // тоже по дате отклика DESC. Так свежие активные всегда наверху, прошлое не
  // отвлекает от текущего.
  const sortedResponses = useMemo(() => {
    const items = myResponses ?? [];
    return [...items].sort((a, b) => {
      const aActive = isActiveResponse(a);
      const bActive = isActiveResponse(b);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return new Date(b.response.created_at).getTime() - new Date(a.response.created_at).getTime();
    });
  }, [myResponses]);

  // Animated fade-in (UI_PATTERNS §3.7).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading) {
      opacity.setValue(0);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoading, opacity]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Мои отклики" onBack={goBack} />

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {isLoading ? (
          <OrderRowsSkeleton count={5} />
        ) : (
          <Animated.View style={{ opacity }} className="pt-2">
            {sortedResponses.length === 0 ? (
              <EmptyActiveState
                accentColor={accentColor}
                onPrimary={onPrimary}
                onFindOrders={() => router.push("/(tabs)/orders/search" as never)}
              />
            ) : (
              // Единый сплошной список откликов: сверху активные (newest first),
              // ниже завершённые/отклонённые (newest first). Заголовки секций
              // убраны по фидбэку владельца — порядок и сам бейдж статуса на
              // карточке (Завершён/Заказ закрыли/Истёк/Отклонён vs «Вы
              // откликнулись») достаточно различают группы.
              sortedResponses.map((r) => {
                const isHistory = isHistoryResponse(r);
                return (
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
                    alreadyResponded={!isHistory}
                    budgetKind={r.order.budget_kind}
                    budgetValue={r.order.budget_value}
                    statusOverrideLabel={isHistory ? historyResponseStatusLabel(r) : undefined}
                    onPress={() => router.push(`/(tabs)/orders/${r.order.id}` as never)}
                  />
                );
              })
            )}
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// EmptyActiveState — hero-иллюстрация + CTA «Найти заказ».
// Только когда активных откликов нет. Историю рендерим отдельно ниже.
// ============================================================================

interface EmptyActiveStateProps {
  accentColor: string;
  onPrimary: string;
  onFindOrders: () => void;
}

function EmptyActiveState({ accentColor, onPrimary, onFindOrders }: EmptyActiveStateProps) {
  return (
    <View className="mt-4 items-center px-6">
      <View className="h-28 w-28 items-center justify-center rounded-2xl relative overflow-hidden bg-badge-amber">
        <View
          className="absolute rounded-full bg-canvas"
          style={{ top: -16, left: -14, width: 52, height: 52, opacity: 0.35 }}
        />
        <View
          className="absolute rounded-full bg-canvas"
          style={{
            bottom: -12,
            right: -8,
            width: 40,
            height: 40,
            opacity: 0.45,
          }}
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
        Найдите интересную заявку в поиске и отправьте отклик.
      </AppText>

      <Pressable
        accessibilityRole="button"
        onPress={onFindOrders}
        className="mt-5 h-11 flex-row items-center gap-2 rounded-pill bg-primary px-5 active:opacity-80"
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          Найти заказ
        </AppText>
        <ArrowRight size={16} weight="bold" color={onPrimary} />
      </Pressable>
    </View>
  );
}
