import { useRouter } from "expo-router";
import { ClipboardList, Plus } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { SafetyBanner } from "@/components/SafetyBanner";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMasterFeed } from "@/features/orders/use-master-feed";
import { useMyOrders } from "@/features/orders/use-my-orders";

export default function OrdersScreen() {
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const activeRole = user?.active_role ?? "client";

  if (activeRole === "master") {
    return <MasterFeedView userId={userId} />;
  }
  return <ClientOrdersView userId={userId} />;
}

// ----------------------------------------------------------------------------
// Client view: список собственных заказов + FAB "Создать заказ"
// ----------------------------------------------------------------------------

interface ClientOrdersViewProps {
  userId: string | undefined;
}

function ClientOrdersView({ userId }: ClientOrdersViewProps) {
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

      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/(tabs)/orders/new")}
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

// ----------------------------------------------------------------------------
// Master view: лента заявок матчащихся под master_categories
// ----------------------------------------------------------------------------

interface MasterFeedViewProps {
  userId: string | undefined;
}

function MasterFeedView({ userId }: MasterFeedViewProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: myCats, isLoading: catsLoading } = useMyMasterCategories(userId);
  const l2Ids = myCats?.map((c) => c.l2_id) ?? [];
  const { data: feed, isLoading: feedLoading, error, refetch } = useMasterFeed({ userId, l2Ids });

  const hasCategories = l2Ids.length > 0;
  const isLoading = catsLoading || (hasCategories && feedLoading);
  const hasFeed = (feed?.length ?? 0) > 0;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View className="px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Заявки
        </AppText>
        <AppText className="mt-2 text-body-md text-muted">
          Новые объявления в ваших категориях. Отправьте отклик, если подходит.
        </AppText>
      </View>

      <View className="mt-6 px-6">
        <SafetyBanner />
      </View>

      {isLoading && (
        <View className="mt-8 items-center px-6">
          <ActivityIndicator />
        </View>
      )}

      {!catsLoading && !hasCategories && (
        <View className="mt-6 px-6">
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push("/(onboarding)/master-categories")}
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
              <Plus size={20} strokeWidth={2} color="#ffffff" />
            </View>
          </Pressable>
        </View>
      )}

      {hasCategories && error && (
        <View className="mt-6 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить ленту. {error.message}
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

      {!isLoading && hasCategories && !error && hasFeed && (
        <View className="mt-6 gap-3 px-6">
          {feed?.map((o) => (
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

      {!isLoading && hasCategories && !error && !hasFeed && (
        <View className="mt-12 items-center rounded-lg bg-surface-2 mx-6 px-6 py-10">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-3">
            <ClipboardList size={24} strokeWidth={1.75} color="#71717a" />
          </View>
          <AppText weight="semibold" className="mt-4 text-title-md text-ink">
            Пока нет заявок
          </AppText>
          <AppText className="mt-2 text-center text-body-sm text-muted">
            Новые заявки в ваших категориях появятся здесь.
          </AppText>
        </View>
      )}
    </ScrollView>
  );
}
