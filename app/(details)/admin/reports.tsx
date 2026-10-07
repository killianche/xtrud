/**
 * /admin/reports — жалобы для админа и управляющего (№286,
 * docs/STAFF_ROLES_2026-10.md). Те же функции базы, что у веб-админки
 * (admin_list_reports, admin_resolve_report, санкции): каждое решение
 * с причиной и в журнале admin_actions. Право проверяет база
 * (`is_staff_session()`).
 *
 * Раньше экран менял таблицы напрямую (без причины и журнала) и показывал
 * голый идентификатор предмета — решать по номеру нельзя.
 */

import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { REASON_LABELS } from "@/features/reports/use-create-report";
import {
  type StaffReport,
  type StaffReportAction,
  useStaffReportAction,
  useStaffReports,
  useStaffRole,
} from "@/features/staff/use-staff";
import { chooseAsync, showAlert } from "@/lib/alert";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticSuccess } from "@/lib/haptics";
import { promptAsync } from "@/lib/prompt";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

const FILTERS: { key: StaffReport["status"] | null; label: string }[] = [
  { key: "pending", label: "Ждут разбора" },
  { key: "resolved", label: "Решены" },
  { key: "dismissed", label: "Отклонены" },
  { key: null, label: "Все" },
];

const TARGET_LABEL: Record<StaffReport["target_type"], string> = {
  user: "Пользователь",
  order: "Задание",
  review: "Отзыв",
  message: "Сообщение",
};

const STATUS_LABEL: Record<StaffReport["status"], string> = {
  pending: "Ждёт разбора",
  reviewed: "Рассмотрена",
  resolved: "Решена",
  dismissed: "Отклонена",
};

type ActionId = StaffReportAction["kind"];

const ACTION_TEXT: Record<ActionId, string> = {
  dismiss: "Отклонить жалобу",
  resolve: "Закрыть как решённую",
  warn: "Предупредить",
  suspend: "Приостановить аккаунт",
  ban: "Заблокировать аккаунт",
  hide_order: "Скрыть задание",
  hide_review: "Скрыть отзыв",
};

function ReportCard({ item, onPress }: { item: StaffReport; onPress: () => void }) {
  const created = new Date(item.created_at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const pending = item.status === "pending";
  const reason = REASON_LABELS[item.reason as keyof typeof REASON_LABELS] ?? item.reason;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={pending ? "Открывает действия по жалобе" : undefined}
      disabled={!pending}
      onPress={onPress}
      className="gap-1.5 rounded-2xl bg-surface-card p-4 active:opacity-80"
    >
      <View className="flex-row items-start justify-between gap-3">
        <AppText weight="semibold" className="flex-1 text-ios-body text-ink">
          {reason}
        </AppText>
        <AppText className="text-ios-footnote text-mute">{created}</AppText>
      </View>
      <AppText className="text-ios-subheadline text-body" numberOfLines={3}>
        {TARGET_LABEL[item.target_type]}
        {item.target_label ? `: ${item.target_label}` : ""}
      </AppText>
      {item.description ? (
        <AppText className="text-ios-subheadline text-mute" numberOfLines={4}>
          «{item.description}»
        </AppText>
      ) : null}
      <AppText className="text-ios-footnote text-mute">
        {item.reporter_label ? `От: ${item.reporter_label}` : "Автор неизвестен"}
        {item.reports_on_target > 1 ? ` · жалоб на это: ${item.reports_on_target}` : ""}
      </AppText>
      {!pending ? (
        <AppText weight="semibold" className="text-ios-footnote text-mute">
          {STATUS_LABEL[item.status]}
        </AppText>
      ) : null}
    </Pressable>
  );
}

export default function StaffReportsScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuthSession();
  const role = useStaffRole(session?.user?.id);
  const [filter, setFilter] = useState<StaffReport["status"] | null>("pending");
  const reports = useStaffReports(filter, !!role);
  const act = useStaffReportAction();
  const tc = useThemeColors(["mute"]);
  const goBack = useSafeBack("/admin" as const);

  const handle = async (r: StaffReport) => {
    if (act.isPending) return;
    const ids: ActionId[] = ["dismiss"];
    if (r.target_user_id) ids.push("warn", "suspend", "ban");
    if (r.target_type === "order") ids.push("hide_order");
    if (r.target_type === "review") ids.push("hide_review");
    ids.push("resolve");
    const choice = await chooseAsync<ActionId>({
      title: "Решение по жалобе",
      message: r.target_label ?? undefined,
      options: ids.map((id) => ({
        id,
        text: ACTION_TEXT[id],
        destructive: id === "ban" || id === "suspend" || id.startsWith("hide_"),
      })),
    });
    if (!choice) return;
    const reason = await promptAsync({
      title: ACTION_TEXT[choice],
      message: "Причина попадёт в журнал управления.",
      confirmText: "Готово",
    });
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) showAlert("Нужна причина", "Напишите хотя бы пару слов.");
      return;
    }
    act.mutate(
      { report: r, action: { kind: choice } as StaffReportAction, reason: reason.trim() },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) => showAlert("Не получилось", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  const rows = reports.data ?? [];
  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Жалобы" onBack={goBack} />
      {role === undefined ? (
        <ActivityIndicator className="mt-8" color={tc.mute} />
      ) : role === null ? (
        <AppText className="px-6 pt-6 text-ios-body text-mute">
          Раздел только для администраторов и управляющих.
        </AppText>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="grow-0">
            <View className="flex-row gap-2 px-4 pt-2 pb-3">
              {FILTERS.map((f) => {
                const selected = filter === f.key;
                return (
                  <Pressable
                    key={f.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(f.key)}
                    className={`min-h-11 justify-center rounded-full px-4 active:opacity-70 ${
                      selected ? "bg-accent" : "bg-surface-card"
                    }`}
                  >
                    <AppText
                      weight="semibold"
                      className={`text-ios-subheadline ${selected ? "text-on-accent" : "text-ink"}`}
                    >
                      {f.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <ScrollView
            contentContainerStyle={{
              padding: 16,
              paddingTop: 4,
              gap: 12,
              paddingBottom: insets.bottom + 24,
            }}
            refreshControl={
              <RefreshControl
                refreshing={reports.isRefetching}
                onRefresh={() => void reports.refetch()}
              />
            }
          >
            {reports.isLoading ? (
              <ActivityIndicator className="mt-8" color={tc.mute} />
            ) : reports.error ? (
              <View className="items-center gap-3 pt-8">
                <AppText className="text-center text-ios-body text-mute">
                  Не удалось загрузить. Проверьте связь.
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void reports.refetch()}
                  className="min-h-11 justify-center px-4 active:opacity-60"
                >
                  <AppText className="text-ios-body text-accent">Повторить</AppText>
                </Pressable>
              </View>
            ) : rows.length === 0 ? (
              <AppText className="pt-8 text-center text-ios-body text-mute">
                {filter === "pending" ? "Новых жалоб нет." : "Здесь пусто."}
              </AppText>
            ) : (
              rows.map((r) => <ReportCard key={r.id} item={r} onPress={() => void handle(r)} />)
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}
