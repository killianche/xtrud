// Hooks для управления master_services текущего мастера (Sprint 31.5).
//
// queryKey ['master-services', masterId] — публично читаемый список (RLS select=true),
// тот же набор используется на master/[id].tsx и в edit-master.tsx.
//
// Лимит 20 услуг enforced trigger'ом БД, на клиенте disable «Добавить» при достижении.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums, Tables, TablesInsert, TablesUpdate } from "@/types/database";

export type MasterService = Tables<"master_services">;
export type ServiceUnit = Enums<"service_unit">;
export type ServicePricingKind = Enums<"service_pricing_kind">;

export const MASTER_SERVICES_MAX = 20;

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  per_hour: "за час",
  per_task: "за работу",
  per_m2: "за м²",
  per_day: "за день",
};

export const PRICING_KIND_LABELS: Record<ServicePricingKind, string> = {
  fixed: "Точная",
  from: "От",
  up_to: "До",
  hourly: "Почасовая",
  quote: "Договорная",
  range: "Диапазон", // legacy — UI новых форм не предлагает, см. PRICING_KIND_OPTIONS
};

export const PRICING_KIND_HINT: Record<ServicePricingKind, string> = {
  fixed: "Одна точная цена за услугу",
  from: "«От X ₽» — стартовая цена, может быть выше",
  up_to: "«До X ₽» — потолок, может быть ниже",
  hourly: "Цена за час работы",
  quote: "По запросу — цена после осмотра",
  range: "Цена «от X до Y» — клиент видит вилку (legacy)",
};

/**
 * Опции pricing_kind, которые показывает picker нового UI. `range` намеренно
 * убран — фидбэк user 2026-05-15/2026-05-16: «диапазоны не нужны, либо от,
 * либо до». Legacy-данные с `range` остаются читаемыми (см. formatServicePrice).
 */
export const PRICING_KIND_OPTIONS: ServicePricingKind[] = [
  "fixed",
  "from",
  "up_to",
  "hourly",
  "quote",
];

export function masterServicesKey(masterId: string | null | undefined) {
  return ["master-services", masterId] as const;
}

export function useMasterServices(masterId: string | null | undefined) {
  return useQuery<MasterService[]>({
    queryKey: masterServicesKey(masterId),
    queryFn: async () => {
      if (!masterId) return [];
      const { data, error } = await supabase
        .from("master_services")
        .select("*")
        .eq("master_id", masterId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });
}

export interface UpsertMasterServiceInput {
  id?: string;
  title: string;
  /** Минимальная цена. Может быть null если pricing_kind='quote'. */
  price_min: number | null;
  price_max: number | null;
  unit: ServiceUnit;
  /** Тип ценообразования (миграция 0057, P0-10). Default 'fixed'. */
  pricing_kind?: ServicePricingKind;
  /** L2-категория услуги. Передаётся новым UI после миграции 0056 (P0-2). */
  l2_id?: string | null;
  /** Опц. конкретная L3 услуга из таксономии. NULL = свободный текст в title. */
  l3_id?: string | null;
}

/**
 * Insert (id отсутствует) или Update (id задан) одной услуги.
 * position при insert ставим в конец (max + 1), при update оставляем как было.
 *
 * l2_id / l3_id опциональны для обратной совместимости с legacy-вызовами;
 * новый UI (P0-3 / P0-4) обязательно передаёт l2_id для всех INSERT и при
 * выборе из pre-defined услуг — также l3_id.
 */
export function useUpsertMasterService(masterId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<MasterService, Error, UpsertMasterServiceInput>({
    mutationFn: async (input) => {
      if (!masterId) throw new Error("Не авторизованы");

      if (input.id) {
        const update: TablesUpdate<"master_services"> = {
          title: input.title,
          price_min: input.price_min,
          price_max: input.price_max,
          unit: input.unit,
          ...(input.pricing_kind !== undefined ? { pricing_kind: input.pricing_kind } : {}),
          ...(input.l2_id !== undefined ? { l2_id: input.l2_id } : {}),
          ...(input.l3_id !== undefined ? { l3_id: input.l3_id } : {}),
        };
        const { data, error } = await supabase
          .from("master_services")
          .update(update)
          .eq("id", input.id)
          .select("*")
          .single();
        if (error) throw error;
        return data;
      }

      const { data: maxRow } = await supabase
        .from("master_services")
        .select("position")
        .eq("master_id", masterId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPosition = (maxRow?.position ?? -1) + 1;

      const insert: TablesInsert<"master_services"> = {
        master_id: masterId,
        title: input.title,
        price_min: input.price_min,
        price_max: input.price_max,
        unit: input.unit,
        position: nextPosition,
        ...(input.pricing_kind !== undefined ? { pricing_kind: input.pricing_kind } : {}),
        ...(input.l2_id !== undefined ? { l2_id: input.l2_id } : {}),
        ...(input.l3_id !== undefined ? { l3_id: input.l3_id } : {}),
      };
      const { data, error } = await supabase
        .from("master_services")
        .insert(insert)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: masterServicesKey(masterId) });
    },
  });
}

export function useDeleteMasterService(masterId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from("master_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: masterServicesKey(masterId) });
    },
  });
}

