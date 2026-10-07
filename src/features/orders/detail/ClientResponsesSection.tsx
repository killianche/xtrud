import { useRouter } from "expo-router";
import { CaretRight } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui";
import type { OrderDetail } from "@/features/orders/use-order-detail";
import { useOrderResponses } from "@/features/orders/use-order-responses";
import { useRejectResponse } from "@/features/orders/use-reject-response";
import { showAlert } from "@/lib/alert";
import { describeServerError } from "@/lib/describe-server-error";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { useThemeColors } from "@/lib/use-theme-color";
import { ClientMasterResponseCard } from "./ClientMasterResponseCard";

// ============================================================================
// Client responses section — клиент видит отклики на свой заказ
//
// 2026-05-20 «classifieds»: убрана кнопка «Выбрать этого мастера»
// (accept_response) и кнопка «Написать» (in-app chat). Каждая карточка
// показывает 3 прямые контакт-кнопки: «Позвонить», «WhatsApp», «Профиль».
// Reject (скрыть отклик) оставлен — это локальное действие клиента, без
// уведомлений. Sections «picked / actionable / passive» свёрнуты в единый
// список — модели «выбранного мастера» больше нет.
// ============================================================================

interface ClientResponsesSectionProps {
  orderId: string;
  order: OrderDetail;
}

