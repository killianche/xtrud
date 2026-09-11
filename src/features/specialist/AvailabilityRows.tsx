/**
 * AvailabilityRows — «Принимаю заказы»: сегодня / на этой неделе / на
 * следующей / не принимаю. Переключается одним тапом в аккаунте и в хабе
 * «Я специалист» (DECISION владельца 2026-09-07: вместо «скрыть профиль»).
 * Хранится в master_profiles.availability_status (RPC set_availability),
 * показывается в профиле и в каталоге.
 *
 * Без категории не включается (владелец, 2026-09-11): «Принимаю заказы»
 * видят в списке специалистов, а без категории человека там нет. Нажатие
 * объясняет, что сделать; сервер (0187) тоже не даёт включить.
 */

import { useRouter } from "expo-router";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import {
  type AvailabilityStatus,
  useMyAvailability,
  useSetAvailability,
} from "@/features/master-view/availability";
import { promptChooseCategory } from "@/features/specialist/category-required";

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
  const router = useRouter();
  const mine = useMyAvailability(userId);
  const set = useSetAvailability(userId);
  const categories = useMyMasterCategories(userId);
  const locked = categories.isFetched && (categories.data?.length ?? 0) === 0;
  const current = locked ? "unspecified" : (mine.data?.availability_status ?? "unspecified");
  return (
    <InsetGroup
      title="Принимаю заказы"
      footer={
        locked
          ? "Включится после выбора категории: без неё вас нет в списке специалистов."
          : set.error
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
          onPress={() => {
            if (locked) {
              promptChooseCategory(() => router.push("/profile/specialist/categories" as never));
              return;
            }
            if (current === o.id) return;
            set.mutate(o.id);
          }}
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
