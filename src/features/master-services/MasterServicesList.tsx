// MasterServicesList — публичный read-only прайс на master/[id].tsx.
//
// Использует тот же queryKey ['master-services', masterId], что и MasterServicesSection,
// поэтому при редактировании владельцем кэш инвалидируется и список обновляется автоматически.

import { ActivityIndicator, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  formatPriceRange,
  SERVICE_UNIT_LABELS,
  useMasterServices,
} from "@/features/master-services/use-master-services";

interface MasterServicesListProps {
  masterId: string;
}

export function MasterServicesList({ masterId }: MasterServicesListProps) {
  const { data: services, isLoading, error } = useMasterServices(masterId);

  if (isLoading) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !services || services.length === 0) {
    return null;
  }

  return (
    <View>
      <AppText weight="semibold" className="text-title-lg text-ink">
        Прайс-лист
      </AppText>
      <View className="mt-4 gap-2">
        {services.map((service) => (
          <View
            key={service.id}
            className="flex-row items-center justify-between gap-3 rounded-lg border border-hairline bg-canvas p-3"
          >
            <View className="flex-1">
              <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
                {service.title}
              </AppText>
              <AppText className="mt-0.5 text-caption text-muted">
                {SERVICE_UNIT_LABELS[service.unit]}
              </AppText>
            </View>
            <AppText weight="semibold" className="text-body-md text-ink">
              {formatPriceRange(service.price_min, service.price_max)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
