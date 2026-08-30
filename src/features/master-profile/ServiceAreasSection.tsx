// ServiceAreasSection — multi-select городов и районов где работает мастер.
//
// P1-3 (упрощ.) из archive/research/MASTER_ACCOUNT_PLAN.md. Без сёл и без radius —
// мастер просто отмечает чипы городов и/или районов.
//
// Auto-save при каждом тапе chip (фидбэк user 2026-05-15: «2 кнопки
// "Сохранить"»). Локальная save-кнопка убрана — каждое изменение мгновенно
// уходит в RPC set_master_service_areas. Inline status «Сохранено» / spinner
// заменяет save-кнопку.

import { Check, MapPin } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  useMasterServiceAreas,
  useSetMasterServiceAreas,
} from "@/features/master-profile/use-service-areas";
import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";
import { useThemeColor } from "@/lib/use-theme-color";

interface ServiceAreasSectionProps {
  masterId: string | null | undefined;
}

export function ServiceAreasSection({ masterId }: ServiceAreasSectionProps) {
  const { data: existing, isLoading } = useMasterServiceAreas(masterId);
  const setAreas = useSetMasterServiceAreas(masterId);
  const successColor = useThemeColor("success");
  const accentColor = useThemeColor("accent");

  // Local draft — Set<id> для быстрого toggle.
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [districts, setDistricts] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);
  // Status indicator для UX-feedback после auto-save
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!hydrated && existing) {
      setCities(new Set(existing.filter((a) => a.kind === "city").map((a) => a.location_id)));
      setDistricts(
        new Set(existing.filter((a) => a.kind === "district").map((a) => a.location_id)),
      );
      setHydrated(true);
    }
  }, [existing, hydrated]);

  // Auto-save при каждом изменении draft.
  // Не сохраняем при первом hydrate — только при реальных user-actions.
  const persistAreas = (nextCities: Set<string>, nextDistricts: Set<string>) => {
    setAreas.mutate(
      {
        cities: Array.from(nextCities),
        districts: Array.from(nextDistricts),
      },
      {
        onSuccess: () => {
          setShowSaved(true);
          // Скрываем «Сохранено» через 2 секунды
          setTimeout(() => setShowSaved(false), 2000);
        },
      },
    );
  };

  const toggleCity = (id: string) => {
    const next = new Set(cities);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCities(next);
    persistAreas(next, districts);
  };

  const toggleDistrict = (id: string) => {
    const next = new Set(districts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDistricts(next);
    persistAreas(cities, next);
  };

  const totalSelected = cities.size + districts.size;
  // Семантика: пустой выбор = «вся Ингушетия» (нет территориального фильтра,
  // мастер получает заявки откуда угодно). Аналогично клиентскому
  // <LocationSheet> и <LocationPicker> — паттерн «карточка-toggle сверху»,
  // снимающая остальные чипы. По фидбэку user 2026-05-15: «добавь один,
  // который покрывает все — Ингушетия».
  const isAllIngushetia = totalSelected === 0;
  const selectAllIngushetia = () => {
    if (isAllIngushetia) return; // уже active — клик no-op
    setCities(new Set());
    setDistricts(new Set());
    persistAreas(new Set(), new Set());
  };

  if (isLoading) {
    return (
      <View className="px-6">
        <AppText className="text-caption text-muted">Загружаем зоны работы…</AppText>
      </View>
    );
  }

  return (
    <View className="px-6">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <AppText weight="semibold" className="text-title-md tracking-tight text-ink">
            Где работаете
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            Отметьте города и/или районы. Заявки из этих локаций будут показываться в вашей ленте.
          </AppText>
          <AppText className="mt-1 text-caption text-muted-soft">Выбрано: {totalSelected}</AppText>
        </View>
        {/* Inline status вместо save-кнопки. */}
        {setAreas.isPending ? (
          <View className="flex-row items-center gap-1.5">
            <ActivityIndicator size="small" />
            <AppText className="text-caption text-muted">Сохраняем…</AppText>
          </View>
        ) : showSaved ? (
          <View className="flex-row items-center gap-1.5">
            <Check size={14} weight="bold" color={successColor} />
            <AppText weight="medium" className="text-caption text-success">
              Сохранено
            </AppText>
          </View>
        ) : null}
      </View>

      {/* «Вся Ингушетия» — toggle-карточка сверху, снимает все остальные
          чипы. Эквивалент пустого выбора (cities=[], districts=[]) — мастер
          получает заявки со всей республики без территориального фильтра. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Вся Ингушетия"
        accessibilityState={{ selected: isAllIngushetia }}
        disabled={setAreas.isPending || isAllIngushetia}
        onPress={selectAllIngushetia}
        className={`mt-4 flex-row items-center gap-3 rounded-lg border p-4 ${
          isAllIngushetia
            ? "border-accent bg-accent-soft"
            : "border-hairline bg-canvas-soft active:opacity-70"
        }`}
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas">
          <MapPin size={18} weight="bold" color={successColor} />
        </View>
        <View className="flex-1">
          <AppText
            weight="semibold"
            className={`text-body-md ${isAllIngushetia ? "text-accent" : "text-ink"}`}
          >
            Вся Ингушетия
          </AppText>
          <AppText className="mt-0.5 text-caption text-mute">
            Получать заявки со всей республики, без фильтра по городу
          </AppText>
        </View>
        {isAllIngushetia ? <Check size={20} weight="fill" color={accentColor} /> : null}
      </Pressable>

      {/* Города */}
      <AppText weight="semibold" className="mt-5 text-caption uppercase tracking-wider text-muted">
        Города
      </AppText>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {PICKER_CITIES.map((c) => {
          const selected = cities.has(c.id);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={setAreas.isPending}
              onPress={() => toggleCity(c.id)}
              className={`h-10 items-center justify-center rounded-pill border px-4 ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-hairline bg-canvas active:opacity-70"
              }`}
            >
              <AppText
                weight="medium"
                className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
              >
                {c.name}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {/* Районы */}
      <AppText weight="semibold" className="mt-5 text-caption uppercase tracking-wider text-muted">
        Районы
      </AppText>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {DISTRICTS.map((d) => {
          const selected = districts.has(d.id);
          return (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={setAreas.isPending}
              onPress={() => toggleDistrict(d.id)}
              className={`h-10 items-center justify-center rounded-pill border px-4 ${
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-hairline bg-canvas active:opacity-70"
              }`}
            >
              <AppText
                weight="medium"
                className={`text-body-sm ${selected ? "text-accent" : "text-ink"}`}
              >
                {d.name}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {setAreas.error ? (
        <AppText weight="medium" className="mt-3 text-caption text-error">
          Не удалось сохранить. {setAreas.error.message}
        </AppText>
      ) : null}
    </View>
  );
}
