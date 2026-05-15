// OrderRow — строка заказа в списке (list-style, full-bleed).
//
// Layout (после фидбэка user 2026-05-15 «иконку маленькую рядом с
// заголовком, текст с левого края, без большого slot'а слева»):
//   - НЕТ border + rounded карточки. Это plain inbox-row, как Apple Mail
//     или iOS Settings — разделение строк — `border-b border-hairline`,
//     внутренний padding px-5 py-4.
//   - **Иконка inline в начале заголовка** (16px, без подложки). Не
//     отдельный slot слева, а маркер ровно перед title-текстом. Для
//     variant='assigned' / 'responded' — Lucide-иконка цвета success /
//     warning. Для 'default' — colorUrl (Iconify CDN) если есть, иначе
//     Lucide categoryIcon.
//   - Title + time в первой строке. Дальше — category, опц. description
//     (2 строки), опц. ценник (mono ink), status-meta — всё на полную
//     ширину контейнера без левого отступа.
//   - **Parent НЕ должен давать gap-3 / px-X.** OrderRow сам управляет
//     своим padding'ом — render parent: `<View>{rows}</View>`.
//
// Старый дизайн (h-9 w-9 slot с подложкой): см. git log до 2026-05-15.

import { CheckCircle, Hourglass, MapPin } from "phosphor-react-native";
import { Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderStatusValue } from "@/components/OrderStatusBadge";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { formatPrice, urgencyLabel } from "@/features/orders/order-schema";
import type { OrderPriceKind, OrderUrgency } from "@/features/orders/use-create-order";
import { pluralizeResponses } from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

/** Визуальный variant для контекста списка:
 *  - `default` (поиск заказов / Мои заказы клиента) — иконка категории.
 *  - `responded` (мастер «Я откликнулся») — Hourglass + warning-soft фон,
 *    "ждёте ответа клиента".
 *  - `assigned` (мастер «Меня выбрали») — CheckCircle + success-soft фон,
 *    "вас выбрали, можно работать".
 *  По фидбэку user 2026-05-15: «чтобы я понимал какой это таб». */
export type OrderRowVariant = "default" | "responded" | "assigned";

export interface OrderRowProps {
  id: string;
  title: string;
  categoryName: string;
  /** Lucide-icon ключ из categories_l2.icon. Fallback если нет color-иконки. */
  categoryIcon?: string | null;
  /** L2 id для маппинга в цветную SVG-иконку (`getCategoryColorIconUrl`).
   *  Если найдена цветная — рендерим её 24×24, иначе fallback Lucide. */
  categoryL2Id?: string | null;
  cityName: string;
  district?: string | null;
  urgency: OrderUrgency;
  responsesCount: number;
  createdAt: string;
  status?: OrderStatusValue;
  onPress?: () => void;
  /** Контекст списка — меняет левую иконку и подложку. Default — категорийная
   *  иконка. См. OrderRowVariant. */
  variant?: OrderRowVariant;
  /** Показать счётчик откликов в meta-row. По умолчанию `true` (для клиента,
   *  он владелец заказа и хочет знать сколько откликов пришло). Для мастера
   *  скрываем — чужая инфа, ему не нужно знать конкуренцию (фидбэк user
   *  2026-05-15: «мастер не должен видеть сколько откликов у заказа»). */
  showResponsesCount?: boolean;
  /** Способ задания бюджета. Опционально — если не передан, ценник скрывается.
   *  На /orders/search показываем ценник, чтобы мастер видел бюджет, не заходя
   *  внутрь (фидбэк user 2026-05-15 «ценники не отображаются, очень плохо»). */
  budgetKind?: OrderPriceKind | null;
  /** Числовое значение бюджета в ₽. NULL для negotiable. */
  budgetValue?: number | null;
  /** Описание заказа. Опционально — если передано, отрисовывается под title
   *  в 2 строки. На /orders/search показываем для контекста (фидбэк user 2026-05-15
   *  «описание заказа можно 1-2 строки отобразить»). */
  description?: string | null;
}

/**
 * Короткая дата: «11 ч», «2 д», «23 мая» — без «назад», т.к. справа в
 * inbox-row нет места для длинных строк (раньше «11 ч назад» обрезался
 * status-pill'ом).
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

/**
 * Цвет статус-точки + короткий лейбл. Точка маленькая (8px) — статус
 * читается как inline-метка, не как тяжёлый pill.
 */
interface StatusMeta {
  label: string;
  dotClass: string;
  textClass: string;
  dimmed: boolean; // приглушаем карточку целиком для cancelled / expired
}

// Статусы НЕЦВЕТНЫЕ — все используют нейтральные mute/ink-токены вместо
// accent/warning/success. Фидбэк user 2026-05-15: «слишком много цветов на
// главной, статус в работе и т.д. сделать стандартным». Status считается
// нейтральным маркером — текст-лейбл его называет, цвет не нужен. Dimmed-флаг
// (draft/completed/cancelled/expired) делает всю карточку приглушённой.
const STATUS_META: Record<OrderStatusValue, StatusMeta> = {
  draft: { label: "Черновик", dotClass: "bg-muted-soft", textClass: "text-mute", dimmed: true },
  open: { label: "Открыта", dotClass: "bg-muted-soft", textClass: "text-ink", dimmed: false },
  in_progress: {
    label: "В работе",
    dotClass: "bg-muted-soft",
    textClass: "text-ink",
    dimmed: false,
  },
  completed: {
    label: "Завершён",
    dotClass: "bg-muted-soft",
    textClass: "text-mute",
    dimmed: true,
  },
  cancelled: { label: "Отменён", dotClass: "bg-muted-soft", textClass: "text-mute", dimmed: true },
  expired: { label: "Истёк", dotClass: "bg-muted-soft", textClass: "text-mute", dimmed: true },
};

