// OrderRow — карточка задания. Единственный вид задания во всех лентах:
// «Найти задание», «Мои задания», «Мои отклики», «Актуальные задания» на
// главной, история откликов, админ-рейтинги. Меняется здесь — меняется везде.
//
// ─────────────────────────────────────────────────────────────────────────
// Дизайн 2026-09-04, сделан с нуля.
//
// DECISION владельца по скриншотам сборки 26: «карточка — иконка стоит, потом
// серым написано „Сантехника“ — некрасиво. Большой блок выделяется под словом.
// Надо, чтобы карточка выглядела укомплектованной, не огромной, но при этом
// супер-дизайн. Сделай с нуля, а не переделывай то, что имеется. Референс —
// Thumbtack».
//
// Что взято из референса (скриншоты Thumbtack, 2026-09-04):
//   - строка сущности держится на типографике, а не на плашках: жирный
//     заголовок и ОДНА строка фактов под ним;
//   - иконки живут в строке текста, в размер текста, без подложек — так
//     нарисованы звёзды рейтинга и кубок «698 hires»;
//   - число, ради которого человек смотрит карточку, набрано крупно и стоит
//     отдельно от мелочей.
//
// Что из-за этого выброшено против версии 2026-09-02:
//   - плитка 44×44 с розовой заливкой под иконку категории. Она весила больше,
//     чем сама категория, и создавала тот самый «большой блок». Осталась
//     цветная иконка 20 px прямо в строке — цвет категорий сохранён, вес ушёл;
//   - две отдельные строки «часы + срок» и «булавка + место». Это два тяжёлых
//     ряда ради двух коротких фактов. Стало одной строкой фактов через «·»;
//   - слово «бюджет» рядом с ценой: «до 2 500 ₽» объясняет себя само;
//   - внутренние разделители везде, кроме подвала с откликами, — там линия
//     отделяет чужое действие от описания задания.
//
// Что по-прежнему НЕ показываем (указания владельца): порядковый номер,
// придуманные метрики. Всё — из данных задания.
//
// Цвета — только токены (NativeWind className + useThemeColors для иконок),
// поэтому обе темы корректны.

import { Image as ExpoImage } from "expo-image";
import { ArrowRight, ChatCenteredText } from "phosphor-react-native";
import { type GestureResponderEvent, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderStatusValue } from "@/components/OrderStatusBadge";
import { formatOrderTiming, formatPrice } from "@/features/orders/order-schema";
import { responsesLabel } from "@/features/orders/plural-ru";
import type { OrderPriceKind, OrderUrgency } from "@/features/orders/use-create-order";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { useThemeColors } from "@/lib/use-theme-color";

/** Визуальный variant для контекста списка (исторический prop, оставлен для
 *  совместимости вызовов; на вид не влияет — иконка всегда категорийная). */
export type OrderRowVariant = "default" | "responded" | "assigned";

/** Мой отклик на это задание — строка «Ваш отклик: цена · срок» в карточке
 *  списка «Мои отклики». Всё из order_responses, ничего не додумывается. */
export interface OrderRowMyResponse {
  priceKind: OrderPriceKind;
  priceValue: number | null;
  leadTime: string | null;
  /** Что человек написал заказчику. DECISION владельца 2026-09-04:
   *  «мои отклики — где я откликался и что я там писал». */
  message?: string | null;
}

export interface OrderRowProps {
  id: string;
  title: string;
  categoryName: string;
  /** Ключ иконки из categories_l2.icon. */
  categoryIcon?: string | null;
  /** L2 id (исторический prop, сохранён для совместимости вызовов). */
  categoryL2Id?: string | null;
  cityName: string;
  district?: string | null;
  urgency: OrderUrgency;
  /** Точная дата (yyyy-mm-dd) для urgency='by_date' — строка «К 12 июня». */
  preferredDate?: string | null;
  responsesCount: number;
  createdAt: string;
  status?: OrderStatusValue;
  onPress?: () => void;
  variant?: OrderRowVariant;
  /** Показать «3 отклика» в подвале. Включается только для СВОИХ заданий на
   *  вкладке «Как клиент»: в чужой ленте счётчик убран ещё 2026-05-24, там он
   *  ничего не решает, а на своём задании это главный вопрос — откликнулся
   *  кто-нибудь или нет (DECISION владельца 2026-09-04). */
  showResponsesCount?: boolean;
  /** Способ задания бюджета. Если не передан — строка цены скрыта. */
  budgetKind?: OrderPriceKind | null;
  /** Числовое значение бюджета в ₽. NULL для negotiable. */
  budgetValue?: number | null;
  /** Описание задания — 2 строки превью под заголовком. */
  description?: string | null;
  /** Уже откликнулись — чип «Вы откликнулись» в подвале карточки. */
  alreadyResponded?: boolean;
  /** Кнопка «Откликнуться» в карточке. Только в компактных подборках;
   *  основная лента открывает детали тапом по всей карточке. Скрывается,
   *  если уже откликнулись. */
  showRespondButton?: boolean;
  /** Обложка задания (первое фото) — миниатюра справа от заголовка. */
  coverUrl?: string | null;
  /** Всего фото — для метки «+N» поверх миниатюры. */
  photosCount?: number;
  /** Переопределить статус нейтральной плашкой (история откликов:
   *  Отклонён / Отозван / Завершён / Истёк). Карточка приглушается. */
  statusOverrideLabel?: string | null;
  /** Мой отклик — строка «Ваш отклик: цена · срок» («Мои отклики»). */
  myResponse?: OrderRowMyResponse | null;
}

