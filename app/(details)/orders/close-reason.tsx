/**
 * /orders/close-reason — выбор причины закрытия заказа.
 *
 * Раньше `CloseReasonSheet` жил как `BottomSheet` внутри `orders/[id].tsx`.
 * Теперь — отдельный route с нативной iOS `formSheet`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): «выбор параметра/подтверждение» →
 * `formSheet`, а не самописный full-screen `<Modal>`.
 *
 * «Завершить задание» (владелец, 2026-10-07, №285: «кнопки „Выбрать“ у
 * отклика не надо — общая кнопка завершить; при завершении выбрать, кто стал
 * мастером, или „никто не подошёл“»). Один шаг:
 *   - откликнувшийся → «Исполнитель выбран» (pick_order_master, 0208);
 *     отзыв потом — кнопкой в задании, сам не предлагается;
 *   - «Нашёл в другом месте» → cancel_reason = 'found_master';
 *   - «Никто не подошёл»     → cancel_reason = 'no_longer_needed'.
 * Заголовок-вопрос без подзаголовка (правило §G design-quality.md).
 * Контент предсказуемой высоты (2 карточки + сноска) → `fitToContents`.
 *
 * Handshake — `useCloseReasonPickerStore` + `router.back()`; экран заказа
 * слушает store и выполняет саму мутацию закрытия (пикер о сети не знает,
 * поэтому здесь нет `pending`-состояния — выбор синхронно уводит назад).
 *
 * Приватный route (владелец-only действие) — сознательно НЕ добавлен в
 * `PUBLIC_DETAIL_ROUTES`: анонимный/чужой deep link просто уводит на табы
 * (fail-closed поведение `AuthGate`), а не показывает форму закрытия чужого
 * заказа. `orderId` обязателен параметром; без него экран не пишет в store.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { MinusCircle, UserCircle, X } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import type { CancelReason } from "@/features/orders/use-cancel-order";
import { useOrderResponses } from "@/features/orders/use-order-responses";
import { useThemeColors } from "@/lib/use-theme-color";

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
};

export default function CloseReasonScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : undefined;
  const setResult = useCloseReasonPickerStore((s) => s.setResult);
  const tc = useThemeColors(["mute"]);

  const close = () => router.back();

  const responsesQ = useOrderResponses(orderId);
  // Выбрать можно только из живых откликов: отозванный или скрытый — нет.
  const responders = (responsesQ.data ?? []).filter(
    (r) => (r.status === "sent" || r.status === "viewed") && r.master,
  );

  const pick = (reason: CancelReason, pickedMasterId: string | null = null) => {
    if (orderId) setResult({ orderId, reason, pickedMasterId });
    close();
  };

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <View className="bg-canvas w-full" style={{ paddingTop: insets.top }}>
        {/* Header — тот же стиль, что у `PickerSheetPage` (bold title + close-X). */}
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="flex-1 text-display-sm tracking-tight text-ink"
            numberOfLines={2}
          >
            Кто стал исполнителем?
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={close}
            hitSlop={10}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            <X size={22} weight="bold" color={tc.mute} />
          </Pressable>
        </View>

        <View className="pb-6 pt-1">
          {responders.length > 0 ? (
            <InsetGroup title="Откликнулись">
              {responders.map((r, i) => {
                const m = r.master;
                const name =
                  [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Специалист";
                return (
                  <InsetRow
                    key={r.id}
                    title={name}
                    subtitle={
                      r.price_value
                        ? `${r.price_value} ₽${r.lead_time ? ` · ${r.lead_time}` : ""}`
                        : (r.lead_time ?? undefined)
                    }
                    icon={<Avatar url={m?.avatar_url} name={name} seed={m?.id} size="sm" />}
                    onPress={() => pick("found_master", m?.id ?? null)}
                    last={i === responders.length - 1}
                  />
                );
              })}
            </InsetGroup>
          ) : null}
          <InsetGroup>
            <InsetRow
              title="Нашёл в другом месте"
              subtitle="Исполнитель не из откликов — задание закроется"
              icon={<UserCircle size={20} weight="bold" color={tc.mute} />}
              onPress={() => pick("found_master", null)}
            />
            <InsetRow
              title="Никто не подошёл"
              subtitle="Задание закроется без исполнителя"
              icon={<MinusCircle size={20} weight="bold" color={tc.mute} />}
              onPress={() => pick("no_longer_needed")}
              last
            />
          </InsetGroup>
        </View>
      </View>
    </>
  );
}
