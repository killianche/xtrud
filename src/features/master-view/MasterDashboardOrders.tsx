/**
 * MasterDashboardOrders — встроенный в главную мастера список «Я откликнулся
 * / Меня выбрали».
 *
 * Why. По фидбэку user 2026-05-15: «второй таб (Заявки) в TabBar убираем, и
 * сразу на главной под Готовы работать пускай идут эти заказы». Раньше у
 * мастера был отдельный таб /orders с двумя секциями + tab pills. Теперь то
 * же самое — компактно на главной.
 *
 * Что показываем:
 *   - Tab pills «Я откликнулся» / «Меня выбрали (N)»
 *     Badge ТОЛЬКО на «Меня выбрали» — это уведомление о новой заявке от клиента.
 *     На «Я откликнулся» badge не нужен — это просто история собственных откликов,
 *     не сигнал требующий внимания (фидбек user 2026-05-15).
 *   - Список заказов по активному табу с OrderRow variant'ом
 *     (responded → Hourglass amber / assigned → CheckCircle success)
 *
 * Tap по карточке → /orders/[id] (полный экран с деталями и формой отклика).
 *
 * Отличия от /orders (master view):
 *   - Без архива откликов (он есть на /orders/[id])
 *   - Без header'а (главная сама даёт контекст)
 *   - Default tab — «assigned» (Меня выбрали) — для мастера это
 *     приоритетнее: уже выбран, нужно работать.
 */

import { useRouter } from "expo-router";
import { CaretDown, CaretUp, CheckCircle, ChatCenteredText } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import {
  type MyResponseWithOrder,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useOrdersAssignedToMe } from "@/features/orders/use-orders-assigned-to-me";
import { useThemeColor } from "@/lib/use-theme-color";

type LocalTab = "responded" | "assigned";

/** Активные отклики = клиент ещё думает (отклик в статусе sent/viewed).
 *  Исключаем:
 *    - accepted → этот заказ уже в табе «Меня выбрали», дублирование не нужно
 *    - rejected/withdrawn → история, не активный отклик
 *    - terminal-статусы заказа (completed/cancelled/expired/disputed) → нет смысла
 *      показывать в «Я откликнулся» — мастер ничего не может сделать.
 *      awaiting_confirmation тоже исключаем: если order дошёл сюда, отклик
 *      этого мастера должен быть accepted (тогда отфильтрован выше). Если по
 *      какой-то причине нет — это inconsistent state, лучше не показывать.
 *  Архив доступен на /orders/[id]. См. docs/lifecycle.md §2.1. */
function isActiveResponse(r: MyResponseWithOrder): boolean {
  const orderStatus = r.order.status;
  const respStatus = r.response.status;
  if (
    orderStatus === "completed" ||
    orderStatus === "cancelled" ||
    orderStatus === "expired" ||
    orderStatus === "disputed" ||
    orderStatus === "awaiting_confirmation"
  ) {
    return false;
  }
  if (respStatus === "accepted" || respStatus === "rejected" || respStatus === "withdrawn") {
    return false;
  }
  return true;
}

interface MasterDashboardOrdersProps {
  userId: string;
}

