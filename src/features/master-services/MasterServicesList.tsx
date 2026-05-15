// MasterServicesList — публичный read-only прайс на master/[id].tsx.
//
// Использует тот же queryKey ['master-services', masterId], что и MasterServicesSection,
// поэтому при редактировании владельцем кэш инвалидируется и список обновляется автоматически.

import { View } from "react-native";
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
  /** Если true — собственный заголовок «Услуги» не рисуется (используется
   *  когда секция вложена под общим заголовком, см. master/[id] после
   *  объединения «Что делаю» + «Услуги» 2026-05-14). */
  hideTitle?: boolean;
}

export function MasterServicesList({ masterId, hideTitle = false }: MasterServicesListProps) {
  const { data: services, isLoading, error } = useMasterServices(masterId);

  if (isLoading) {
    // Skeleton под реальный layout — 3 строки с теми же размерами что и
    // настоящий service-row (h-14 ≈ p-3 + 2 строки текста). Радиус и border
    // как у настоящих карточек, чтобы при смене состояния layout не дёргался.
    return (
      <View className={hideTitle ? "gap-2" : "mt-4 gap-2"}>
        {[0, 1, 2].map((i) => (
          <Skeleton
            key={i}
            className="rounded-lg"
            height={60}
            width="100%"
          />
        ))}
      </View>
    );
  }

  if (error || !services || services.length === 0) {
    return null;
  }

  return (
    <View>
      {!hideTitle ? (
        <AppText weight="semibold" className="text-title-md text-ink">
          Услуги
        </AppText>
      ) : null}
      {/* Единый стиль с категориями-направлениями: bg-canvas-soft (Card-soft),
          padding 16, radius xl. Унифицирует визуал «Услуги» на master detail —
          раньше прайс выглядел иначе чем категории и казался «другой раздел»
          (фидбэк user 2026-05-14). */}
      <View className={hideTitle ? "gap-3" : "mt-4 gap-3"}>
        {services.map((service) => {
          const kind: ServicePricingKind = service.pricing_kind ?? "fixed";
          const isQuote = kind === "quote";
          // Текст цены: для quote — «Договорная», для остальных — диапазон
          // (formatPriceRange сам ставит «Договорная» если price_min=null).
          const priceText = isQuote
            ? "Договорная"
            : formatPriceRange(service.price_min, service.price_max);
          // Подпись под ценой: для hourly — «за час», для quote скрываем,
          // для остальных — единица из SERVICE_UNIT_LABELS.
          const unitText = isQuote
            ? null
            : kind === "hourly"
              ? "за час"
              : SERVICE_UNIT_LABELS[service.unit];
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
    </View>
  );
}
