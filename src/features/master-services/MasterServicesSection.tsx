// MasterServicesSection — CRUD-блок прайс-листа мастера.
//
// Используется в edit-master.tsx ниже основной формы.
// На master/[id].tsx показывается read-only через <MasterServicesList /> (тот же queryKey).
//
// Sprint 31.5.

import { PencilSimple, ListPlus, Pencil, Plus, Sparkle, Trash } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { useCategoriesL3ByL2 } from "@/features/categories/use-categories-l3-by-l2";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import {
  formatServicePrice,
  MASTER_SERVICES_MAX,
  type MasterService,
  PRICING_KIND_HINT,
  PRICING_KIND_LABELS,
  PRICING_KIND_OPTIONS,
  SERVICE_UNIT_LABELS,
  type ServicePricingKind,
  type ServiceUnit,
  useDeleteMasterService,
  useMasterServices,
  useUpsertMasterService,
} from "@/features/master-services/use-master-services";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

interface MasterServicesSectionProps {
  masterId: string | null | undefined;
}

export function MasterServicesSection({ masterId }: MasterServicesSectionProps) {
  const { data: services, isLoading, error } = useMasterServices(masterId);
  const deleteService = useDeleteMasterService(masterId);
  const inkColor = useThemeColor("ink");
  const errorColor = useThemeColor("error");

  const [editing, setEditing] = useState<MasterService | "new" | null>(null);

  const count = services?.length ?? 0;
  const canAdd = count < MASTER_SERVICES_MAX;

  const handleDelete = (service: MasterService) => {
    Alert.alert("Удалить услугу", `«${service.title}» исчезнет из вашего прайса.`, [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => deleteService.mutate(service.id),
      },
    ]);
  };

  return (
    <View className="px-6">
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <AppText weight="semibold" className="text-title-md tracking-tight text-ink">
            Прайс-лист
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            {count} из {MASTER_SERVICES_MAX} услуг
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Добавить услугу"
          disabled={!canAdd}
          onPress={() => setEditing("new")}
          className={`h-10 flex-row items-center gap-1.5 rounded-md px-3 ${
            canAdd ? "bg-accent active:opacity-80 hover:opacity-80" : "bg-surface-3"
          }`}
        >
          <Plus size={16} weight="bold" color={canAdd ? "#fff" : inkColor} />
          <AppText
            weight="semibold"
            className={`text-caption ${canAdd ? "text-on-primary" : "text-muted"}`}
          >
            Добавить
          </AppText>
        </Pressable>
      </View>

      {isLoading && (
        <View className="mt-4 items-center py-6">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-4">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить прайс. {error.message}
          </AppText>
        </View>
      )}

      {!isLoading && !error && count === 0 && (
        <View className="mt-4">
          <EmptyState
            icon={ListPlus}
            title="Прайс ещё пустой"
            hint="Добавьте 3-5 типичных услуг с ценой — клиенты увидят их прямо в карточке."
          />
        </View>
      )}

      {!isLoading && !error && count > 0 && (
        <View className="mt-4 gap-2">
          {services?.map((service) => (
            <ServiceRow
              key={service.id}
              service={service}
              onEdit={() => setEditing(service)}
              onDelete={() => handleDelete(service)}
              errorColor={errorColor}
              inkColor={inkColor}
            />
          ))}
        </View>
      )}

      <ServiceFormModal
        visible={editing !== null}
        initial={editing === "new" ? null : editing}
        masterId={masterId}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

// ----------------------------------------------------------------------------

interface ServiceRowProps {
  service: MasterService;
  onEdit: () => void;
  onDelete: () => void;
  errorColor: string;
  inkColor: string;
}

function ServiceRow({ service, onEdit, onDelete, errorColor, inkColor }: ServiceRowProps) {
  return (
    <View className="flex-row items-center gap-3 rounded-lg border border-hairline bg-canvas p-3">
      <View className="flex-1">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
          {service.title}
        </AppText>
        <AppText className="mt-0.5 text-caption text-muted">
          {formatServicePrice(service)}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Изменить"
        onPress={onEdit}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-md active:opacity-70 hover:bg-surface-2"
      >
        <Pencil size={16} weight="bold" color={inkColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Удалить"
        onPress={onDelete}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-md active:opacity-70 hover:bg-surface-2"
      >
        <Trash size={16} weight="bold" color={errorColor} />
      </Pressable>
    </View>
  );
}

// ----------------------------------------------------------------------------

interface ServiceFormModalProps {
  visible: boolean;
  initial: MasterService | null;
  masterId: string | null | undefined;
  onClose: () => void;
}

const UNIT_OPTIONS: ServiceUnit[] = ["per_hour", "per_task", "per_m2", "per_day"];
// `range` сознательно НЕ показываем в picker — фидбэк user 2026-05-15/2026-05-16
// «диапазоны не нужны». Legacy-данные с `range` остаются читаемыми
// (PRICING_KIND_LABELS / formatServicePrice их понимают), но новых не создаём.
const KIND_OPTIONS: ServicePricingKind[] = PRICING_KIND_OPTIONS;

function ServiceFormModal({ visible, initial, masterId, onClose }: ServiceFormModalProps) {
  // formKey меняется при смене initial → ServiceFormContent ремаунтится со свежим state.
  const formKey = visible ? (initial?.id ?? "new") : "closed";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <ServiceFormContent key={formKey} initial={initial} masterId={masterId} onClose={onClose} />
    </Modal>
  );
}

// ----------------------------------------------------------------------------

interface ServiceFormContentProps {
  initial: MasterService | null;
  masterId: string | null | undefined;
  onClose: () => void;
}

function ServiceFormContent({ initial, masterId, onClose }: ServiceFormContentProps) {
  const upsert = useUpsertMasterService(masterId);
  const tc = useThemeColors(["ink", "muted-soft", "accent"]);

  // P0-4: загружаем категории мастера для выбора L2.
  // L3-список грузим лениво по выбранной L2.
  const { data: myCategories } = useMyMasterCategories(masterId ?? undefined);

  // L2 — для НОВОЙ услуги по умолчанию выбираем первую категорию мастера
  // (если она одна — экономит клик). Для редактирования — берём из initial.
  const initialL2 = initial?.l2_id ?? myCategories?.[0]?.l2_id ?? null;
  const [selectedL2, setSelectedL2] = useState<string | null>(initialL2);

  // Когда myCategories догрузились (и initial без l2), выставляем default.
  useEffect(() => {
    if (selectedL2 == null && initial?.l2_id == null && myCategories?.[0]) {
      setSelectedL2(myCategories[0].l2_id);
    }
  }, [myCategories, selectedL2, initial?.l2_id]);

  const { data: l3List } = useCategoriesL3ByL2(selectedL2);

  const initialKind: ServicePricingKind = initial?.pricing_kind ?? "fixed";
  const [pricingKind, setPricingKind] = useState<ServicePricingKind>(initialKind);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [selectedL3, setSelectedL3] = useState<string | null>(initial?.l3_id ?? null);
  // freeMode = режим "своя формулировка". При создании новой услуги по
  // умолчанию false (показываем готовый список); при редактировании — true,
  // если у legacy-записи нет l3_id (значит, мастер вписывал руками).
  const [freeMode, setFreeMode] = useState<boolean>(
    initial != null && initial.l3_id == null,
  );
  // priceValue — единое поле «цена» которое мастер вводит в форме. На submit
  // мы переносим его в price_min (для fixed/from/hourly/range) или price_max
  // (для up_to). Это упрощает UI: один input независимо от kind, label меняется.
  const [priceValue, setPriceValue] = useState(() => {
    if (initial == null) return "";
    if (initial.pricing_kind === "up_to") {
      return initial.price_max == null ? "" : String(initial.price_max);
    }
    return initial.price_min == null ? "" : String(initial.price_min);
  });
  // priceMaxLegacy — только для редактирования legacy записей с kind='range'.
  // Новые kind=range создать нельзя (KIND_OPTIONS его не показывает).
  const [priceMaxLegacy, setPriceMaxLegacy] = useState(
    initial?.pricing_kind === "range" && initial.price_max != null
      ? String(initial.price_max)
      : "",
  );
  const [unit, setUnit] = useState<ServiceUnit>(initial?.unit ?? "per_task");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Найти выбранный L3 объект (для показа его avg_check_rub как placeholder).
  const selectedL3Obj = useMemo(
    () => l3List?.find((x) => x.id === selectedL3) ?? null,
    [l3List, selectedL3],
  );

  // При выборе L3 из готового списка — автозаполняем title (если пустой
  // или совпадает с предыдущим L3.name_ru — чтобы не затирать ручные правки).
  const pickL3 = (l3: { id: string; name_ru: string; avg_check_rub: number | null }) => {
    setSelectedL3(l3.id);
    // Перезаписываем title только если он пустой ИЛИ совпадает с предыдущим
    // выбранным L3 (т.е. мастер ничего не редактировал руками).
    const prevL3 = l3List?.find((x) => x.id === selectedL3);
    if (!title.trim() || (prevL3 && title.trim() === prevL3.name_ru.trim())) {
      setTitle(l3.name_ru);
    }
  };

  // При переключении pricing_kind очищаем поля, которые не имеют смысла
  // в новом режиме. priceValue — для всех кроме quote. priceMaxLegacy —
  // только для legacy range.
  const handleKindChange = (k: ServicePricingKind) => {
    setPricingKind(k);
    if (k === "quote") {
      setPriceValue("");
      setPriceMaxLegacy("");
    } else if (k !== "range") {
      setPriceMaxLegacy("");
    }
    if (k === "hourly") setUnit("per_hour");
    setSubmitError(null);
  };

  // Применить рекомендованную цену из avg_check_rub. P0-4: «гарантирую
  // ориентир по рынку». Для up_to берём +30% от avg (порог), для остальных —
  // как есть.
  const applyRecommendedPrice = () => {
    if (selectedL3Obj?.avg_check_rub != null) {
      if (pricingKind === "up_to") {
        setPriceValue(String(Math.round(selectedL3Obj.avg_check_rub * 1.3)));
      } else {
        setPriceValue(String(selectedL3Obj.avg_check_rub));
      }
      if (pricingKind === "range") {
        setPriceMaxLegacy(String(Math.round(selectedL3Obj.avg_check_rub * 1.5)));
      }
    }
  };

  const handleSubmit = async () => {
    if (!selectedL2) {
      setSubmitError("Сначала выберите категорию");
      return;
    }
    if (!title.trim() || title.trim().length < 2) {
      setSubmitError("Название от 2 символов");
      return;
    }
    if (title.length > 100) {
      setSubmitError("Название до 100 символов");
      return;
    }

    if (pricingKind === "quote") {
      // Цены не требуются — submit с null/null
      try {
        await upsert.mutateAsync({
          id: initial?.id,
          title: title.trim(),
          price_min: null,
          price_max: null,
          unit,
          pricing_kind: pricingKind,
          l2_id: selectedL2,
          l3_id: freeMode ? null : selectedL3,
        });
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось сохранить";
        setSubmitError(msg);
      }
      return;
    }

    const value = parseInt(priceValue.replace(/\s/g, ""), 10);
    const max =
      pricingKind === "range" && priceMaxLegacy.trim() !== ""
        ? parseInt(priceMaxLegacy.replace(/\s/g, ""), 10)
        : null;

    if (Number.isNaN(value) || value < 0) {
      setSubmitError("Укажите цену");
      return;
    }
    // Распределение по price_min / price_max в зависимости от kind:
    //   up_to        → price_min=null, price_max=value
    //   range legacy → price_min=value, price_max=max (отдельный input)
    //   остальные    → price_min=value, price_max=null
    const min = pricingKind === "up_to" ? null : value;
    const maxOut = pricingKind === "up_to" ? value : max;
    if (pricingKind === "range" && max == null) {
      setSubmitError("Укажите максимальную цену для диапазона");
      return;
    }
    if (pricingKind === "range" && max != null && min != null && max < min) {
      setSubmitError("Максимальная цена должна быть ≥ минимальной");
      return;
    }

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        title: title.trim(),
        price_min: min,
        price_max: maxOut,
        unit,
        pricing_kind: pricingKind,
        l2_id: selectedL2,
        l3_id: freeMode ? null : selectedL3,
      });
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить";
      setSubmitError(msg);
    }
  };

  const isBusy = upsert.isPending;
  const placeholderColor = tc["muted-soft"];
  const inkColor = tc.ink;
  const accentColor = tc.accent;
  const isValid =
    !!selectedL2 &&
    title.trim().length >= 2 &&
    (pricingKind === "quote" || priceValue.trim() !== "");
  const showPriceValue = pricingKind !== "quote";
  const showPriceMaxLegacy = pricingKind === "range";
  // Unit показываем только для kind'ов где он имеет смысл — точная/«от»/«до»/
  // диапазон. hourly зафиксирован на per_hour автоматически, quote не имеет цены.
  const showUnit =
    pricingKind === "fixed" ||
    pricingKind === "from" ||
    pricingKind === "up_to" ||
    pricingKind === "range";

  // Label для поля цены по kind. Placeholder подсказывает «правильный»
  // порядок цены, но не предзаполняет — фидбэк user 2026-05-16: «цену
  // пускай человек сам заполняет».
  const priceLabel =
    pricingKind === "hourly"
      ? "₽ / час"
      : pricingKind === "range"
        ? "Цена от, ₽"
        : pricingKind === "up_to"
          ? "Цена до, ₽"
          : pricingKind === "from"
            ? "Цена от, ₽"
            : "Цена, ₽";
  const pricePlaceholder = selectedL3Obj?.avg_check_rub
    ? String(selectedL3Obj.avg_check_rub)
    : pricingKind === "hourly"
      ? "800"
      : "1500";

  const noCategoriesYet = (myCategories?.length ?? 0) === 0;

  return (
    <View className="flex-1 items-center justify-center bg-black/60 px-6">
      <View className="w-full max-w-md rounded-xl bg-canvas p-6 max-h-[90vh]">
        <AppText weight="bold" className="text-title-lg tracking-tight text-ink">
          {initial ? "Изменить услугу" : "Новая услуга"}
        </AppText>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 8 }}
        >

        {/* P0-4: блок выбора категории и услуги из готового списка.
            При freeMode скрываем список L3 и просим ввести title руками. */}
        {noCategoriesYet ? (
          <View className="mt-4 rounded-md border border-hairline bg-canvas-soft p-3">
            <AppText weight="semibold" className="text-body-sm text-ink">
              Сначала выберите категории
            </AppText>
            <AppText className="mt-1 text-caption text-muted">
              Без категорий нельзя добавить услугу. Откройте «Профиль → Категории»
              и выберите 1-5 направлений в которых работаете.
            </AppText>
          </View>
        ) : (
          <View className="mt-4">
            <AppText weight="medium" className="text-caption text-muted">
              Категория
            </AppText>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {(myCategories ?? []).map((mc) => {
                const selected = selectedL2 === mc.l2_id;
                return (
                  <Pressable
                    key={mc.l2_id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setSelectedL2(mc.l2_id);
                      // При смене категории сбрасываем L3-выбор и title (если он
                      // был автоподставлен из L3 — иначе оставляем).
                      const prevL3 = l3List?.find((x) => x.id === selectedL3);
                      if (prevL3 && title.trim() === prevL3.name_ru.trim()) {
                        setTitle("");
                      }
                      setSelectedL3(null);
                    }}
                    className={`rounded-pill border px-3 py-1.5 active:opacity-70 ${
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-canvas hover:bg-surface-2"
                    }`}
                  >
                    <AppText
                      weight={selected ? "semibold" : "medium"}
                      className={`text-caption ${selected ? "text-accent" : "text-ink"}`}
                    >
                      {mc.l2?.name_ru ?? mc.l2_id}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Pre-defined L3 услуги для выбранной L2 (skip в freeMode) */}
        {!freeMode && !noCategoriesYet && selectedL2 && l3List && l3List.length > 0 ? (
          <View className="mt-4">
            <View className="flex-row items-center justify-between">
              <AppText weight="medium" className="text-caption text-muted">
                Готовые услуги в этой категории
              </AppText>
              <Pressable
                onPress={() => {
                  setFreeMode(true);
                  setSelectedL3(null);
                }}
                accessibilityRole="button"
                hitSlop={6}
                className="flex-row items-center gap-1 active:opacity-60"
              >
                <PencilSimple size={12} weight="bold" color={accentColor} />
                <AppText weight="medium" className="text-caption text-accent">
                  Своя формулировка
                </AppText>
              </Pressable>
            </View>
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {l3List.map((l3) => {
                const selected = selectedL3 === l3.id;
                return (
                  <Pressable
                    key={l3.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => pickL3(l3)}
                    className={`rounded-pill border px-2.5 py-1 active:opacity-70 ${
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-canvas hover:bg-surface-2"
                    }`}
                  >
                    <AppText
                      weight={selected ? "semibold" : "medium"}
                      className={`text-caption ${selected ? "text-accent" : "text-ink"}`}
                    >
                      {l3.name_ru}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* В freeMode — кнопка «вернуться к готовым услугам» */}
        {freeMode && !noCategoriesYet && selectedL2 ? (
          <View className="mt-3 flex-row items-center justify-end">
            <Pressable
              onPress={() => setFreeMode(false)}
              accessibilityRole="button"
              hitSlop={6}
              className="active:opacity-60"
            >
              <AppText weight="medium" className="text-caption text-link">
                ← Готовые услуги
              </AppText>
            </Pressable>
          </View>
        ) : null}

        <View className="mt-4">
          <AppText weight="medium" className="text-caption text-muted">
            Название
          </AppText>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              // Если мастер редактирует title после выбора L3 — переходим
              // в freeMode (значит, он уточняет формулировку).
              const prevL3 = l3List?.find((x) => x.id === selectedL3);
              if (prevL3 && t.trim() !== prevL3.name_ru.trim()) {
                // Не флипаем freeMode — оставляем l3_id как ссылку, но
                // сохраним пользовательскую формулировку. Это корректное
                // поведение из плана (см. P0-2 и MASTER_ACCOUNT_PLAN P0-4).
              }
            }}
            placeholder={
              selectedL3Obj?.name_ru ?? "Например, Установка смесителя"
            }
            placeholderTextColor={placeholderColor}
            maxLength={100}
            style={{ color: inkColor }}
            className="mt-1.5 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md"
          />
        </View>

        {/* Pricing kind toggles — главная P0-10 фича: режим «договорная» */}
        <View className="mt-3">
          <AppText weight="medium" className="text-caption text-muted">
            Тип цены
          </AppText>
          <View className="mt-1.5 flex-row flex-wrap gap-2">
            {KIND_OPTIONS.map((opt) => {
              const selected = pricingKind === opt;
              return (
                <Pressable
                  key={opt}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => handleKindChange(opt)}
                  className={`rounded-pill border px-3 py-1.5 active:opacity-70 ${
                    selected ? "border-accent bg-accent-soft" : "border-hairline bg-canvas hover:bg-surface-2"
                  }`}
                >
                  <AppText
                    weight={selected ? "semibold" : "medium"}
                    className={`text-caption ${selected ? "text-accent" : "text-ink"}`}
                  >
                    {PRICING_KIND_LABELS[opt]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText className="mt-1 text-caption-xs text-muted">
            {PRICING_KIND_HINT[pricingKind]}
          </AppText>
        </View>

        {showPriceValue && (
          <>
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <AppText weight="medium" className="text-caption text-muted">
                  {priceLabel}
                </AppText>
                <TextInput
                  value={priceValue}
                  onChangeText={setPriceValue}
                  placeholder={pricePlaceholder}
                  placeholderTextColor={placeholderColor}
                  keyboardType="number-pad"
                  style={{ color: inkColor }}
                  className="mt-1.5 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md"
                />
              </View>
              {showPriceMaxLegacy && (
                <View className="flex-1">
                  <AppText weight="medium" className="text-caption text-muted">
                    До, ₽
                  </AppText>
                  <TextInput
                    value={priceMaxLegacy}
                    onChangeText={setPriceMaxLegacy}
                    placeholder={
                      selectedL3Obj?.avg_check_rub
                        ? String(Math.round(selectedL3Obj.avg_check_rub * 1.5))
                        : "3000"
                    }
                    placeholderTextColor={placeholderColor}
                    keyboardType="number-pad"
                    style={{ color: inkColor }}
                    className="mt-1.5 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md"
                  />
                </View>
              )}
            </View>
            {/* P0-4: hint с рекомендованной ценой из avg_check_rub +
                кнопка «применить». Видно только если выбран L3 со known
                ставкой и поле цены ещё пустое (иначе мастер уже сам
                ввёл — не мешаем). */}
            {selectedL3Obj?.avg_check_rub && priceValue.trim() === "" ? (
              <Pressable
                onPress={applyRecommendedPrice}
                accessibilityRole="button"
                hitSlop={6}
                className="mt-2 flex-row items-center gap-1.5 self-start active:opacity-60"
              >
                <Sparkle size={12} weight="bold" color={accentColor} />
                <AppText weight="medium" className="text-caption text-accent">
                  В среднем берут {selectedL3Obj.avg_check_rub.toLocaleString("ru-RU")} ₽
                  — применить
                </AppText>
              </Pressable>
            ) : null}
          </>
        )}

        {showUnit && (
          <View className="mt-3">
            <AppText weight="medium" className="text-caption text-muted">
              Единица
            </AppText>
            <View className="mt-1.5 flex-row flex-wrap gap-2">
              {UNIT_OPTIONS.map((opt) => {
                const selected = unit === opt;
                return (
                  <Pressable
                    key={opt}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setUnit(opt)}
                    className={`rounded-pill border px-3 py-1.5 active:opacity-70 ${
                      selected
                        ? "border-accent bg-accent-soft"
                        : "border-hairline bg-canvas hover:bg-surface-2"
                    }`}
                  >
                    <AppText
                      weight={selected ? "semibold" : "medium"}
                      className={`text-caption ${selected ? "text-accent" : "text-ink"}`}
                    >
                      {SERVICE_UNIT_LABELS[opt]}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {submitError && (
          <View className="mt-4">
            <AppText weight="medium" className="text-caption text-error">
              {submitError}
            </AppText>
          </View>
        )}

        </ScrollView>

        <View className="mt-6 flex-row gap-3">
          <Pressable
            accessibilityRole="button"
            disabled={isBusy}
            onPress={onClose}
            className="h-11 flex-1 items-center justify-center rounded-md border border-hairline active:opacity-70 hover:bg-surface-2"
          >
            <AppText weight="semibold" className="text-button text-ink">
              Отмена
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy}
            onPress={handleSubmit}
            className={`h-11 flex-1 items-center justify-center rounded-md ${
              isValid && !isBusy ? "bg-primary active:opacity-80 hover:opacity-90" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Сохраняем..." : "Сохранить"}
            </AppText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
