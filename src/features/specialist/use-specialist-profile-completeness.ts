/**
 * Хук-обёртка над `computeSpecialistProfileCompleteness` (profile-completeness.ts):
 * собирает данные существующими хуками и вызывает чистую функцию. И
 * `SpecialistProfileNudge` (главная), и `AccountBody` (вкладка профиля)
 * используют этот один хук — никакой второй копии логики
 * (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.1).
 *
 * Отдельный файл от чистой функции: этот модуль тянет `@/lib/supabase`, а
 * тот — `react-native`, который vitest не парсит (см. комментарий в
 * profile-completeness.ts) — юнит-тест чистой функции должен оставаться
 * импортируемым без хуков.
 */

import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import {
  type CompletenessInput,
  computeSpecialistProfileCompleteness,
} from "@/features/specialist/profile-completeness";
import { useMySpecialistProfile } from "@/features/specialist/use-specialist";
import { realAvatarUrl } from "@/lib/avatar";

/**
 * `ready` — у всех нужных запросов есть ответ. Только `isFetched` мало: при
 * сбое сети запрос тоже «завершён», но без данных — и индикатор показал бы
 * заниженное «N из 4» у заполненного профиля (QA №360). Нет данных хотя бы
 * по одному запросу — не показываем ни карточку, ни индикатор. Устаревшие
 * данные из кэша при неудачном обновлении остаются — их показывать можно.
 */
export function useSpecialistProfileCompleteness(userId: string | undefined) {
  const categories = useMyMasterCategories(userId);
  const user = useUserRecord(userId);
  const profile = useMySpecialistProfile(userId);
  const portfolio = useMasterPortfolio(userId);

  const ready =
    categories.data !== undefined &&
    user.data !== undefined &&
    profile.data !== undefined &&
    portfolio.data !== undefined;

  const input: CompletenessInput = {
    hasCategories: (categories.data ?? []).length > 0,
    hasAvatar: !!realAvatarUrl(user.data?.avatar_url),
    hasBio: !!profile.data?.bio?.trim(),
    hasPortfolio: (portfolio.data ?? []).length > 0,
    hasContacts: !!(user.data?.contact_phone || profile.data?.whatsapp_phone),
  };

  return { ...computeSpecialistProfileCompleteness(input), ready };
}
