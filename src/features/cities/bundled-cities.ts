import { PICKER_CITIES } from "@/lib/location-config";
import type { Tables } from "@/types/database";

/**
 * Existing UI city configuration projected into the database row shape.
 * This is only a form-filling fallback; publication still revalidates the
 * selected city against the authoritative backend.
 */
export const BUNDLED_PICKER_CITIES: readonly Tables<"cities">[] = PICKER_CITIES.map(
  (city, sortOrder) => ({
    id: city.id,
    name: city.name,
    region: "Республика Ингушетия",
    sort_order: sortOrder,
    is_active: true,
    created_at: "1970-01-01T00:00:00.000Z",
  }),
);
