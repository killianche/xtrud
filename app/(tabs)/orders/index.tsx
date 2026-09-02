/**
 * /(tabs)/orders — «Мои задания». Корень одноимённого таба для ОБЕИХ ролей,
 * содержимое разное:
 *   - Задания → ClientOrdersView: свои задания одним списком, открытые сверху.
 *   - Мастер → MasterOrdersView: свои отклики (единый список, было
 *     /orders/my-responses).
 *
 * История (2026-08-30, редизайн главной + нижней навигации). Раньше этот
 * роут был мёртвым для мастера — просто редиректил на главную (фидбэк
 * 2026-05-15: «/orders убран из мастер-таббара, мастерские заявки на
 * dashboard»), а бейдж непрочитанного на этом мёртвом табе висел зря. Теперь
 * «Мои задания» — настоящий 3-й/4-й таб обеих ролей, редирект убран, контент
 * /orders/my-responses перенесён сюда как корень (без back-кнопки, с
 * pull-to-refresh, которого там не было). Сам detail-роут
 * /orders/my-responses удалён — входов на него больше нет.
 *
 * Клиентская часть — 2 таба (2026-05-21, ORDER_LIFECYCLE_CLIENT_PLAN.md §6):
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
 */

import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useNavigation, useRouter } from "expo-router";
import {
  ArrowClockwise,
  ArrowRight,
  ChatCenteredText,
  ClipboardText,
  Plus,
  WarningCircle,
} from "phosphor-react-native";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, type FlatList, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { OrderRowsSkeleton } from "@/components/OrderRowsSkeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { type OrderWithRefs, useMyOrders } from "@/features/orders/use-my-orders";
import {
  historyResponseStatusLabel,
  isActiveResponse,
  isHistoryResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

// Открытые — только open. В новой classified-ads модели заказ не идёт в
// in_progress/awaiting_confirmation (нет accept-flow), а disputed недостижим.
const ACTIVE_STATUSES = new Set<string>(["open"]);

export default function OrdersScreen() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  // Раньше экран выбирался по active_role, и человек видел ровно половину
  // своей жизни в приложении: выложивший задание не видел своих откликов, и
  // наоборот. Переключиться можно было только сменой режима.
  //
  // Режимов больше нет (DECISION владельца 2026-09-01), поэтому оба списка
  // живут на одном экране и переключаются сегментами. Это навигация внутри
  // экрана, а не вопрос «кто вы сейчас».
  //
  // Отклики показываем первыми, только если своих заданий нет вовсе: у
  // человека, который пришёл откликаться, пустой список заданий не должен
  // быть первым, что он видит.
  const { data: myOrders } = useMyOrders(userId);
  const [tab, setTab] = useState<"orders" | "responses" | null>(null);
  const resolved = tab ?? (myOrders && myOrders.length === 0 ? "responses" : "orders");

  return (
    <>
      <OrdersSegments value={resolved} onChange={setTab} />
      {resolved === "responses" ? (
        <MasterOrdersView userId={userId} />
      ) : (
        <ClientOrdersView userId={userId} />
      )}
    </>
  );
}

