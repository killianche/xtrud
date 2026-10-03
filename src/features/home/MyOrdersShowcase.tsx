/**
 * «Ваши задания» на Главной — над «Актуальными заданиями».
 *
 * Владелец, 2026-10-03: «если у человека выложено своё задание — пускай
 * показываются его задания, чтобы сразу мог на них прийти, посмотреть отклики».
 * Показываем до трёх открытых заданий человека той же карточкой, что в «Мои
 * задания», с откликами и пометкой «N новых». Нет своих открытых заданий
 * (или гость) — блока нет вовсе: пустой блок на Главной был бы лишним.
 */

import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderRow } from "@/components/OrderRow";
import { useMyOrders } from "@/features/orders/use-my-orders";
import { useNewResponsesByOrder } from "@/features/orders/use-unread-responses";

const MAX_ITEMS = 3;

export function MyOrdersShowcase({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const { data: orders } = useMyOrders(userId);
  const { data: newByOrder } = useNewResponsesByOrder(userId);
  const open = useMemo(
    () => (orders ?? []).filter((o) => o.status === "open").slice(0, MAX_ITEMS),
    [orders],
  );
  if (!userId || open.length === 0) return null;

  return (
    <View className="mt-10">
      <View className="flex-row items-end justify-between px-4">
        <AppText accessibilityRole="header" weight="bold" className="text-display-sm text-ink">
          Ваши задания
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Все ваши задания"
          hitSlop={12}
          onPress={() => router.navigate("/(tabs)/orders" as never)}
        >
          <AppText weight="semibold" className="text-body-md text-accent">
            Все
          </AppText>
        </Pressable>
      </View>
      <View className="mt-4">
        {open.map((o) => (
          <OrderRow
            key={o.id}
            id={o.id}
            title={o.title}
            description={o.description}
            categoryName={o.l2?.name_ru ?? o.l2_id}
            categoryIcon={o.l2?.icon ?? null}
            categoryL2Id={o.l2_id}
            cityName={o.city?.name ?? o.city_id ?? null}
            district={o.district}
            urgency={o.urgency}
            preferredDate={o.preferred_date}
            responsesCount={o.responses_count}
            showResponsesCount
            newResponsesCount={newByOrder?.get(o.id) ?? 0}
            createdAt={o.created_at}
            budgetKind={o.budget_kind}
            budgetValue={o.budget_value}
            coverUrl={o.photo_urls?.[0] ?? null}
            photosCount={o.photo_urls?.length ?? 0}
            onPress={() => router.push(`/orders/${o.id}` as never)}
          />
        ))}
      </View>
    </View>
  );
}
