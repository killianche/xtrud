/**
 * Хелперы для статуса готовности мастера.
 * См. миграцию 0043_availability_status.sql.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@/types/database";

export type AvailabilityStatus = Enums<"availability_status">;

// Полные подписи бейджа доступности. Префикс «Готов» добавлен ко всем срочным
// статусам (2026-05-27) — раньше «На следующей неделе» без контекста читалось
// непонятно (фидбэк владельца: «надо понятнее, что это про готовность мастера
// взяться за заказ»). Теперь смысл самоочевиден: мастер готов взяться тогда-то.
export const AVAILABILITY_LABELS: Record<AvailabilityStatus, string> = {
  today: "Готов сегодня",
  this_week: "Готов на этой неделе",
  next_week: "Готов на следующей неделе",
  // 'unspecified' — нейтральный «готов, срок не указан». Значок клиенту не
  // показывается, штрафа в выдаче нет (решение владельца 2026-05-24).
  unspecified: "Не указан",
  unavailable: "Не доступен",
};

export const AVAILABILITY_SHORT: Record<AvailabilityStatus, string> = {
  today: "сегодня",
  this_week: "на неделе",
  next_week: "след. неделе",
  unspecified: "не указан",
  unavailable: "не доступен",
};

/** Цвет dot/chip для каждого статуса. Hex чтобы работало inline в RN.
 *  Палитра по решению user 2026-05-14:
 *    today + this_week  → зелёный (мастер «реально доступен»)
 *    next_week          → жёлто-оранжевый (придётся подождать)
 *    unspecified        → нейтральный серый (готов, срок не указан; клиенту скрыт)
 *    unavailable        → приглушённый серый (явно недоступен; клиенту скрыт) */
export const AVAILABILITY_DOT: Record<AvailabilityStatus, string> = {
  today: "#10b981", // emerald-500 — bright green «онлайн»
  this_week: "#10b981", // emerald-500 — тот же зелёный, разные подписи
  next_week: "#f59e0b", // amber-500 — мягкое предупреждение
  unspecified: "#94a3b8", // slate-400 — нейтральный (готов без срока)
  unavailable: "#94a3b8", // slate-400 — приглушённый (недоступен)
};

/** Должен ли клиент видеть значок статуса. Скрываем И 'unavailable' (негативный
 *  сигнал), И 'unspecified' (срок не указан — нечего показывать). Значок виден
 *  только для срочных статусов today / this_week / next_week. */
export function isAvailabilityVisible(s: AvailabilityStatus | null | undefined): boolean {
  return s != null && s !== "unavailable" && s !== "unspecified";
}

/** Учитываем что статус мог истечь между cron-запусками — приводим на клиенте.
 *  Истёкший срочный статус → нейтральный 'unspecified' (НЕ 'unavailable'):
 *  мастер не «наказывается» за непродление таймера. 'unavailable' остаётся
 *  только если выбран явно. Нет статуса → нейтральный 'unspecified'. */
export function effectiveStatus(
  status: AvailabilityStatus | null | undefined,
  until: string | null | undefined,
): AvailabilityStatus {
  if (!status) return "unspecified";
  if (status === "unavailable") return "unavailable";
  if (status === "unspecified") return "unspecified";
  // срочный статус (today / this_week / next_week)
  if (until && new Date(until).getTime() < Date.now()) return "unspecified";
  return status;
}

/**
 * Бонус доступности к ranking_score при сортировке выдачи (рейтинг мастеров,
 * Этап 1). «Быстрый» фактор гибрида (MASTER_RANKING_PLAN.md §3.6): нажал
 * «Готов сегодня» — поднялся мгновенно, не дожидаясь ночного пересчёта балла.
 *
 * Шкала (решение владельца 2026-05-24):
 *   today → 20, this_week → 16, next_week → 10 — срочно доступен, выше всех.
 *   unspecified → 4 — НЕЙТРАЛЬНО: «готов, срок не указан» (в т.ч. истёкший
 *     таймер). Без штрафа, обычное место в выдаче.
 *   unavailable → −1000 — ЯВНО недоступен: тяжёлый штраф, уходит в самый низ
 *     выдачи, после всех у кого есть статус или «не указан» (−1000 заведомо
 *     перекрывает любой ranking_score, поэтому такие мастера всегда последние,
 *     но из выдачи не исчезают).
 */
export function availabilityBonus(
  status: AvailabilityStatus | null | undefined,
  until: string | null | undefined,
): number {
  switch (effectiveStatus(status, until)) {
    case "today":
      return 20;
    case "this_week":
      return 16;
    case "next_week":
      return 10;
    case "unavailable":
      return -1000;
    default:
      // 'unspecified' — нейтральный baseline.
      return 4;
  }
}

/**
 * Итоговое значение для сортировки мастеров в выдаче (категория / поиск /
 * лучшие мастера): материализованный `ranking_score` (медленные факторы —
 * отзывы, заполненность, отклики, активность, cold-start; считается ночным
 * cron) + бонус доступности (быстрый фактор). Больше — выше.
 */
export function rankingSortValue(
  rankingScore: number | null | undefined,
  status: AvailabilityStatus | null | undefined,
  until: string | null | undefined,
): number {
  return (rankingScore ?? 0) + availabilityBonus(status, until);
}

export interface MyAvailability {
  availability_status: AvailabilityStatus;
  availability_until: string | null;
}

/**
 * Текущий статус готовности мастера (для триггера-плашки). Тот же queryKey, что
 * у приватного хука в AvailabilitySwitcher — кэш общий, а useSetAvailability
 * инвалидирует префикс ["my-master-profile"], так что после смены плашка
 * обновляется. Единый источник, чтобы не дублировать запрос (connect-the-dots).
 */
export function useMyAvailability(userId: string | undefined) {
  return useQuery<MyAvailability | null>({
    queryKey: ["my-master-profile", userId, "availability"],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("availability_status, availability_until")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return (data as MyAvailability | null) ?? null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });
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
      // Ключа "my-master-profile" в коде нет: своя строка master_profiles
      // читается под ["master-profile", userId] (профиль и редактор профиля).
      // Прежний вызов был холостым — статус доступности на своём профиле
      // после переключения не обновлялся.
      queryClient.invalidateQueries({ queryKey: ["master-profile"] });
      queryClient.invalidateQueries({ queryKey: ["master-public"] });
      queryClient.invalidateQueries({ queryKey: ["masters-by-l2"] });
    },
  });
}
