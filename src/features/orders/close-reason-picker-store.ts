/**
 * Транзитный (не persisted) канал результата пикера причины закрытия заказа
 * (`app/(details)/orders/close-reason.tsx`) обратно в `orders/[id].tsx`.
 *
 * Тот же handshake, что у остальных пикеров-роутов (`useOrderDatePickerStore`,
 * `useCategoryFilterPickerStore`): route коммитит выбор и делает
 * `router.back()`, экран заказа слушает store через `useEffect` и выполняет
 * саму мутацию закрытия (`useCancelOrder`) — сама мутация и её `pending`-статус
 * остаются на экране заказа, пикер не знает о сети.
 *
 * `orderId` в результате — защита от гонки: если пользователь как-то успел
 * перейти на другой заказ до того как эффект применил результат, экран заказа
 * сверяет `orderId` со своим `id` и игнорирует чужой результат.
 */

import { create } from "zustand";
import type { CancelReason } from "@/features/orders/use-cancel-order";

interface CloseReasonPickerState {
  result: { orderId: string; reason: CancelReason } | null;
  setResult: (value: { orderId: string; reason: CancelReason } | null) => void;
}

export const useCloseReasonPickerStore = create<CloseReasonPickerState>()((set) => ({
  result: null,
  setResult: (value) => set({ result: value }),
}));
