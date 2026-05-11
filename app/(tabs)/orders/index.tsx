import { useRouter } from "expo-router";
import { ClipboardList, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyOrders } from "@/features/orders/use-my-orders";

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const activeRole = user?.active_role ?? "client";

  // Sprint 5.2: client view (свои заказы).
  // Sprint 5.3: master view (feed) — переключение по activeRole.
  if (activeRole === "master") {
    return (
      <View
        className="flex-1 bg-canvas px-6"
        style={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom }}
      >
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Заявки
        </AppText>
        <AppText className="mt-2 text-body-md text-muted">
          Лента заявок мастеру — sprint 5.3 (следующий коммит).
        </AppText>
      </View>
    );
  }

  return (
    <ClientOrdersView userId={userId} onCreatePress={() => router.push("/(tabs)/orders/new")} />
  );
}

interface ClientOrdersViewProps {
  userId: string | undefined;
  onCreatePress: () => void;
}

function ClientOrdersView({ userId, onCreatePress }: ClientOrdersViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: orders, isLoading, error, refetch } = useMyOrders(userId);

  const hasOrders = (orders?.length ?? 0) > 0;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 100,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6">
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Мои заказы
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">
            Опубликуйте заявку — мастера откликнутся в течение часа.
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
                cityName={o.city?.name ?? o.city_id}
                district={o.district}
                urgency={o.urgency}
                responsesCount={o.responses_count}
                createdAt={o.created_at}
                onPress={() => router.push(`/(tabs)/orders/${o.id}` as never)}
              />
            ))}
          </View>
        )}

        {!isLoading && !error && !hasOrders && (
          <View className="mt-12 items-center rounded-lg bg-surface-2 px-6 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-3">
              <ClipboardList size={24} strokeWidth={1.75} color="#71717a" />
            </View>
            <AppText weight="semibold" className="mt-4 text-title-md text-ink">
              Заказов пока нет
            </AppText>
            <AppText className="mt-2 text-center text-body-sm text-muted">
              Создайте первую заявку — это бесплатно.
            </AppText>
          </View>
        )}
      </ScrollView>

      {/* FAB-style "Создать заказ" */}
      <Pressable
        accessibilityRole="button"
        onPress={onCreatePress}
        className="absolute right-6 bottom-6 h-14 flex-row items-center gap-2 rounded-pill bg-primary px-5 active:opacity-80"
        style={{ marginBottom: insets.bottom + 12 }}
      >
        <Plus size={20} strokeWidth={2.25} color="#ffffff" />
        <AppText weight="semibold" className="text-button text-on-primary">
          Создать заказ
        </AppText>
      </Pressable>
    </View>
  );
}
