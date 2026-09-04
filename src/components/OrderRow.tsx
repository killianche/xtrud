// OrderRow — карточка задания. Единственный вид задания во всех лентах:
// «Найти задание», «Мои задания», «Мои отклики», «Актуальные задания» на
// главной, история откликов, админ-рейтинги. Меняется здесь — меняется везде.
//
// Стандарт 2026-09-02 (DECISION владельца по скриншотам сборки 20: «шрифты
// слишком мелкие, один общий стиль, как у референса»). Образец — карточка
// исполнителя Thumbtack: карточка с рамкой, жирный заголовок, факты стопкой
// строками «микроиконка + читаемый текст», цена крупно.
//
// Что изменилось против строки-ряда 2026-05-24 (Linear-style) и почему:
//   - карточка с рамкой и радиусом вместо full-bleed строки с линией снизу —
//     у референса каждая сущность — отдельный объект, это читается с первого
//     взгляда и не сливается в таблицу;
//   - минимальный текст 14 px (категория, время), основной — 16, заголовок и
//     цена — 18; 12 px в карточке больше нет;
//   - срок и место — строки с иконкой в `ink`, а не серая мелочь; срочность
//     не теряется: «Срочно» окрашено в error;
//   - блок «БЮДЖЕТ / до 2 500 ₽» с капсом и пунктиром заменён строкой
//     «до 2 500 ₽ · бюджет», как «$150 Starting price» у образца.
//
// Что по-прежнему НЕ показываем (указания владельца): счётчик откликов,
// порядковый номер, придуманные метрики. Всё — из данных задания.
//
// Цвета — только токены (NativeWind className + useThemeColors для иконок),
// поэтому обе темы корректны.

import { Image as ExpoImage } from "expo-image";
import { ArrowRight, ChatCenteredText, Clock, MapPin } from "phosphor-react-native";
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

// Мягкая тень карточки. DECISION владельца 2026-09-04: «карточка обведена, но
// линия не видна» — на белом фоне рамка #ebebeb давала контраст 8% и на свету
// исчезала. Теперь карточка стоит на чуть более тёмной поверхности и слегка
// приподнята: так её край читается, как в референсе.
//
// Значения нарочно скромные: тень обозначает край, а не рисует объём
// (design-quality §1.1 — «убрать лучше, чем добавить»).
const CARD_SHADOW = {
  shadowColor: "#000000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

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
      className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4 active:opacity-90"
      style={[CARD_SHADOW, isDimmed ? { opacity: 0.65 } : null]}
    >
      {/* Шапка: плитка категории + категория + время публикации.
          Иконка — цветная из каталога (тот же механизм, что на экране «Все
          категории»), с запасным моно-вариантом. До 2026-09-03 во всех
          карточках была одинаковая розовая моно-иконка, и лента выглядела
          однообразной: категории не различались с одного взгляда. */}
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-accent-soft">
          {colorIconUrl ? (
            <ExpoImage
              source={{ uri: colorIconUrl }}
              style={{ width: 24, height: 24 }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : (
            <Icon size={22} weight="bold" color={tc.accent} />
          )}
        </View>
        <AppText
          weight="semibold"
          className="min-w-0 flex-1 text-body-sm text-mute"
          numberOfLines={1}
        >
          {props.categoryName}
        </AppText>
        <AppText weight="mono" className="text-mono-body text-mute">
          {timeAgoShort(props.createdAt)}
        </AppText>
      </View>

      {/* Заголовок (+ миниатюра фото справа, если есть). */}
      <View className="mt-3 flex-row items-start gap-3">
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-title-lg text-ink" numberOfLines={2}>
            {props.title}
          </AppText>
          {props.description && props.description.trim().length > 0 ? (
            <AppText className="mt-1 text-body-md text-body" numberOfLines={2}>
              {props.description}
            </AppText>
          ) : null}
        </View>
        {props.coverUrl ? (
          <View
            className="overflow-hidden rounded-xl bg-canvas-soft-2"
            style={{ width: 56, height: 56 }}
          >
            <ExpoImage
              source={{ uri: cdnImage(props.coverUrl, { width: 112 }) }}
              placeholder={{ uri: cdnBlur(props.coverUrl) }}
              style={{ width: 56, height: 56 }}
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

      {/* Факты стопкой: срок (или статус закрытого задания) и место. */}
      <View className="mt-3 gap-2">
        {dimmedLabel ? (
          <View className="self-start rounded-pill bg-surface-2 px-3 py-1.5">
            <AppText weight="semibold" className="text-body-sm text-mute">
              {dimmedLabel}
            </AppText>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <Clock size={18} weight="bold" color={isUrgent ? tc.error : tc.ink} />
            <AppText
              weight="medium"
              className={`min-w-0 flex-1 text-body-md ${isUrgent ? "text-error" : "text-ink"}`}
              numberOfLines={1}
            >
              {timingLabel}
            </AppText>
          </View>
        )}
        <View className="flex-row items-center gap-2">
          <MapPin size={18} weight="bold" color={tc.ink} />
          <AppText
            weight="medium"
            className="min-w-0 flex-1 text-body-md text-ink"
            numberOfLines={1}
          >
            {locationLabel}
          </AppText>
        </View>
      </View>

      {/* Сколько откликов пришло на моё задание. Для клиента это главный
          вопрос к собственному заданию, поэтому строка идёт до цены. */}
      {props.showResponsesCount ? (
        <View className="mt-3 flex-row items-center gap-2">
          <ChatCenteredText size={18} weight="bold" color={hasResponses ? tc.accent : tc.mute} />
          <AppText
            weight={hasResponses ? "semibold" : "medium"}
            className={`text-body-md ${hasResponses ? "text-accent" : "text-mute"}`}
          >
            {hasResponses ? responsesLabel(props.responsesCount) : "Откликов пока нет"}
          </AppText>
        </View>
      ) : null}

      {/* Подвал: цена крупно + справа кнопка/чип отклика. */}
      {priceLabel || showButton || props.alreadyResponded ? (
        <View className="mt-4 flex-row items-center justify-between gap-3">
          {priceLabel ? (
            <View className="min-w-0 flex-1 flex-row flex-wrap items-baseline gap-x-2">
              <AppText
                weight={isNegotiable ? "semibold" : "bold"}
                className={isNegotiable ? "text-title-md text-ink" : "text-title-lg text-ink"}
                numberOfLines={1}
              >
                {priceLabel}
              </AppText>
              {!isNegotiable ? <AppText className="text-body-sm text-mute">бюджет</AppText> : null}
            </View>
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

      {/* Мой отклик («Мои отклики»): что я предложил. */}
      {myResponseLabel ? (
        <View className="mt-3 rounded-xl bg-accent-soft px-3 py-2.5">
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
        </View>
      ) : null}
    </Pressable>
  );
}
