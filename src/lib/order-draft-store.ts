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
import { createJSONStorage, persist } from "zustand/middleware";
import { storage } from "@/lib/storage";
import type { CreateOrderFormValues } from "@/features/orders/order-schema";

export type OrderDraft = Partial<CreateOrderFormValues> & {
  /** Когда draft был последний раз изменён — для отображения в табе «Черновики» и
   *  будущего auto-expire (TTL 14d). Заполняется автоматически в setDraft. */
  updatedAt?: number;
};

interface OrderDraftState {
  /** Полный snapshot формы. Применяется как defaultValues при mount /orders/new. */
  draft: OrderDraft;
  /** Merge: текущий draft + patch + updatedAt. */
  setDraft: (patch: Partial<CreateOrderFormValues>) => void;
  /** Сбросить всё. Вызывается после успешной публикации. */
  clearDraft: () => void;

  /** id выбранной L2 категории — устанавливается с экрана выбора, обнуляется
   *  после применения в форме. Оставляем отдельным флагом для back-compat
   *  с CategoryPicker. */
  selectedL2: string | null;
  setSelectedL2: (id: string | null) => void;

  /** Выбранная локация — устанавливается с экрана /orders/location-select
   *  (тап «Готово»), обнуляется после применения в форме. Тот же эфемерный
   *  handshake-паттерн, что и selectedL2: LocationPicker слушает это поле
   *  через useEffect и применяет cityId+district в react-hook-form. cityId
   *  может быть "all" (Вся Ингушетия), id города или "" (когда выбран район). */
  selectedLocation: { cityId: string; district: string } | null;
  setSelectedLocation: (loc: { cityId: string; district: string } | null) => void;
}

/**
 * Helper: есть ли в draft контент стоящий показа в табе «Черновики».
 * Пустые объекты со только updatedAt не считаются — это «прикоснулся к форме,
 * ничего не ввёл». Минимум: title или description или l2_id.
 */
export function hasDraftContent(d: OrderDraft | null | undefined): boolean {
  if (!d) return false;
  const title = typeof d.title === "string" ? d.title.trim() : "";
  const description = typeof d.description === "string" ? d.description.trim() : "";
  const l2 = typeof d.l2Id === "string" ? d.l2Id.trim() : "";
  return !!(title || description || l2);
}

export const useOrderDraftStore = create<OrderDraftState>()(
  persist(
    (set) => ({
      draft: {},
      setDraft: (patch) =>
        set((s) => ({ draft: { ...s.draft, ...patch, updatedAt: Date.now() } })),
      clearDraft: () => set({ draft: {}, selectedL2: null, selectedLocation: null }),

      selectedL2: null,
      setSelectedL2: (id) => set({ selectedL2: id }),

      selectedLocation: null,
      setSelectedLocation: (loc) => set({ selectedLocation: loc }),
    }),
    {
      name: "xtrud:order-draft",
      storage: createJSONStorage(() => storage),
      // selectedL2 / selectedLocation — эфемерные handshake-поля между экраном
      // выбора и формой, в storage не пишем. Только draft.
      partialize: (s) => ({ draft: s.draft }),
    },
  ),
);
