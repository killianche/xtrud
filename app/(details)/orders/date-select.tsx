/**
 * /orders/date-select — пикер точной даты «К дате» для формы заказа.
 *
 * Раньше `<OrderDateSheet>` жил как `BottomSheet` внутри `OrderFormBody`.
 * Теперь — отдельный route с нативной iOS `formSheet`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): «выбор параметра/подтверждение» →
 * `formSheet`, а не самописный full-screen `<Modal>`.
 *
 * Календарь — предсказуемая по высоте карточка (заголовок месяца + сетка
 * 7×6 + 2 quick-пилюли + кнопка «Готово»), поэтому `fitToContents`, а не
 * массив detents со скроллом (в отличие от длинных списков вроде
 * `category/city-select` / `category/l3-select`).
 *
 * Handshake — `useOrderDatePickerStore` + `router.back()`; `OrderFormBody`
 * слушает store и применяет выбранную дату (+ ставит срок `urgency: "by_date"`)
 * в react-hook-form.
 *
 * Deep link: `value` необязателен — без него календарь открывается на
 * текущем месяце без выбранного дня, ничего не падает.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { OrderDateSheet } from "@/features/orders/OrderDateSheet";
import { useOrderDatePickerStore } from "@/features/orders/order-date-picker-store";

export default function DateSelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ value?: string }>();
  const setResult = useOrderDatePickerStore((s) => s.setResult);

  const currentValue = typeof params.value === "string" && params.value ? params.value : null;

  const close = () => router.back();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <OrderDateSheet value={currentValue} onSelect={(iso) => setResult(iso)} onClose={close} />
    </>
  );
}
