import { useRouter } from "expo-router";
import { ChevronDown, ChevronUp, Plus } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMasterFeed } from "@/features/orders/use-master-feed";
import { useMyOrders } from "@/features/orders/use-my-orders";
import { useMyResponses } from "@/features/orders/use-my-responses";
import { useOrdersAssignedToMe } from "@/features/orders/use-orders-assigned-to-me";
import { useMarkFeedSeen } from "@/features/orders/use-unread-feed";
import {
  type MasterTab as MasterTabFromStore,
  useMasterOrdersTabStore,
} from "@/features/orders/master-orders-tab-store";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useThemeColor } from "@/lib/use-theme-color";

export default function OrdersScreen() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const activeRole = user?.active_role ?? "client";

  if (activeRole === "master") {
    return <MasterOrdersView userId={userId} />;
  }
  return <ClientOrdersView userId={userId} />;
}

// ----------------------------------------------------------------------------
// Client view
// ----------------------------------------------------------------------------

interface ClientOrdersViewProps {
  userId: string | undefined;
}

function ClientOrdersView({ userId }: ClientOrdersViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useMyOrders(userId);
  const hasOrders = (orders?.length ?? 0) > 0;
  const refresh = usePullToRefresh();

  // Tap-on-active-tab → scroll to top.
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter]);

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
        <View className="px-6">
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Мои заказы
          </AppText>
        </View>

        {isLoading && (
          <View className="mt-8 items-center px-6">
            <ActivityIndicator />
          </View>
        )}

        {error && (
          <View className="mt-8 px-6">
            <AppText weight="medium" className="text-caption text-error">
              Не удалось загрузить заказы. {error.message}
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => refetch()}
              className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
            >
              <AppText weight="medium" className="text-caption text-ink">
                Повторить
              </AppText>
            </Pressable>
          </View>
        )}

        {!isLoading && !error && hasOrders && (
          <View className="mt-6 gap-3 px-6">
            {orders?.map((o) => (
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
                onPress={() => router.push(`/(tabs)/orders/${o.id}` as never)}
              />
            ))}
          </View>
        )}

        {!isLoading && !error && !hasOrders && (
          <View className="mt-16 items-center px-6">
            <AppText weight="bold" className="text-title-lg text-ink text-center">
              Заказов пока нет
            </AppText>
            <AppText className="mt-2 text-center text-body-md text-muted">
              Опишите задачу — мастера откликнутся за 15–60 минут.
            </AppText>
          </View>
        )}
      </ScrollView>
      {/* FAB «Создать заказ» удалён по фидбэку user 2026-05-14: дублирует
          5-й таб («+ Создать») в TabBar — две точки входа на одной странице
          избыточны и перекрывали контент. Путь к созданию остаётся через
          таб-бар. */}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Master view — с 3 секциями (Новые / Я откликнулся / Меня выбрали)
// ----------------------------------------------------------------------------

type MasterTab = "new" | "responded" | "assigned";

interface MasterOrdersViewProps {
  userId: string | undefined;
}

