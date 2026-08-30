/**
 * /orders/close-reason — выбор причины закрытия заказа.
 *
 * Раньше `CloseReasonSheet` жил как `BottomSheet` внутри `orders/[id].tsx`.
 * Теперь — отдельный route с нативной iOS `formSheet`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4): «выбор параметра/подтверждение» →
 * `formSheet`, а не самописный full-screen `<Modal>`.
 *
 * Две крупные кнопки (план §4 ORDER_LIFECYCLE_CLIENT_PLAN.md):
 *   - «Я нашёл исполнителя» → cancel_reason = 'found_master'   (успех)
 *   - «Больше не нужно»     → cancel_reason = 'no_longer_needed' (передумал)
 * Обе ведут заказ в статус cancelled — разница только в сохранённой причине.
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
import { CheckCircle, X } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useCloseReasonPickerStore } from "@/features/orders/close-reason-picker-store";
import type { CancelReason } from "@/features/orders/use-cancel-order";
import { useThemeColors } from "@/lib/use-theme-color";

export default function CloseReasonScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string }>();
  const orderId = typeof params.orderId === "string" ? params.orderId : undefined;
  const setResult = useCloseReasonPickerStore((s) => s.setResult);
  const tc = useThemeColors(["mute"]);

  const close = () => router.back();

  const pick = (reason: CancelReason) => {
    if (orderId) setResult({ orderId, reason });
    close();
  };

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <View className="bg-canvas w-full">
        {/* Header — тот же стиль, что у `PickerSheetPage` (bold title + close-X). */}
        <View className="flex-row items-center gap-3 px-5 py-3">
          <AppText
            weight="bold"
            className="flex-1 text-display-sm tracking-tight text-ink"
            numberOfLines={2}
          >
            Почему закрываете задание?
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

        {/* Два крупных варианта-карточки (Lazyweb: DoorDash refund-sheet, Linear
            status-picker). Каждый — иконка в круге + заголовок + описание справа.
            «Нашёл мастера» — позитивный исход (success-tint), «Больше не нужно» —
            нейтральный. Оба → cancelled, разница в cancel_reason. */}
        <View className="gap-2 px-5 pb-6 pt-1">
          <CloseReasonOption
            icon={CheckCircle}
            title="Я нашёл исполнителя"
            description="Договорился с подрядчиком — задача закрыта успешно."
            tone="success"
            onPress={() => pick("found_master")}
          />
          <CloseReasonOption
            icon={X}
            title="Больше не нужно"
            description="Передумал или решил вопрос другим способом."
            tone="neutral"
            onPress={() => pick("no_longer_needed")}
          />

          {/* Честное предупреждение о последствиях (паттерн Avito при снятии).
              Это не subtitle под H1, а сноска внизу списка вариантов. */}
          <AppText className="mt-2 text-caption text-mute" style={{ lineHeight: 18 }}>
            Исполнители перестанут видеть задание и не смогут откликнуться. Контакты тех, кто уже
            откликнулся, останутся у вас.
          </AppText>
        </View>
      </View>
    </>
  );
}

// CloseReasonOption — карточка-вариант причины закрытия. Раньше рендерилась в
// `BottomSheet` (Modal-портал), где CSS-vars не резолвились — цвета
// приходилось брать hex'ом из палитры по DOM-теме. Обычный route-контент
// такой проблемы не имеет — NativeWind className работает как везде.
interface CloseReasonOptionProps {
  icon: typeof CheckCircle;
  title: string;
  description: string;
  tone: "success" | "neutral";
  onPress: () => void;
}

function CloseReasonOption({
  icon: Icon,
  title,
  description,
  tone,
  onPress,
}: CloseReasonOptionProps) {
  const tc = useThemeColors(["success", "ink"]);
  const iconColor = tone === "success" ? tc.success : tc.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-3.5 rounded-2xl border border-hairline bg-canvas px-4 py-3.5 active:opacity-70"
    >
      <View
        className={`h-11 w-11 items-center justify-center rounded-xl ${
          tone === "success" ? "bg-success-soft" : "bg-canvas-soft"
        }`}
      >
        <Icon size={24} weight={tone === "success" ? "fill" : "bold"} color={iconColor} />
      </View>
      <View className="flex-1 min-w-0">
        <AppText weight="semibold" className="text-body-md text-ink">
          {title}
        </AppText>
        <AppText className="mt-0.5 text-caption text-mute">{description}</AppText>
      </View>
    </Pressable>
  );
}
