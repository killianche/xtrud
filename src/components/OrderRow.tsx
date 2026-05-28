// OrderRow — строка заказа в списке (Linear-style, full-bleed).
//
// Редизайн 2026-05-24 по присланному владельцем референсу «Linear Design.html»
// (карточки заказов). Взяли визуальный язык Linear: плоские строки-ряды без
// рамок/теней (разделены тонкой линией снизу), цветная статус-плашка с точкой
// (мягкая подложка + заглавный лейбл), плотная типографика, пунктирный
// разделитель перед блоком цифр, табличные цифры. Все цвета — наши токены
// (NativeWind className), поэтому корректно работает и тёмная тема.
//
// Что НЕ взяли (по указанию владельца / из-за наших данных):
//   - метрику «Отклики 7/20» — исключено явно;
//   - номер «01» слева — для ленты заказов это декор;
//   - блок кнопок «Откликнуться/закладка» внутри карточки — лента видна и
//     клиенту, и мастеру (разное действие); вся карточка кликается → детали;
//   - «Срок · 84д» — у заказа нет дедлайна-обратного-отсчёта в данных ленты.
//
// Цвет статус-плашки привязан к срочности/статусу:
//   - закрытые статусы (черновик/завершён/закрыта/истекла) → нейтральная;
//   - иначе по срочности: Срочно → красная, На неделе → янтарная, остальное →
//     нейтральная.
//
// Используется во всех лентах заказов (Поиск заказов, Мои заказы, ленты
// мастера responded/assigned) — единый вид. Старый «inbox-row» дизайн — в git
// history до 2026-05-24.

import { Image as ExpoImage } from "expo-image";
import { ArrowRight, MapPin } from "phosphor-react-native";
import { type GestureResponderEvent, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderStatusValue } from "@/components/OrderStatusBadge";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, urgencyLabel } from "@/features/orders/order-schema";
import type { OrderPriceKind, OrderUrgency } from "@/features/orders/use-create-order";
import { useThemeColors } from "@/lib/use-theme-color";

/** Визуальный variant для контекста списка (исторический prop, оставлен для
 *  совместимости вызовов; на вид сейчас не влияет — иконка всегда категорийная). */
export type OrderRowVariant = "default" | "responded" | "assigned";

export interface OrderRowProps {
  id: string;
  title: string;
  categoryName: string;
  /** Lucide-icon ключ из categories_l2.icon. Fallback если нет color-иконки. */
  categoryIcon?: string | null;
  /** L2 id для маппинга в цветную SVG-иконку (`getCategoryColorIconUrl`). */
  categoryL2Id?: string | null;
  cityName: string;
  district?: string | null;
  urgency: OrderUrgency;
  responsesCount: number;
  createdAt: string;
  status?: OrderStatusValue;
  onPress?: () => void;
  variant?: OrderRowVariant;
  /** @deprecated «Отклики» убраны из карточки 2026-05-24 по указанию владельца. */
  showResponsesCount?: boolean;
  /** Способ задания бюджета. Если не передан — блок «Бюджет» скрыт. */
  budgetKind?: OrderPriceKind | null;
  /** Числовое значение бюджета в ₽. NULL для negotiable. */
  budgetValue?: number | null;
  /** Описание заказа — 2 строки превью под title. */
  description?: string | null;
  /** Мастер уже отправил отклик на этот заказ — чип «Вы откликнулись» + лёгкий
   *  тонированный фон всей строки. */
  alreadyResponded?: boolean;
  /** Показать кнопку «Откликнуться» в карточке. ТОЛЬКО в ленте «Поиск заказов»
   *  (где мастер находит новые заказы). НЕ показываем в «Ваши отклики» /
   *  «Мои заказы» / на главной мастера — там отклик уже отправлен либо это свой
   *  заказ. Дополнительно скрывается, если на этот заказ уже откликнулись. */
  showRespondButton?: boolean;
  /** Обложка заказа (первое фото) — миниатюра справа. */
  coverUrl?: string | null;
  /** Всего фото у заказа — для бейджа «+N» поверх миниатюры. */
  photosCount?: number;
  /** Переопределить текст статус-плашки на нейтральный «мёртвый» вид. Нужно
   *  экрану «История откликов»: там итог строки — статус отклика
   *  (Отклонён/Отозван) или заказа (Завершён/Истёк/Спор/…), который родная
   *  логика pillFor не покрывает (она знает только draft/completed/cancelled/
   *  expired + срочность). Передан → плашка всегда нейтральная (bg-surface-2 /
   *  text-mute) + строка приглушена. Обратносовместимо: не передан → как раньше. */
  statusOverrideLabel?: string | null;
}

