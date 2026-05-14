// OrderRow — карточка заказа в списке.
//
// Дизайн-паттерн (Lazyweb: Craft / Amie / Asana «My tasks»): inbox-row с
// tinted category-icon tile слева, title крупно, мета-row снизу со
// статус-точкой + срочность + локация + N откликов. Время справа сверху,
// чтобы не сталкиваться с status-pill (раньше «Завершён» наезжал на дату).

import { MapPin } from "lucide-react-native";
import { Image, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderStatusValue } from "@/components/OrderStatusBadge";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { getCategoryIcon } from "@/lib/category-icons";
import { urgencyLabel } from "@/features/orders/order-schema";
import type { OrderUrgency } from "@/features/orders/use-create-order";
import { pluralizeResponses } from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

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

const STATUS_META: Record<OrderStatusValue, StatusMeta> = {
  draft: { label: "Черновик", dotClass: "bg-muted-soft", textClass: "text-mute", dimmed: true },
  open: { label: "Открыта", dotClass: "bg-accent", textClass: "text-accent", dimmed: false },
  in_progress: {
    label: "В работе",
    dotClass: "bg-warning",
    textClass: "text-warning",
    dimmed: false,
  },
  completed: {
    label: "Завершён",
    dotClass: "bg-success",
    textClass: "text-success",
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

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.title} — ${statusMeta?.label ?? ""}`}
      onPress={props.onPress}
      className="flex-row items-start gap-3 rounded-xl border border-hairline bg-canvas p-4 active:bg-canvas-soft hover:bg-canvas-soft"
      style={dimmed ? { opacity: 0.7 } : undefined}
    >
      {/* Category icon tile — tinted square. Цветная SVG-иконка (как на
          главной, fluent-color set) или Lucide-моно как fallback. */}
      <View className="h-11 w-11 items-center justify-center rounded-xl bg-canvas-soft-2">
        {colorUrl ? (
          <Image source={{ uri: colorUrl }} style={{ width: 26, height: 26 }} />
        ) : (
          <Icon size={20} strokeWidth={1.75} color={tc.ink} />
        )}
      </View>

      {/* Right column — title + meta */}
      <View className="flex-1 min-w-0">
        {/* Row 1: title (semibold body-md) + time (mono caption right) */}
        <View className="flex-row items-start gap-2">
          <AppText
            weight="semibold"
            className="flex-1 text-body-md text-ink"
            numberOfLines={2}
          >
            {props.title}
          </AppText>
          <AppText
            weight="mono"
            className="mt-0.5 text-mono-caption text-muted-soft"
          >
            {timeAgoShort(props.createdAt)}
          </AppText>
        </View>

        {/* Row 2: category eyebrow */}
        <AppText
          className="mt-1 text-caption text-mute"
          numberOfLines={1}
        >
          {props.categoryName}
        </AppText>

        {/* Row 3: status-dot + status + · + meta. Перенос строк gap-y-1
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
            <MapPin size={11} strokeWidth={1.75} color={tc["muted-soft"]} />
            <AppText className="text-caption text-mute" numberOfLines={1}>
              {props.cityName}
              {props.district ? ` · ${props.district}` : ""}
            </AppText>
          </View>
          <AppText className="text-caption text-muted-soft">·</AppText>
          <AppText className="text-caption text-mute">
            {pluralizeResponses(props.responsesCount)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
