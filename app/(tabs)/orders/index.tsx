/**
 * /(tabs)/orders — «Мои задания»: всё, что человек делает в xtrud, на одном
 * экране. Деление — по роли в сделке (DECISION владельца 2026-09-04):
 *   - Как клиент — задания, которые я выложил, и сколько откликов пришло;
 *   - Как мастер — задания, на которые я откликнулся, с моей ценой, сроком
 *     и текстом, который я написал заказчику.
 *
 * Прежние ярлыки «Задания» и «Отклики» описывали объекты, а не роль, и
 * человеку приходилось догадываться, чьи это отклики — его или на его
 * задание. Роли аккаунта здесь по-прежнему нет: это два взгляда на свою же
 * работу, переключать «режим» не нужно (решение 2026-09-01 в силе).
 *
 * Редизайн 2026-09-02 (DECISION владельца по скриншоту сборки 20: «тут прям
 * полный редизайн нужен… и UX, и UI»). Что было не так: сегменты сверху и под
 * ними второй заголовок «Мои задания» с тем же словом; пустое состояние в
 * серой гамме с чёрной кнопкой; мелкий текст. Что стало: один заголовок и
 * одно главное действие экрана — создать задание (акцентная круглая кнопка,
 * `design-quality.md` §1.1 «одно главное действие»); сегменты крупные, со
 * счётчиками из данных; списки — карточки OrderRow (единый стиль всех лент);
 * пустые состояния с акцентной кнопкой.
 *
 * История: до 2026-09-01 экран выбирался по active_role, и человек видел
 * ровно половину своей жизни в приложении. Режимов больше нет.
 */

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useNavigation, useRouter } from "expo-router";
import {
  ArrowClockwise,
  ChatCenteredText,
  ClipboardText,
  MagnifyingGlass,
  Plus,
  WarningCircle,
} from "phosphor-react-native";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  type FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { Button, LargeTitleBar, LargeTitleBlock, useLargeTitle } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { type OrderWithRefs, useMyOrders } from "@/features/orders/use-my-orders";
import {
  historyResponseStatusLabel,
  isActiveResponse,
  isHistoryResponse,
  type MyResponseWithOrder,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { hapticSelection } from "@/lib/haptics";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

type Segment = "orders" | "responses";

// Открытые — только open. В classified-ads модели задание не идёт в
// in_progress/awaiting_confirmation (нет accept-flow), а disputed недостижим.
const ACTIVE_STATUSES = new Set<string>(["open"]);

export default function OrdersScreen() {
  const large = useLargeTitle();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: myOrders } = useMyOrders(userId);
  const { data: myResponses } = useMyResponses(userId);

  // Отклики показываем первыми, только если своих заданий нет вовсе: у
  // человека, который пришёл откликаться, пустой список заданий не должен
  // быть первым, что он видит. Выбор делается ОДИН раз, когда оба списка
  // загрузились, и дальше не пересчитывается — иначе фоновое обновление
  // данных (pull-to-refresh, инвалидация кэша) переключало бы сегмент под
  // рукой у пользователя (QA 2026-09-02).
  const [tab, setTab] = useState<Segment | null>(null);
  useEffect(() => {
    if (tab !== null || myOrders === undefined || myResponses === undefined) return;
    setTab(myOrders.length === 0 && myResponses.length > 0 ? "responses" : "orders");
  }, [tab, myOrders, myResponses]);
  const resolved: Segment = tab ?? "orders";

  return (
    <View className="flex-1 bg-surface-page">
      {resolved === "responses" ? (
        <ResponsesList userId={userId} contentTop={large.contentTop} onScroll={large.onScroll} />
      ) : (
        <OrdersList userId={userId} contentTop={large.contentTop} onScroll={large.onScroll} />
      )}

      {/* Шапка в стиле системных приложений iOS (DECISION владельца 2026-09-06):
          компактный заголовок и «+» в закреплённой строке, сегменты под ней. */}
      <LargeTitleBar
        title="Мои задания"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        actions={[
          {
            label: "Создать задание",
            Icon: Plus,
            iconOnly: true,
            active: true,
            onPress: () => router.push("/orders/new" as never),
          },
        ]}
        below={
          <Segments
            value={resolved}
            onChange={setTab}
            ordersCount={myOrders?.length ?? null}
            responsesCount={myResponses?.length ?? null}
          />
        }
      />
    </View>
  );
}

