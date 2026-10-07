import { Clock, MapPin, Wallet } from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/StatusPill";
import { GuestContactGate } from "@/features/auth/GuestContactGate";
import { useVisibleCategories } from "@/features/categories/use-visible-categories";
import { OrderPhotoCarousel } from "@/features/orders/OrderPhotoCarousel";
import { orderCategoryIds } from "@/features/orders/order-categories";
import { formatOrderTiming, formatPrice } from "@/features/orders/order-schema";
import { orderStatusView } from "@/features/orders/order-status-view";
import type { useOrderDetail } from "@/features/orders/use-order-detail";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";
import { normalizeWhatsappDigits } from "@/lib/whatsapp";
import type { Database, Tables } from "@/types/database";
import { ContactButtons } from "./ContactButtons";

// ============================================================================
// Order info block — общий для всех
// ============================================================================

interface OrderInfoBlockProps {
  order: NonNullable<ReturnType<typeof useOrderDetail>["data"]>;
  /** Клиент сам же видит свой заказ? Тогда «Заказчик»-карточка не показывается
   *  (не показывать себе себя). */
  isOwner: boolean;
  /** Гость без входа — контакты клиента скрыты за входом (2026-10-03). */
  isGuest: boolean;
  /** Статус СВОЕГО отклика — для взгляда специалиста (orderStatusView). У
   *  заказчика и у того, кто ещё не откликнулся, не задан. */
  myResponseStatus?: Tables<"order_responses">["status"];
}

