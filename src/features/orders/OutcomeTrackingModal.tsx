/**
 * Outcome tracking modal — Яндекс/Profi паттерн.
 *
 * Когда клиент принял отклик мастера и прошло ≥ 3 дня без отметки
 * «Работа выполнена», спрашиваем результат:
 *  - «Всё хорошо, работаем» → snooze на 3 дня
 *  - «Договорились вне сервиса» → закрыть заказ как completed
 *  - «Не договорились» → cancelled
 *
 * Pure-логика и store вынесены в `outcome-store.ts` (тестируется в Node).
 */

import { CheckCircle, X, XCircle } from "phosphor-react-native";
import { Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

export {
  SNOOZE_MS,
  shouldShowOutcomePrompt,
  useOutcomeStore,
} from "./outcome-store";

interface OutcomeTrackingModalProps {
  visible: boolean;
  isBusy?: boolean;
  onCompletedOffline: () => void;
  onNoDeal: () => void;
  onSnooze: () => void;
}

export function OutcomeTrackingModal({
  visible,
  isBusy,
  onCompletedOffline,
  onNoDeal,
  onSnooze,
}: OutcomeTrackingModalProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  const successColor = useThemeColor("success");
  const errorColor = useThemeColor("error");
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onSnooze}>
      <View className="flex-1 items-center justify-center bg-black/50 px-6">
        <View className="w-full max-w-md rounded-2xl bg-canvas p-6">
          <View className="mb-1 flex-row items-start justify-between">
            <AppText weight="bold" className="flex-1 text-title-md text-ink">
              Как идут дела с заказом?
            </AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              onPress={onSnooze}
              hitSlop={8}
              className="ml-2 active:opacity-70"
            >
              <X size={20} weight="bold" color={mutedSoftColor} />
            </Pressable>
          </View>
          <AppText className="text-body-sm text-muted">
            Прошло уже несколько дней с момента выбора мастера. Отметьте результат — это поможет нам
            улучшить сервис.
          </AppText>

          <View className="mt-5 gap-3">
            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={onCompletedOffline}
              className="flex-row items-center gap-3 rounded-md border border-success/40 bg-success-soft px-4 py-3 active:opacity-80"
            >
              <CheckCircle size={20} weight="bold" color={successColor} />
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Всё сделано
                </AppText>
                <AppText className="text-caption text-muted">
                  Закрыть заказ и оставить отзыв
                </AppText>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={onNoDeal}
              className="flex-row items-center gap-3 rounded-md border border-error/30 bg-error-soft px-4 py-3 active:opacity-80"
            >
              <XCircle size={20} weight="bold" color={errorColor} />
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Не договорились
                </AppText>
                <AppText className="text-caption text-muted">
                  Отменить заказ, искать другого мастера
                </AppText>
              </View>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              disabled={isBusy}
              onPress={onSnooze}
              className="flex-row items-center justify-center rounded-md border border-hairline px-4 py-3 active:opacity-70"
            >
              <AppText weight="medium" className="text-body-md text-body">
                Спросить позже
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
