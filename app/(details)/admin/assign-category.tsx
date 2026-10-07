/**
 * /admin/assign-category?orderId&title — выбор подкатегории для задания без
 * категории (№286, docs/STAFF_ROLES_2026-10.md). Поиск сверху, ниже —
 * подкатегории по разделам, как в каталоге. Касание → подтверждение →
 * admin_set_order_category (право проверяет база, журнал admin_actions).
 */

import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow, ScreenHeader, SearchField } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type StaffCategory,
  useStaffCategories,
  useStaffRole,
  useStaffSetOrderCategory,
} from "@/features/staff/use-staff";
import { showAlert } from "@/lib/alert";
import { confirmAsync } from "@/lib/confirm";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticSuccess } from "@/lib/haptics";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

function matches(c: StaffCategory, q: string): boolean {
  if (!q) return true;
  const hay = [c.l2_name, c.l1_name, ...(c.terms ?? [])].join(" ").toLowerCase();
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export default function StaffAssignCategoryScreen() {
  const insets = useSafeAreaInsets();
  const { orderId, title } = useLocalSearchParams<{ orderId?: string; title?: string }>();
  const { session } = useAuthSession();
  const role = useStaffRole(session?.user?.id);
  const cats = useStaffCategories(!!role);
  const setCategory = useStaffSetOrderCategory();
  const tc = useThemeColors(["mute"]);
  const goBack = useSafeBack("/admin/uncategorized" as const);
  const [query, setQuery] = useState("");

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: { id: string; name: string; rows: StaffCategory[] }[] = [];
    for (const c of cats.data ?? []) {
      if (!matches(c, q)) continue;
      const last = out[out.length - 1];
      if (last && last.id === c.l1_id) last.rows.push(c);
      else out.push({ id: c.l1_id, name: c.l1_name, rows: [c] });
    }
    return out;
  }, [cats.data, query]);

  const pick = async (c: StaffCategory) => {
    if (!orderId || setCategory.isPending) return;
    const ok = await confirmAsync({
      title: `«${c.l2_name}»?`,
      message: `Задание «${title ?? ""}» перейдёт в эту категорию, её специалисты получат уведомление.`,
      confirmText: "Назначить",
      cancelText: "Отмена",
    });
    if (!ok) return;
    setCategory.mutate(
      { orderId, l2Id: c.l2_id, reason: "Назначено в приложении" },
      {
        onSuccess: () => {
          hapticSuccess();
          goBack();
        },
        onError: (e) =>
          showAlert("Не удалось назначить", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Категория" onBack={goBack} />
      {role === undefined ? (
        <ActivityIndicator className="mt-8" color={tc.mute} />
      ) : role === null || !orderId ? (
        <AppText className="px-6 pt-6 text-ios-body text-mute">
          {role === null
            ? "Раздел только для администраторов и управляющих."
            : "Задание не найдено."}
        </AppText>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          {title ? (
            <AppText className="px-8 pb-3 text-ios-subheadline text-mute" numberOfLines={3}>
              {title}
            </AppText>
          ) : null}
          <View className="px-4 pb-4">
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder="Категория или услуга"
              showCancel={false}
            />
          </View>
          {cats.isLoading ? (
            <ActivityIndicator className="mt-8" color={tc.mute} />
          ) : cats.error ? (
            <View className="items-center gap-3 pt-8">
              <AppText className="text-center text-ios-body text-mute">
                Не удалось загрузить каталог. Проверьте связь.
              </AppText>
              <Pressable
                accessibilityRole="button"
                onPress={() => void cats.refetch()}
                className="min-h-11 justify-center px-4 active:opacity-60"
              >
                <AppText className="text-ios-body text-accent">Повторить</AppText>
              </Pressable>
            </View>
          ) : sections.length === 0 ? (
            <AppText className="px-8 pt-6 text-center text-ios-body text-mute">
              Ничего не нашлось. Новую подкатегорию можно создать в веб-админке.
            </AppText>
          ) : (
            sections.map((s) => (
              <InsetGroup key={s.id} title={s.name}>
                {s.rows.map((c, i) => (
                  <InsetRow
                    key={c.l2_id}
                    title={c.l2_name}
                    subtitle={c.is_visible ? undefined : "Скрыта из каталога"}
                    disabled={setCategory.isPending}
                    onPress={() => void pick(c)}
                    last={i === s.rows.length - 1}
                  />
                ))}
              </InsetGroup>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
