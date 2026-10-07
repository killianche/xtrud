/** Карточка задания на экранах поиска — один набор полей для всех списков. */

import { OrderRow } from "@/components/OrderRow";
import type { OrderWithRefs } from "@/features/orders/use-my-orders";

export function FindOrderRow({
  order: o,
  responded,
  mine,
  onOpen,
}: {
  order: OrderWithRefs;
  responded: boolean;
  /** Задание текущего пользователя — плашка «Ваше задание» (№287). */
  mine: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <OrderRow
      id={o.id}
      title={o.title}
      categoryName={o.l2?.name_ru ?? o.l2_id}
      categoryIcon={o.l2?.icon ?? null}
      categoryL2Id={o.l2_id}
      cityName={o.city?.name ?? o.city_id ?? null}
      district={o.district}
      village={o.village}
      urgency={o.urgency}
      preferredDate={o.preferred_date}
      responsesCount={o.responses_count}
      createdAt={o.created_at}
      showResponsesCount={false}
      budgetKind={o.budget_kind}
      budgetValue={o.budget_value}
      description={o.description}
      contactMode={o.contact_mode}
      coverUrl={o.photo_urls?.[0] ?? null}
      photosCount={o.photo_urls?.length ?? 0}
      alreadyResponded={responded}
      isMine={mine}
      onPress={() => onOpen(o.id)}
    />
  );
}
