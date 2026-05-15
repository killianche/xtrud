// MasterServicesSection — CRUD-блок прайс-листа мастера.
//
// Используется в edit-master.tsx ниже основной формы.
// На master/[id].tsx показывается read-only через <MasterServicesList /> (тот же queryKey).
//
// Sprint 31.5.

import { ListPlus, Pencil, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import {
  formatServicePrice,
  MASTER_SERVICES_MAX,
  type MasterService,
  PRICING_KIND_HINT,
  PRICING_KIND_LABELS,
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
            canAdd ? "bg-ink active:opacity-80 hover:opacity-80" : "bg-surface-3"
          }`}
        >
          <Plus size={16} strokeWidth={2} color={canAdd ? "#fff" : inkColor} />
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
        <Pencil size={16} strokeWidth={1.75} color={inkColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Удалить"
        onPress={onDelete}
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-md active:opacity-70 hover:bg-surface-2"
      >
        <Trash2 size={16} strokeWidth={1.75} color={errorColor} />
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
const KIND_OPTIONS: ServicePricingKind[] = ["fixed", "range", "hourly", "quote"];

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
  const tc = useThemeColors(["ink", "muted-soft"]);

  const initialKind: ServicePricingKind = initial?.pricing_kind ?? "fixed";
  const [pricingKind, setPricingKind] = useState<ServicePricingKind>(initialKind);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [priceMin, setPriceMin] = useState(
    initial?.price_min == null ? "" : String(initial.price_min),
  );
  const [priceMax, setPriceMax] = useState(
    initial?.price_max == null ? "" : String(initial.price_max),
  );
  const [unit, setUnit] = useState<ServiceUnit>(initial?.unit ?? "per_task");
  const [submitError, setSubmitError] = useState<string | null>(null);

  // При переключении pricing_kind очищаем поля, которые не имеют смысла
  // в новом режиме (priceMax — только для range; priceMin — только не для quote).
  const handleKindChange = (k: ServicePricingKind) => {
    setPricingKind(k);
    if (k === "quote") {
      setPriceMin("");
      setPriceMax("");
    } else if (k !== "range") {
      setPriceMax("");
    }
    if (k === "hourly") setUnit("per_hour");
    setSubmitError(null);
  };

  const handleSubmit = async () => {
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
        });
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Не удалось сохранить";
        setSubmitError(msg);
      }
      return;
    }

    const min = parseInt(priceMin.replace(/\s/g, ""), 10);
    const max =
      pricingKind === "range" && priceMax.trim() !== ""
        ? parseInt(priceMax.replace(/\s/g, ""), 10)
        : null;

    if (Number.isNaN(min) || min < 0) {
      setSubmitError("Укажите цену");
      return;
    }
    if (pricingKind === "range" && max == null) {
      setSubmitError("Укажите максимальную цену для диапазона");
      return;
    }
    if (max != null && max < min) {
      setSubmitError("Максимальная цена должна быть ≥ минимальной");
      return;
    }

    try {
      await upsert.mutateAsync({
        id: initial?.id,
        title: title.trim(),
        price_min: min,
        price_max: max,
        unit,
        pricing_kind: pricingKind,
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
  const isValid =
    title.trim().length >= 2 &&
    (pricingKind === "quote" || priceMin.trim() !== "");
  const showPriceMin = pricingKind !== "quote";
  const showPriceMax = pricingKind === "range";
  // Unit не показываем для hourly (он зафиксирован per_hour) и quote (не имеет
  // смысла без цены).
  const showUnit = pricingKind === "fixed" || pricingKind === "range";

  return (
    <View className="flex-1 items-center justify-center bg-black/60 px-6">
      <View className="w-full max-w-md rounded-xl bg-canvas p-6">
        <AppText weight="bold" className="text-title-lg tracking-tight text-ink">
          {initial ? "Изменить услугу" : "Новая услуга"}
        </AppText>

        <View className="mt-4">
          <AppText weight="medium" className="text-caption text-muted">
            Название
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Например, Установка смесителя"
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
                    selected ? "border-ink bg-ink" : "border-hairline bg-canvas hover:bg-surface-2"
                  }`}
                >
                  <AppText
                    weight={selected ? "semibold" : "medium"}
                    className={`text-caption ${selected ? "text-on-primary" : "text-ink"}`}
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

        {showPriceMin && (
          <View className="mt-3 flex-row gap-3">
            <View className="flex-1">
              <AppText weight="medium" className="text-caption text-muted">
                {pricingKind === "hourly"
                  ? "₽ / час"
                  : pricingKind === "range"
                    ? "Цена от, ₽"
                    : "Цена, ₽"}
              </AppText>
              <TextInput
                value={priceMin}
                onChangeText={setPriceMin}
                placeholder={pricingKind === "hourly" ? "800" : "1500"}
                placeholderTextColor={placeholderColor}
                keyboardType="number-pad"
                style={{ color: inkColor }}
                className="mt-1.5 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md"
              />
            </View>
            {showPriceMax && (
              <View className="flex-1">
                <AppText weight="medium" className="text-caption text-muted">
                  До, ₽
                </AppText>
                <TextInput
                  value={priceMax}
                  onChangeText={setPriceMax}
                  placeholder="3000"
                  placeholderTextColor={placeholderColor}
                  keyboardType="number-pad"
                  style={{ color: inkColor }}
                  className="mt-1.5 h-11 rounded-md border border-hairline bg-canvas px-3 text-body-md"
                />
              </View>
            )}
          </View>
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
                        ? "border-ink bg-ink"
                        : "border-hairline bg-canvas hover:bg-surface-2"
                    }`}
                  >
                    <AppText
                      weight={selected ? "semibold" : "medium"}
                      className={`text-caption ${selected ? "text-on-primary" : "text-ink"}`}
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
