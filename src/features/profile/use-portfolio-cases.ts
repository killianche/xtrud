/**
 * use-portfolio-cases — hooks для управления кейсами портфолио (миграция 0085).
 *
 * Фидбэк user 2026-05-18: «перед добавлением фото можно создать кейс. Задаём
 * название, фото, описание, дату. При завершении заказа клиента — кейс
 * создаётся автоматически (trigger БД). Фото прикреплены к кейсам».
 *
 * Hooks:
 *   - useMasterCases(masterId) — список кейсов мастера с preview-фото (3 шт).
 *   - useCaseDetail(caseId) — детали одного кейса + все фото.
 *   - useCreateCase — INSERT.
 *   - useUpdateCase — UPDATE title/description/work_done_at.
 *   - useDeleteCase — DELETE (фото удаляются каскадно через ON DELETE CASCADE).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type PortfolioCase = Tables<"portfolio_cases">;
export type PortfolioItem = Tables<"portfolio_items">;

export interface CaseWithPreview extends PortfolioCase {
  /** Топ-3 фото для preview на listing-странице. */
  preview_items: Pick<PortfolioItem, "id" | "url">[];
  /** Сколько всего фото в кейсе (для бейджа «+N»). */
  items_count: number;
}

const CASES_KEY = (masterId: string | null | undefined) => ["portfolio-cases", masterId] as const;

const CASE_DETAIL_KEY = (caseId: string | null | undefined) => ["portfolio-case", caseId] as const;

// ============================================================================
// Список кейсов с preview-фото
// ============================================================================

export function useMasterCases(masterId: string | null | undefined) {
  return useQuery<CaseWithPreview[]>({
    queryKey: CASES_KEY(masterId),
    queryFn: async () => {
      if (!masterId) return [];

      const { data: cases, error } = await supabase
        .from("portfolio_cases")
        .select("*")
        .eq("master_id", masterId)
        .order("sort_order", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!cases || cases.length === 0) return [];

      // Подтягиваем preview-фото для каждого кейса (топ-3) одним запросом.
      const caseIds = cases.map((c) => c.id);
      const { data: items, error: itemsError } = await supabase
        .from("portfolio_items")
        .select("id, url, case_id, sort_order")
        .in("case_id", caseIds)
        .order("sort_order", { ascending: true });

      if (itemsError) throw itemsError;

      const itemsByCase = new Map<string, Pick<PortfolioItem, "id" | "url">[]>();
      for (const it of items ?? []) {
        if (!it.case_id) continue;
        const arr = itemsByCase.get(it.case_id) ?? [];
        arr.push({ id: it.id, url: it.url });
        itemsByCase.set(it.case_id, arr);
      }

      return cases.map<CaseWithPreview>((c) => {
        const all = itemsByCase.get(c.id) ?? [];
        return {
          ...c,
          preview_items: all.slice(0, 3),
          items_count: all.length,
        };
      });
    },
    enabled: !!masterId,
    staleTime: 30_000,
  });
}

// ============================================================================
// Детали одного кейса + все фото
// ============================================================================

export interface CaseWithItems extends PortfolioCase {
  items: PortfolioItem[];
}

export function useCaseDetail(caseId: string | null | undefined) {
  return useQuery<CaseWithItems | null>({
    queryKey: CASE_DETAIL_KEY(caseId),
    queryFn: async () => {
      if (!caseId) return null;

      const { data: caseData, error: caseError } = await supabase
        .from("portfolio_cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();

      if (caseError) throw caseError;
      if (!caseData) return null;

      const { data: items, error: itemsError } = await supabase
        .from("portfolio_items")
        .select("*")
        .eq("case_id", caseId)
        .order("sort_order", { ascending: true });

      if (itemsError) throw itemsError;

      return { ...caseData, items: items ?? [] };
    },
    enabled: !!caseId,
    staleTime: 15_000,
  });
}

// ============================================================================
// Create / Update / Delete
// ============================================================================

export interface CreateCaseInput {
  title: string;
  description?: string | null;
  workDoneAt?: string | null; // ISO date YYYY-MM-DD
}

export function useCreateCase(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation<PortfolioCase, Error, CreateCaseInput>({
    mutationFn: async ({ title, description, workDoneAt }) => {
      if (!userId) throw new Error("auth required");
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("Название кейса обязательно");
      const { data, error } = await supabase
        .from("portfolio_cases")
        .insert({
          master_id: userId,
          title: trimmedTitle,
          description: description?.trim() || null,
          work_done_at: workDoneAt || null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY(userId) });
    },
  });
}

export interface UpdateCaseInput {
  caseId: string;
  title?: string;
  description?: string | null;
  workDoneAt?: string | null;
}

export function useUpdateCase(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation<PortfolioCase, Error, UpdateCaseInput>({
    mutationFn: async ({ caseId, title, description, workDoneAt }) => {
      const updates: Partial<PortfolioCase> = {};
      if (title !== undefined) updates.title = title.trim();
      if (description !== undefined) updates.description = description?.trim() || null;
      if (workDoneAt !== undefined) updates.work_done_at = workDoneAt || null;
      const { data, error } = await supabase
        .from("portfolio_cases")
        .update(updates)
        .eq("id", caseId)
        .select("*")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY(userId) });
      queryClient.invalidateQueries({ queryKey: CASE_DETAIL_KEY(vars.caseId) });
    },
  });
}

export function useDeleteCase(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { caseId: string }>({
    mutationFn: async ({ caseId }) => {
      const { error } = await supabase.from("portfolio_cases").delete().eq("id", caseId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CASES_KEY(userId) });
    },
  });
}
