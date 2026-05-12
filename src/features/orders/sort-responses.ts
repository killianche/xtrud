/**
 * Pure: правило сортировки откликов мастеров.
 *
 * Sprint 15.2 — Profi-style sort:
 *  1. accepted (picked master) → top
 *  2. sent / viewed (активные) → middle, новые сверху
 *  3. rejected / withdrawn → bottom, новые сверху
 *
 * Client при принятии отклика получает мгновенный визуальный сигнал —
 * мастер уезжает наверх с success-рамкой.
 */

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  sent: 1,
  viewed: 1, // sent и viewed визуально одинаковые для клиента
  withdrawn: 2,
  rejected: 2,
};

/**
 * Generic по {status, created_at} — позволяет в тестах подавать "weird_status"
 * без расширения enum'а order_responses. В рантайме TS-узкий тип
 * order_response_status, тоже extends string.
 */
export function sortResponses<T extends { status: string; created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
