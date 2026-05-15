/**
 * Order draft store — persisted-in-memory draft заказа.
 *
 * Зачем. На /orders/new пользователь заполняет форму. Если он кликает на
 * «Выбрать категорию» → /orders/category-select → возвращается обратно,
 * react-hook-form внутри NewOrderScreen теряет state (особенно когда
 * useSafeBack делает router.replace — экран unmount'ится и
 * пересоздаётся с defaultValues). Также теряется при случайном
 * переключении табов, при reload страницы, или при JIT-signup flow когда
 * анон уходит логиниться.
 *
 * Решение. Полный snapshot формы — в Zustand. /orders/new подписывается
 * на store как defaultValues и пишет обратно на каждое изменение (через
 * `watch()` + `setDraft`). После успешной публикации — `clearDraft()`.
 *
 * Persistence. Сейчас только в памяти (Zustand). Если нужно переживать
 * full reload — обернуть в `persist` middleware с localStorage. Не делаю
 * сразу, потому что: (a) на native localStorage = AsyncStorage, нужен
 * @react-native-async-storage; (b) draft с PII (адрес, цена) лучше не
 * хранить долго без причины — TTL должен быть короткий. Для текущей задачи
 * (back-в-категории не теряет данные) хватает in-memory.
 *
 * Контракт:
 *   - `draft` — Partial<CreateOrderFormValues>; undefined-поля = пользователь
 *     не вводил значения, можно подставить defaultValues.
 *   - `setDraft(patch)` — merge с текущим draft (НЕ replace).
 *   - `clearDraft()` — сбросить всё. Вызывается на success-публикации.
 *   - `selectedL2` — back-compat: отдельное поле, потому что category-select
 *     записывает выбор и /orders/new применяет в react-hook-form через
 *     CategoryPicker.useEffect (см. там).
 */

import { create } from "zustand";
import type { CreateOrderFormValues } from "@/features/orders/order-schema";

export type OrderDraft = Partial<CreateOrderFormValues>;

interface OrderDraftState {
  /** Полный snapshot формы. Применяется как defaultValues при mount /orders/new. */
  draft: OrderDraft;
  /** Merge: текущий draft + patch. */
  setDraft: (patch: OrderDraft) => void;
  /** Сбросить всё. Вызывается после успешной публикации. */
  clearDraft: () => void;

  /** id выбранной L2 категории — устанавливается с экрана выбора, обнуляется
   *  после применения в форме. Оставляем отдельным флагом для back-compat
   *  с CategoryPicker. */
  selectedL2: string | null;
  setSelectedL2: (id: string | null) => void;
}

export const useOrderDraftStore = create<OrderDraftState>((set) => ({
  draft: {},
  setDraft: (patch) => set((s) => ({ draft: { ...s.draft, ...patch } })),
  clearDraft: () => set({ draft: {}, selectedL2: null }),

  selectedL2: null,
  setSelectedL2: (id) => set({ selectedL2: id }),
}));