/**
 * Короткая дата: «11 ч», «2 д», «23 мая» — без «назад».
 */
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

interface PillStyle {
  label: string;
  bgClass: string;
  textClass: string;
  dotClass: string;
}

// Статусы, при которых заказ «неактивен» — плашку показываем нейтральной с
// текстом статуса (важно для «Мои заказы» → история). Для активных заказов
// плашка отражает срочность (главный сигнал в ленте поиска).
const DIMMED_STATUS: Partial<Record<OrderStatusValue, string>> = {
  draft: "Черновик",
  completed: "Завершён",
  cancelled: "Закрыта",
  expired: "Истекла",
};

function pillFor(status: OrderStatusValue | undefined, urgency: OrderUrgency): PillStyle {
  // 1) Закрытые/неактивные статусы → нейтральная плашка со статусом.
  if (status && DIMMED_STATUS[status]) {
    return {
      label: DIMMED_STATUS[status] as string,
      bgClass: "bg-surface-2",
      textClass: "text-mute",
      dotClass: "bg-muted-soft",
    };
  }
  // 2) Активный заказ → плашка по срочности.
  if (urgency === "urgent") {
    return {
      label: urgencyLabel("urgent"),
      bgClass: "bg-error-soft",
      textClass: "text-error-deep",
      dotClass: "bg-error",
    };
  }
  if (urgency === "this_week") {
    return {
      label: urgencyLabel("this_week"),
      bgClass: "bg-warning-soft",
      textClass: "text-warning-deep",
      dotClass: "bg-warning",
    };
  }
  return {
    label: urgencyLabel(urgency),
    bgClass: "bg-surface-2",
    textClass: "text-mute",
    dotClass: "bg-muted-soft",
  };
}