export function OrderRow(props: OrderRowProps) {
  const tc = useThemeColors(["ink", "muted-soft", "mute"]);
  const Icon = getCategoryIcon(props.categoryIcon);
  // Mapping L2 id → colored SVG (fluent-color). Если в curated-словаре есть
  // match — рендерим цветную иконку как на главной, иначе моно-Lucide.
  const colorUrl = getCategoryColorIconUrl(props.categoryL2Id);
  const statusMeta = props.status ? STATUS_META[props.status] : null;
  const dimmed = statusMeta?.dimmed ?? false;
  const variant = props.variant ?? "default";

  // Inline-иконка в начале заголовка. Все variant'ы — НЕЦВЕТНЫЕ (ink-токен,
  // авто-инверсия светлая/тёмная тема). Фидбэк user 2026-05-15: «галочку
  // сделать не цветной, белой в темной теме и наоборот». Отличие variant'ов
  // даётся самой иконкой (CheckCircle / Hourglass / categoryIcon), не цветом.
  // Размер 16px — маркер, не визуальный анкор.
  const inlineIcon =
    variant === "assigned" ? (
      <CheckCircle size={16} weight="bold" color={tc.ink} />
    ) : variant === "responded" ? (
      <Hourglass size={16} weight="bold" color={tc.ink} />
    ) : colorUrl ? (
      <Image source={{ uri: colorUrl }} style={{ width: 16, height: 16 }} />
    ) : (
      <Icon size={16} weight="bold" color={tc.ink} />
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.title} — ${statusMeta?.label ?? ""}`}
      onPress={props.onPress}
      className="border-b border-hairline bg-canvas px-5 py-4 active:bg-canvas-soft hover:bg-canvas-soft"
      style={dimmed ? { opacity: 0.7 } : undefined}
    >
      {/* Row 1: [icon + title flex-1] + time. Иконка inline, чуть смещена
          вниз (mt 3px) чтобы её центр совпал с cap-line первой строки текста. */}
      <View className="flex-row items-start gap-2">
        <View className="flex-1 min-w-0 flex-row items-start gap-1.5">
          <View style={{ marginTop: 3 }}>{inlineIcon}</View>
          <AppText
            weight="semibold"
            className="flex-1 text-body-md text-ink"
            numberOfLines={2}
          >
            {props.title}
          </AppText>
        </View>
        <AppText
          weight="mono"
          className="mt-0.5 text-mono-caption text-muted-soft"
        >
          {timeAgoShort(props.createdAt)}
        </AppText>
      </View>

      {/* Row 2: category eyebrow — текст с левого края (без gap для иконки) */}
      <AppText className="mt-1 text-caption text-mute" numberOfLines={1}>
        {props.categoryName}
      </AppText>

      {/* Row 3 (опц.): описание заказа в 2 строки — short preview для
          контекста. Передаётся на /orders/search чтобы мастер сразу понимал
          детали. */}
      {props.description && props.description.trim().length > 0 ? (
        <AppText
          className="mt-1 text-body-sm text-body"
          numberOfLines={2}
          style={{ lineHeight: 19 }}
        >
          {props.description}
        </AppText>
      ) : null}

      {/* Row 4 (опц.): ценник — отдельной строкой, mono для цифр. */}
      {props.budgetKind ? (
        <AppText weight="mono" className="mt-2 text-body-sm text-ink">
          {formatPrice(props.budgetKind, props.budgetValue ?? null)}
        </AppText>
      ) : null}

      {/* Row 5: status-dot + status + · + meta. Перенос строк gap-y-1
          на случай длинных локаций. */}
      <View className="mt-2 flex-row flex-wrap items-center gap-x-2 gap-y-1">
        {statusMeta ? (
          <View className="flex-row items-center gap-1.5">
            <View className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
            <AppText weight="semibold" className={`text-caption ${statusMeta.textClass}`}>
              {statusMeta.label}
            </AppText>
          </View>
        ) : null}
        {statusMeta ? (
          <AppText className="text-caption text-muted-soft">·</AppText>
        ) : null}
        <AppText className="text-caption text-mute">{urgencyLabel(props.urgency)}</AppText>
        <AppText className="text-caption text-muted-soft">·</AppText>
        <View className="flex-row items-center gap-1">
          <MapPin size={11} weight="bold" color={tc["muted-soft"]} />
          <AppText className="text-caption text-mute" numberOfLines={1}>
            {props.cityName}
            {props.district ? ` · ${props.district}` : ""}
          </AppText>
        </View>
        {props.showResponsesCount !== false ? (
          <>
            <AppText className="text-caption text-muted-soft">·</AppText>
            <AppText className="text-caption text-mute">
              {pluralizeResponses(props.responsesCount)}
            </AppText>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}
