/**
 * /profile/services-suggest — добавление услуг из шаблона.
 *
 * Why. Раньше мастер вбивал каждую услугу руками: название, цену, единицу,
 * категорию. Долго, скучно, ошибки в названиях («Унитаз поставить» вместо
 * стандартного «Установка унитаза»). Фидбэк user 2026-05-15: «чтобы были
 * подсказки, ремонт унитаза и т.д. — как у больших компаний».
 *
 * Pattern (Treatwell/Booksy/TaskRabbit): мастер выбирает категорию → видит
 * чеклист типовых L3-услуг с дефолтной ценой (взято из categories_l3.avg_check_rub
 * с разбросом ±30%, мастер может скорректировать inline). Тап → услуга в
 * прайсе.
 *
 * Параметры:
 *   ?l2=<id>  — какую L2-категорию открыть сразу. Если нет — chip-row из
 *               my-categories для выбора.
 */

import { useLocalSearchParams } from "expo-router";
import { Check } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type CategoryL3,
  useCategoriesL3ByL2,
} from "@/features/categories/use-categories-l3-by-l2";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useUpsertMasterService } from "@/features/master-services/use-master-services";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { CaretLeft } from "phosphor-react-native";

/** Дефолтная цена услуги — 70% от avg_check_rub. Мастер скорректирует
 *  под себя; placeholder задаёт «правильный» порядок цены и не нулится. */
function suggestedPrice(l3: CategoryL3): number | null {
  if (l3.avg_check_rub == null) return null;
  return Math.max(100, Math.round(l3.avg_check_rub * 0.7));
}

type SelectionState = Map<string, { priceMin: number | null }>;

