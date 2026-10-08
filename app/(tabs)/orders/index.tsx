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
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import {
  Archive,
  ArrowClockwise,
  CaretDown,
  CaretUp,
  ChatCenteredText,
  ClipboardText,
  MagnifyingGlass,
  PaperPlaneTilt,
  Plus,
  SignIn,
  WarningCircle,
} from "phosphor-react-native";
import type { RefObject } from "react";
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  Button,
  FAB_LIST_SPACE,
  FloatingActionButton,
  LargeTitleBar,
  SegmentedControl,
  useLargeTitle,
} from "@/components/ui";
import { SegmentPager } from "@/components/ui/SegmentPager";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useMarkOrderEventsRead,
  useUnreadOrderEventsCount,
} from "@/features/notifications/use-notifications";
import {
  buildOrderSections,
  buildResponseList,
  type OrderListSectionItem,
} from "@/features/orders/order-list-sections";
import { type OrderWithRefs, useMyOrders } from "@/features/orders/use-my-orders";
import { type MyResponseWithOrder, useMyResponses } from "@/features/orders/use-my-responses";
import { useNewResponsesByOrder } from "@/features/orders/use-unread-responses";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { describeQueryError } from "@/lib/describe-query-error";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

type Segment = "orders" | "responses";

export default function OrdersScreen() {
  // Строки навигации в покое нет — стартовая высота 0, без прыжка (QA).
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
  // Открыли вкладку — события по заказам прочитаны, бейдж гаснет (как
  // бейдж на вкладке в системных приложениях).
  const unreadEventsQ = useUnreadOrderEventsCount(userId ?? undefined);
  const markEventsRead = useMarkOrderEventsRead(userId ?? undefined);
  const markEventsMutate = markEventsRead.mutate;
  const unreadEvents = unreadEventsQ.data ?? 0;
  useFocusEffect(
    useCallback(() => {
      if (unreadEvents > 0) markEventsMutate();
    }, [unreadEvents, markEventsMutate]),
  );

  const [tab, setTab] = useState<Segment | null>(null);
  useEffect(() => {
    if (tab !== null || myOrders === undefined || myResponses === undefined) return;
    setTab(myOrders.length === 0 && myResponses.length > 0 ? "responses" : "orders");
  }, [tab, myOrders, myResponses]);
  const resolved: Segment = tab ?? "orders";

  // Крупный заголовок первым, под ним сегменты — как у Apple под large
  // title (Фитнес, Здоровье). Уезжают вместе со списком; в закреплённой строке
  // остаётся компактный заголовок (DECISION владельца 2026-09-06, вечер:
  // «заголовок — в самом верху, где пустое место»).
  // Сегменты живут в закреплённой шапке под заголовком: переключение
  // мгновенное и всегда под рукой (владелец, 2026-09-07: «долго и тяжело
  // переключаются»). Крупный заголовок здесь не нужен — экран начинается с
  // выбора роли.
  const header = <View className="h-2" />;

  if (!userId) {
    // Гость: личный кабинет пуст не потому, что заданий нет, а потому что
    // входа нет (дизайн-роль, 2026-09-07: честность интерфейса).
    return (
      <View className="flex-1 bg-surface-page">
        <View className="flex-1" style={{ paddingTop: large.contentTop }}>
          <EmptyState
            icon={ClipboardText}
            title="Войдите, чтобы видеть свои задания"
            hint="Здесь будут ваши задания и предложения специалистов."
            ctaLabel="Войти"
            ctaIcon={SignIn}
            onCta={() => router.push("/(auth)/phone" as never)}
          />
        </View>
        <LargeTitleBar
          title="Мои задания"
          compactTitleOpacity={large.compactTitleOpacity}
          onLayoutHeight={large.setBarHeight}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-surface-page">
      {/* Две роли — две страницы: переключаются и сегментом, и свайпом по
          экрану (владелец, 2026-10-03). Пейджер — системный
          UIPageViewController (react-native-pager-view), а не свой жест:
          инерция и упругость — как в приложениях Apple. */}
      <SegmentPager
        page={resolved === "responses" ? 1 : 0}
        onPageChange={(index) => setTab(index === 1 ? "responses" : "orders")}
      >
        <OrdersList
          key="orders"
          userId={userId}
          contentTop={large.contentTop}
          onScroll={large.onScroll}
          header={header}
        />
        <ResponsesList
          key="responses"
          userId={userId}
          contentTop={large.contentTop}
          onScroll={large.onScroll}
          header={header}
        />
      </SegmentPager>

      <LargeTitleBar
        title="Мои задания"
        compactTitleOpacity={large.compactTitleOpacity}
        onLayoutHeight={large.setBarHeight}
        hideTitle
        alwaysCompact
        belowFloating
        below={
          <SegmentedControl<Segment>
            bare
            value={resolved}
            onChange={setTab}
            items={[
              // «Ваши задания» / «Ваши отклики», без счётчика (владелец,
              // 2026-10-03) — новое видно на карточках («N новых»).
              {
                id: "orders",
                label: "Ваши задания",
                icon: ClipboardText,
              },
              {
                id: "responses",
                label: "Ваши предложения",
                tone: "primary",
                // Отправленный отклик — самолётик, как блок «Ваш отклик» в
                // задании (владелец, 2026-10-03: «инструмент поменять»).
                icon: PaperPlaneTilt,
              },
            ]}
          />
        }
      />

      {/* Главное действие экрана — плавающая кнопка снизу справа, как «новая
          заметка» в Заметках iOS 26 (DECISION владельца 2026-09-06, вечер).
          В пустом «Как клиент» её нет: там уже стоит «Разместить задание», а
          два равнозначных призыва — дефект (design-quality §1.1, QA). */}
      {resolved === "orders" && myOrders !== undefined && myOrders.length === 0 ? null : (
        <FloatingActionButton
          label="Создать задание"
          onPress={() => router.push("/orders/new" as never)}
        />
      )}
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
  /** Крупный заголовок и сегменты — начало списка. */
  header: ReactElement;
}

/**
 * «Архив · N» — закрытые задания свёрнуты в одну тихую строку внизу списка
 * (владелец, 2026-10-08, №331: «чтобы глаза не надоедали, но легко
 * открыть»). Касание раскрывает их тут же, повторное — сворачивает: как
 * «Выполненные» в «Напоминаниях» iOS, без отдельного экрана.
 */
function ArchiveToggle({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const tc = useThemeColors(["mute"]);
  const Caret = open ? CaretUp : CaretDown;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`Архив, ${count}`}
      accessibilityHint={open ? "Скрыть закрытые задания" : "Показать закрытые задания"}
      onPress={onToggle}
      className="mx-4 mb-3 mt-4 min-h-12 flex-row items-center gap-3 rounded-2xl px-4 active:opacity-60"
    >
      <Archive size={20} weight="regular" color={tc.mute} />
      <AppText weight="semibold" className="flex-1 text-ios-body text-mute">
        Архив · {count}
      </AppText>
      <AppText className="text-ios-subheadline text-mute">{open ? "Скрыть" : "Показать"}</AppText>
      <Caret size={16} weight="bold" color={tc.mute} />
    </Pressable>
  );
}

/** Строка списка — либо заголовок секции, либо карточка. Тип элемента для
 *  FlashList.getItemType: разные формы ячеек не должны переиспользоваться
 *  друг другом при рециклинге. */
function sectionItemType<T>(item: OrderListSectionItem<T>): "archiveHeader" | "row" {
  return item.kind;
}

/** Ключ для FlashList.keyExtractor — заголовок один на список, статический id. */
function sectionItemKey<T>(item: OrderListSectionItem<T>): string {
  return item.kind === "archiveHeader" ? "archive-header" : item.id;
}

function OrdersList({ userId, contentTop, onScroll, header }: ListProps) {
  // Место под плавающую кнопку, иначе она ляжет на последнюю карточку (QA).
  const tabBarSpace = useTabBarSpace(FAB_LIST_SPACE);
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useMyOrders(userId);
  // Где новые отклики — чтобы бейдж вкладки было видно на карточке.
  const { data: newByOrder } = useNewResponsesByOrder(userId);
  const refresh = usePullToRefresh();

  const [archiveOpen, setArchiveOpen] = useState(false);
  const sections = useMemo(
    () => buildOrderSections(orders ?? [], archiveOpen),
    [orders, archiveOpen],
  );

  // Tap-on-active-tab → scroll to top (src/lib/tab-scroll-reset.ts).
  const listRef = useRef<FlashListRef<OrderListSectionItem<OrderWithRefs>>>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const hasItems = !isLoading && !error && sections.length > 0;

  return (
    <FlashList
      style={{ flex: 1 }}
      ref={listRef}
      data={hasItems ? sections : []}
      extraData={newByOrder}
      keyExtractor={sectionItemKey}
      getItemType={sectionItemType}
      contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      renderScrollComponent={Animated.ScrollView as never}
      ListHeaderComponent={header}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
      renderItem={({ item }) => {
        if (item.kind === "archiveHeader") {
          return (
            <ArchiveToggle
              count={item.count}
              open={item.open}
              onToggle={() => setArchiveOpen((v) => !v)}
            />
          );
        }
        const o = item.data;
        return (
          <OrderRow
            id={o.id}
            title={o.title}
            categoryName={o.l2?.name_ru ?? o.l2_id}
            categoryIcon={o.l2?.icon ?? null}
            categoryL2Id={o.l2_id}
            cityName={o.city?.name ?? o.city_id ?? null}
            district={o.district}
            village={o.village}
            urgency={o.urgency}
            preferredDate={o.preferred_date}
            responsesCount={o.responses_count}
            // Счётчик откликов важен, пока исполнитель не выбран.
            showResponsesCount={o.status === "open"}
            newResponsesCount={newByOrder?.get(o.id) ?? 0}
            // Тот же знак, что в общей ленте: по нему автор узнаёт своё
            // задание везде (№287).
            isMine
            createdAt={o.created_at}
            status={o.status}
            statusView={item.statusView}
            budgetKind={o.budget_kind}
            budgetValue={o.budget_value}
            coverUrl={o.photo_urls?.[0] ?? null}
            photosCount={o.photo_urls?.length ?? 0}
            onPress={() => router.push(`/orders/${o.id}` as never)}
          />
        );
      }}
      ListEmptyComponent={
        isLoading ? (
          <OrderRowsSkeleton count={4} />
        ) : error ? (
          <ErrorState message={describeQueryError(error).hint} onRetry={() => refetch()} />
        ) : (
          <EmptyState
            icon={ClipboardText}
            title="Вы ещё не выкладывали задания"
            hint="Опишите задачу — исполнители предложат цену и срок."
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
// источник — orderStatusView() (docs/ORDER_STATUS_DESIGN.md §3.4).
// ============================================================================

function ResponsesList({ userId, contentTop, onScroll, header }: ListProps) {
  // Место под плавающую кнопку, иначе она ляжет на последнюю карточку (QA).
  const tabBarSpace = useTabBarSpace(FAB_LIST_SPACE);
  const router = useRouter();
  const navigation = useNavigation();
  const refresh = usePullToRefresh();
  const { data: myResponses, isLoading, error, refetch } = useMyResponses(userId);

  const sections = useMemo(() => buildResponseList(myResponses ?? []), [myResponses]);

  // Fade-in списка после скелетона (UI_PATTERNS §3.7).

  // Tap-on-active-tab → scroll to top — как и у списка заданий.
  const listRef = useRef<FlashListRef<OrderListSectionItem<MyResponseWithOrder>>>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  const hasItems = !isLoading && !error && sections.length > 0;

  return (
    <View style={{ flex: 1 }}>
      <FlashList
        style={{ flex: 1 }}
        ref={listRef}
        data={hasItems ? sections : []}
        keyExtractor={sectionItemKey}
        getItemType={sectionItemType}
        contentContainerStyle={{ paddingTop: contentTop, paddingBottom: tabBarSpace }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        renderScrollComponent={Animated.ScrollView as never}
        ListHeaderComponent={header}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        renderItem={({ item }) => {
          // В списке предложений архива нет (buildResponseList, §0.3).
          if (item.kind === "archiveHeader") return null;
          const r = item.data;
          return (
            <OrderRow
              id={r.order.id}
              title={r.order.title}
              categoryName={r.order.l2?.name_ru ?? r.order.l2_id}
              categoryIcon={r.order.l2?.icon ?? null}
              categoryL2Id={r.order.l2_id}
              cityName={r.order.city?.name ?? r.order.city_id ?? null}
              district={r.order.district}
              village={r.order.village}
              urgency={r.order.urgency}
              preferredDate={r.order.preferred_date}
              responsesCount={r.order.responses_count}
              createdAt={r.response.created_at}
              status={r.order.status}
              variant="responded"
              showResponsesCount={false}
              budgetKind={r.order.budget_kind}
              budgetValue={r.order.budget_value}
              statusView={item.statusView}
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
            <ErrorState message={describeQueryError(error).hint} onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon={ChatCenteredText}
              title="Вы ещё никому не предлагали услуги"
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
    </View>
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
