// Hooks для master_service_areas (P1-3 упрощ.).
//
// Архитектура — multi-select городов И районов в одной таблице
// master_service_areas с kind enum('city'|'district').
//
// Source of truth для cities — public.cities (БД-таблица); для districts —
// src/lib/location-config.ts DISTRICTS const (4 муниципальных района РИ).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface ServiceArea {
  id: string;
  kind: "city" | "district";
  location_id: string;
}

export function masterAreasKey(masterId: string | null | undefined) {
  return ["master-service-areas", masterId] as const;
}

export function useMasterServiceAreas(masterId: string | null | undefined) {
  return useQuery<ServiceArea[]>({
    queryKey: masterAreasKey(masterId),
    queryFn: async () => {
      if (!masterId) return [];
      const { data, error } = await supabase
        .from("master_service_areas")
        .select("id, kind, location_id")
        .eq("master_id", masterId);
      if (error) throw error;
      return (data ?? []) as ServiceArea[];
    },
    enabled: !!masterId,
    staleTime: 60_000,
  });
}

export interface SetServiceAreasInput {
  /** ID городов (cities.id, например "magas", "nazran"). */
  cities: string[];
  /** Slugs районов из DISTRICTS (например "nazranovsky"). */
  districts: string[];
}

/**
 * Атомарно перезаписывает service-areas мастера через RPC
 * set_master_service_areas (DELETE all + INSERT new в одной транзакции).
 */
export function useSetMasterServiceAreas(masterId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<void, Error, SetServiceAreasInput>({
    mutationFn: async ({ cities, districts }) => {
      const { error } = await supabase.rpc("set_master_service_areas", {
        p_cities: cities,
        p_districts: districts,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: masterAreasKey(masterId) });
    },
  });
}
