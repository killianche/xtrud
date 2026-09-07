/**
 * /orders/respond?orderId= — отклик на задание в системной шторке (formSheet).
 * Отклик отделён от самого задания (DECISION владельца 2026-09-07): задание
 * читают, отклик — пишут в своей карточке со своим заголовком и «закрыть».
 */

import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { XCircle } from "phosphor-react-native";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui/Skeleton";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { RespondSheet } from "@/features/orders/RespondSheet";
import { useOrderDetail } from "@/features/orders/use-order-detail";
import { useMyResponseForOrder } from "@/features/orders/use-order-responses";
import { useThemeColors } from "@/lib/use-theme-color";

// Параметры шторки — константа модуля (переоткрытие при рендере).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.92, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

export default function RespondRoute() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const id = typeof orderId === "string" ? orderId : undefined;
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const order = useOrderDetail(id);
  const mine = useMyResponseForOrder(id, userId);
  const tc = useThemeColors(["mute"]);

  if (!userId) return <Redirect href="/(auth)/phone" />;
  const close = () => router.back();
  const o = order.data;
  const resendId = mine.data?.status === "withdrawn" ? mine.data.id : undefined;

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <KeyboardAvoidingView
        className="flex-1 bg-surface-page"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ paddingTop: insets.top }}
      >
        <View className="flex-row items-start gap-3 px-4 pt-4 pb-2">
          <View className="min-w-0 flex-1 pt-0.5">
            <AppText weight="bold" className="text-ios-title1 text-ink" numberOfLines={1}>
              Отклик
            </AppText>
            {o ? (
              <AppText className="mt-0.5 text-ios-subheadline text-mute" numberOfLines={1}>
                {o.title}
              </AppText>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={close}
            hitSlop={10}
            className="h-8 w-8 items-center justify-center active:opacity-60"
          >
            <SystemIcon
              sf="xmark.circle.fill"
              fallback={XCircle}
              size={30}
              weight="regular"
              hierarchical
              color={tc.mute}
            />
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          {!id || (!order.isLoading && !o) ? (
            <View className="px-5 pt-6">
              <AppText className="text-ios-body text-mute">Задание не найдено.</AppText>
            </View>
          ) : order.isLoading || !o || mine.isLoading ? (
            <View className="mx-4 gap-3">
              <Skeleton height={60} className="rounded-2xl" />
              <Skeleton height={44} className="rounded-2xl" />
              <Skeleton height={60} className="rounded-2xl" />
            </View>
          ) : (
            <RespondSheet
              orderId={o.id}
              masterId={userId}
              l2Id={o.l2_id}
              budgetKind={o.budget_kind}
              budgetValue={o.budget_value}
              resendResponseId={resendId}
              onDone={close}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
