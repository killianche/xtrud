import { formatPrice } from "@/features/orders/order-schema";
import type { Tables } from "@/types/database";

export function formatResponsePrice(r: Tables<"order_responses">): string {
  // Делегирует общему форматтеру из order-schema. «Цена договорная» → «Договорная»
  // короткая (для inline-меты в карточке отклика).
  if (r.price_kind === "negotiable") return "Договорная";
  return formatPrice(r.price_kind, r.price_value);
}
