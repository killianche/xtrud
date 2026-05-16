/**
 * /profile/services-suggest — добавление услуг из шаблона (Treatwell/Booksy-style).
 *
 * Why. Раньше мастер вбивал каждую услугу руками (название, цена, единица,
 * категория) — долго и с разнобоем формулировок. Фидбэк user 2026-05-15:
 * «чтобы были подсказки — ремонт унитаза и т.д.»
 *
 * Pattern. Мастер выбирает L2 → видит чек-лист готовых L3-услуг. Тап на услугу
 * — раскрывается inline-форма с типом цены (Точная/От/До/Договорная) и
 * единственным числовым полем. После выбора нескольких — sticky «Добавить N»
 * сохраняет в master_services.
 *
 * Фидбэк user 2026-05-16:
 * - убрать дефолтные ценники под названиями услуг (≈ X ₽);
 * - убрать предзаполненную цену при выборе — пускай мастер сам вводит;
 * - дать выбор: точная / от / до — НО НЕ диапазон «от-до» одновременно;
 * - блок «Своя услуга» поднять наверх и сделать компактнее.
 *
 * Параметры:
 *   ?l2=<id>  — какую L2 открыть сразу. Если нет — chip-row из my-categories.
 */

import { useLocalSearchParams } from "expo-router";
import { CaretLeft, Check, Plus, X } from "phosphor-react-native";
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
import {
  PRICING_KIND_LABELS,
  type ServicePricingKind,
  useUpsertMasterService,
} from "@/features/master-services/use-master-services";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

// 4 chip-варианта типа цены: точная / от / до / договорная. Совпадает с
// `order_price_kind` по семантике (см. order-schema.ts), но pricing_kind для
// master_services — отдельный enum (миграция 0080 добавила from/up_to).
const PRICE_KIND_CHOICES: ServicePricingKind[] = ["fixed", "from", "up_to", "quote"];

interface SelectionEntry {
  priceKind: ServicePricingKind;
  priceValue: number | null;
}
type SelectionState = Map<string, SelectionEntry>;

