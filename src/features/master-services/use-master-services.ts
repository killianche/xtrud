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

export const MASTER_SERVICES_MAX = 20;

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  per_hour: "за час",
  per_task: "за работу",
  per_m2: "за м²",
  per_day: "за день",
};

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
  price_min: number;
  price_max: number | null;
  unit: ServiceUnit;
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
 * Форматирует диапазон цены: "от 1000 ₽", "1000–2000 ₽", и т.д.
 */
export function formatPriceRange(priceMin: number, priceMax: number | null): string {
  const min = formatPrice(priceMin);
  if (priceMax == null || priceMax === priceMin) return `от ${min}`;
  return `${min}–${formatPrice(priceMax)}`;
}

function formatPrice(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}