/** Сегменты «Мои задания» / «Мои отклики». */
function OrdersSegments({
  value,
  onChange,
}: {
  value: "orders" | "responses";
  onChange: (v: "orders" | "responses") => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="bg-canvas px-5 pb-2" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row gap-1 rounded-lg bg-canvas-soft p-1">
        {(
          [
            ["orders", "Мои задания"],
            ["responses", "Мои отклики"],
          ] as const
        ).map(([key, label]) => {
          const active = value === key;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
              onPress={() => onChange(key)}
              className={`min-h-11 flex-1 items-center justify-center rounded-md ${
                active ? "bg-canvas" : ""
              }`}
            >
              <AppText
                weight={active ? "semibold" : "medium"}
                className={`text-body-sm ${active ? "text-ink" : "text-mute"}`}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  // Один список вместо вкладок «Активные / История» (DECISION владельца
  // 2026-09-02: «просто мои задания и отклики»). Открытые — сверху, закрытые
  // и истёкшие — ниже: статус и так виден плашкой на каждой карточке, отдельная
  // вкладка ради него только прятала половину списка. Список откликов мастера
  // пришёл к тому же ещё 2026-05-28.
  const allOrders = useMemo(() => {
    const list = orders ?? [];
    const open = list.filter((o) => ACTIVE_STATUSES.has(o.status as string));
    const rest = list.filter((o) => !ACTIVE_STATUSES.has(o.status as string));
    return [...open, ...rest];
  }, [orders]);

  // Tap-on-active-tab → scroll to top. scrollViewToTop поддерживает
  // FlatList/FlashList-рефы через scrollToOffset — см. src/lib/tab-scroll-reset.ts.
  const listRef = useRef<FlashListRef<OrderWithRefs>>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) {
      scrollViewToTop(listRef as unknown as RefObject<FlatList | null>);
    }
  }, [resetCounter]);

  // Список текущего таба — виртуализуется через FlashList (личная история
  // заказов растёт со временем, порог ≤15 для plain ScrollView из
  // docs/IOS_FOUNDATION.md §6.1 не гарантирован).
  const hasItems = !isLoading && !error && allOrders.length > 0;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader
        title="Мои задания"
        rightAction={{
          label: "Создать",
          Icon: Plus,
          onPress: () => router.push("/orders/new" as never),
        }}
      />

      <FlashList
        style={{ flex: 1 }}
        ref={listRef}
        data={hasItems ? allOrders : []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        // Реальные строки начинаются с отступа mt-4 (16px) — как раньше у
        // OrdersList. Skeleton/ошибка/empty несут собственный отступ и в
        // этом спейсере не нуждаются.
        ListHeaderComponent={hasItems ? <View style={{ height: 16 }} /> : null}
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
            // Loading — скелетоны по форме OrderRow, не голый спиннер (§5).
            <OrderRowsSkeleton count={5} />
          ) : error ? (
            <OrdersErrorState message={error.message} onRetry={() => refetch()} />
          ) : (
            <EmptyState
              icon={ClipboardText}
              title="Заданий пока нет"
              hint="Опишите задачу — и исполнители пришлют отклики с ценой и сроком."
              ctaLabel="Разместить задание"
              onCta={() => router.push("/orders/new" as never)}
            />
          )
        }
      />
    </View>
  );
}

// ============================================================================
// MasterOrdersView — «Мои задания» мастера: единый список ВСЕХ его откликов
// (активные + история), отсортированный по дате отклика (newest first).
// Перенесено сюда из /orders/my-responses (2026-08-30) как корень таба:
// без back-кнопки (это таб, не detail-экран) и с pull-to-refresh, которого
// на отдельном экране не было.
//
// Единый список без заголовков-секций — по фидбэку владельца 2026-05-28:
// «Убери активные/историю, просто сделай список по дате отклика». Для
// history-откликов вместо «Вы откликнулись» показывается статус-override
// (Завершён / Заказ закрыли / Истёк / Отклонён) — historyResponseStatusLabel,
// единый источник истины в use-my-responses.ts.
// ============================================================================

interface MasterOrdersViewProps {
  userId: string | undefined;
}

function MasterOrdersView({ userId }: MasterOrdersViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const accentColor = useThemeColor("accent");
  const onPrimary = useThemeColor("on-primary");
  const refresh = usePullToRefresh();

  const { data: myResponses, isLoading } = useMyResponses(userId);
  // Сортировка: сначала все активные (заказ ещё открыт) по дате отклика DESC,
  // ниже все завершённые/отклонённые (история) тоже по дате отклика DESC.
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
      <ScreenHeader title="Мои задания" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={refresh.control}
      >
        {isLoading ? (
          <OrderRowsSkeleton count={5} />
        ) : (
          <Animated.View style={{ opacity }} className="pt-2">
            {sortedResponses.length === 0 ? (
              <EmptyActiveState
                accentColor={accentColor}
                onPrimary={onPrimary}
                // Переключаем таб, а не пушим новый экран — «Найти задание»
                // это соседний таб мастера (/find), не detail-роут.
                onFindOrders={() => navigation.navigate("find" as never)}
              />
            ) : (
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
                    onPress={() => router.push(`/orders/${r.order.id}` as never)}
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
// EmptyActiveState — hero-иллюстрация + CTA «Найти задание».
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
        className="mt-5 min-h-11 flex-row items-center gap-2 rounded-pill bg-primary px-5 active:opacity-80"
      >
        <AppText weight="semibold" className="text-button text-on-primary">
          Найти задание
        </AppText>
        <ArrowRight size={16} weight="bold" color={onPrimary} />
      </Pressable>
    </View>
  );
}

// ============================================================================
// EmptyState — пустое состояние списка заданий.
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
          className="mt-6 min-h-11 flex-row items-center justify-center gap-2 rounded-md bg-primary px-5 active:opacity-80"
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
        className="mt-6 min-h-11 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas px-5 active:bg-canvas-soft"
      >
        <ArrowClockwise size={18} weight="bold" color={tc.ink} />
        <AppText weight="semibold" className="text-button text-ink">
          Повторить
        </AppText>
      </Pressable>
    </View>
  );
}