export function OrderRow(props: OrderRowProps) {
  const tc = useThemeColors(["ink", "mute", "muted-soft", "on-primary"]);

  // Кнопка «Откликнуться» дублирует тап по карточке (обе → открыть заказ).
  // stopPropagation, чтобы на web клик по кнопке не всплыл к карточке и не
  // вызвал onPress дважды. На native stopPropagation — безопасный no-op.
  const handleRespond = (e: GestureResponderEvent) => {
    e.stopPropagation?.();
    props.onPress?.();
  };
  const Icon = getCategoryIcon(props.categoryIcon);
  // statusOverrideLabel (экран Истории) → всегда нейтральная плашка с этим
  // лейблом + приглушённая строка. Иначе — родная логика по статусу/срочности.
  const hasStatusOverride =
    !!props.statusOverrideLabel && props.statusOverrideLabel.trim().length > 0;
  const isDimmed = hasStatusOverride || !!(props.status && DIMMED_STATUS[props.status]);
  const pill: PillStyle = hasStatusOverride
    ? {
        label: props.statusOverrideLabel as string,
        bgClass: "bg-surface-2",
        textClass: "text-mute",
        dotClass: "bg-muted-soft",
      }
    : pillFor(props.status, props.urgency);
  // Кнопка «Откликнуться» — только в ленте поиска и только если ещё не откликнулись.
  const showButton = !!props.showRespondButton && !props.alreadyResponded;

  // Ведущая иконка категории слева — монохромная line-иконка (Gravity-стиль).
  // Заняла место номера «01» из референса (фидбэк владельца 2026-05-24:
  // «вместо цифр — иконки категорий»). Сразу показывает категорию заказа.
  const catIcon = <Icon size={20} color={tc.mute} />;

  const ariaLabel = `${props.title} — ${pill.label}${
    props.alreadyResponded ? ", вы откликнулись" : ""
  }`;

  // Уже откликался → приглушённый фон строки (паттерн «прочитанного» инбокса).
  // Разделитель между карточками — мягкая сплошная линия hairline-strong/50
  // (полупрозрачный серый): карточки отделяются, но линия не «чёрная».
  // Внутренний разделитель «Бюджета» — светлый пунктир hairline, так иерархия
  // линий читается: сплошная серая = граница карточки, пунктир = внутри.
  // ВАЖНО: классы border-цвета и bg ОБЯЗАНЫ быть через пробел. Раньше была
  // склейка `hairline-strong/60bg-canvas` (без пробела) → NativeWind не понимал
  // класс и рисовал границу дефолтным ТЁМНЫМ цветом (баг «чёрная линия»).
  const bgClass = props.alreadyResponded
    ? "border-b border-hairline-strong/50 bg-canvas-soft px-5 py-4 active:bg-canvas-soft-2 hover:bg-canvas-soft-2"
    : "border-b border-hairline-strong/50 bg-canvas px-5 py-4 active:bg-canvas-soft hover:bg-canvas-soft";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={ariaLabel}
      onPress={props.onPress}
      className={bgClass}
      style={isDimmed ? { opacity: 0.7 } : undefined}
    >
      <View className="flex-row items-start gap-3">
        {/* Ведущая иконка категории слева (вместо номера «01» из референса). */}
        <View style={{ marginTop: 2 }}>{catIcon}</View>
        <View className="flex-1 min-w-0">
          {/* Row 1: статус-плашка + название категории + время справа. */}
          <View className="flex-row items-center gap-2">
            <View
              className={`flex-row items-center gap-1.5 self-start rounded-pill px-2 py-0.5 ${pill.bgClass}`}
            >
              <View className={`h-1.5 w-1.5 rounded-full ${pill.dotClass}`} />
              <AppText weight="semibold" className={`text-caption ${pill.textClass}`}>
                {pill.label}
              </AppText>
            </View>
            <AppText className="min-w-0 flex-1 text-caption text-mute" numberOfLines={1}>
              {props.categoryName}
            </AppText>
            <AppText weight="mono" className="text-mono-caption text-muted-soft">
              {timeAgoShort(props.createdAt)}
            </AppText>
          </View>

          {/* Row 2: заголовок. */}
          <AppText
            weight="semibold"
            className="mt-2 text-body-md tracking-tight text-ink"
            numberOfLines={2}
          >
            {props.title}
          </AppText>

          {/* Row 3 (опц.): описание, 2 строки. */}
          {props.description && props.description.trim().length > 0 ? (
            <AppText
              className="mt-1 text-body-sm text-body"
              numberOfLines={2}
              style={{ lineHeight: 19 }}
            >
              {props.description}
            </AppText>
          ) : null}

          {/* Row 4: локация. */}
          <View className="mt-2 flex-row items-center gap-1">
            <MapPin size={12} weight="bold" color={tc["muted-soft"]} />
            <AppText className="text-caption text-mute" numberOfLines={1}>
              {props.cityName}
              {props.district ? ` · ${props.district}` : ""}
            </AppText>
          </View>

          {/* Row 5: пунктирный разделитель + «Бюджет» слева + справа либо кнопка
              «Откликнуться» (лента поиска, ещё не откликнулся), либо чип
              «Вы откликнулись» (уже откликнулся) — на месте кнопки. */}
          {props.budgetKind || showButton || props.alreadyResponded ? (
            <View className="mt-3 flex-row items-center justify-between gap-3 border-t border-dashed border-hairline pt-3">
              {props.budgetKind ? (
                <View className="min-w-0 flex-1">
                  <AppText className="text-caption uppercase tracking-wide text-mute">
                    Бюджет
                  </AppText>
                  <AppText
                    weight="mono"
                    className="mt-0.5 text-body-md text-ink"
                    numberOfLines={1}
                  >
                    {formatPrice(props.budgetKind, props.budgetValue ?? null)}
                  </AppText>
                </View>
              ) : (
                <View className="flex-1" />
              )}
              {showButton ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Откликнуться на заказ"
                  onPress={handleRespond}
                  className="flex-row items-center gap-1.5 self-end rounded-md bg-primary px-4 py-2 active:opacity-80"
                >
                  <AppText weight="semibold" className="text-body-sm text-on-primary">
                    Откликнуться
                  </AppText>
                  <ArrowRight size={14} weight="bold" color={tc["on-primary"]} />
                </Pressable>
              ) : props.alreadyResponded ? (
                <View className="self-end rounded-pill bg-accent-soft px-3 py-1.5">
                  <AppText weight="semibold" className="text-caption text-accent">
                    Вы откликнулись
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Миниатюра-обложка справа — только если у заказа есть фото.
            Размеры заданы ИНЛАЙН (а не h-16/w-16) + alignSelf:flex-start —
            иначе в flex-строке бокс растягивался по высоте строки и landscape-
            фото обрезалось в высокую полоску (баг 2026-05-24). Фиксированный
            квадрат 64×64 даёт аккуратную обложку как в Avito/Profi. */}
        {props.coverUrl ? (
          <View
            className="overflow-hidden rounded-lg bg-canvas-soft-2"
            style={{ width: 64, height: 64, alignSelf: "flex-start" }}
          >
            <ExpoImage
              source={{ uri: cdnImage(props.coverUrl, { width: 64 }) }}
              placeholder={{ uri: cdnBlur(props.coverUrl) }}
              style={{ width: 64, height: 64 }}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            {props.photosCount && props.photosCount > 1 ? (
              <View className="absolute bottom-1 right-1 rounded-pill bg-black/50 px-1.5 py-0.5">
                <AppText weight="mono" className="text-caption text-on-dark">
                  +{props.photosCount - 1}
                </AppText>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
