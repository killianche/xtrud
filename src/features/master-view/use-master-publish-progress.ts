/**
 * useMasterPublishProgress — состояние «готовности к публикации» для мастера.
 *
 * Фидбэк user 2026-05-18: мастер, ставший мастером через `enable_master_mode`,
 * должен видеть чек-лист «что осталось заполнить чтобы стать доступным в
 * каталоге». DB-trigger auto_publish_master сам переключит видимость, когда
 * все три условия выполнены — этот hook нужен только для UI отображения.
 *
 * Условия публикации (миграция 0084):
 *   1. portfolio_items.count >= 5
 *   2. master_categories.count >= 1
 *   3. master_profiles.experience_years > 0
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface MasterPublishProgress {
  portfolioCount: number;
  portfolioRequired: number;
  categoryCount: number;
  categoryRequired: number;
  experienceYears: number | null;
  experienceRequired: boolean;
  isReady: boolean;
  /** Сколько пунктов из всего набора выполнено (0..3). */
  doneCount: number;
  totalCount: number;
}

const PORTFOLIO_REQUIRED = 5;
const CATEGORY_REQUIRED = 1;

export function useMasterPublishProgress(userId: string | null | undefined, enabled = true) {
  return useQuery<MasterPublishProgress>({
    queryKey: ["master-publish-progress", userId],
    queryFn: async () => {
      if (!userId) {
        return {
          portfolioCount: 0,
          portfolioRequired: PORTFOLIO_REQUIRED,
          categoryCount: 0,
          categoryRequired: CATEGORY_REQUIRED,
          experienceYears: null,
          experienceRequired: true,
          isReady: false,
          doneCount: 0,
          totalCount: 3,
        };
      }

      // 3 параллельных запроса — один поход в backend.
      const [portfolioRes, categoryRes, profileRes] = await Promise.all([
        supabase
          .from("portfolio_items")
          .select("id", { count: "exact", head: true })
          .eq("master_id", userId),
        supabase
          .from("master_categories")
          .select("master_id", { count: "exact", head: true })
          .eq("master_id", userId),
        supabase
          .from("master_profiles")
          .select("experience_years")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);

      const portfolioCount = portfolioRes.count ?? 0;
      const categoryCount = categoryRes.count ?? 0;
      const experienceYears = profileRes.data?.experience_years ?? null;

      const portfolioOk = portfolioCount >= PORTFOLIO_REQUIRED;
      const categoryOk = categoryCount >= CATEGORY_REQUIRED;
      const experienceOk = experienceYears != null && experienceYears > 0;
      const doneCount =
        (portfolioOk ? 1 : 0) + (categoryOk ? 1 : 0) + (experienceOk ? 1 : 0);

      return {
        portfolioCount,
        portfolioRequired: PORTFOLIO_REQUIRED,
        categoryCount,
        categoryRequired: CATEGORY_REQUIRED,
        experienceYears,
        experienceRequired: true,
        isReady: portfolioOk && categoryOk && experienceOk,
        doneCount,
        totalCount: 3,
      };
    },
    enabled: !!userId && enabled,
    staleTime: 15_000,
  });
}
