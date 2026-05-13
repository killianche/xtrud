// Карточка заказа в списке (для клиентского "Мои заказы" и master feed).
// Паттерн: tag-первая chip с категорией → название → meta (срок, локация, время).

import { MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { OrderStatusBadge, type OrderStatusValue } from "@/components/OrderStatusBadge";
import { urgencyLabel } from "@/features/orders/order-schema";
import type { OrderUrgency } from "@/features/orders/use-create-order";
import { pluralizeResponses } from "@/lib/pluralize";
import { useThemeColor } from "@/lib/use-theme-color";

export interface OrderRowProps {
  id: string;
  title: string;
  categoryName: string;
  cityName: string;
  district?: string | null;
  urgency: OrderUrgency;
  responsesCount: number;
  createdAt: string;
  status?: OrderStatusValue;
  onPress?: () => void;
}

function timeAgo(iso: string): string {
  const created = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - created) / 1000));
  if (diffSec < 60) return "только что";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ч назад`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} д назад`;
}

export function OrderRow(props: OrderRowProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className="rounded-lg border border-hairline bg-canvas p-4 active:opacity-70 hover:bg-surface-2"
    >
      {/* Категория chip + статус + время */}
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-1 flex-row items-center gap-2">
          <View className="rounded-pill bg-surface-2 px-3 py-1">
            <AppText weight="medium" className="text-caption-xs text-body">
              {props.categoryName}
            </AppText>
          </View>
          {props.status && <OrderStatusBadge status={props.status} />}
        </View>
        <AppText className="text-caption-xs text-muted-soft">{timeAgo(props.createdAt)}</AppText>
      </View>

      {/* Title */}
      <AppText weight="semibold" className="mt-3 text-body-md text-ink" numberOfLines={2}>
        {props.title}
      </AppText>

      {/* Meta */}
      <View className="mt-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <AppText className="text-caption text-muted">{urgencyLabel(props.urgency)}</AppText>
        <View className="flex-row items-center gap-1">
          <MapPin size={12} strokeWidth={1.75} color={mutedSoftColor} />
          <AppText className="text-caption text-muted">
            {props.cityName}
            {props.district ? ` · ${props.district}` : ""}
          </AppText>
        </View>
        <AppText className="text-caption text-muted">
          {pluralizeResponses(props.responsesCount)}
        </AppText>
      </View>
    </Pressable>
  );
}
