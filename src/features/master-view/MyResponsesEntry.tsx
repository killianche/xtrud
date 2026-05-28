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
import { ChatCenteredText } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  isActiveResponse,
  useMyResponses,
} from "@/features/orders/use-my-responses";
import { useThemeColor } from "@/lib/use-theme-color";

interface MyResponsesEntryProps {
  userId: string;
}

export function MyResponsesEntry({ userId }: MyResponsesEntryProps) {
  const router = useRouter();
  const inkColor = useThemeColor("ink");

  const myResponsesQ = useMyResponses(userId);
  const activeResponsesCount = (myResponsesQ.data ?? []).filter(
    isActiveResponse,
  ).length;

  return (
    <View className="px-4">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          activeResponsesCount > 0
            ? `Мои отклики, активных ${activeResponsesCount}`
            : "Мои отклики"
        }
        onPress={() => router.push("/(tabs)/orders/my-responses" as never)}
        hitSlop={8}
        className="h-10 flex-row items-center gap-2 self-start rounded-full border border-hairline bg-canvas px-4 active:opacity-70"
      >
        <ChatCenteredText size={16} weight="bold" color={inkColor} />
        <AppText weight="semibold" className="text-button text-ink">
          Мои отклики
        </AppText>
        {activeResponsesCount > 0 ? (
          <AppText weight="medium" className="text-button text-mute">
            {activeResponsesCount}
          </AppText>
        ) : null}
      </Pressable>
    </View>
  );
}
