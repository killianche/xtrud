import { Redirect, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyOrders } from "@/features/orders/use-my-orders";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

// /orders = «Мои заказы» только для клиента. У мастера эта страница убрана
// (фидбэк user 2026-05-15): таб «Заявки» вырезан из TabBar, содержимое
// «Я откликнулся / Меня выбрали» переехало на главную мастера в
// MasterDashboardOrders. Если мастер всё-таки приходит сюда по прямому URL
// (например, со старой закладки или с десктопа) — редиректим на главную.

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
  const hasOrders = (orders?.length ?? 0) > 0;
  const refresh = usePullToRefresh();

  // Tap-on-active-tab → scroll to top.
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("orders");
  useEffect(() => {
    if (resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Мои заказы" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
      >
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
          <View className="mt-6">
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
                budgetKind={o.budget_kind}
                budgetValue={o.budget_value}
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
              Опишите задачу — мастера откликнутся.
            </AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
