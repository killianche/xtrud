/**
 * order-list-sections.ts — сборка списков «Мои задания» (обе роли) и счётчик
 * для SegmentedControl. Раньше это было размазано по orders/index.tsx:
 * отдельный `ACTIVE_STATUSES` набор статусов для деления списка клиента,
 * отдельная (другая!) сортировка `isActiveResponse` для списка мастера, и
 * счётчик сегмента — просто `myOrders?.length` (все, а не активные). Три
 * места, каждое со своим представлением «активно ли это».
 *
 * Единый источник — `orderStatusView().cardArchived` (то же самое поле,
 * которое красит карточку и решает архив/не архив в OrderRow). Ни списки, ни
 * счётчик не заводят пятого источника правды поверх него — см.
 * docs/ORDER_STATUS_DESIGN.md §4.2.
 */

import type { OrderStatusView } from "./order-status-view";
import { orderStatusView } from "./order-status-view";
import type { OrderWithRefs } from "./use-my-orders";
import type { MyResponseWithOrder } from "./use-my-responses";

export type OrderListSectionItem<T> =
  | { kind: "archiveHeader" }
  | { kind: "row"; id: string; statusView: OrderStatusView; data: T };

interface SortableItem<T> {
  id: string;
  /** ms since epoch — сортировка внутри своей секции. */
  sortKey: number;
  statusView: OrderStatusView;
  data: T;
}

/**
 * Активные сверху (сначала `confirmed` — у человека уже есть исход, ему
 * важнее, — затем `neutral`; внутри группы по `sortKey` убыв.), затем, если
 * есть архив, — заголовок секции и архив (по `sortKey` убыв., §4.2). Если
 * архива нет — заголовка нет. Если активных нет, а архив есть — заголовок
 * всё равно показывается (архив — не то же самое, что пустой список).
 */
function buildSections<T>(items: SortableItem<T>[]): OrderListSectionItem<T>[] {
  const active = items.filter((i) => !i.statusView.cardArchived);
  const archived = items.filter((i) => i.statusView.cardArchived);
  const rank = (i: SortableItem<T>) => (i.statusView.pillTone === "confirmed" ? 0 : 1);
  const activeSorted = [...active].sort((a, b) => rank(a) - rank(b) || b.sortKey - a.sortKey);
  const archivedSorted = [...archived].sort((a, b) => b.sortKey - a.sortKey);

  const toRows = (list: SortableItem<T>[]): OrderListSectionItem<T>[] =>
    list.map((i) => ({ kind: "row" as const, id: i.id, statusView: i.statusView, data: i.data }));

  return archivedSorted.length > 0
    ? [...toRows(activeSorted), { kind: "archiveHeader" as const }, ...toRows(archivedSorted)]
    : toRows(activeSorted);
}

/** «Мои задания» → «Как клиент». */
export function buildOrderSections(orders: OrderWithRefs[]): OrderListSectionItem<OrderWithRefs>[] {
  return buildSections(
    orders.map((o) => ({
      id: o.id,
      sortKey: new Date(o.created_at).getTime(),
      statusView: orderStatusView({ role: "client", order: o }),
      data: o,
    })),
  );
}

/**
 * «Мои задания» → «Как мастер» (§0.3, 2026-09-16): один плоский список без
 * архива и приглушения — отклик как отправленное сообщение. «Вас выбрали»
 * сверху, дальше по дате отклика.
 */
export function buildResponseList(
  responses: MyResponseWithOrder[],
): OrderListSectionItem<MyResponseWithOrder>[] {
  const items = responses.map((r) => ({
    id: r.response.id,
    sortKey: new Date(r.response.created_at).getTime(),
    statusView: orderStatusView({
      role: "master",
      order: r.order,
      // Исполнитель задания — я: старые закрытия «нашёл исполнителя»
      // оставляли отклик отозванным, но выбран был именно я.
      myResponseStatus:
        r.order.picked_master_id === r.response.master_id ? "accepted" : r.response.status,
    }),
    data: r,
  }));
  const rank = (i: (typeof items)[number]) => (i.statusView.pillTone === "confirmed" ? 0 : 1);
  return [...items]
    .sort((x, y) => rank(x) - rank(y) || y.sortKey - x.sortKey)
    .map((i) => ({ kind: "row" as const, id: i.id, statusView: i.statusView, data: i.data }));
}

/** Счётчик сегмента «Как клиент» — DECISION владельца §4.2: только активные;
 *  0 активных → `null`, чтобы SegmentedControl не рисовал «· 0» (архив может
 *  быть не пуст — ноль активных не значит «здесь ничего нет»). */
export function countActiveOrders(orders: OrderWithRefs[]): number | null {
  const n = orders.filter(
    (o) => !orderStatusView({ role: "client", order: o }).cardArchived,
  ).length;
  return n > 0 ? n : null;
}

/** Счётчик сегмента «Как мастер» (§0.6): отклики, которые ещё ждут решения
 *  клиента — задание открыто, отклик не отклонён и не отозван. */
export function countPendingResponses(responses: MyResponseWithOrder[]): number | null {
  const n = responses.filter(
    (r) =>
      r.order.status === "open" && (r.response.status === "sent" || r.response.status === "viewed"),
  ).length;
  return n > 0 ? n : null;
}