export default function ServicesSuggestScreen() {
  const insets = useSafeAreaInsets();
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent"]);

  const params = useLocalSearchParams<{ l2?: string }>();
  const initialL2 = typeof params.l2 === "string" ? params.l2 : null;

  const myCats = useMyMasterCategories(userId ?? undefined);
  // Активная L2 — из ?l2= или первая из my-cats.
  const [activeL2, setActiveL2] = useState<string | null>(initialL2);
  const resolvedL2 =
    activeL2 ?? (myCats.data && myCats.data[0]?.l2_id) ?? null;

  const l3s = useCategoriesL3ByL2(resolvedL2);
  const upsert = useUpsertMasterService(userId);

  const [selection, setSelection] = useState<SelectionState>(new Map());
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Кастомная услуга — inline форма «Своя услуга». Раньше user должен был
  // уйти на /profile/edit-master → прайс. Фидбэк user 2026-05-15: «дай
  // возможность добавлять собственное прямо тут». Маленький title+цена
  // input + кнопка → upsert. После успеха — очистить + toast.
  const [customTitle, setCustomTitle] = useState("");
  const [customPriceMin, setCustomPriceMin] = useState("");
  const [customSaving, setCustomSaving] = useState(false);
  const [customSavedTitle, setCustomSavedTitle] = useState<string | null>(null);

  const colorUrl = getCategoryColorIconUrl(resolvedL2);

  const selectedCount = selection.size;
  const items = useMemo(() => l3s.data ?? [], [l3s.data]);

  const toggle = (l3: CategoryL3) => {
    setSelection((prev) => {
      const next = new Map(prev);
      if (next.has(l3.id)) {
        next.delete(l3.id);
      } else {
        next.set(l3.id, { priceMin: suggestedPrice(l3) });
      }
      return next;
    });
  };

  const updatePrice = (l3Id: string, raw: string) => {
    const clean = raw.replace(/[^\d]/g, "");
    const num = clean === "" ? null : Number(clean);
    setSelection((prev) => {
      const next = new Map(prev);
      const existing = next.get(l3Id);
      if (!existing) return next;
      next.set(l3Id, { priceMin: num });
      return next;
    });
  };

  const handleAddCustom = async () => {
    if (!userId || !resolvedL2) return;
    const title = customTitle.trim();
    if (title.length < 2) return;
    const priceClean = customPriceMin.replace(/[^\d]/g, "");
    const price = priceClean === "" ? null : Number(priceClean);
    setCustomSaving(true);
    setErrorMsg(null);
    try {
      await upsert.mutateAsync({
        title,
        price_min: price,
        price_max: null,
        unit: "per_task",
        pricing_kind: price == null ? "quote" : "fixed",
        l2_id: resolvedL2,
        l3_id: null,
      });
      // Очистка + эфемерный feedback (отображаем title последней успешно
      // добавленной услуги в небольшом success-блоке).
      setCustomSavedTitle(title);
      setCustomTitle("");
      setCustomPriceMin("");
      setTimeout(() => setCustomSavedTitle(null), 2500);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCustomSaving(false);
    }
  };

  const handleSave = async () => {
    if (!userId || !resolvedL2 || selectedCount === 0) return;
    setSaving(true);
    setErrorMsg(null);
    const failed: string[] = [];
    for (const [l3Id, conf] of selection.entries()) {
      const l3 = items.find((x) => x.id === l3Id);
      if (!l3) continue;
      try {
        await upsert.mutateAsync({
          title: l3.name_ru,
          price_min: conf.priceMin,
          price_max: null,
          unit: "per_task",
          pricing_kind: "fixed",
          l2_id: resolvedL2,
          l3_id: l3.id,
        });
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    setSaving(false);
    if (failed.length > 0) {
      setErrorMsg(
        `Добавлено ${selectedCount - failed.length} из ${selectedCount}. Ошибок: ${failed.length}.`,
      );
    } else {
      // Успех — возвращаемся назад. Профиль refetch'нется через
      // invalidateQueries в useUpsertMasterService.
      goBack();
    }
  };

  if (!userId) {
    return (
      <View
        className="flex-1 bg-canvas items-center justify-center px-6"
        style={{ paddingTop: insets.top + 24 }}
      >
        <AppText className="text-body-md text-mute">Войдите в аккаунт.</AppText>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-3 py-2"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={22} weight="bold" color={tc.ink} />
        </Pressable>
        <AppText weight="semibold" className="flex-1 text-body-md text-ink text-center">
          Добавить услуги
        </AppText>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 120,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mt-2">
          <AppText weight="bold" className="text-display-sm text-ink">
            Что вы делаете?
          </AppText>
          <AppText className="mt-1 text-body-sm text-mute">
            Отметьте услуги, которые предлагаете. Цены — наша рекомендация по
            рынку, можете скорректировать.
          </AppText>
        </View>

        {/* L2 selector — chip-row из my-categories, если их больше одной */}
        {myCats.data && myCats.data.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
            className="mt-4"
          >
            {myCats.data.map((c) => {
              const sel = c.l2_id === resolvedL2;
              return (
                <Pressable
                  key={c.l2_id}
                  accessibilityRole="button"
                  onPress={() => {
                    setActiveL2(c.l2_id);
                    setSelection(new Map());
                  }}
                  className={`h-10 px-4 items-center justify-center rounded-full ${
                    sel ? "bg-ink" : "bg-canvas border border-hairline"
                  }`}
                >
                  <AppText
                    weight={sel ? "semibold" : "medium"}
                    className={`text-body-sm ${sel ? "text-on-primary" : "text-ink"}`}
                  >
                    {c.l2?.name_ru ?? c.l2_id}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {/* L3 checklist */}
        <View className="mt-4 gap-2">
          {l3s.isLoading ? (
            <AppText className="text-body-sm text-mute">Загружаем…</AppText>
          ) : items.length === 0 ? (
            <View className="rounded-xl bg-canvas-soft px-4 py-5 items-center">
              <AppText weight="semibold" className="text-body-md text-ink">
                Готовых услуг тут нет
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute text-center">
                Добавьте свою — название и цену. Внизу есть форма «Своя услуга».
              </AppText>
            </View>
          ) : (
            items.map((l3) => {
              const sel = selection.get(l3.id);
              const isSel = !!sel;
              const placeholder = suggestedPrice(l3);
              return (
                <View
                  key={l3.id}
                  className={`rounded-xl border ${
                    isSel ? "border-ink bg-canvas" : "border-hairline bg-canvas"
                  }`}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={l3.name_ru}
                    onPress={() => toggle(l3)}
                    className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
                  >
                    {/* Иконка категории L2 (общая для всех L3 этой L2) */}
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft">
                      {colorUrl ? (
                        <Image
                          source={{ uri: colorUrl }}
                          style={{ width: 22, height: 22 }}
                        />
                      ) : null}
                    </View>

                    <View className="flex-1">
                      <AppText
                        weight="semibold"
                        className="text-body-md text-ink"
                        numberOfLines={2}
                      >
                        {l3.name_ru}
                      </AppText>
                      {!isSel && placeholder !== null ? (
                        <AppText weight="mono" className="mt-0.5 text-mono-caption text-mute">
                          ≈ {placeholder.toLocaleString("ru-RU")} ₽
                        </AppText>
                      ) : null}
                    </View>

                    {/* Checkbox visual */}
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-full ${
                        isSel ? "bg-ink" : "border border-hairline-strong"
                      }`}
                    >
                      {isSel ? (
                        <Check size={16} weight="bold" color="#ffffff" />
                      ) : null}
                    </View>
                  </Pressable>

                  {/* Inline price input — появляется когда selected */}
                  {isSel ? (
                    <View className="px-4 pb-3 flex-row items-center gap-2 border-t border-hairline">
                      <AppText className="text-body-sm text-mute">от</AppText>
                      <TextInput
                        value={sel.priceMin == null ? "" : String(sel.priceMin)}
                        onChangeText={(v) => updatePrice(l3.id, v)}
                        keyboardType="numeric"
                        placeholder={placeholder ? String(placeholder) : "1000"}
                        placeholderTextColor={tc["muted-soft"]}
                        className="flex-1 h-10 mt-3 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
                        maxLength={7}
                      />
                      <AppText className="text-body-sm text-mute">₽</AppText>
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Inline-форма «Своя услуга» — добавляет master_service с custom title
            и без l3_id (свободная формулировка). Видна всегда когда L2 выбрана.
            Фидбэк user 2026-05-15: «дай возможность добавлять собственное
            прямо тут». Сохраняется отдельной кнопкой (не через нижний sticky
            CTA — у того другая семантика «добавить N выбранных из чек-листа»). */}
        {resolvedL2 ? (
          <View className="mt-6 rounded-xl border border-hairline bg-canvas-soft p-4">
            <AppText weight="semibold" className="text-body-md text-ink">
              Своя услуга
            </AppText>
            <AppText className="mt-1 text-caption text-mute">
              Не нашли в списке? Введите название и цену.
            </AppText>
            <TextInput
              value={customTitle}
              onChangeText={setCustomTitle}
              placeholder="Например, замена бачка унитаза"
              placeholderTextColor={tc["muted-soft"]}
              maxLength={100}
              className="mt-3 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
              editable={!customSaving}
            />
            <View className="mt-2 flex-row items-center gap-2">
              <AppText className="text-body-sm text-mute">от</AppText>
              <TextInput
                value={customPriceMin}
                onChangeText={(v) => setCustomPriceMin(v.replace(/[^\d]/g, ""))}
                keyboardType="numeric"
                placeholder="1000"
                placeholderTextColor={tc["muted-soft"]}
                maxLength={7}
                className="flex-1 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
                editable={!customSaving}
              />
              <AppText className="text-body-sm text-mute">₽</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить свою услугу"
              disabled={customSaving || customTitle.trim().length < 2}
              onPress={handleAddCustom}
              className={`mt-3 h-11 items-center justify-center rounded-md ${
                customSaving || customTitle.trim().length < 2
                  ? "bg-canvas-soft-2"
                  : "bg-accent active:opacity-80"
              }`}
            >
              <AppText
                weight="semibold"
                className={`text-button ${
                  customSaving || customTitle.trim().length < 2
                    ? "text-mute"
                    : "text-on-primary"
                }`}
              >
                {customSaving ? "Добавляем…" : "Добавить услугу"}
              </AppText>
            </Pressable>
            {customSavedTitle ? (
              <AppText
                weight="medium"
                className="mt-2 text-caption text-success"
              >
                Добавлено: «{customSavedTitle}»
              </AppText>
            ) : null}
          </View>
        ) : null}

        {errorMsg ? (
          <View className="mt-4 rounded-md bg-canvas-soft px-4 py-3">
            <AppText className="text-caption text-error">{errorMsg}</AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Sticky CTA */}
      <View
        className="absolute left-0 right-0 bg-canvas border-t border-hairline px-5 pt-3"
        style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={handleSave}
          disabled={selectedCount === 0 || saving}
          className={`flex-row items-center justify-center gap-2 h-12 rounded-pill active:opacity-80 ${
            selectedCount === 0 || saving ? "bg-canvas-soft-2" : "bg-ink"
          }`}
        >
          <AppText
            weight="semibold"
            className={`text-body-md ${
              selectedCount === 0 || saving ? "text-mute" : "text-on-primary"
            }`}
          >
            {saving
              ? "Сохраняем…"
              : selectedCount === 0
                ? "Выберите услуги"
                : `Добавить ${selectedCount}`}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}
