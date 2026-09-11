/**
 * /profile/specialist/statuses — что значат статусы профиля специалиста
 * (владелец, 2026-09-11: «рядом со статусом — информационная кнопка»).
 * Системная шторка, как отклик.
 *
 * Тексты — ровно то, что делает код: без категории профиля нет в каталоге
 * (try_publish_master), «Принимаю заказы» включается только с категорией
 * (set_availability, 0187), рассылка «Новая заявка» идёт только тем, кто в
 * каталоге (process_order_broadcast_queue). Откликаться можно при любом
 * статусе (DECISION владельца 2026-09-11).
 */

import { Stack, useRouter } from "expo-router";
import { XCircle } from "phosphor-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";

// Параметры шторки — константа модуля (иначе переоткрывается при рендере).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.8, 1.0],
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
};

type Tone = "success" | "warning" | "error";

const STATUSES: ReadonlyArray<{ label: string; tone: Tone; text: string }> = [
  {
    label: "В каталоге",
    tone: "success",
    text: "Клиенты находят вас во вкладке «Специалисты». Приходят уведомления о новых заданиях в ваших категориях и районах.",
  },
  {
    label: "Нет категории",
    tone: "warning",
    text: "Профиль есть, но в списке специалистов его нет. Выберите хотя бы одну категорию — и включатся показ в каталоге, «Принимаю заказы» и уведомления о новых заданиях.",
  },
  {
    label: "Скрыт вами",
    tone: "warning",
    text: "Вы выключили «Показывать среди специалистов». В каталоге вас нет, но профиль открывается по прямой ссылке.",
  },
  {
    label: "Скрыт администратором",
    tone: "error",
    text: "Профиль убран из каталога модерацией. Если это ошибка, напишите в поддержку.",
  },
  {
    label: "Заблокирован",
    tone: "error",
    text: "Аккаунт заблокирован администратором. Напишите в поддержку.",
  },
];

export default function SpecialistStatusesSheet() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["mute", "success", "warning", "error"]);

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      {/* Отступ от чёлки — контракт для каждого экрана
          (screen-top-inset-contract.test.ts), как у шторки отклика. */}
      <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center gap-3 px-4 pt-5 pb-3">
          <AppText
            accessibilityRole="header"
            weight="bold"
            className="min-w-0 flex-1 text-ios-title1 text-ink"
          >
            Статусы профиля
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            hitSlop={8}
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center active:opacity-60"
          >
            <SystemIcon
              sf="xmark.circle.fill"
              fallback={XCircle}
              size={30}
              weight="regular"
              color={tc.mute}
            />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          <View className="mx-4 overflow-hidden rounded-2xl bg-canvas">
            {STATUSES.map((s, i) => (
              <View
                key={s.label}
                accessible
                accessibilityLabel={`${s.label}. ${s.text}`}
                className={`flex-row gap-3 px-4 py-3.5 ${
                  i < STATUSES.length - 1 ? "border-b border-hairline" : ""
                }`}
              >
                <View
                  className="mt-2 h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: tc[s.tone] }}
                />
                <View className="min-w-0 flex-1">
                  <AppText weight="semibold" className="text-ios-body text-ink">
                    {s.label}
                  </AppText>
                  <AppText className="mt-0.5 text-ios-subheadline text-mute">{s.text}</AppText>
                </View>
              </View>
            ))}
          </View>
          <AppText className="mx-8 mt-2 text-ios-footnote text-mute">
            Откликаться на задания можно при любом статусе.
          </AppText>

          <AppText weight="semibold" className="mx-8 mt-7 text-ios-body text-ink">
            Чтобы клиенты выбирали вас
          </AppText>
          <AppText className="mx-8 mt-1 text-ios-subheadline text-mute">
            Выберите категории, расскажите о себе, добавьте фото работ и контакты. Заполненный
            профиль вызывает больше доверия, чем пустой.
          </AppText>
        </ScrollView>
      </View>
    </>
  );
}