function MasterOrdersView({ userId }: MasterOrdersViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Sticky tab сохраняется в Zustand при каждом setTab — back из /orders/[id]
  // вернёт на тот таб, откуда мастер ушёл. Default 'new' при первом заходе.
  const stickyTab = useMasterOrdersTabStore((s) => s.stickyTab);
  const setStickyTab = useMasterOrdersTabStore((s) => s.setStickyTab);
  const tab = stickyTab;
  const setTab = (next: MasterTabFromStore) => setStickyTab(next);

  // Sprint 13.1 — помечаем feed просмотренным при mount, чтобы tab-badge обнулился.
  const markFeedSeen = useMarkFeedSeen(userId);
  const markFeedSeenMutate = markFeedSeen.mutate;
  useEffect(() => {
    if (!userId) return;
    markFeedSeenMutate();
  }, [userId, markFeedSeenMutate]);

  const { data: myCats, isLoading: catsLoading } = useMyMasterCategories(userId);
  const l2Ids = myCats?.map((c) => c.l2_id) ?? [];

  const {
    data: feed,
    isLoading: feedLoading,
    error: feedError,
    hasNextPage: feedHasNext,
    fetchNextPage: feedFetchNext,
    isFetchingNextPage: feedFetchingNext,
  } = useMasterFeed({
    userId,
    l2Ids,
  });
  const { data: myResponses, isLoading: respLoading } = useMyResponses(userId);
  const { data: assigned, isLoading: assignedLoading } = useOrdersAssignedToMe(userId);

  const respondedOrderIds = new Set(myResponses?.map((r) => r.order.id) ?? []);

  // "Новые" = feed без тех, на что я уже откликнулся
  const feedRows = feed?.pages.flatMap((p) => p.rows) ?? [];
  const newFeed = feedRows.filter((o) => !respondedOrderIds.has(o.id));

  // Активные отклики = клиент ещё думает (sent/viewed) или работа идёт
  // (accepted + order in_progress). Остальные — архив (rejected, withdrawn,
  // completed, cancelled). Badge показывает только активные.
  const activeResponsesCount = useMemo(() => {
    if (!myResponses) return 0;
    return myResponses.filter((r) => isActiveResponse(r)).length;
  }, [myResponses]);

  const hasCategories = l2Ids.length > 0;
  const refresh = usePullToRefresh();

  // Tap-on-active-tab → scroll to top.
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter]);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      {/* Header */}
      <View className="px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Заявки
        </AppText>
      </View>

      {/* Tab pills */}
      <View className="mt-4 px-6">
        <View className="flex-row gap-1 self-start rounded-pill bg-surface-2 p-1">
          <TabPill
            label="Новые"
            count={newFeed.length}
            selected={tab === "new"}
            onPress={() => setTab("new")}
          />
          <TabPill
            label="Я откликнулся"
            count={activeResponsesCount}
            selected={tab === "responded"}
            onPress={() => setTab("responded")}
          />
          <TabPill
            label="Меня выбрали"
            count={assigned?.length ?? 0}
            selected={tab === "assigned"}
            onPress={() => setTab("assigned")}
          />
        </View>
      </View>

      {/* Tab content */}
      {tab === "new" && (
        <NewOrdersTab
          userId={userId}
          orders={newFeed}
          isLoading={catsLoading || (hasCategories && feedLoading)}
          hasCategories={hasCategories}
          error={feedError}
          hasNextPage={feedHasNext}
          isFetchingNextPage={feedFetchingNext}
          onLoadMore={() => feedFetchNext()}
          onCategoryCta={() => router.push("/(onboarding)/master-categories")}
          onOrderPress={(id) => router.push(`/(tabs)/orders/${id}` as never)}
        />
      )}

      {tab === "responded" && (
        <RespondedTab
          responses={myResponses ?? []}
          isLoading={respLoading}
          onOrderPress={(id) => router.push(`/(tabs)/orders/${id}` as never)}
        />
      )}

      {tab === "assigned" && (
        <AssignedTab
          orders={assigned ?? []}
          isLoading={assignedLoading}
          onOrderPress={(id) => router.push(`/(tabs)/orders/${id}` as never)}
        />
      )}
    </ScrollView>
  );
}

interface TabPillProps {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
}

