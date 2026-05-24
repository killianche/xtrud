/**
 * /(tabs)/orders — «Мои заказы» клиента.
 *
 * 2 таба (2026-05-21, ORDER_LIFECYCLE_CLIENT_PLAN.md §6):
 *   - Активные   — open
 *   - История    — cancelled, expired (+ legacy: completed, disputed,
 *                  in_progress, awaiting_confirmation, closed)
 *
 * Переименование «Открытые/Архив» → «Активные/История» (план §6): «архив»
 * звучит как «спрятано навсегда», тогда как это обычная лента прошлых заказов,
 * по которым ещё можно посмотреть отклики, удалить или открыть заново.
 *
 * Why. Без accept-flow заказ из open идёт только в cancelled/expired.
 * Остальные статусы недостижимы в новом UI, но могут существовать в БД
 * для legacy-заказов — складываем их в «Историю».
 *
 * Master приходящий по прямому URL → редирект на главную (фидбэк 2026-05-15:
 * /orders убран из мастер-таббара, мастерские заявки на dashboard).
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowClockwise,
  ClipboardText,
  ClockCounterClockwise,
  Plus,
  WarningCircle,
} from "phosphor-react-native";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyOrders, type OrderWithRefs } from "@/features/orders/use-my-orders";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import type { IconComponent } from "@/types/icon";
import { useThemeColors } from "@/lib/use-theme-color";

type OrderTab = "active" | "done";

// Открытые — только open. В новой classified-ads модели заказ не идёт в
// in_progress/awaiting_confirmation (нет accept-flow), а disputed недостижим.
const ACTIVE_STATUSES = new Set<string>(["open"]);
// Архив — cancelled / expired + любой legacy-статус (in_progress / completed
// / awaiting_confirmation / disputed / closed остались в БД).
const DONE_STATUSES = new Set<string>([
  "cancelled",
  "expired",
  "completed",
  "in_progress",
  "awaiting_confirmation",
  "disputed",
  "closed",
]);

export default function OrdersScreen() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const activeRole = user?.active_role ?? "client";

  if (activeRole === "master") {
    return <Redirect href="/(tabs)" />;
  }
  return <ClientOrdersView userId={userId} />;
}

interface ClientOrdersViewProps {
  userId: string | undefined;
}

function ClientOrdersView({ userId }: ClientOrdersViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useMyOrders(userId);
  const refresh = usePullToRefresh();

  // Выбранный таб хранится в URL-параметре (?tab=active|done), а НЕ в локальном
  // useState. Почему: раздел заказов — это стопка экранов (Stack). Когда клиент
  // открывает заказ из «Истории» и жмёт «назад», экран списка может пересоздаться
  // и локальный state сбросился бы на «Активные» (баг, фидбэк 2026-05-21).
  // URL-параметр живёт в навигационном состоянии и переживает возврат с детали —
  // вкладка восстанавливается сама. Дефолт (нет параметра) — «Активные».
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: OrderTab = params.tab === "done" ? "done" : "active";
  const setTab = (next: OrderTab) => router.setParams({ tab: next });

  const { activeOrders, doneOrders } = useMemo(() => {
    const list = orders ?? [];
    return {
      activeOrders: list.filter((o) => ACTIVE_STATUSES.has(o.status as string)),
      doneOrders: list.filter((o) => DONE_STATUSES.has(o.status as string)),
    };
  }, [orders]);

  // Tap-on-active-tab → scroll to top.
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Мои заказы"
        rightAction={{
          label: "Создать",
          Icon: Plus,
          onPress: () => router.push("/(tabs)/orders/new" as never),
        }}
      />

      <TabsBar
        tab={tab}
        onChange={setTab}
        activeCount={activeOrders.length}
        doneCount={doneOrders.length}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        {/* Loading — скелетоны по форме OrderRow, не голый спиннер (§5). */}
        {isLoading && <OrderRowsSkeleton count={5} />}

        {error && <OrdersErrorState message={error.message} onRetry={() => refetch()} />}

        {tab === "active" && !isLoading && !error && (
          <OrdersList
            orders={activeOrders}
            empty={
              <EmptyState
                icon={ClipboardText}
                title="Активных заказов нет"
                hint="Опишите задачу — мастера откликнутся в течение часа."
                ctaLabel="Разместить заказ"
                onCta={() => router.push("/(tabs)/orders/new" as never)}
              />
            }
            onPress={(id) => router.push(`/(tabs)/orders/${id}` as never)}
          />
        )}

        {tab === "done" && !isLoading && !error && (
          <OrdersList
            orders={doneOrders}
            empty={
              <EmptyState
                icon={ClockCounterClockwise}
                title="В истории пока пусто"
                hint="Сюда переедут заказы, которые вы закрыли или которые истекли."
              />
            }
            onPress={(id) => router.push(`/(tabs)/orders/${id}` as never)}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ============================================================================
// TabsBar — segmented control. Активный таб подчёркнут ink-линией.
// ============================================================================

interface TabsBarProps {
  tab: OrderTab;
  onChange: (next: OrderTab) => void;
  activeCount: number;
  doneCount: number;
}

function TabsBar({ tab, onChange, activeCount, doneCount }: TabsBarProps) {
  // Sprint 2026-05-20: убран таб «Черновики» — клиент публикует заказ сразу,
  // без сохранения промежуточного состояния. Закрыть/удалить заказ — на
  // detail-экране /orders/[id].
  // Sprint 2026-05-21: «Открытые/Архив» → «Активные/История» (план §6).
  const items: Array<{ id: OrderTab; label: string; count: number }> = [
    { id: "active", label: "Активные", count: activeCount },
    { id: "done", label: "История", count: doneCount },
  ];

  return (
    <View className="flex-row border-b border-hairline px-2">
      {items.map((it) => {
        const isActive = it.id === tab;
        return (
          <Pressable
            key={it.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(it.id)}
            className="flex-1 items-center justify-center pt-3 active:opacity-70"
          >
            {/* Label + count в одном блоке — underline ровно под этим блоком,
                а не во всю ширину таба (Linear-стиль segmented control). */}
            <View className="items-center">
              <View className="flex-row items-center gap-1.5 pb-2.5">
                <AppText
                  weight={isActive ? "semibold" : "medium"}
                  className={`text-body-md ${isActive ? "text-ink" : "text-mute"}`}
                >
                  {it.label}
                </AppText>
                {it.count > 0 ? (
                  <View
                    className={`min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 ${
                      isActive ? "bg-ink" : "bg-surface-2"
                    }`}
                  >
                    <AppText
                      weight="mono"
                      className={`text-mono-caption ${isActive ? "text-on-primary" : "text-mute"}`}
                    >
                      {it.count}
                    </AppText>
                  </View>
                ) : null}
              </View>
              {/* Underline точно под label-блоком (full width блока). */}
              <View
                className={`h-0.5 w-full rounded-full ${isActive ? "bg-ink" : "bg-transparent"}`}
              />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ============================================================================
// OrdersList — общий компонент для активных и завершённых.
// ============================================================================

interface OrdersListProps {
  orders: OrderWithRefs[];
  empty: React.ReactNode;
  onPress: (id: string) => void;
}

function OrdersList({ orders, empty, onPress }: OrdersListProps) {
  if (orders.length === 0) return <>{empty}</>;
  return (
    <View className="mt-4">
      {orders.map((o) => (
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
          coverUrl={o.photo_urls?.[0] ?? null}
          photosCount={o.photo_urls?.length ?? 0}
          onPress={() => onPress(o.id)}
        />
      ))}
    </View>
  );
}

// DraftsSection и formatRelative удалены 2026-05-20 — таб «Черновики» убран.
// Авто-сохранение в форме создания заказа (orders/new.tsx) продолжает работать
// через useOrderDraftStore, просто отдельный UI для просмотра drafts больше
// не нужен.

// ============================================================================
// EmptyState — пустое состояние для табов «Активные» / «История».
//
// Паттерн (Lazyweb: Farfetch / Adidas Confirmed / Alibaba / Cava): иконка-
// иллюстрация в мягком круге + короткий заголовок + одна поясняющая строка +
// опц. один primary CTA. Никогда не «голый текст по центру».
//
// hint под title здесь — часть empty-паттерна (разрешено правилами §G /
// design-enforcement, в отличие от subtitle под H1 на экранах).
// ============================================================================

interface EmptyStateProps {
  icon: IconComponent;
  title: string;
  hint: string;
  ctaLabel?: string;
  onCta?: () => void;
}

function EmptyState({ icon: Icon, title, hint, ctaLabel, onCta }: EmptyStateProps) {
  const tc = useThemeColors(["mute"]);
  return (
    <View className="mt-20 items-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-2">
        <Icon size={30} weight="bold" color={tc.mute} />
      </View>
      <AppText weight="bold" className="mt-5 text-center text-title-lg text-ink">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-muted" style={{ lineHeight: 22 }}>
        {hint}
      </AppText>
      {ctaLabel && onCta ? (
        <Pressable
          accessibilityRole="button"
          onPress={onCta}
          className="mt-6 h-11 flex-row items-center justify-center gap-2 rounded-md bg-primary px-5 active:opacity-80"
        >
          <Plus size={18} weight="bold" color="rgb(var(--on-primary))" />
          <AppText weight="semibold" className="text-button text-on-primary">
            {ctaLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// ============================================================================
// OrdersErrorState — ошибка загрузки списка заказов.
// Иконка + понятный текст + кнопка «Повторить» (§5 error-state).
// ============================================================================

function OrdersErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tc = useThemeColors(["mute", "ink"]);
  return (
    <View className="mt-20 items-center px-10">
      <View className="h-16 w-16 items-center justify-center rounded-full bg-surface-2">
        <WarningCircle size={30} weight="bold" color={tc.mute} />
      </View>
      <AppText weight="bold" className="mt-5 text-center text-title-lg text-ink">
        Не удалось загрузить
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-muted" style={{ lineHeight: 22 }}>
        {message}
      </AppText>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="mt-6 h-11 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas px-5 active:bg-canvas-soft"
      >
        <ArrowClockwise size={18} weight="bold" color={tc.ink} />
        <AppText weight="semibold" className="text-button text-ink">
          Повторить
        </AppText>
      </Pressable>
    </View>
  );
}
