/**
 * /admin/uncategorized — «Без категории» в приложении для админа и
 * управляющего (№286, docs/STAFF_ROLES_2026-10.md): назначить категорию с
 * телефона, не открывая веб-админку. На каждое задание — подсказка
 * нейросети с «Принять» в одно касание и «Выбрать категорию» (экран
 * /admin/assign-category). Сюда ведёт уведомление «Новое задание без
 * категории». Право проверяет база (`is_staff_session()`).
 */

import { useRouter } from "expo-router";
import { Sparkle } from "phosphor-react-native";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useStaffRole,
  useStaffSetOrderCategory,
  useStaffUncategorized,
} from "@/features/staff/use-staff";
import { showAlert } from "@/lib/alert";
import { confirmAsync } from "@/lib/confirm";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticSuccess } from "@/lib/haptics";
import { formatOrderPlace } from "@/lib/location-config";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function StaffUncategorizedScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const role = useStaffRole(session?.user?.id);
  const list = useStaffUncategorized(!!role);
  const setCategory = useStaffSetOrderCategory();
  const tc = useThemeColors(["accent", "mute"]);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  const accept = async (orderId: string, title: string, l2Id: string, l2Name: string) => {
    const ok = await confirmAsync({
      title: `«${l2Name}»?`,
      message: `Задание «${title}» перейдёт в эту категорию, её специалисты получат уведомление.`,
      confirmText: "Назначить",
      cancelText: "Отмена",
    });
    if (!ok) return;
    setCategory.mutate(
      { orderId, l2Id, reason: "Подсказка нейросети (приложение)" },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) =>
          showAlert("Не удалось назначить", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  const rows = list.data ?? [];
  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Без категории" onBack={goBack} />
      {role === undefined ? (
        <ActivityIndicator className="mt-8" color={tc.mute} />
      ) : role === null ? (
        <AppText className="px-6 pt-6 text-ios-body text-mute">
          Раздел только для администраторов и управляющих.
        </AppText>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          refreshControl={
            <RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} />
          }
        >
          {list.isLoading ? (
            <ActivityIndicator className="mt-8" color={tc.mute} />
          ) : list.error ? (
            <View className="items-center gap-3 pt-8">
              <AppText className="text-center text-ios-body text-mute">
                Не удалось загрузить. Проверьте связь.
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => void list.refetch()}
                className="min-h-11 justify-center px-4 active:opacity-60"
              >
                <AppText className="text-ios-body text-accent">Повторить</AppText>
              </Pressable>
            </View>
          ) : rows.length === 0 ? (
            <AppText className="pt-8 text-center text-ios-body text-mute">
              Заданий без категории нет.
            </AppText>
          ) : (
            rows.map(({ order: o, suggestion: s }) => {
              const suggested = s?.suggested_l2 && s.status !== "pending" ? s : null;
              const suggestedId = suggested?.suggested_l2 ?? null;
              const suggestedName = suggested?.l2_name ?? suggestedId ?? "";
              return (
                <View key={o.id} className="gap-3 rounded-2xl bg-surface-card p-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityHint="Открывает задание"
                    onPress={() => router.push(`/orders/${o.id}` as never)}
                    className="active:opacity-70"
                  >
                    <AppText weight="semibold" className="text-ios-body text-ink">
                      {o.title}
                    </AppText>
                    <AppText className="mt-0.5 text-ios-subheadline text-mute">
                      {formatOrderPlace(o.city_name, o.district, o.village) || "Вся Ингушетия"}
                    </AppText>
                  </Pressable>
                  {suggestedId ? (
                    <View className="flex-row items-center gap-2">
                      <Sparkle size={16} weight="fill" color={tc.accent} />
                      <AppText className="flex-1 text-ios-subheadline text-body">
                        Нейросеть: {suggestedName}
                        {suggested?.confidence != null
                          ? ` · ${Math.round(suggested.confidence * 100)}%`
                          : ""}
                      </AppText>
                    </View>
                  ) : s?.status === "pending" ? (
                    <AppText className="text-ios-subheadline text-mute">
                      Нейросеть ещё смотрит задание…
                    </AppText>
                  ) : null}
                  <View className="flex-row flex-wrap gap-2">
                    {suggestedId ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Назначить «${suggestedName}»`}
                        disabled={setCategory.isPending}
                        onPress={() => void accept(o.id, o.title, suggestedId, suggestedName)}
                        className="min-h-11 grow items-center justify-center rounded-full bg-accent px-4 active:opacity-85"
                      >
                        <AppText weight="semibold" className="text-ios-body text-on-accent">
                          Принять
                        </AppText>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        router.push({
                          pathname: "/admin/assign-category",
                          params: { orderId: o.id, title: o.title },
                        } as never)
                      }
                      className="min-h-11 grow items-center justify-center rounded-full bg-canvas-soft px-4 active:opacity-70"
                    >
                      <AppText weight="semibold" className="text-ios-body text-ink">
                        Выбрать категорию
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}