export default function ServicesSuggestScreen() {
  const insets = useSafeAreaInsets();
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const tc = useThemeColors(["ink", "mute", "muted-soft", "accent", "on-primary"]);

  const params = useLocalSearchParams<{ l2?: string }>();
  const initialL2 = typeof params.l2 === "string" ? params.l2 : null;

  const myCats = useMyMasterCategories(userId ?? undefined);
  const [activeL2, setActiveL2] = useState<string | null>(initialL2);
  const resolvedL2 = activeL2 ?? (myCats.data && myCats.data[0]?.l2_id) ?? null;

  const l3s = useCategoriesL3ByL2(resolvedL2);
  const upsert = useUpsertMasterService(userId);

  const [selection, setSelection] = useState<SelectionState>(new Map());
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compact «Своя услуга». Свёрнута по умолчанию — кнопка-trigger «+ Своя
  // услуга». Тап → раскрывается inline-форма. После save сворачивается и
  // показывает короткий success-toast.
  const [customOpen, setCustomOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customKind, setCustomKind] = useState<ServicePricingKind>("fixed");
  const [customValue, setCustomValue] = useState("");
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
        // Default kind = «Точная», priceValue = null (без подсказки) —
        // фидбэк user: «цену пускай человек сам заполняет».
        next.set(l3.id, { priceKind: "fixed", priceValue: null });
      }
      return next;
    });
  };

  const updateEntry = (l3Id: string, patch: Partial<SelectionEntry>) => {
    setSelection((prev) => {
      const next = new Map(prev);
      const existing = next.get(l3Id);
      if (!existing) return next;
      next.set(l3Id, { ...existing, ...patch });
      return next;
    });
  };

  const updateKind = (l3Id: string, kind: ServicePricingKind) => {
    // При переключении на «Договорная» сбрасываем введённую цену.
    updateEntry(l3Id, { priceKind: kind, ...(kind === "quote" ? { priceValue: null } : {}) });
  };

  const updateValue = (l3Id: string, raw: string) => {
    const clean = raw.replace(/[^\d]/g, "");
    updateEntry(l3Id, { priceValue: clean === "" ? null : Number(clean) });
  };

  /** Готовит {price_min, price_max, pricing_kind} для одного селекта/кастома. */
  function preparePayload(kind: ServicePricingKind, value: number | null) {
    // Если выбрана точная/от/до, но цена не введена — fallback в quote,
    // чтобы услуга не сохранилась с битым display'ем «Договорная» при kind='fixed'.
    if (kind === "quote" || value == null) {
      return { price_min: null, price_max: null, pricing_kind: "quote" as ServicePricingKind };
    }
    if (kind === "up_to") {
      return { price_min: null, price_max: value, pricing_kind: "up_to" as ServicePricingKind };
    }
    return { price_min: value, price_max: null, pricing_kind: kind };
  }

  const handleAddCustom = async () => {
    if (!userId || !resolvedL2) return;
    const title = customTitle.trim();
    if (title.length < 2) return;
    const valueClean = customValue.replace(/[^\d]/g, "");
    const value = valueClean === "" ? null : Number(valueClean);
    const payload = preparePayload(customKind, value);
    setCustomSaving(true);
    setErrorMsg(null);
    try {
      await upsert.mutateAsync({
        title,
        price_min: payload.price_min,
        price_max: payload.price_max,
        unit: "per_task",
        pricing_kind: payload.pricing_kind,
        l2_id: resolvedL2,
        l3_id: null,
      });
      setCustomSavedTitle(title);
      setCustomTitle("");
      setCustomValue("");
      setCustomKind("fixed");
      setCustomOpen(false);
      setTimeout(() => setCustomSavedTitle(null), 2800);
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
      const payload = preparePayload(conf.priceKind, conf.priceValue);
      try {
        await upsert.mutateAsync({
          title: l3.name_ru,
          price_min: payload.price_min,
          price_max: payload.price_max,
          unit: "per_task",
          pricing_kind: payload.pricing_kind,
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
            Отметьте услуги, которые предлагаете, и укажите свою цену.
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

        {/* Compact «Своя услуга» — поднят сюда наверх (раньше был в конце
            списка, было неудобно). Свёрнут по умолчанию: кнопка-trigger.
            Тап → inline-форма (название + chip-kind + цена + кнопка). */}
        {resolvedL2 ? (
          <CustomServicePanel
            open={customOpen}
            onToggle={() => setCustomOpen((v) => !v)}
            title={customTitle}
            onTitleChange={setCustomTitle}
            kind={customKind}
            onKindChange={setCustomKind}
            value={customValue}
            onValueChange={(v) => setCustomValue(v.replace(/[^\d]/g, ""))}
            saving={customSaving}
            onAdd={handleAddCustom}
            savedTitle={customSavedTitle}
            tc={tc}
          />
        ) : null}

        {/* L3 checklist */}
        <View className="mt-5 gap-2">
          {l3s.isLoading ? (
            <AppText className="text-body-sm text-mute">Загружаем…</AppText>
          ) : items.length === 0 ? (
            <View className="rounded-xl bg-canvas-soft px-4 py-5 items-center">
              <AppText weight="semibold" className="text-body-md text-ink">
                Готовых услуг тут нет
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute text-center">
                Используйте «Своя услуга» сверху — введите название и цену.
              </AppText>
            </View>
          ) : (
            items.map((l3) => {
              const sel = selection.get(l3.id);
              const isSel = !!sel;
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
                    </View>

                    {/* Checkbox visual */}
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-full ${
                        isSel ? "bg-ink" : "border border-hairline-strong"
                      }`}
                    >
                      {isSel ? (
                        <Check size={16} weight="bold" color={tc["on-primary"]} />
                      ) : null}
                    </View>
                  </Pressable>

                  {/* Inline price form — раскрывается когда L3 выбрана. */}
                  {isSel ? (
                    <View className="px-4 pb-3 border-t border-hairline">
                      <View className="mt-3 flex-row flex-wrap gap-1.5">
                        {PRICE_KIND_CHOICES.map((k) => {
                          const active = sel.priceKind === k;
                          return (
                            <Pressable
                              key={k}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: active }}
                              onPress={() => updateKind(l3.id, k)}
                              className={`h-8 px-3 items-center justify-center rounded-full border ${
                                active
                                  ? "border-accent bg-accent-soft"
                                  : "border-hairline bg-canvas"
                              }`}
                            >
                              <AppText
                                weight={active ? "semibold" : "medium"}
                                className={`text-caption ${active ? "text-accent" : "text-ink"}`}
                              >
                                {PRICING_KIND_LABELS[k]}
                              </AppText>
                            </Pressable>
                          );
                        })}
                      </View>

                      {sel.priceKind !== "quote" ? (
                        <View className="mt-2 flex-row items-center gap-2">
                          <TextInput
                            value={sel.priceValue == null ? "" : String(sel.priceValue)}
                            onChangeText={(v) => updateValue(l3.id, v)}
                            keyboardType="numeric"
                            placeholder="Цена"
                            placeholderTextColor={tc["muted-soft"]}
                            className="flex-1 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
                            maxLength={7}
                          />
                          <AppText className="text-body-sm text-mute">₽</AppText>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

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

// ----------------------------------------------------------------------------
// CustomServicePanel — компактная «Своя услуга».
//
// Свёрнут: одна строка с «+ Своя услуга» (chip-pressable, h-10).
// Раскрыт: bg-canvas-soft card с title input + 4 chip kind + price input + button.
// После успешного добавления возвращается в свёрнутое состояние + caption-toast.
// ----------------------------------------------------------------------------

interface CustomServicePanelProps {
  open: boolean;
  onToggle: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  kind: ServicePricingKind;
  onKindChange: (k: ServicePricingKind) => void;
  value: string;
  onValueChange: (v: string) => void;
  saving: boolean;
  onAdd: () => void;
  savedTitle: string | null;
  tc: { ink: string; mute: string; "muted-soft": string; accent: string; "on-primary": string };
}

function CustomServicePanel({
  open,
  onToggle,
  title,
  onTitleChange,
  kind,
  onKindChange,
  value,
  onValueChange,
  saving,
  onAdd,
  savedTitle,
  tc,
}: CustomServicePanelProps) {
  if (!open) {
    return (
      <View className="mt-4">
        <Pressable
          accessibilityRole="button"
          onPress={onToggle}
          className="h-11 flex-row items-center justify-center gap-2 rounded-pill border border-hairline bg-canvas active:opacity-70"
        >
          <Plus size={16} weight="bold" color={tc.ink} />
          <AppText weight="semibold" className="text-button text-ink">
            Своя услуга
          </AppText>
        </Pressable>
        {savedTitle ? (
          <AppText weight="medium" className="mt-2 text-caption text-success">
            Добавлено: «{savedTitle}»
          </AppText>
        ) : null}
      </View>
    );
  }

  const canAdd = !saving && title.trim().length >= 2;
  const isQuote = kind === "quote";
  // Если выбран не «Договорная» — цена обязательна. Иначе кнопка enabled
  // даже без цены (только название). Так UX очевиднее: пустая цена + не-quote
  // → user видит блокировку, не отправляет случайно.
  const disabled = !canAdd || (!isQuote && value.trim() === "");

  return (
    <View className="mt-4 rounded-xl border border-hairline bg-canvas-soft p-3">
      <View className="flex-row items-center justify-between">
        <AppText weight="semibold" className="text-body-md text-ink">
          Своя услуга
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Свернуть"
          onPress={onToggle}
          hitSlop={8}
          className="h-7 w-7 items-center justify-center rounded-full active:opacity-70"
        >
          <X size={16} weight="bold" color={tc.mute} />
        </Pressable>
      </View>

      <TextInput
        value={title}
        onChangeText={onTitleChange}
        placeholder="Например, замена бачка унитаза"
        placeholderTextColor={tc["muted-soft"]}
        maxLength={100}
        className="mt-2 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
        editable={!saving}
      />

      <View className="mt-2 flex-row flex-wrap gap-1.5">
        {PRICE_KIND_CHOICES.map((k) => {
          const active = kind === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => onKindChange(k)}
              className={`h-8 px-3 items-center justify-center rounded-full border ${
                active ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
              }`}
            >
              <AppText
                weight={active ? "semibold" : "medium"}
                className={`text-caption ${active ? "text-accent" : "text-ink"}`}
              >
                {PRICING_KIND_LABELS[k]}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {!isQuote ? (
        <View className="mt-2 flex-row items-center gap-2">
          <TextInput
            value={value}
            onChangeText={onValueChange}
            keyboardType="numeric"
            placeholder="Цена"
            placeholderTextColor={tc["muted-soft"]}
            maxLength={7}
            className="flex-1 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md text-ink"
            editable={!saving}
          />
          <AppText className="text-body-sm text-mute">₽</AppText>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить свою услугу"
        disabled={disabled}
        onPress={onAdd}
        className={`mt-3 h-11 flex-row items-center justify-center gap-2 rounded-md ${
          disabled ? "bg-canvas-soft-2" : "bg-ink active:opacity-80"
        }`}
      >
        {!disabled ? <Plus size={16} weight="bold" color={tc["on-primary"]} /> : null}
        <AppText
          weight="semibold"
          className={`text-button ${disabled ? "text-mute" : "text-on-primary"}`}
        >
          {saving ? "Добавляем…" : "Добавить услугу"}
        </AppText>
      </Pressable>
    </View>
  );
}