function TabPill({ label, count, selected, onPress }: TabPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={selected}
      className={`h-9 flex-row items-center justify-center gap-1.5 rounded-pill px-3 ${
        selected ? "bg-canvas" : "active:opacity-60"
      }`}
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-caption ${selected ? "text-ink" : "text-muted"}`}
      >
        {label}
      </AppText>
      {count > 0 && (
        <View
          className={`h-5 min-w-5 items-center justify-center rounded-full px-1.5 ${
            selected ? "bg-accent" : "bg-surface-3"
          }`}
        >
          <AppText
            weight="semibold"
            className={`text-caption-xs ${selected ? "text-on-primary" : "text-muted"}`}
          >
            {count}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

// ----------------------------------------------------------------------------
// Tab content components
// ----------------------------------------------------------------------------

interface NewOrdersTabProps {
  userId: string | undefined;
  orders: {
    id: string;
    title: string;
    l2: { name_ru: string; icon: string | null } | null;
    l2_id: string;
    city: { name: string } | null;
    city_id: string | null;
    district: string | null;
    urgency: import("@/features/orders/use-create-order").OrderUrgency;
    responses_count: number;
    created_at: string;
    description?: string | null;
  }[];
  isLoading: boolean;
  hasCategories: boolean;
  error: Error | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onCategoryCta: () => void;
  onOrderPress: (id: string) => void;
}

function NewOrdersTab({
  orders,
  isLoading,
  hasCategories,
  error,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onCategoryCta,
  onOrderPress,
}: NewOrdersTabProps) {
  const onPrimaryColor = useThemeColor("on-primary");

  // 2026-05-15: search-input и chip-фильтр УБРАНЫ отсюда (фидбэк user
  // «зачем строка поиска здесь»). Этот таб — только заявки в категориях
  // мастера, без поиска. Для поиска ВСЕХ заказов сайта (включая чужие
  // категории) — отдельный экран /orders/search через кнопку в TabBar.

  if (isLoading) {
    return (
      <View className="mt-8 items-center px-6">
        <ActivityIndicator />
      </View>
    );
  }

  if (!hasCategories) {
    return (
      <View className="mt-6 px-6">
        <Pressable
          accessibilityRole="button"
          onPress={onCategoryCta}
          className="flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
        >
          <View className="flex-1">
            <AppText weight="semibold" className="text-body-md text-ink">
              Сначала добавьте категории
            </AppText>
            <AppText className="mt-1 text-body-sm text-muted">
              Без категорий заявки не появятся в ленте.
            </AppText>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-accent">
            <Plus size={20} strokeWidth={2} color={onPrimaryColor} />
          </View>
        </Pressable>
      </View>
    );
  }

  if (error) {
    return (
      <View className="mt-6 px-6">
        <AppText weight="medium" className="text-caption text-error">
          {error.message}
        </AppText>
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View className="mt-6 px-6">
        <EmptyCard
          title="Новых заявок нет"
          subtitle="Когда появятся заявки в ваших категориях — увидите их здесь."
        />
      </View>
    );
  }

  return (
    <View className="mt-6 gap-3 px-6">
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
          // Master feed показывает только status='open' (см. use-master-feed).
          status="open"
          onPress={() => onOrderPress(o.id)}
        />
      ))}

      {hasNextPage && (
        <Pressable
          accessibilityRole="button"
          disabled={isFetchingNextPage}
          onPress={onLoadMore}
          className="mt-2 h-11 flex-row items-center justify-center rounded-md border border-hairline active:opacity-70"
        >
          {isFetchingNextPage ? (
            <ActivityIndicator size="small" />
          ) : (
            <AppText weight="medium" className="text-button text-body">
              Показать ещё
            </AppText>
          )}
        </Pressable>
      )}
    </View>
  );
}

interface RespondedTabProps {
  responses: import("@/features/orders/use-my-responses").MyResponseWithOrder[];
  isLoading: boolean;
  onOrderPress: (id: string) => void;
}

/**
 * Активный отклик = клиент ещё думает (sent/viewed) ИЛИ работа идёт
 * (accepted + order.status='in_progress'). Все остальные — архив:
 * - response rejected / withdrawn (клиент отклонил или мастер отозвал)
 * - order completed / cancelled (работа закончена или отменена)
 */
export function isActiveResponse(
  r: import("@/features/orders/use-my-responses").MyResponseWithOrder,
): boolean {
  const respStatus = r.response.status;
  const orderStatus = r.order.status;
  if (orderStatus === "completed" || orderStatus === "cancelled") return false;
  if (respStatus === "rejected" || respStatus === "withdrawn") return false;
  return true;
}

function RespondedTab({ responses, isLoading, onOrderPress }: RespondedTabProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const inkColor = useThemeColor("ink");

  // Делим отклики на активные + архив (в одном проходе).
  const { active, archived } = useMemo(() => {
    const active: typeof responses = [];
    const archived: typeof responses = [];
    for (const r of responses) {
      if (isActiveResponse(r)) active.push(r);
      else archived.push(r);
    }
    return { active, archived };
  }, [responses]);

  if (isLoading) {
    return (
      <View className="mt-8 items-center px-6">
        <ActivityIndicator />
      </View>
    );
  }

  if (responses.length === 0) {
    return (
      <View className="mt-6 px-6">
        <EmptyCard
          title="Вы пока не откликались"
          subtitle="Найдите интересную заявку и отправьте отклик из вкладки «Новые»."
        />
      </View>
    );
  }

  const renderRow = (r: typeof responses[number]) => {
    const { order, response } = r;
    return (
      <OrderRow
        key={response.id}
        id={order.id}
        title={order.title}
        categoryName={order.l2?.name_ru ?? order.l2_id}
        categoryIcon={order.l2?.icon ?? null}
        categoryL2Id={order.l2_id}
        cityName={order.city?.name ?? order.city_id ?? "Вся Ингушетия"}
        district={order.district}
        urgency={order.urgency}
        responsesCount={order.responses_count}
        createdAt={response.created_at}
        status={order.status}
        onPress={() => onOrderPress(order.id)}
      />
    );
  };

  return (
    <View className="mt-6 gap-3 px-6">
      {/* Активные — всегда видны */}
      {active.length > 0 ? (
        active.map(renderRow)
      ) : archived.length > 0 ? (
        <View className="rounded-md bg-canvas-soft p-4">
          <AppText weight="medium" className="text-body-sm text-muted">
            Сейчас нет активных откликов
          </AppText>
          <AppText className="mt-1 text-caption text-muted-soft">
            Все ваши прошлые отклики — в архиве ниже.
          </AppText>
        </View>
      ) : null}

      {/* Архив — collapsible toggle */}
      {archived.length > 0 ? (
        <View className="mt-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={archiveOpen ? "Скрыть архив" : "Показать архив"}
            onPress={() => setArchiveOpen((v) => !v)}
            className="flex-row items-center justify-between rounded-md border border-hairline bg-canvas px-4 py-3 active:opacity-70"
          >
            <View>
              <AppText weight="semibold" className="text-body-sm text-ink">
                Архив откликов
              </AppText>
              <AppText className="mt-0.5 text-caption text-muted">
                Завершённые, отклонённые и отозванные · {archived.length}
              </AppText>
            </View>
            {archiveOpen ? (
              <ChevronUp size={18} strokeWidth={2} color={inkColor} />
            ) : (
              <ChevronDown size={18} strokeWidth={2} color={inkColor} />
            )}
          </Pressable>
          {archiveOpen ? <View className="mt-3 gap-3">{archived.map(renderRow)}</View> : null}
        </View>
      ) : null}
    </View>
  );
}

interface AssignedTabProps {
  orders: import("@/features/orders/use-my-orders").OrderWithRefs[];
  isLoading: boolean;
  onOrderPress: (id: string) => void;
}

function AssignedTab({ orders, isLoading, onOrderPress }: AssignedTabProps) {
  if (isLoading) {
    return (
      <View className="mt-8 items-center px-6">
        <ActivityIndicator />
      </View>
    );
  }

  if (orders.length === 0) {
    return (
      <View className="mt-6 px-6">
        <EmptyCard
          title="Вас пока не выбрали"
          subtitle="Заявки, где клиент выбрал именно вас, появятся здесь."
        />
      </View>
    );
  }

  return (
    <View className="mt-6 gap-3 px-6">
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
          onPress={() => onOrderPress(o.id)}
        />
      ))}
    </View>
  );
}

interface EmptyCardProps {
  title: string;
  subtitle: string;
}

function EmptyCard({ title, subtitle }: EmptyCardProps) {
  return (
    <View className="items-center px-6 py-10">
      <AppText weight="bold" className="text-title-lg text-ink text-center">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-muted">{subtitle}</AppText>
    </View>
  );
}
