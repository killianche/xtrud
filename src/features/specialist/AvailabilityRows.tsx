/**
 * AvailabilityRows — «Принимаю заказы»: сегодня / на этой неделе / на
 * следующей / не принимаю. Переключается одним тапом в аккаунте и в хабе
 * «Я специалист» (DECISION владельца 2026-09-07: вместо «скрыть профиль»).
 * Хранится в master_profiles.availability_status (RPC set_availability),
 * показывается в профиле и в каталоге.
 */

import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow } from "@/components/ui";
import {
  type AvailabilityStatus,
  useMyAvailability,
  useSetAvailability,
} from "@/features/master-view/availability";

const OPTIONS: Array<{ id: AvailabilityStatus; title: string; subtitle?: string }> = [
  { id: "today", title: "Сегодня", subtitle: "Готов выехать сегодня" },
  { id: "this_week", title: "На этой неделе" },
  { id: "next_week", title: "На следующей неделе" },
  {
    id: "unavailable",
    title: "Не принимаю заказы",
    subtitle: "Профиль остаётся в каталоге с пометкой",
  },
];

export function availabilityTitle(status: AvailabilityStatus | null | undefined): string {
  switch (status) {
    case "today":
      return "Принимает заказы сегодня";
    case "this_week":
      return "Принимает заказы на этой неделе";
    case "next_week":
      return "Принимает заказы на следующей неделе";
    case "unavailable":
      return "Сейчас не принимает заказы";
    default:
      return "Принимает заказы";
  }
}

export function AvailabilityRows({ userId }: { userId: string }) {
  const mine = useMyAvailability(userId);
  const set = useSetAvailability();
  const current = mine.data?.availability_status ?? "unspecified";
  return (
    <InsetGroup
      title="Принимаю заказы"
      footer={
        set.error
          ? "Не удалось сохранить. Попробуйте ещё раз."
          : "Клиенты видят это в вашем профиле и в каталоге."
      }
    >
      {OPTIONS.map((o, i) => (
        <InsetRow
          key={o.id}
          title={o.title}
          subtitle={o.subtitle}
          selected={current === o.id}
          onPress={() => set.mutate(o.id)}
          disabled={set.isPending}
          last={i === OPTIONS.length - 1}
        />
      ))}
      {mine.isLoading ? (
        <View className="px-4 pb-2">
          <AppText className="text-ios-footnote text-mute">Загружаем…</AppText>
        </View>
      ) : null}
    </InsetGroup>
  );
}
