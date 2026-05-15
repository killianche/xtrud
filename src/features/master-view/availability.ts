/**
 * Хелперы для статуса готовности мастера.
 * См. миграцию 0043_availability_status.sql.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export type AvailabilityStatus = Enums<"availability_status">;

export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  today: "Готов сегодня",
  this_week: "На этой неделе",
  next_week: "На следующей неделе",
  unavailable: "Не доступен",
};

export const AVAILABILITY_SHORT: Record<AvailabilityStatus, string> = {
  today: "сегодня",
  this_week: "на неделе",
  next_week: "след. неделе",
  unavailable: "не доступен",
};

/** Цвет dot/chip для каждого статуса. Hex чтобы работало inline в RN.
 *  Палитра по решению user 2026-05-14:
 *    today + this_week  → зелёный (мастер «реально доступен»)
 *    next_week          → жёлто-оранжевый (придётся подождать)
 *    unavailable        → нейтральный серый (скрыт от клиента) */
export const AVAILABILITY_DOT: Record<AvailabilityStatus, string> = {
  today: "#10b981", // emerald-500 — bright green «онлайн»
  this_week: "#10b981", // emerald-500 — тот же зелёный, разные подписи
  next_week: "#f59e0b", // amber-500 — мягкое предупреждение
  unavailable: "#94a3b8", // slate-400 (mute)
};

/** Чекаем — должен ли клиент видеть эту инфу (unavailable скрываем чтобы не было «отрицательного» сигнала). */
export function isAvailabilityVisible(s: AvailabilityStatus | null | undefined): boolean {
  return s != null && s !== "unavailable";
}

/** Учитываем что статус мог истечь между cron-запусками — фильтруем на клиенте. */
export function effectiveStatus(
  status: AvailabilityStatus | null | undefined,
  until: string | null | undefined,
): AvailabilityStatus {
  if (!status || status === "unavailable") return "unavailable";
  if (until && new Date(until).getTime() < Date.now()) return "unavailable";
  return status;
}

/** Mutation: мастер ставит свой статус. */
export function useSetAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: AvailabilityStatus) => {
      const { data, error } = await supabase.rpc("set_availability", { p_status: status });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      // Invalidate всё что показывает мастера-меня (топ-мастера, my-profile и т.п.)
      queryClient.invalidateQueries({ queryKey: ["top-masters"] });
      queryClient.invalidateQueries({ queryKey: ["my-master-profile"] });
      queryClient.invalidateQueries({ queryKey: ["master-public"] });
      queryClient.invalidateQueries({ queryKey: ["masters-by-l2"] });
    },
  });
}
