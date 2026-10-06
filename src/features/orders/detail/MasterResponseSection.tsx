import { CheckCircle, Clock, PaperPlaneTilt } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { StatusPill } from "@/components/StatusPill";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { orderStatusView } from "@/features/orders/order-status-view";
import { useMyResponseForOrder } from "@/features/orders/use-order-responses";
import { useWithdrawResponse } from "@/features/orders/use-withdraw-response";
import { showAlert } from "@/lib/alert";
import { confirmAsync } from "@/lib/confirm";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticSuccess } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";
import { formatResponsePrice } from "./order-response-price";

// ============================================================================
// Master response section — мой отправленный отклик (карточка со статусом и
// «Отозвать»). Сама форма отклика живёт в шторке /orders/respond (DECISION
// владельца 2026-09-07: отклик отделён от задания). Если отклика нет или он
// отозван — секция пустая, кнопка «Откликнуться» плавает внизу экрана.
// ============================================================================

interface MasterResponseSectionProps {
  orderId: string;
  masterId: string;
  orderStatus: Tables<"orders">["status"];
  pickedMasterId: string | null;
}

export function MasterResponseSection({
  orderId,
  masterId,
  orderStatus,
  pickedMasterId,
}: MasterResponseSectionProps) {
  const { data: myResponse } = useMyResponseForOrder(orderId, masterId);
  const withdrawResponse = useWithdrawResponse();
  const tc = useThemeColors(["ink", "accent"]);
  if (!myResponse || (myResponse.status === "withdrawn" && orderStatus === "open")) return null;

  // Выбрали меня: отклик принят или я исполнитель задания (старые закрытия
  // «нашёл исполнителя» оставляли отклик отозванным, но исполнителя — мной).
  const isPickedMaster = myResponse.status === "accepted" || pickedMasterId === masterId;
  const canWithdraw =
    orderStatus === "open" && (myResponse.status === "sent" || myResponse.status === "viewed");
  const onWithdrawPress = async () => {
    if (withdrawResponse.isPending) return;
    const confirmed = await confirmAsync({
      title: "Отозвать отклик?",
      message: "Клиент получит уведомление. Позже можно откликнуться снова.",
      confirmText: "Отозвать",
      cancelText: "Отмена",
    });
    if (!confirmed) return;
    withdrawResponse.mutate(
      { responseId: myResponse.id, orderId, masterId },
      {
        onSuccess: () => hapticSuccess(),
        onError: (e) =>
          showAlert("Не удалось отозвать", describeServerError(e, "Попробуйте ещё раз.")),
      },
    );
  };

  // Отклик как сообщение (DECISION владельца 2026-09-16, ORDER_STATUS_DESIGN
  // §0.4): плашка — «Отклик отправлен» или «Вас выбрали»; что стало с
  // заданием — только тихой строкой ниже, без цвета и без оценки отклика.
  const statusView = orderStatusView({
    role: "master",
    order: { status: orderStatus },
    myResponseStatus: isPickedMaster ? "accepted" : myResponse.status,
  });
  // Выбор мастера сразу закрывает задание (0208, №255): этапа «выполнено»
  // нет, отзыв клиент оставляет сам, когда захочет. Поэтому мастеру —
  // не «работа выполнена», а что делать дальше.
  const hint = isPickedMaster
    ? orderStatus === "cancelled" || orderStatus === "expired"
      ? "Клиент закрыл задание после того, как выбрал вас."
      : "Клиент свяжется с вами по номеру из отклика. Когда закончите работу, попросите его оставить отзыв."
    : orderStatus === "open"
      ? // Обычное ожидание — без пояснения (владелец запрещает подсказки,
        // которые повторяют очевидное; статус уже на плашке).
        null
      : "Задание больше не активно.";

  // Отдельный блок на сером фоне (владелец, 2026-09-11: «отделить дизайном
  // от остального»). Раньше это была InsetGroup — белая плашка на белом
  // экране: от карточки оставались одни линии, а статус висел справа.
  return (
    <View className="mx-4 mt-8 rounded-2xl bg-canvas-soft p-4">
      <View className="flex-row items-center gap-3">
        {/* Плитка — на тинте: сплошной accent только у главного действия,
            активного сегмента и цены (xtrud-design). */}
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-accent-soft">
          <SystemIcon
            sf={isPickedMaster ? "checkmark.seal.fill" : "paperplane.fill"}
            fallback={isPickedMaster ? CheckCircle : PaperPlaneTilt}
            size={18}
            weight="regular"
            color={tc.accent}
          />
        </View>
        <AppText
          accessibilityRole="header"
          weight="semibold"
          className="flex-1 text-title-md text-ink"
        >
          Ваш отклик
        </AppText>
        <StatusPill
          tone={statusView.pillTone}
          label={statusView.label}
          iconKey={statusView.iconKey}
          iconWeight={statusView.iconWeight}
        />
      </View>

      <AppText weight="bold" className="mt-4 text-title-lg text-ink">
        {formatResponsePrice(myResponse)}
      </AppText>
      {myResponse.lead_time ? (
        <View className="mt-1.5 flex-row items-center gap-2">
          <Clock size={16} weight="bold" color={tc.ink} />
          <AppText className="flex-1 text-body-md text-ink">{`Срок: ${myResponse.lead_time}`}</AppText>
        </View>
      ) : null}
      {myResponse.message ? (
        <AppText className="mt-2 text-body-md text-body">{myResponse.message}</AppText>
      ) : null}

      {hint ? <AppText className="mt-4 text-body-sm text-mute">{hint}</AppText> : null}

      {canWithdraw ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отозвать отклик"
          accessibilityState={{
            disabled: withdrawResponse.isPending,
            busy: withdrawResponse.isPending,
          }}
          disabled={withdrawResponse.isPending}
          onPress={() => void onWithdrawPress()}
          className="mt-3 min-h-11 items-center justify-center border-t border-t-hairline pt-1 active:opacity-60"
        >
          <AppText weight="semibold" className="text-body-md text-error">
            {withdrawResponse.isPending ? "Отзываем…" : "Отозвать отклик"}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
