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
 * Без живых предложений экран не открывается: выбирать некого, задание
 * закрывается после подтверждения (`orders/[id].tsx`, №344).
 * Заголовок-вопрос без подзаголовка (правило §G design-quality.md).
 *
 * Выбор и подтверждение разделены (владелец, 2026-10-20, №347: «люди не
 * понимают, что надо что-то кликать»). Было: строки без признаков выбора,
 * белая группа на белом фоне — читались как текст, а касание сразу
 * закрывало задание. Стало: серый фон шторки, строки — белые группы с
 * пустым кружком справа (как выбор в Почте/Фото); касание только отмечает
 * вариант, закрывает задание розовая «Закрыть задание» внизу — неактивна,
 * пока ничего не выбрано. Список длиннее ~60% экрана прокручивается,
 * кнопка остаётся видна. Высота — `fitToContents`.
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
import { useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { Button, InsetGroup, InsetRow } from "@/components/ui";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import { formatPrice } from "@/features/orders/order-schema";
import type { CancelReason } from "@/features/orders/use-cancel-order";
import { isPickableResponse, useOrderResponses } from "@/features/orders/use-order-responses";
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

/** Выбранный вариант: ключ строки и что уйдёт в закрытие задания. */
interface Choice {
  key: string;
  reason: CancelReason;
  pickedMasterId: string | null;
}

export default function CloseReasonScreen() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : undefined;
  const setResult = useCloseReasonPickerStore((s) => s.setResult);
  const tc = useThemeColors(["mute"]);
  const [choice, setChoice] = useState<Choice | null>(null);

  const close = () => router.back();

  const responsesQ = useOrderResponses(orderId);
  // Выбрать можно только из живых откликов: отозванный или скрытый — нет.
  const responders = (responsesQ.data ?? []).filter(isPickableResponse);

  const confirm = () => {
    if (!choice) return;
    if (orderId) {
      setResult({ orderId, reason: choice.reason, pickedMasterId: choice.pickedMasterId });
    }
    close();
  };

  const isChosen = (key: string) => choice?.key === key;

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <View className="bg-surface-page w-full" style={{ paddingTop: insets.top }}>
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

        <ScrollView
          style={{ maxHeight: height * 0.6 }}
          contentContainerStyle={{ paddingTop: 4 }}
          accessibilityRole="radiogroup"
        >
          {responders.length > 0 ? (
            <InsetGroup title="Предложили услуги">
              {responders.map((r, i) => {
                const m = r.master;
                const name =
                  [m?.first_name, m?.last_name].filter(Boolean).join(" ") || "Специалист";
                const key = `r:${r.id}`;
                return (
                  <InsetRow
                    key={r.id}
                    radio
                    selected={isChosen(key)}
                    title={name}
                    subtitle={
                      r.price_value
                        ? `${formatPrice("fixed", r.price_value)}${r.lead_time ? ` · ${r.lead_time}` : ""}`
                        : (r.lead_time ?? undefined)
                    }
                    icon={<Avatar url={m?.avatar_url} name={name} seed={m?.id} size="sm" />}
                    onPress={() =>
                      setChoice({ key, reason: "found_master", pickedMasterId: m?.id ?? null })
                    }
                    last={i === responders.length - 1}
                  />
                );
              })}
            </InsetGroup>
          ) : null}
          <InsetGroup>
            <InsetRow
              radio
              selected={isChosen("elsewhere")}
              title="Нашёл в другом месте"
              subtitle="Исполнитель не из предложений"
              icon={<UserCircle size={20} weight="bold" color={tc.mute} />}
              onPress={() =>
                setChoice({ key: "elsewhere", reason: "found_master", pickedMasterId: null })
              }
            />
            <InsetRow
              radio
              selected={isChosen("nobody")}
              title="Никто не подошёл"
              subtitle="Задание закроется без исполнителя"
              icon={<MinusCircle size={20} weight="bold" color={tc.mute} />}
              onPress={() =>
                setChoice({ key: "nobody", reason: "no_longer_needed", pickedMasterId: null })
              }
              last
            />
          </InsetGroup>
        </ScrollView>

        <View className="px-4 pt-1" style={{ paddingBottom: insets.bottom + 12 }}>
          <Button variant="accent" size="lg" fullWidth disabled={!choice} onPress={confirm}>
            Закрыть задание
          </Button>
        </View>
      </View>
    </>
  );
}
