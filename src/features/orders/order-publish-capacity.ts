/**
 * Client-visible publication capacity for the current classifieds MVP.
 *
 * This module keeps the provisional product limit and its pure calculation in
 * one place. The client precheck improves UX, but is not an authority: a later
 * forward-only backend migration must enforce the same rule atomically.
 */

export const MAX_ACTIVE_ORDERS = 3;

export interface OrderPublishCapacity {
  activeCount: number;
  limit: number;
  remaining: number;
  canPublish: boolean;
}

export function getOrderPublishCapacity(
  activeCount: number,
  limit = MAX_ACTIVE_ORDERS,
): OrderPublishCapacity {
  const safeLimit = Math.max(0, Math.floor(limit));
  const safeCount = Math.max(0, Math.floor(activeCount));
  const remaining = Math.max(0, safeLimit - safeCount);

  return {
    activeCount: safeCount,
    limit: safeLimit,
    remaining,
    canPublish: remaining > 0,
  };
}

export class ActiveOrderLimitError extends Error {
  readonly code = "active_order_limit_reached";
  readonly limit: number;

  constructor(limit = MAX_ACTIVE_ORDERS) {
    super(`Достигнут лимит: ${limit} активных задания`);
    this.name = "ActiveOrderLimitError";
    this.limit = limit;
  }
}