// ============================================================================
// Segments — «Задания N» / «Отклики N». Счётчики — из данных, пока данных
// нет — без числа (не показываем «0», которого не знаем).
// ============================================================================

function Segments({
  value,
  onChange,
  ordersCount,
  responsesCount,
}: {
  value: Segment;
  onChange: (v: Segment) => void;
  ordersCount: number | null;
  responsesCount: number | null;
}) {
  // DECISION владельца 2026-09-06: две роли — два цвета. «Как клиент» — в
  // фирменном акценте, «Как мастер» — чёрный (ink): человек с одного взгляда
  // понимает, в каком контексте он сейчас. Тот же цвет подхватывает
  // содержимое списка ниже (см. accent у OrderRow «Ваш отклик»).
  const items: Array<[Segment, string, number | null]> = [
    ["orders", "Как клиент", ordersCount],
    ["responses", "Как мастер", responsesCount],
  ];
  return (
    <View className="mx-4 mt-1 mb-2 flex-row rounded-xl bg-canvas-soft p-1">
      {items.map(([key, label, count]) => {
        const active = value === key;
        const title = count != null && count > 0 ? `${label} · ${count}` : label;
        const activeClass = key === "responses" ? "bg-primary" : "bg-accent";
        const activeText = key === "responses" ? "text-on-primary" : "text-on-accent";
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: active }}
            onPress={() => {
              hapticSelection();
              onChange(key);
            }}
            className={`min-h-12 flex-1 items-center justify-center rounded-lg ${
              active ? activeClass : ""
            }`}
          >
            <AppText
              weight="semibold"
              className={`text-body-md ${active ? activeText : "text-mute"}`}
            >
              {title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ============================================================================
// OrdersList — мои задания: открытые сверху, закрытые ниже. Статус виден
// плашкой на карточке, отдельная вкладка «История» только прятала бы список.
// ============================================================================

interface ListProps {
  userId: string | undefined;
  /** Отступ под закреплённую шапку (useLargeTitle().contentTop). */
  contentTop: number;
  /** Прокрутка — в шапку, чтобы компактный заголовок проявлялся. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

function OrdersList({ userId, contentTop, onScroll }: ListProps) {
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useMyOrders(userId);
  const refresh = usePullToRefresh();

  const allOrders = useMemo(() => {
    const list = orders ?? [];
    const open = list.filter((o) => ACTIVE_STATUSES.has(o.status as string));
    const rest = list.filter((o) => !ACTIVE_STATUSES.has(o.status as string));
    return [...open, ...rest];
  }, [orders]);

  // Tap-on-active-tab → scroll to top (src/lib/tab-scroll-reset.ts).
  const listRef = useRef<FlashListRef<OrderWithRefs>>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const hasItems = !isLoading && !error && allOrders.length > 0;

  return (
    <FlashList
      style={{ flex: 1 }}
      ref={listRef}
      data={hasItems ? allOrders : []}
      keyExtractor={(o) => o.id}
      contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      renderScrollComponent={Animated.ScrollView as never}
      ListHeaderComponent={<LargeTitleBlock title="Мои задания" />}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
      renderItem={({ item: o }) => (
        <OrderRow
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
          showResponsesCount
          createdAt={o.created_at}
          status={o.status}
          budgetKind={o.budget_kind}
          budgetValue={o.budget_value}
          coverUrl={o.photo_urls?.[0] ?? null}
          photosCount={o.photo_urls?.length ?? 0}
          onPress={() => router.push(`/orders/${o.id}` as never)}
        />
      )}
      ListEmptyComponent={
        isLoading ? (
          <OrderRowsSkeleton count={4} />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => refetch()} />
        ) : (
          <EmptyState
            icon={ClipboardText}
            title="Вы ещё не выкладывали задания"
            hint="Опишите задачу — исполнители пришлют отклики с ценой и сроком."
            ctaLabel="Разместить задание"
            ctaIcon={Plus}
            onCta={() => router.push("/orders/new" as never)}
          />
        )
      }
    />
  );
}

// ============================================================================
// ResponsesList — мои отклики: активные (задание ещё открыто) сверху по дате
// отклика, история ниже. В карточке — что я предложил (цена · срок); для
// истории — итог (Завершено / Закрыто / Истекло / Отклонён / Отозван), единый
// источник — historyResponseStatusLabel.
// ============================================================================

function ResponsesList({ userId, contentTop, onScroll }: ListProps) {
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const navigation = useNavigation();
  const refresh = usePullToRefresh();
  const { data: myResponses, isLoading, error, refetch } = useMyResponses(userId);

  const sorted = useMemo(() => {
    const items = myResponses ?? [];
    return [...items].sort((a, b) => {
      const aActive = isActiveResponse(a);
      const bActive = isActiveResponse(b);
      if (aActive !== bActive) return aActive ? -1 : 1;
      return new Date(b.response.created_at).getTime() - new Date(a.response.created_at).getTime();
    });
  }, [myResponses]);

  // Fade-in списка после скелетона (UI_PATTERNS §3.7).
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isLoading) {
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, [isLoading, opacity]);

  // Tap-on-active-tab → scroll to top — как и у списка заданий.
  const listRef = useRef<FlashListRef<MyResponseWithOrder>>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const hasItems = !isLoading && !error && sorted.length > 0;

  return (
    <Animated.View style={{ flex: 1, opacity: isLoading ? 1 : opacity }}>
      <FlashList
        style={{ flex: 1 }}
        ref={listRef}
        data={hasItems ? sorted : []}
        keyExtractor={(r: MyResponseWithOrder) => r.response.id}
        contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderScrollComponent={Animated.ScrollView as never}
        ListHeaderComponent={<LargeTitleBlock title="Мои задания" />}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        renderItem={({ item: r }) => {
          const isHistory = isHistoryResponse(r);
          return (
            <OrderRow
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
              statusOverrideLabel={isHistory ? historyResponseStatusLabel(r) : undefined}
              myResponse={{
                priceKind: r.response.price_kind,
                priceValue: r.response.price_value,
                leadTime: r.response.lead_time,
                message: r.response.message,
              }}
              onPress={() => router.push(`/orders/${r.order.id}` as never)}
            />
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <OrderRowsSkeleton count={4} />
          ) : error ? (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon={ChatCenteredText}
              title="Вы ещё никому не откликались"
              hint="Найдите подходящее задание и предложите свою цену и срок."
              ctaLabel="Найти задание"
              ctaIcon={MagnifyingGlass}
              // Переключаем таб, а не пушим экран: «Найти задание» — соседняя
              // вкладка нижнего меню, не detail-роут.
              onCta={() => navigation.navigate("find" as never)}
            />
          )
        }
      />
    </Animated.View>
  );
}

// ============================================================================
// EmptyState — иконка в мягком акцентном круге + заголовок + одна строка +
// одна акцентная кнопка. hint под заголовком — часть empty-паттерна.
// ============================================================================

function EmptyState({
  icon: Icon,
  title,
  hint,
  ctaLabel,
  ctaIcon: CtaIcon,
  onCta,
}: {
  icon: IconComponent;
  title: string;
  hint: string;
  ctaLabel: string;
  ctaIcon: IconComponent;
  onCta: () => void;
}) {
  const tc = useThemeColors(["accent", "on-accent"]);
  return (
    <View className="mt-16 items-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
        <Icon size={36} weight="bold" color={tc.accent} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        {title}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">{hint}</AppText>
      <View className="mt-8 self-stretch">
        <Button
          variant="accent"
          size="lg"
          fullWidth
          onPress={onCta}
          leftIcon={<CtaIcon size={20} weight="bold" color={tc["on-accent"]} />}
        >
          {ctaLabel}
        </Button>
      </View>
    </View>
  );
}

// ============================================================================
// ErrorState — не удалось загрузить: иконка + текст + «Повторить».
// ============================================================================

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const tc = useThemeColors(["mute", "ink"]);
  return (
    <View className="mt-16 items-center px-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-2">
        <WarningCircle size={36} weight="bold" color={tc.mute} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        Не удалось загрузить
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">{message}</AppText>
      <View className="mt-8 self-stretch">
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          onPress={onRetry}
          leftIcon={<ArrowClockwise size={20} weight="bold" color={tc.ink} />}
        >
          Повторить
        </Button>
      </View>
    </View>
  );
}