export function OrderInfoBlock({ order, isOwner, isGuest, myResponseStatus }: OrderInfoBlockProps) {
  // Единый статус (docs/ORDER_STATUS_DESIGN.md §3.4): для заказчика — его
  // взгляд; для специалиста со своим откликом — его взгляд; для любого другого
  // читателя (гость, ещё не откликнувшийся специалист) — нейтральный взгляд
  // заказчика: он не подразумевает личной вовлечённости, только факт заказа.
  const headerStatus = isOwner
    ? orderStatusView({ role: "client", order })
    : myResponseStatus
      ? orderStatusView({ role: "master", order, myResponseStatus })
      : orderStatusView({ role: "client", order });
  const clientDisplay =
    [order.client?.first_name, order.client?.last_name].filter(Boolean).join(" ") || "Клиент";
  // Имя, которое видит мастер: введённое клиентом в заказе (contact_name) →
  // иначе регистрационное. Профиль/рейтинг/переход НЕ показываем — просто имя
  // (решение владельца 2026-05-24).
  const contactDisplay = order.contact_name?.trim() || clientDisplay;
  const tc = useThemeColors(["muted-soft", "mute", "ink", "warning", "error"]);
  // Задание может быть в нескольких категориях (0195): основная + до двух.
  const categories = useVisibleCategories();
  // Без категории (№251) — строки категории у плашки статуса нет (№265).
  const categoryLine = orderCategoryIds(order)
    .filter((id) => id !== UNCATEGORIZED_L2_ID)
    .map((id, i) =>
      i === 0
        ? (order.l2?.name_ru ?? categories.data?.find((c) => c.id === id)?.name_ru ?? id)
        : categories.data?.find((c) => c.id === id)?.name_ru,
    )
    .filter(Boolean)
    .join(", ");

  // Бюджет — отдельный display-режим: разделяем сумму и пометку «договорной».
  const budgetText = formatBudget(order);
  const isNegotiable = order.budget_kind === "negotiable";
  // Срочный заказ — мета «Срочно» красным (как в Linear-референсе детали).
  const isUrgent = order.urgency === "urgent";

  return (
    <View className="px-5 pt-2">
      {/* Статус + категория. flex-wrap: на крупном шрифте категории уходят на
          следующую строку, а не выталкивают плашку за край экрана; max-w-full
          даёт самой плашке перенести длинную подпись (ревью 2026-09-14). */}
      <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
        <View className="max-w-full">
          <StatusPill
            tone={headerStatus.pillTone}
            label={headerStatus.label}
            iconKey={headerStatus.iconKey}
            iconWeight={headerStatus.iconWeight}
            size="md"
          />
        </View>
        {/* Точка и категория переносятся вместе: иначе «·» оставалась одна
            в конце первой строки. */}
        {categoryLine ? (
          <View className="shrink flex-row items-center gap-2">
            <AppText className="text-caption text-mute">·</AppText>
            <AppText weight="medium" className="flex-shrink text-caption text-body">
              {categoryLine}
            </AppText>
          </View>
        ) : null}
      </View>

      <AppText weight="display" className="mt-3 text-display-md tracking-tight text-ink">
        {order.title}
      </AppText>

      {/* Редизайн 2026-09-02 по образцу владельца: информация не серым, а
          читаемым цветом; микроиконки; жирные заголовки секций; всё стопкой
          друг под другом, а не разбросано. Каждая секция — заголовок + тело. */}

      {/* Описание */}
      {order.description ? (
        <View className="mt-6">
          <AppText weight="bold" className="text-title-md text-ink">
            Описание
          </AppText>
          <AppText className="mt-2 text-body-md text-ink" style={{ lineHeight: 24 }}>
            {order.description}
          </AppText>
        </View>
      ) : null}

      {order.photo_urls && order.photo_urls.length > 0 ? (
        <View className="mt-5 -mx-5">
          <OrderPhotoCarousel urls={order.photo_urls} />
        </View>
      ) : null}

      {/* Детали — список «иконка + факт», всё в ink. Только то, что есть в
          данных: срочность/дата и место. Число откликов убрано (владелец,
          2026-09-11): чужому оно ни к чему, а у автора стоит в заголовке
          «Отклики». Ничего не выдумываем (design-quality.md §5). */}
      <View className="mt-6">
        <AppText weight="bold" className="text-title-md text-ink">
          Детали
        </AppText>
        <View className="mt-2 gap-3">
          {/* Бюджет — первой строкой деталей (№293): отдельный блок с
              заголовком и огромным «Договорная» спорил с названием. */}
          {budgetText ? (
            <View className="flex-row items-center gap-3">
              <Wallet size={18} weight="bold" color={tc.ink} />
              <AppText
                weight={isNegotiable ? "medium" : "bold"}
                className={`flex-1 ${isNegotiable ? "text-body-md" : "text-title-md"} text-ink`}
              >
                {isNegotiable ? "Цена договорная" : budgetText}
              </AppText>
            </View>
          ) : null}
          <View className="flex-row items-center gap-3">
            <Clock size={18} weight="bold" color={isUrgent ? tc.error : tc.ink} />
            <AppText
              weight={isUrgent ? "semibold" : "medium"}
              className={`flex-1 text-body-md ${isUrgent ? "text-error-deep" : "text-ink"}`}
            >
              {formatOrderTiming(order.urgency, order.preferred_date)}
            </AppText>
          </View>
          <View className="flex-row items-center gap-3">
            <MapPin size={18} weight="bold" color={tc.ink} />
            <AppText weight="medium" className="flex-1 text-body-md text-ink">
              {/* Город может быть не выбран (задание по району) — тогда строка
                  начиналась с запятой: «, Назрановский район» (владелец,
                  2026-09-12). Собираем только то, что есть. */}
              {[order.city?.name ?? order.city_id, order.village, order.district, order.address]
                .filter((part) => !!part && String(part).trim().length > 0)
                .join(", ") || "Ингушетия"}
            </AppText>
          </View>
        </View>
      </View>

      {/* Заказчик — карточка по стандарту экрана: фото (или инициалы), имя
          и когда опубликовано задание. Профиля и рейтинга нет (решение
          владельца 2026-05-24). Редизайн 2026-09-11: прежняя серая плашка с
          инициалами выглядела заглушкой. Контакты, которые заказчик сам
          оставил в задании (0159, «напрямую» — 0168), — здесь же. */}
      {!isOwner ? (
        <View className="mt-6">
          <AppText weight="bold" className="text-title-md text-ink">
            Клиент
          </AppText>
          <View className="mt-3 rounded-2xl bg-surface-card p-4" style={CARD_SHADOW}>
            <View className="flex-row items-center gap-3">
              <Avatar
                url={order.client?.avatar_url ?? null}
                name={contactDisplay}
                seed={order.client_id}
                size="md"
              />
              <View className="min-w-0 flex-1">
                <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
                  {contactDisplay}
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
                  {`Задание от ${formatDayMonth(order.created_at)}`}
                </AppText>
              </View>
            </View>
            {order.contact_mode === "phone_open" ? (
              <AppText className="mt-3 text-body-sm text-mute">
                Клиент ждёт звонка или сообщения — откликов в приложении здесь нет.
              </AppText>
            ) : null}
            {/* Номер клиента — только в режиме «напрямую»: в обычном режиме
                приложение обещает «Ваш номер скрыт» (владелец, 2026-10-03;
                база обнуляет такие номера — 0211). */}
            {order.contact_mode === "phone_open" && isGuest ? (
              // Гость — только после входа (владелец, 2026-10-03).
              <GuestContactGate
                returnPath={`/orders/${order.id}`}
                title="Войдите, чтобы позвонить или написать клиенту"
              />
            ) : order.contact_mode === "phone_open" &&
              (order.contact_phone || order.whatsapp_phone) ? (
              <ContactButtons
                phoneTel={order.contact_phone?.replace(/[^\d+]/g, "") || null}
                whatsappDigits={
                  order.whatsapp_phone ? normalizeWhatsappDigits(order.whatsapp_phone) : null
                }
                who={contactDisplay}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** «11 сентября» — день и месяц словом. */
function formatDayMonth(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(iso));
}

function formatBudget(o: {
  budget_kind: Database["public"]["Enums"]["order_price_kind"];
  budget_value: number | null;
}): string {
  // Делегирует общему форматтеру цены из order-schema.
  return formatPrice(o.budget_kind, o.budget_value);
}
