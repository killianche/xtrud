// MasterServicesList — публичный read-only прайс на master/[id].tsx.
//
// Использует тот же queryKey ['master-services', masterId], что и MasterServicesSection,
// поэтому при редактировании владельцем кэш инвалидируется и список обновляется автоматически.
//
// compact (2026-05-19): inline rows с border-hairline divider вместо card-soft.
// Top-3 видны, остальные за «Показать все (N)» ghost-link. Сокращает высоту
// секции с ~540px до ~190px при 6 услугах. Lazyweb pattern: TaskRabbit/
// Whatnot/Alibaba используют inline list-rows для long-price-list.

import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/ui";
import {
  formatPriceRange,
  SERVICE_UNIT_LABELS,
  useMasterServices,
} from "@/features/master-services/use-master-services";
import type { Enums } from "@/types/database";

type ServicePricingKind = Enums<"service_pricing_kind">;

interface MasterServicesListProps {
  masterId: string;
  /** Если true — собственный заголовок «Услуги» не рисуется. */
  hideTitle?: boolean;
  /** Compact mode: inline rows + show-more-after-N. */
  compact?: boolean;
}

const COMPACT_PREVIEW_LIMIT = 3;

export function MasterServicesList({
  masterId,
  hideTitle = false,
  compact = false,
}: MasterServicesListProps) {
  const { data: services, isLoading, error } = useMasterServices(masterId);
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <View className={hideTitle ? "gap-2" : "mt-4 gap-2"}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="rounded-lg" height={compact ? 44 : 60} width="100%" />
        ))}
      </View>
    );
  }

  if (error || !services || services.length === 0) {
    return null;
  }

  const visibleServices =
    compact && !expanded ? services.slice(0, COMPACT_PREVIEW_LIMIT) : services;
  const remaining = compact && !expanded ? services.length - visibleServices.length : 0;

  return (
    <View>
      {!hideTitle ? (
        <AppText weight="semibold" className="text-title-md text-ink">
          Услуги
        </AppText>
      ) : null}

      <View
        className={
          compact
            ? hideTitle
              ? "border-t border-hairline-soft"
              : "mt-3 border-t border-hairline-soft"
            : hideTitle
              ? "gap-3"
              : "mt-4 gap-3"
        }
      >
        {visibleServices.map((service) => {
          const kind: ServicePricingKind = service.pricing_kind ?? "fixed";
          const isQuote = kind === "quote";
          let priceText: string;
          if (isQuote) {
            priceText = "Договорная";
          } else if (kind === "up_to") {
            const value = service.price_max ?? service.price_min;
            priceText = value == null ? "Договорная" : `до ${value.toLocaleString("ru-RU")} ₽`;
          } else if (kind === "fixed") {
            priceText =
              service.price_min == null
                ? "Договорная"
                : `${service.price_min.toLocaleString("ru-RU")} ₽`;
          } else {
            priceText = formatPriceRange(service.price_min, service.price_max);
          }
          const unitText = isQuote
            ? null
            : kind === "hourly"
              ? "за час"
              : SERVICE_UNIT_LABELS[service.unit];

          if (compact) {
            return (
              <View
                key={service.id}
                className="flex-row items-center justify-between gap-3 border-b border-hairline-soft py-3"
              >
                <View className="flex-1 min-w-0">
                  <AppText weight="medium" className="text-ink text-body-md" numberOfLines={1}>
                    {service.title}
                  </AppText>
                  {unitText ? (
                    <AppText className="mt-0.5 text-caption text-mute">{unitText}</AppText>
                  ) : null}
                </View>
                <AppText weight="mono" className="text-ink text-mono-sm">
                  {priceText}
                </AppText>
              </View>
            );
          }

          // Legacy non-compact (card-soft) — оставлен для других экранов.
          return (
            <View key={service.id} className="rounded-xl bg-canvas-soft p-4">
              <View className="flex-row items-center justify-between gap-2">
                <AppText
                  weight="semibold"
                  className="text-ink text-body-md flex-1"
                  numberOfLines={1}
                >
                  {service.title}
                </AppText>
                <AppText weight="mono" className="text-ink text-mono-sm">
                  {priceText}
                </AppText>
              </View>
              {unitText ? (
                <AppText className="mt-1 text-caption text-mute">{unitText}</AppText>
              ) : null}
            </View>
          );
        })}
      </View>

      {compact && remaining > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          hitSlop={8}
          className="mt-3 self-start active:opacity-70"
        >
          <AppText weight="medium" className="text-body-sm text-ink underline">
            Показать все ({services.length})
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