/** Короткая дата: «11 ч», «2 д», «23 мая» — без «назад». */
function timeAgoShort(iso: string): string {
  const created = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - created) / 1000));
  if (diffSec < 60) return "сейчас";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ч`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Статусы, при которых задание неактивно: вместо срока показываем плашку
// статуса, карточка приглушена («Мои задания» → закрытые внизу списка).
const DIMMED_STATUS: Partial<Record<OrderStatusValue, string>> = {
  draft: "Черновик",
  completed: "Завершено",
  cancelled: "Закрыто",
  expired: "Истекло",
};

// Мягкая тень карточки: край читается без опоры на линию (DECISION владельца
// 2026-09-04 — «карточка обведена, но линия не видна»). Значения нарочно
// скромные: тень обозначает край, а не рисует объём.
const CARD_SHADOW = {
  shadowColor: "#000000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

/** Размер миниатюры задания. 68 — как аватар исполнителя у референса: видно,
 *  что на фото, и не отбирает ширину у заголовка. */
const THUMB = 68;

export function OrderRow(props: OrderRowProps) {
  const tc = useThemeColors(["ink", "mute", "accent", "error", "on-accent"]);

  // Кнопка «Откликнуться» дублирует тап по карточке (обе → открыть задание).
  // stopPropagation — чтобы на web клик не всплыл к карточке и не вызвал
  // onPress дважды; на native это безопасный no-op.
  const handleRespond = (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    props.onPress?.();
  };

  const Icon = getCategoryIcon(props.categoryIcon);
  const colorIconUrl = getCategoryColorIconUrl(props.categoryL2Id);
  const overrideLabel = props.statusOverrideLabel?.trim() || null;
  const dimmedLabel = overrideLabel ?? (props.status ? DIMMED_STATUS[props.status] : undefined);
  const isDimmed = !!dimmedLabel;
  const showButton = !!props.showRespondButton && !props.alreadyResponded;

  const timingLabel = formatOrderTiming(props.urgency, props.preferredDate);
  const isUrgent = props.urgency === "urgent" && !isDimmed;
  const locationLabel = `${props.cityName}${props.district ? ` · ${props.district}` : ""}`;
  const priceLabel = props.budgetKind
    ? formatPrice(props.budgetKind, props.budgetValue ?? null)
    : null;
  const hasResponses = props.responsesCount > 0;
  const isNegotiable = props.budgetKind === "negotiable" || props.budgetValue == null;
  const myResponseLabel = props.myResponse
    ? [
        formatPrice(props.myResponse.priceKind, props.myResponse.priceValue),
        props.myResponse.leadTime?.trim() || null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const hasFooter = props.showResponsesCount || !!myResponseLabel;

  const ariaLabel = [
    props.title,
    props.categoryName,
    dimmedLabel ?? timingLabel,
    locationLabel,
    priceLabel ? `Бюджет ${priceLabel}` : null,
    `Опубликовано ${timeAgoShort(props.createdAt)}`,
    myResponseLabel ? `Ваш отклик ${myResponseLabel}` : null,
    props.alreadyResponded && !myResponseLabel ? "Вы откликнулись" : null,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      onPress={props.onPress}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-hairline bg-surface-card active:opacity-90"
      style={[CARD_SHADOW, isDimmed ? { opacity: 0.65 } : null]}
    >
      <View className="p-4">
        {/* Строка категории. Иконка — в размер текста и без подложки: цвет
            категории сохранён, а плитка, из-за которой карточка выглядела
            блочной, убрана. Справа — возраст задания. */}
        <View className="flex-row items-center gap-2">
          {colorIconUrl ? (
            <ExpoImage
              source={{ uri: colorIconUrl }}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <Icon size={18} weight="bold" color={tc.accent} />
          )}
          <AppText
            weight="semibold"
            className="min-w-0 flex-1 text-body-sm text-body"
            numberOfLines={1}
          >
            {props.categoryName}
          </AppText>
          {dimmedLabel ? (
            <View className="rounded-pill bg-surface-2 px-2.5 py-1">
              <AppText weight="semibold" className="text-body-sm text-mute">
                {dimmedLabel}
              </AppText>
            </View>
          ) : (
            <AppText weight="mono" className="text-mono-body text-mute">
              {timeAgoShort(props.createdAt)}
            </AppText>
          )}
        </View>

        {/* Заголовок и описание. Заголовок — самое крупное в карточке: именно
            по нему решают, открывать задание или нет. */}
        <View className="mt-2.5 flex-row items-start gap-3">
          <View className="min-w-0 flex-1">
            <AppText weight="bold" className="text-display-sm text-ink" numberOfLines={2}>
              {props.title}
            </AppText>
            {props.description?.trim() ? (
              <AppText className="mt-1 text-body-md text-body" numberOfLines={2}>
                {props.description.trim()}
              </AppText>
            ) : null}
          </View>
          {props.coverUrl ? (
            <View
              className="overflow-hidden rounded-xl bg-canvas-soft-2"
              style={{ width: THUMB, height: THUMB }}
            >
              <ExpoImage
                source={{ uri: cdnImage(props.coverUrl, { width: THUMB * 2 }) }}
                placeholder={{ uri: cdnBlur(props.coverUrl) }}
                style={{ width: THUMB, height: THUMB }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
              {props.photosCount && props.photosCount > 1 ? (
                <View className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5">
                  <AppText weight="mono" className="text-mono-caption text-on-dark">
                    +{props.photosCount - 1}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Одна строка фактов вместо двух рядов с иконками. Срочность — не
            иконка, а слово в цвете ошибки: она и должна бросаться в глаза. */}
        <View className="mt-3 flex-row flex-wrap items-center gap-x-1.5">
          <AppText
            weight={isUrgent ? "semibold" : "medium"}
            className={`text-body-md ${isUrgent ? "text-error" : "text-body"}`}
          >
            {timingLabel}
          </AppText>
          <AppText className="text-body-md text-mute">·</AppText>
          <AppText
            weight="medium"
            className="min-w-0 flex-1 text-body-md text-mute"
            numberOfLines={1}
          >
            {locationLabel}
          </AppText>
        </View>

        {/* Цена и действие. Число — крупно: ради него мастер и смотрит ленту. */}
        {priceLabel || showButton || props.alreadyResponded ? (
          <View className="mt-3 flex-row items-center justify-between gap-3">
            {priceLabel ? (
              <AppText
                weight={isNegotiable ? "semibold" : "bold"}
                className={`min-w-0 flex-1 ${
                  isNegotiable ? "text-title-md text-mute" : "text-display-sm text-ink"
                }`}
                numberOfLines={1}
              >
                {priceLabel}
              </AppText>
            ) : (
              <View className="flex-1" />
            )}
            {showButton ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Откликнуться на задание"
                onPress={handleRespond}
                hitSlop={4}
                className="min-h-11 flex-row items-center gap-1.5 rounded-pill bg-accent px-4 active:opacity-85"
              >
                <AppText weight="semibold" className="text-body-md text-on-accent">
                  Откликнуться
                </AppText>
                <ArrowRight size={16} weight="bold" color={tc["on-accent"]} />
              </Pressable>
            ) : props.alreadyResponded && !myResponseLabel ? (
              <View className="rounded-pill bg-accent-soft px-3 py-1.5">
                <AppText weight="semibold" className="text-body-sm text-accent">
                  Вы откликнулись
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Подвал. Здесь живёт всё, что относится не к описанию задания, а к
          отклику на него, поэтому он отделён линией и лежит на своей
          поверхности. */}
      {hasFooter ? (
        <View className="border-hairline border-t bg-surface-page px-4 py-3">
          {props.showResponsesCount ? (
            <View className="flex-row items-center gap-2">
              <ChatCenteredText
                size={18}
                weight="bold"
                color={hasResponses ? tc.accent : tc.mute}
              />
              <AppText
                weight={hasResponses ? "semibold" : "medium"}
                className={`min-w-0 flex-1 text-body-md ${
                  hasResponses ? "text-accent" : "text-mute"
                }`}
              >
                {hasResponses ? responsesLabel(props.responsesCount) : "Откликов пока нет"}
              </AppText>
              {hasResponses ? <ArrowRight size={16} weight="bold" color={tc.accent} /> : null}
            </View>
          ) : null}

          {myResponseLabel ? (
            <>
              <View className="flex-row items-center gap-2">
                <ChatCenteredText size={18} weight="bold" color={tc.accent} />
                <AppText
                  weight="semibold"
                  className="min-w-0 flex-1 text-body-md text-ink"
                  numberOfLines={1}
                >
                  Ваш отклик: {myResponseLabel}
                </AppText>
              </View>
              {props.myResponse?.message?.trim() ? (
                <AppText className="mt-1.5 text-body-md text-body" numberOfLines={3}>
                  {props.myResponse.message.trim()}
                </AppText>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