export function MasterDashboardOrders({ userId }: MasterDashboardOrdersProps) {
  const router = useRouter();
  const [tab, setTab] = useState<LocalTab>("assigned");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const accentColor = useThemeColor("accent");
  const muteColor = useThemeColor("mute");

  const { data: myResponses, isLoading: respLoading } = useMyResponses(userId);
  const { data: assigned, isLoading: assignedLoading } =
    useOrdersAssignedToMe(userId);

  const activeResponses = (myResponses ?? []).filter(isActiveResponse);

  // Assigned-таб: разбиваем на active (open/in_progress) и archived
  // (completed/cancelled/expired). Завершённые скрываются в collapsible
  // секции — фидбэк user 2026-05-15: «если полностью завершены — скрыть».
  const { activeAssigned, archivedAssigned } = useMemo(() => {
    const active: typeof assigned = [];
    const archived: typeof assigned = [];
    for (const o of assigned ?? []) {
      if (
        o.status === "completed" ||
        o.status === "cancelled" ||
        o.status === "expired"
      ) {
        archived.push(o);
      } else {
        active.push(o);
      }
    }
    return { activeAssigned: active ?? [], archivedAssigned: archived ?? [] };
  }, [assigned]);

  const isLoading = tab === "responded" ? respLoading : assignedLoading;
  const isEmpty =
    tab === "responded"
      ? activeResponses.length === 0
      : activeAssigned.length === 0 && archivedAssigned.length === 0;

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
  }, [isLoading, isEmpty, tab, opacity]);

  return (
    <View>
      {/* Twitter/X-style tab-bar: текстовые табы без подложки, с accent-underline
          под активным. Compact и «игровой» — как stream/feed selector. По
          фидбэку user 2026-05-16: «попробуй другой дизайн переключателя,
          может убрать». Заменил segmented-control с shadow + bg-canvas
          на underline-tabs. */}
      <View className="mx-4 flex-row gap-6 border-b border-hairline">
        <TabUnderline
          label="Меня выбрали"
          count={activeAssigned.length}
          selected={tab === "assigned"}
          onPress={() => setTab("assigned")}
        />
        <TabUnderline
          label="Я откликнулся"
          selected={tab === "responded"}
          onPress={() => setTab("responded")}
        />
      </View>

      {/* Content */}
      {isLoading ? (
        // Skeleton-rows вместо ActivityIndicator (UI_PATTERNS §3.7). Идут
        // edge-to-edge, как реальные OrderRow.
        <View>
          <OrderRowsSkeleton count={3} />
        </View>
      ) : isEmpty ? (
        <EmptyTabState tab={tab} accentColor={accentColor} />
      ) : (
        // Карточки — full-bleed, от левого до правого края экрана.
        // Padding pх внутри самого OrderRow (px-5).
        <Animated.View style={{ opacity }} className="mt-3">
          {tab === "assigned" ? (
            <>
              {/* Активные (open/in_progress) — всегда видны */}
              {activeAssigned.map((o) => (
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
                  variant="assigned"
                  showResponsesCount={false}
                  budgetKind={o.budget_kind}
                  budgetValue={o.budget_value}
                  onPress={() => router.push(`/(tabs)/orders/${o.id}` as never)}
                />
              ))}

              {/* Архив (completed/cancelled/expired) — collapsible.
                  Secondary action, не должен отвлекать от активных заявок.
                  По фидбэку user 2026-05-16: «менее заметная кнопка». Убран
                  border + bg + py-3 — теперь footer-link стиль (text-mute
                  caption + маленький chevron), inline по центру. */}
              {archivedAssigned.length > 0 ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      archiveOpen ? "Скрыть завершённые" : "Показать завершённые"
                    }
                    onPress={() => setArchiveOpen((v) => !v)}
                    className="mt-4 mb-1 flex-row items-center justify-center gap-1.5 px-4 py-2 active:opacity-50"
                  >
                    <AppText weight="medium" className="text-caption text-mute">
                      Завершённые · {archivedAssigned.length}
                    </AppText>
                    {archiveOpen ? (
                      <CaretUp size={12} weight="bold" color={muteColor} />
                    ) : (
                      <CaretDown size={12} weight="bold" color={muteColor} />
                    )}
                  </Pressable>
                  {archiveOpen ? (
                    <View className="mt-3">
                      {archivedAssigned.map((o) => (
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
                          variant="assigned"
                          showResponsesCount={false}
                          budgetKind={o.budget_kind}
                          budgetValue={o.budget_value}
                          onPress={() =>
                            router.push(`/(tabs)/orders/${o.id}` as never)
                          }
                        />
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            activeResponses.map((r) => (
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
                budgetKind={r.order.budget_kind}
                budgetValue={r.order.budget_value}
                onPress={() => router.push(`/(tabs)/orders/${r.order.id}` as never)}
              />
            ))
          )}
        </Animated.View>
      )}
    </View>
  );
}

// ============================================================================
// EmptyTabState — hero-иллюстрация (UI_PATTERNS §3.5 + §3.8) для empty-таба.
// Разный tint и иконка для assigned/responded.
// ============================================================================

function EmptyTabState({ tab, accentColor }: { tab: LocalTab; accentColor: string }) {
  const isAssigned = tab === "assigned";
  return (
    <View className="mt-6 items-center px-2">
      <View
        className={`h-28 w-28 items-center justify-center rounded-2xl relative overflow-hidden ${
          isAssigned ? "bg-badge-emerald" : "bg-badge-amber"
        }`}
      >
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
          {isAssigned ? (
            <CheckCircle size={26} weight="bold" color={accentColor} />
          ) : (
            <ChatCenteredText size={26} weight="bold" color={accentColor} />
          )}
        </View>
      </View>

      <AppText weight="bold" className="mt-5 text-center text-title-md text-ink">
        {isAssigned ? "Вас пока не выбрали" : "Откликов пока нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-sm text-mute">
        {isAssigned
          ? "Заявки, где клиент выбрал именно вас, появятся здесь."
          : "Найдите интересную заявку через поиск и отправьте отклик."}
      </AppText>
    </View>
  );
}

function TabUnderline({
  label,
  count = 0,
  selected,
  onPress,
}: {
  label: string;
  /** Если 0 или не передан — badge не рендерится. */
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-row items-center gap-2 pb-3 pt-2 active:opacity-60"
      style={
        selected
          ? {
              borderBottomWidth: 2,
              borderBottomColor: "rgb(var(--ink))",
              marginBottom: -1, // overlap родительского border-b 1px чтобы accent был flush
            }
          : undefined
      }
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-body-md ${selected ? "text-ink" : "text-mute"}`}
      >
        {label}
      </AppText>
      {count > 0 ? (
        // Notification-style badge: красный (error-токен) как iOS unread badge.
        <View
          className="h-4 min-w-4 items-center justify-center rounded-full bg-error px-1"
          style={selected ? undefined : { opacity: 0.55 }}
        >
          <AppText
            weight="semibold"
            className="text-white"
            style={{ fontSize: 10, lineHeight: 12 }}
          >
            {count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
