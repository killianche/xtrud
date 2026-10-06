import {
  ALL_INGUSHETIA_CITY_ID,
  isDistrictName,
  isVillageName,
  isVillageOfDistrict,
} from "@/lib/location-config";
import { UNCATEGORIZED_L2_ID } from "@/lib/product-scope";
import { supabase } from "@/lib/supabase";

export interface PublishCategoryRecord {
  id: string;
  l1_id: string;
  /** Раздел категории включён в базе (`categories_l1.is_active`). Списка
   *  разделов в коде больше нет — см. src/lib/product-scope.ts. */
  l1_active: boolean;
}

export type PublishCategoryLookup = (l2Id: string) => Promise<PublishCategoryRecord | null>;

export interface PublishCityRecord {
  id: string;
}

export type PublishCityLookup = (cityId: string) => Promise<PublishCityRecord | null>;

async function lookupCurrentPublishCategory(l2Id: string): Promise<PublishCategoryRecord | null> {
  let query = supabase
    .from("categories_l2")
    .select("id,l1_id,l1:categories_l1!inner(is_active)")
    .eq("id", l2Id)
    .eq("is_active", true);
  // «Без категории» (0230) скрыта из каталога, но публиковать в неё можно;
  // остальные — только видимые.
  if (l2Id !== UNCATEGORIZED_L2_ID) query = query.eq("is_visible", true);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return { id: data.id, l1_id: data.l1_id, l1_active: data.l1.is_active };
}

async function lookupCurrentPublishCity(cityId: string): Promise<PublishCityRecord | null> {
  const { data, error } = await supabase
    .from("cities")
    .select("id")
    .eq("id", cityId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fresh backend authority check performed immediately before any photo upload
 * or order insert. Bundled catalogue data is deliberately never enough to
 * publish: the selected L2 must still be active, visible and in product scope.
 */
export async function validateOrderPublishCategory(
  l2Id: string,
  lookup: PublishCategoryLookup = lookupCurrentPublishCategory,
): Promise<boolean> {
  if (!l2Id.trim()) return false;
  const category = await lookup(l2Id);
  return Boolean(category && category.id === l2Id && category.l1_active);
}

/**
 * Publish-time authority check for the complete location contract.
 *
 * Real cities are refreshed against the backend. The two non-city variants
 * are deliberately validated against their canonical local contract:
 * `all` means the whole republic, while district-only orders use the tracked
 * district allowlist and store a null city_id.
 */
export async function validateOrderPublishLocation(
  cityId: string,
  district: string,
  lookup: PublishCityLookup = lookupCurrentPublishCity,
  village = "",
): Promise<boolean> {
  const normalizedCityId = cityId.trim();
  const normalizedDistrict = district.trim();
  const normalizedVillage = village.trim();
  // Село — только внутри своего района и без города (как FK и CHECK в 0212).
  if (normalizedVillage) {
    return (
      !normalizedCityId &&
      isDistrictName(normalizedDistrict) &&
      isVillageOfDistrict(normalizedVillage, normalizedDistrict)
    );
  }

  // The form contract makes city and district mutually exclusive. Recheck it
  // at the publish boundary instead of trusting restored draft data.
  if (normalizedCityId && normalizedDistrict) return false;
  if (normalizedCityId === ALL_INGUSHETIA_CITY_ID) return true;
  if (normalizedDistrict) {
    return isDistrictName(normalizedDistrict) || isVillageName(normalizedDistrict);
  }
  if (!normalizedCityId) return false;

  const city = await lookup(normalizedCityId);
  return city?.id === normalizedCityId;
}
