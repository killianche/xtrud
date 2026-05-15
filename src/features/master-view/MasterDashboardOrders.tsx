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
 *   - Tab pills «Я откликнулся (N)» / «Меня выбрали (N)»
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
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  MessageSquare,
} from "lucide-react-native";
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

/** Активные отклики = клиент ещё думает или работа идёт. Архив (rejected,
 *  withdrawn, completed без accept) не показываем — он на /orders/[id]. */
function isActiveResponse(r: MyResponseWithOrder): boolean {
  const orderStatus = r.order.status;
  const respStatus = r.response.status;
  if (orderStatus === "completed" || orderStatus === "cancelled") return false;
  if (respStatus === "rejected" || respStatus === "withdrawn") return false;
  return true;
}

interface MasterDashboardOrdersProps {
  userId: string;
}

export function MasterDashboardOrders({ userId }: MasterDashboardOrdersProps) {
  const router = useRouter();
  const [tab, setTab] = useState<LocalTab>("assigned");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const inkColor = useThemeColor("ink");
  const accentColor = useThemeColor("accent");

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
      {/* Tab pills full-width — заголовок «Мои заявки» убран как избыточный
          (контекст ясен из chip-tab лейблов). По фидбэку user 2026-05-15:
          «убрать слово, переключатели на всю ширину». Каждый pill flex-1 —
          iOS segmented control pattern. */}
      <View className="flex-row gap-1 rounded-pill bg-canvas-soft-2 p-1">
        <TabPill
          label="Меня выбрали"
          // Badge — только активные (open/in_progress), без архива.
          // Завершённые «висят» в collapsible-секции ниже.
          count={activeAssigned.length}
          selected={tab === "assigned"}
          onPress={() => setTab("assigned")}
        />
        <TabPill
          label="Я откликнулся"
          count={activeResponses.length}
          selected={tab === "responded"}
          onPress={() => setTab("responded")}
        />
      </View>

      {/* Content */}
      {isLoading ? (
        // Skeleton-rows вместо ActivityIndicator (UI_PATTERNS §3.7).
        // -mx-4 чтобы skeleton строки шли от края до края, как реальные OrderRow.
        <View className="-mx-4">
          <OrderRowsSkeleton count={3} />
        </View>
      ) : isEmpty ? (
        <EmptyTabState tab={tab} accentColor={accentColor} />
      ) : (
        // Карточки — full-bleed, как в OrderRow.
        // ‼️ Берём отступ из родителя обратно (-mx-4 = compensate за px-4 на
        // MasterHomeContent), чтобы граница строки шла от края до края.
        // Внутри OrderRow свой px-5.
        <Animated.View style={{ opacity }} className="-mx-4 mt-3">
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
                  По фидбэку user 2026-05-15: «завершённые скрыть, можно
                  раскрыть посмотреть». Если активных нет, но есть архив —
                  тоже показываем кнопку. */}
              {archivedAssigned.length > 0 ? (
                <View className="mx-4 mt-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      archiveOpen ? "Скрыть завершённые" : "Показать завершённые"
                    }
                    onPress={() => setArchiveOpen((v) => !v)}
                    className="flex-row items-center justify-between rounded-md border border-hairline bg-canvas px-4 py-3 active:opacity-70"
                  >
                    <View className="flex-1">
                      <AppText weight="semibold" className="text-body-sm text-ink">
                        Завершённые заявки
                      </AppText>
                      <AppText className="mt-0.5 text-caption text-mute">
                        {archivedAssigned.length} {archivedAssigned.length === 1 ? "заявка" : "заявок"}
                      </AppText>
                    </View>
                    {archiveOpen ? (
                      <ChevronUp size={18} strokeWidth={2} color={inkColor} />
                    ) : (
                      <ChevronDown size={18} strokeWidth={2} color={inkColor} />
                    )}
                  </Pressable>
                  {archiveOpen ? (
                    <View className="-mx-4 mt-3">
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
                </View>
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
            <CheckCircle2 size={26} strokeWidth={1.75} color={accentColor} />
          ) : (
            <MessageSquare size={26} strokeWidth={1.75} color={accentColor} />
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

function TabPill({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      // flex-1 → каждый pill занимает половину ширины контейнера.
      // Высота h-12 (увеличена с h-10 — фидбек user 2026-05-15: «главное
      // должно выглядеть круто»). Активный pill — bg-canvas + чуть более
      // выраженная тень для glow-эффекта.
      className={`flex-1 h-12 flex-row items-center justify-center gap-2 rounded-pill px-4 ${
        selected ? "bg-canvas" : "active:opacity-60"
      }`}
      style={
        selected
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
            }
          : undefined
      }
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-body-sm ${selected ? "text-ink" : "text-mute"}`}
      >
        {label}
      </AppText>
      {count > 0 ? (
        <View
          className={`h-5 min-w-5 items-center justify-center rounded-full px-1.5 ${
            selected ? "bg-accent" : "bg-canvas-soft"
          }`}
        >
          <AppText
            weight="semibold"
            className={`text-caption-xs ${selected ? "text-on-primary" : "text-mute"}`}
          >
            {count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}