/**
 * Legacy helper: возвращает «от X ₽» для не-null цены, иначе «Договорная».
 * Используется одним legacy-местом (`MasterServicesList`); новый код вызывает
 * `formatServicePrice`, которое уважает `pricing_kind` и не лепит «от» к
 * точной цене.
 */
export function formatPriceRange(priceMin: number | null, _priceMax: number | null): string {
  if (priceMin == null) return "Договорная";
  return `от ${formatPrice(priceMin)}`;
}

/**
 * Форматирует цену услуги с учётом pricing_kind.
 *
 * - quote        → «Договорная» (без unit)
 * - hourly       → «от 1500 ₽ / час» (час — единственный режим, где префикс
 *                  «от» подразумевается всегда)
 * - fixed        → «1500 ₽» (без префикса)
 * - from         → «от 1500 ₽»
 * - up_to        → «до 2000 ₽»
 * - range (lega) → «от 1500 ₽» (price_max игнорируется — см. user feedback
 *                  2026-05-15 «убрать диапазоны»)
 *
 * Юнит `per_task` («за работу») по фидбэку user 2026-05-15 не отображаем —
 * это дефолтный case без особенностей измерения, suffix только засоряет.
 * Значимые юниты (м², м.п., день, смена) остаются.
 */
export function formatServicePrice(service: {
  pricing_kind?: ServicePricingKind | null;
  price_min: number | null;
  price_max: number | null;
  unit: ServiceUnit;
}): string {
  const kind = service.pricing_kind ?? "fixed";
  if (kind === "quote") return "Договорная";

  // hourly особый случай — price_min используется как ставка за час.
  if (kind === "hourly") {
    if (service.price_min == null) return "Договорная";
    return `от ${formatPrice(service.price_min)} / час`;
  }

  // up_to: показываем price_max (если есть), иначе price_min (legacy fallback).
  if (kind === "up_to") {
    const value = service.price_max ?? service.price_min;
    if (value == null) return "Договорная";
    const base = `до ${formatPrice(value)}`;
    return service.unit === "per_task"
      ? base
      : `${base} · ${SERVICE_UNIT_LABELS[service.unit]}`;
  }

  // fixed / from / range (legacy) — все смотрят на price_min.
  if (service.price_min == null) return "Договорная";
  const base =
    kind === "fixed"
      ? formatPrice(service.price_min)
      : `от ${formatPrice(service.price_min)}`;
  return service.unit === "per_task"
    ? base
    : `${base} · ${SERVICE_UNIT_LABELS[service.unit]}`;
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}
