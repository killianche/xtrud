// ServiceAreasSection — multi-select городов и районов где работает мастер.
//
// P1-3 (упрощ.) из research/MASTER_ACCOUNT_PLAN.md. Без сёл и без radius —
// мастер просто отмечает чипы городов и/или районов. Минимум 1 локация
// для попадания в выдачу.
//
// Чипы группируются в 2 секции — «Города» (5 cities из БД) и «Районы»
// (4 муниципальных из location-config DISTRICTS). Сохранение через RPC
// set_master_service_areas (DELETE all + INSERT new атомарно).

import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/ui";
import {
  type SetServiceAreasInput,
  useMasterServiceAreas,
  useSetMasterServiceAreas,
} from "@/features/master-profile/use-service-areas";
import { DISTRICTS, PICKER_CITIES } from "@/lib/location-config";

interface ServiceAreasSectionProps {
  masterId: string | null | undefined;
}

export function ServiceAreasSection({ masterId }: ServiceAreasSectionProps) {
  const { data: existing, isLoading } = useMasterServiceAreas(masterId);
  const setAreas = useSetMasterServiceAreas(masterId);

  // Local draft — Set<id> для быстрого toggle.
  const [cities, setCities] = useState<Set<string>>(new Set());
  const [districts, setDistricts] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!hydrated && existing) {
      setCities(new Set(existing.filter((a) => a.kind === "city").map((a) => a.location_id)));
      setDistricts(
        new Set(existing.filter((a) => a.kind === "district").map((a) => a.location_id)),
      );
      setHydrated(true);
    }
  }, [existing, hydrated]);

  const toggleCity = (id: string) => {
    setCities((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDistrict = (id: string) => {
    setDistricts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Dirty-check: текущий draft != existing
  const dirty = (() => {
    if (!existing) return false;
    const existingCities = new Set(
      existing.filter((a) => a.kind === "city").map((a) => a.location_id),
    );
    const existingDistricts = new Set(
      existing.filter((a) => a.kind === "district").map((a) => a.location_id),
    );
    if (cities.size !== existingCities.size || districts.size !== existingDistricts.size) {
      return true;
    }
    for (const c of cities) if (!existingCities.has(c)) return true;
    for (const d of districts) if (!existingDistricts.has(d)) return true;
    return false;
  })();

  const totalSelected = cities.size + districts.size;

  const onSave = async () => {
    const payload: SetServiceAreasInput = {
      cities: Array.from(cities),
      districts: Array.from(districts),
    };
    try {
      await setAreas.mutateAsync(payload);
    } catch (_e) {
      // ошибка отрендерится через setAreas.error ниже
    }
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
      <View className="flex-row items-end justify-between">
        <View className="flex-1">
          <AppText weight="semibold" className="text-title-md tracking-tight text-ink">
            Где работаете
          </AppText>
          <AppText className="mt-1 text-caption text-muted">
            Отметьте города и/или районы. Заявки из этих локаций будут показываться
            в вашей ленте.
          </AppText>
          <AppText className="mt-1 text-caption text-muted-soft">
            Выбрано: {totalSelected}
          </AppText>
        </View>
      </View>

      {/* Города */}
      <AppText weight="semibold" className="mt-4 text-caption uppercase tracking-wider text-muted">
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
              onPress={() => toggleCity(c.id)}
              className={`h-10 items-center justify-center rounded-pill border px-4 ${
                selected
                  ? "border-ink bg-ink"
                  : "border-hairline bg-canvas active:opacity-70"
              }`}
            >
              <AppText
                weight="medium"
                className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
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
              onPress={() => toggleDistrict(d.id)}
              className={`h-10 items-center justify-center rounded-pill border px-4 ${
                selected
                  ? "border-ink bg-ink"
                  : "border-hairline bg-canvas active:opacity-70"
              }`}
            >
              <AppText
                weight="medium"
                className={`text-body-sm ${selected ? "text-on-primary" : "text-ink"}`}
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

      <View className="mt-4">
        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!dirty || setAreas.isPending || totalSelected === 0}
          onPress={onSave}
        >
          {setAreas.isPending
            ? "Сохраняем..."
            : totalSelected === 0
              ? "Выберите хотя бы одну локацию"
              : dirty
                ? "Сохранить изменения"
                : "Сохранено"}
        </Button>
      </View>
    </View>
  );
}
