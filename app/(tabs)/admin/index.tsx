/**
 * Admin dashboard — минимальная модерация внутри Expo app (Sprint I.5).
 *
 * Точка входа: «Админ» в профиле (видна только если users.is_admin=true).
 *
 * Что умеет:
 *  - Список жалоб (по статусу, default pending)
 *  - Open report → меню действий:
 *      * dismiss (пометить как «отклонено»)
 *      * resolved + suspend (если жалоба на user)
 *      * resolved + hide review (если жалоба на review)
 *      * resolved + cancel order (если жалоба на order) — TBD
 *  - Видимо только админу (RLS отсекает не-админов, list = []).
 */

import { useRouter } from "expo-router";
import { AlertTriangle, ChevronLeft, ShieldCheck, X } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import {
  type ReportWithReporter,
  useReportsQueue,
  useUpdateReport,
  useUpdateReviewStatus,
  useUpdateUserStatus,
} from "@/features/admin/use-admin";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { REASON_LABELS } from "@/features/reports/use-create-report";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

const STATUS_FILTERS = [
  { key: "pending" as const, label: "На рассмотрении" },
  { key: "reviewed" as const, label: "В работе" },
  { key: "resolved" as const, label: "Решены" },
  { key: "dismissed" as const, label: "Отклонены" },
  { key: "all" as const, label: "Все" },
];

function ReportCard({
  item,
  onAction,
}: {
  item: ReportWithReporter;
  onAction: (item: ReportWithReporter) => void;
}) {
  const reporterName =
    [item.reporter?.first_name, item.reporter?.last_name].filter(Boolean).join(" ") || "Аноним";
  const created = new Date(item.created_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onAction(item)}
      className="rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <View className="rounded-pill bg-error-soft px-2 py-1">
            <AppText weight="medium" className="text-caption-xs text-error">
              {REASON_LABELS[item.reason]}
            </AppText>
          </View>
          <View className="rounded-pill bg-surface-2 px-2 py-1">
            <AppText weight="medium" className="text-caption-xs text-body">
              {item.target_type}
            </AppText>
          </View>
        </View>
        <AppText className="text-caption-xs text-muted-soft">{created}</AppText>
      </View>

      <AppText weight="semibold" className="mt-2 text-body-md text-ink" numberOfLines={2}>
        От {reporterName}
      </AppText>

      {item.description && (
        <AppText className="mt-1 text-caption text-muted" numberOfLines={3}>
          {item.description}
        </AppText>
      )}

      <AppText className="mt-2 text-caption-xs text-muted-soft">
        target_id: {item.target_id.slice(0, 8)}…
      </AppText>

      {item.status !== "pending" && (
        <View className="mt-2 flex-row items-center gap-1">
          <ShieldCheck size={12} strokeWidth={1.75} color="#10b981" />
          <AppText weight="medium" className="text-caption-xs text-success">
            {item.status}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

export default function AdminScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const isAdmin = (user as { is_admin?: boolean } | null)?.is_admin === true;

  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["key"]>(
    "pending",
  );
  const reports = useReportsQueue(statusFilter);
  const updateReport = useUpdateReport();
  const updateUser = useUpdateUserStatus();
  const updateReview = useUpdateReviewStatus();
  const tc = useThemeColors(["ink", "muted-soft", "error"]);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  if (user && !isAdmin) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top }}
      >
        <EmptyState
          icon={AlertTriangle}
          title="Доступ запрещён"
          hint="Эта страница только для админов."
        />
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="mt-4 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
        >
          <AppText weight="medium" className="text-caption text-ink">
            Назад
          </AppText>
        </Pressable>
      </View>
    );
  }

  const handleAction = (item: ReportWithReporter) => {
    if (!userId) return;
    Alert.alert(
      "Действие по жалобе",
      `Причина: ${REASON_LABELS[item.reason]}\nТип: ${item.target_type}\nID: ${item.target_id}`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Отклонить (dismiss)",
          onPress: () => {
            updateReport.mutate({
              reportId: item.id,
              status: "dismissed",
              reviewerId: userId,
            });
          },
        },
        ...(item.target_type === "user"
          ? [
              {
                text: "Suspend юзер + resolve",
                style: "destructive" as const,
                onPress: () => {
                  updateUser.mutate({ userId: item.target_id, status: "suspended" });
                  updateReport.mutate({
                    reportId: item.id,
                    status: "resolved",
                    reviewerId: userId,
                    adminNote: "Пользователь приостановлен",
                  });
                },
              },
            ]
          : []),
        ...(item.target_type === "review"
          ? [
              {
                text: "Скрыть отзыв + resolve",
                style: "destructive" as const,
                onPress: () => {
                  updateReview.mutate({ reviewId: item.target_id, status: "hidden" });
                  updateReport.mutate({
                    reportId: item.id,
                    status: "resolved",
                    reviewerId: userId,
                    adminNote: "Отзыв скрыт",
                  });
                },
              },
            ]
          : []),
      ],
    );
  };

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
        <AppText weight="bold" className="flex-1 text-title-lg text-ink">
          Модерация
        </AppText>
      </View>

      {/* Фильтры по статусу */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 px-6 pb-3">
          {STATUS_FILTERS.map((f) => {
            const selected = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setStatusFilter(f.key)}
                className={`h-9 items-center justify-center rounded-pill px-3 active:opacity-70 ${
                  selected ? "bg-primary" : "bg-surface-2"
                }`}
              >
                <AppText
                  weight="medium"
                  className={`text-caption ${selected ? "text-on-primary" : "text-body"}`}
                >
                  {f.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {reports.isLoading && (
        <View className="mt-8 items-center">
          <ActivityIndicator />
        </View>
      )}

      {reports.error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить. {reports.error.message}
          </AppText>
        </View>
      )}

      {reports.data && reports.data.length === 0 && !reports.isLoading && (
        <View className="flex-1 items-center justify-center">
          <EmptyState
            icon={X}
            title="Пусто"
            hint={`Нет жалоб в статусе «${STATUS_FILTERS.find((s) => s.key === statusFilter)?.label}».`}
          />
        </View>
      )}

      {reports.data && reports.data.length > 0 && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-3 px-6 pt-2 pb-4">
            {reports.data.map((item) => (
              <ReportCard key={item.id} item={item} onAction={handleAction} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
