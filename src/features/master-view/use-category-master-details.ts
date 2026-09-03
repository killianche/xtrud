// Услуги и портфолио сразу для всего списка мастеров — двумя запросами.
//
// Зачем (FACT, замер по коду 2026-09-03): карточка мастера в категории сама
// вызывает useMasterServices(id) и useMasterPortfolio(id). На списке из 20
// мастеров это 40 запросов вдобавок к двум запросам самого списка. Экран
// открывался тем медленнее, чем больше в категории людей — то есть хуже всего
// вёл себя там, где нужнее всего.
//
// Приём: забираем данные для всех мастеров одним запросом на таблицу и
// раскладываем их в кэш react-query ПОД ТЕМИ ЖЕ КЛЮЧАМИ, которыми пользуются
// карточки. Карточка находит готовое значение и в сеть не идёт вовсе —
// менять её саму не нужно.
//
// Правило скорости: один экран — один запрос за списком
// (.claude/rules/design-quality.md §1.2).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { masterServicesKey } from "@/features/master-services/use-master-services";
import { groupByMaster } from "@/features/master-view/group-by-master";
import { portfolioKey } from "@/features/profile/use-my-portfolio";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

type MasterService = Tables<"master_services">;
type PortfolioItem = Tables<"portfolio_items">;

/**
 * Загружает услуги и портфолио для переданных мастеров и кладёт результат в
 * кэш по ключам одиночных хуков. Возвращает состояние загрузки — экран может
 * показать скелетоны, пока данные едут.
 */
export function useCategoryMasterDetails(masterIds: readonly string[]) {
  const queryClient = useQueryClient();
  // Ключ не должен меняться от порядка: иначе сортировка списка сбрасывала бы
  // кэш и запрос уходил заново.
  const ids = [...new Set(masterIds)].sort();

  return useQuery({
    queryKey: ["category-master-details", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const [servicesResult, portfolioResult] = await Promise.all([
        supabase
          .from("master_services")
          .select("*")
          .in("master_id", ids)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase
          .from("portfolio_items")
          .select("*")
          .in("master_id", ids)
          .order("sort_order", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

      if (servicesResult.error) throw servicesResult.error;
      if (portfolioResult.error) throw portfolioResult.error;

      const services = groupByMaster((servicesResult.data ?? []) as MasterService[]);
      const portfolio = groupByMaster((portfolioResult.data ?? []) as PortfolioItem[]);

      // Раскладываем по одиночным ключам. Пустой массив тоже кладём: иначе
      // карточка мастера без услуг сходит в сеть за пустотой.
      for (const id of ids) {
        queryClient.setQueryData(masterServicesKey(id), services.get(id) ?? []);
        queryClient.setQueryData(portfolioKey(id), portfolio.get(id) ?? []);
      }

      return { masters: ids.length };
    },
  });
}
