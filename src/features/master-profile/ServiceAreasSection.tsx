// ServiceAreasSection — multi-select городов и районов где работает мастер.
//
// P1-3 (упрощ.) из research/MASTER_ACCOUNT_PLAN.md. Без сёл и без radius —
// мастер просто отмечает чипы городов и/или районов.
//
// Auto-save при каждом тапе chip (фидбэк user 2026-05-15: «2 кнопки
// "Сохранить"»). Локальная save-кнопка убрана — каждое изменение мгновенно
// уходит в RPC set_master_service_areas. Inline status «Сохранено» / spinner
// заменяет save-кнопку.

import { Check } from "lucide-react-native";
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
            Отметьте города и/или районы. Заявки из этих локаций будут показываться
            в вашей ленте.
          </AppText>
          <AppText className="mt-1 text-caption text-muted-soft">
            Выбрано: {totalSelected}
          </AppText>
        </View>
        {/* Inline status вместо save-кнопки. */}
        {setAreas.isPending ? (
          <View className="flex-row items-center gap-1.5">
            <ActivityIndicator size="small" />
            <AppText className="text-caption text-muted">Сохраняем…</AppText>
          </View>
        ) : showSaved ? (
          <View className="flex-row items-center gap-1.5">
            <Check size={14} strokeWidth={2.5} color={successColor} />
            <AppText weight="medium" className="text-caption text-success">
              Сохранено
            </AppText>
          </View>
        ) : null}
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
              disabled={setAreas.isPending}
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
              disabled={setAreas.isPending}
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
    </View>
  );
}
