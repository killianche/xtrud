/**
 * /orders/edit/[id] — редактирование открытого задания тем же конструктором:
 * загружаем задание, кладём его ответы в сессию редактирования и открываем
 * экран проверки, откуда каждый ответ меняется на своём шаге.
 * Доступно только автору и только пока status = 'open'.
 */

import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import { useComposerSession } from "@/features/task-composer/composer-store";
import { COMPOSER_ROUTE } from "@/features/task-composer/steps";
import { ALL_INGUSHETIA_CITY_ID } from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export default function EditOrderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : undefined;
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: order, isLoading, error } = useOrderDetail(orderId);
  const startEdit = useComposerSession((s) => s.startEdit);
  const tc = useThemeColors(["accent"]);
  const startedRef = useRef(false);

  const editable = !!order && !!userId && order.client_id === userId && order.status === "open";

  useEffect(() => {
    if (!editable || !order || startedRef.current) return;
    startedRef.current = true;
    startEdit(
      order.id,
      {
        l2Id: order.l2_id,
        title: order.title,
        description: order.description ?? "",
        cityId: order.city_id ?? (order.district ? "" : ALL_INGUSHETIA_CITY_ID),
        district: order.district ?? "",
        urgency: order.urgency,
        preferredDate: order.preferred_date ?? null,
        budgetKind: order.budget_kind,
        budgetValue: order.budget_value ?? null,
        contactPhone: order.contact_phone ?? "",
        whatsappPhone: order.whatsapp_phone ?? "",
        contactName: order.contact_name ?? "",
      },
      (order.photo_urls ?? []).map((uri, i) => ({ id: `remote-${i}`, uri, width: 0, height: 0 })),
    );
    router.replace(COMPOSER_ROUTE.review as never);
  }, [editable, order, startEdit, router]);

  if (!orderId) return <Redirect href="/(tabs)/orders" />;
  if (!isLoading && (error || (order && !editable))) {
    return <Redirect href={`/orders/${orderId}` as never} />;
  }
  return (
    <View
      className="flex-1 items-center justify-center bg-surface-page"
      style={{ paddingTop: insets.top }}
    >
      <ActivityIndicator color={tc.accent} />
      <AppText className="mt-3 text-ios-subheadline text-mute">Открываем задание…</AppText>
    </View>
  );
}
