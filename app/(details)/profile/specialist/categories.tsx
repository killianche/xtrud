/**
 * /profile/specialist/categories — чем занимаетесь: до пяти категорий,
 * список по разделам с поиском, галочки-кружки. Сохранение — «Готово».
 */

import { useRouter } from "expo-router";
import { Check } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, InsetGroup, SearchField } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useCategoriesL1 } from "@/features/categories/use-categories-l1";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useSetMasterCategories } from "@/features/master-categories/use-set-categories";
import { useInvalidateSpecialistCounts } from "@/features/specialist/use-specialist";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const MAX = 5;

export default function SpecialistCategoriesScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["ink", "accent", "on-accent", "hairline-strong"]);
  const mine = useMyMasterCategories(userId);
  const l1 = useCategoriesL1();
  const categories = useVisibleCategories();
  const setCategories = useSetMasterCategories();
  const invalidate = useInvalidateSpecialistCounts();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[] | null>(null);
  useEffect(() => {
    if (selected === null && mine.data) setSelected(mine.data.map((c) => c.l2_id));
  }, [mine.data, selected]);
  const chosen = selected ?? [];

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byL1 = new Map<string, Array<{ id: string; name: string; icon: string | null }>>();
    for (const c of categories.data ?? []) {
      if (q && !c.name_ru.toLowerCase().includes(q)) continue;
      const rows = byL1.get(c.l1_id) ?? [];
      rows.push({ id: c.id, name: c.name_ru, icon: c.icon });
      byL1.set(c.l1_id, rows);
    }
    const ordered = (l1.data ?? []).filter((s) => byL1.has(s.id));
    return ordered.map((s) => ({ id: s.id, title: s.name_ru, rows: byL1.get(s.id) ?? [] }));
  }, [categories.data, l1.data, query]);

  const toggle = (id: string) => {
    hapticSelection();
    setSelected((prev) => {
      const cur = prev ?? [];
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX) return cur;
      return [...cur, id];
    });
  };

  // Уйти с несохранёнными правками можно только осознанно (QA).
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges:
      selected !== null &&
      [...chosen].sort().join() !==
        (mine.data ?? [])
          .map((c) => c.l2_id)
          .sort()
          .join(),
    isBusy: setCategories.isPending,
  });
  const save = () => {
    if (!userId) return;
    setCategories.mutate(
      { userId, l2Ids: chosen },
      {
        onSuccess: () => {
          invalidate(userId);
          allowLeave();
          router.back();
        },
      },
    );
  };

  return (
    <FormScreen
      title="Чем занимаетесь?"
      subtitle={`До ${MAX} категорий. Клиенты находят вас по ним.`}
      onBack={() => router.back()}
      primaryLabel={chosen.length > 0 ? `Готово · ${chosen.length}` : "Готово"}
      onPrimary={save}
      primaryDisabled={selected === null}
      busy={setCategories.isPending}
      error={setCategories.error ? "Не удалось сохранить. Попробуйте ещё раз." : null}
    >
      <View className="mb-5 px-4">
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Например, электрик или уборка"
          showCancel={false}
        />
      </View>
      {sections.map((s) => (
        <InsetGroup key={s.id} title={s.title}>
          {s.rows.map((c, i) => {
            const Icon = getCategoryIcon(c.icon);
            const on = chosen.includes(c.id);
            const blocked = !on && chosen.length >= MAX;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: blocked }}
                accessibilityLabel={c.name}
                onPress={() => toggle(c.id)}
                disabled={blocked}
                className={`flex-row items-center pl-4 active:bg-canvas-soft ${on ? "bg-accent-soft" : ""}`}
                style={{ opacity: blocked ? 0.45 : 1 }}
              >
                <View
                  className={`mr-3 h-9 w-9 items-center justify-center rounded-lg ${on ? "bg-accent" : "bg-canvas-soft"}`}
                >
                  <Icon size={18} weight="bold" color={on ? tc["on-accent"] : tc.ink} />
                </View>
                <View
                  className={`min-h-14 flex-1 flex-row items-center py-3 pr-4 ${i === s.rows.length - 1 ? "" : "border-b border-hairline"}`}
                >
                  <AppText
                    weight={on ? "semibold" : "regular"}
                    className="flex-1 text-ios-body text-ink"
                  >
                    {c.name}
                  </AppText>
                  <SystemIcon
                    sf={on ? "checkmark.circle.fill" : "circle"}
                    fallback={Check}
                    size={24}
                    weight="regular"
                    color={on ? tc.accent : tc["hairline-strong"]}
                  />
                </View>
              </Pressable>
            );
          })}
        </InsetGroup>
      ))}
    </FormScreen>
  );
}
