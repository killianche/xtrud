/**
 * MyResponsesEntry — pill-кнопка «Мои отклики (N)» со счётчиком активных
 * откликов мастера. Тап → переход на отдельный экран /orders/my-responses
 * (единый список: активные сверху, история ниже).
 *
 * Where (фидбэк владельца 2026-05-28, вечер). Сначала кнопка жила в шапке
 * /orders/search, потом перенесена НА ГЛАВНУЮ мастера, над секцией
 * «Подобрали для вас». На главной мастер первым делом видит и подборку
 * новых заказов, и статус-оверview своих откликов одним движением глаз.
 *
 * Why (общая идея). «Ваши отклики» убраны с главной как полноценный список
 * (это статичная справка — мастер ничего больше не делает после отклика, ждёт
 * звонка). Но быстрая навигация в свои отклики нужна — отсюда entry-pill.
 *
 * UI. Round-pill, hairline-border, иконка ChatCenteredText + текст «Мои
 * отклики» + счётчик активных в скобках (если 0 — без числа, только текст).
 * Видна только если есть activeResponsesCount > 0 OR родитель явно зарендерил
 * (мы решаем «показывать пустую» на стороне места использования). Сейчас на
 * главной мастера: рендерим всегда — мастер должен знать, куда идти, даже
 * если активных откликов 0 (туда смотрит история).
 *
 * Источник данных. Один запрос useMyResponses(userId) → фильтр через
 * isActiveResponse (источник истины, не дублируем предикат).
 */

import { useRouter } from "expo-router";
import { CaretRight, ChatCenteredText } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  isActiveResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useThemeColors } from "@/lib/use-theme-color";

interface MyResponsesEntryProps {
  userId: string;
}

export function MyResponsesEntry({ userId }: MyResponsesEntryProps) {
  const router = useRouter();
  const tc = useThemeColors(["accent", "mute"]);

  const myResponsesQ = useMyResponses(userId);
  const activeResponsesCount = (myResponsesQ.data ?? []).filter(
    isActiveResponse,
  ).length;
  const hasActive = activeResponsesCount > 0;

  return (
    <View className="px-4">
      {/* Full-width карточка-навигация (фидбэк владельца 2026-05-29): иконка в
          мягком кружке + заголовок + статус-строка + счётчик-бейдж + стрелка.
          Единый стиль с карточками профиля. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasActive ? `Мои отклики, активных ${activeResponsesCount}` : "Мои отклики"
        }
        onPress={() => router.push("/(tabs)/orders/my-responses" as never)}
        className="flex-row items-center gap-3 rounded-2xl border border-hairline bg-canvas px-4 py-3.5 active:bg-canvas-soft"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-canvas-soft-2">
          <ChatCenteredText size={20} weight="fill" color={tc.accent} />
        </View>
        <View className="min-w-0 flex-1">
          {/* Подзаголовок «N в ожидании ответа» убран 2026-05-27: в xtrud нет
              статуса «ожидания» — клиент сам звонит/пишет в WhatsApp. Это
              просто история откликов, заголовок самоочевиден. Счётчик активных
              показывается бейджем справа. */}
          <AppText weight="semibold" className="text-body-md text-ink">
            Мои отклики
          </AppText>
        </View>
        {hasActive ? (
          <View className="min-w-6 items-center justify-center rounded-full bg-accent-soft px-2 py-0.5">
            <AppText weight="bold" className="text-caption text-accent">
              {activeResponsesCount}
            </AppText>
          </View>
        ) : null}
        <CaretRight size={18} weight="bold" color={tc.mute} />
      </Pressable>
    </View>
  );
}