export function ClientResponsesSection({ orderId, order }: ClientResponsesSectionProps) {
  const tc = useThemeColors(["muted-soft"]);
  const router = useRouter();
  const {
    data: responses,
    isLoading,
    error,
    refetch: refetchResponses,
    isRefetching: isRefetchingResponses,
  } = useOrderResponses(orderId);
  const rejectResponse = useRejectResponse();

  // Точечный pending-state: какой именно отклик сейчас скрывается.
  // Без этого `mutation.isPending` triggers loading-state у ВСЕХ карточек,
  // потому что один TanStack mutation общий для всех откликов.
  const [pendingRejectResponseId, setPendingRejectResponseId] = useState<string | null>(null);
  // Раскрыт ли блок «Скрытые отклики» (по умолчанию свёрнут).
  const [hiddenExpanded, setHiddenExpanded] = useState(false);

  // «Скрыть отклик» в меню «⋯» карточки → reject_response RPC (№262). Меню
  // с пояснением и красным пунктом — уже подтверждение, второго окна нет.
  // Карточка переезжает в свёрнутый раздел «Скрытые» внизу.
  const onRejectResponseClick = (responseId: string) => {
    if (pendingRejectResponseId) return;
    setPendingRejectResponseId(responseId);
    rejectResponse.mutate(
      { responseId, orderId },
      {
        onSettled: () => setPendingRejectResponseId(null),
        onError: (e) => showAlert("Не удалось скрыть", e.message),
      },
    );
  };

  const isOpen = order.status === "open";
  // Выбранный исполнитель показан отдельным блоком выше — здесь остальные.
  const others = (responses ?? []).filter(
    (r) => !(order.picked_master_id && r.master_id === order.picked_master_id),
  );
  const hasResponses = others.length > 0;
  const activeResponses = others.filter((r) => r.status !== "rejected");
  const rejectedResponses = others.filter((r) => r.status === "rejected");
  const hasPicked = !!order.picked_master_id && !isOpen;
  // Когда исполнитель выбран и других откликов нет — секция не нужна.
  if (hasPicked && !isLoading && !error && !hasResponses) return null;

  // Заказ «висит» больше суток без откликов → не обещаем «в течение часа»
  // (это была бы ложь), а даём честную подсказку как привлечь мастеров.
  const orderAgeMs = Date.now() - new Date(order.created_at).getTime();
  const isStaleNoResponses = orderAgeMs > 24 * 60 * 60 * 1000;

  return (
    <View className="mt-8 px-5">
      {/* Heading: «Отклики · N» */}
      <View className="flex-row items-baseline justify-between gap-2">
        <AppText weight="semibold" className="text-title-md text-ink tracking-tight">
          {hasPicked ? "Другие отклики" : "Отклики"}
        </AppText>
        {hasResponses ? (
          <AppText weight="mono" className="text-mono-caption text-mute">
            {activeResponses.length}
          </AppText>
        ) : null}
      </View>

      {isLoading && (
        <View className="mt-3 gap-3">
          {[0, 1].map((index) => (
            <View
              key={index}
              className="flex-row items-center gap-3 rounded-2xl border border-hairline p-4"
            >
              <Skeleton circle size={44} />
              <View className="flex-1 gap-2">
                <Skeleton width="55%" height={16} />
                <Skeleton width="35%" height={12} />
                <Skeleton width="80%" height={12} />
              </View>
            </View>
          ))}
        </View>
      )}

      {error && (
        <View className="mt-3 rounded-lg bg-canvas-soft p-4">
          <AppText weight="semibold" className="text-body-sm text-ink">
            Не удалось загрузить отклики
          </AppText>
          <AppText className="mt-1 text-body-sm text-error">
            {describeServerError(error, "Не удалось отправить отклик. Попробуйте ещё раз.")}
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить загрузку откликов"
            disabled={isRefetchingResponses}
            onPress={() => void refetchResponses()}
            className="mt-3 min-h-11 self-start items-center justify-center rounded-md border border-hairline bg-canvas px-4 active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-button-sm text-ink">
              {isRefetchingResponses ? "Загружаем…" : "Повторить"}
            </AppText>
          </Pressable>
        </View>
      )}

      {/* Empty state. Текст зависит от возраста заказа: свежий — оптимистично,
          старше суток без откликов — честно + совет как привлечь мастеров. */}
      {!isLoading && !error && !hasResponses && (
        <View className="mt-3 rounded-xl border border-hairline bg-canvas-soft p-4">
          {isStaleNoResponses ? (
            <>
              <AppText weight="medium" className="text-body-sm text-ink">
                Пока никто не откликнулся
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute">
                Так бывает — спрос на разные услуги разный. Чтобы заданием заинтересовались,
                попробуйте дополнить описание, добавить фото или указать бюджет. Можно также найти
                исполнителя самому в каталоге.
              </AppText>
              <View className="mt-3 flex-row flex-wrap gap-2">
                {/* «Без категории» (№251) — своих специалистов нет, список был бы пуст. */}
                {order.l2_id === UNCATEGORIZED_L2_ID ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Посмотреть специалистов раздела"
                    onPress={() =>
                      router.push({
                        pathname: "/specialists/section",
                        params: { l2: order.l2_id },
                      } as never)
                    }
                    className="min-h-11 items-center justify-center rounded-pill bg-accent px-4 active:opacity-85"
                  >
                    <AppText weight="semibold" className="text-body-sm text-on-accent">
                      Специалисты раздела
                    </AppText>
                  </Pressable>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Изменить задание"
                  onPress={() => router.push(`/orders/edit/${orderId}` as never)}
                  className="min-h-11 items-center justify-center rounded-pill border border-hairline bg-canvas px-4 active:bg-canvas-soft"
                >
                  <AppText weight="semibold" className="text-body-sm text-ink">
                    Изменить задание
                  </AppText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <AppText weight="medium" className="text-body-sm text-ink">
                Откликов пока нет
              </AppText>
              <AppText className="mt-1 text-body-sm text-mute">
                Уведомим, как только исполнитель отзовётся.
              </AppText>
            </>
          )}
        </View>
      )}

      {/* Активные отклики. */}
      {activeResponses.length > 0 ? (
        <View className="mt-3 gap-3">
          {activeResponses.map((r) => (
            <ClientMasterResponseCard
              key={r.id}
              response={r}
              // «Выбрать» на карточке нет (владелец, №285): исполнителя
              // выбирают при «Завершить задание».
              isRejecting={pendingRejectResponseId === r.id}
              onReject={isOpen ? () => onRejectResponseClick(r.id) : undefined}
            />
          ))}
        </View>
      ) : null}

      {/* Скрытые отклики — collapsible. */}
      {rejectedResponses.length > 0 ? (
        <View className="mt-4">
          <Pressable
            accessibilityRole="button"
            onPress={() => setHiddenExpanded((v) => !v)}
            className="min-h-12 flex-row items-center justify-between rounded-2xl bg-canvas-soft px-4 py-3 active:opacity-70"
          >
            <View className="flex-1 flex-row items-center gap-2">
              <AppText weight="medium" className="text-body-sm text-mute">
                Скрытые отклики
              </AppText>
              <View className="rounded-full bg-canvas-soft-2 px-2 py-0.5">
                <AppText weight="mono" className="text-mono-caption text-mute">
                  {rejectedResponses.length}
                </AppText>
              </View>
            </View>
            <CaretRight
              size={16}
              weight="bold"
              color={tc["muted-soft"]}
              style={{
                transform: [{ rotate: hiddenExpanded ? "90deg" : "0deg" }],
              }}
            />
          </Pressable>
          {hiddenExpanded ? (
            <View className="mt-3 gap-3">
              {rejectedResponses.map((r) => (
                <ClientMasterResponseCard
                  key={r.id}
                  response={r}
                  isRejecting={false}
                  onReject={undefined}
                  rejected
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
