/**
 * Hooks для раздела «Полезное» (Sprint I.9).
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type Article = Tables<"articles">;

export function articlesKey() {
  return ["articles", "published"] as const;
}

export function articleBySlugKey(slug: string | undefined) {
  return ["article", slug] as const;
}

export function useArticles() {
  return useQuery<Article[]>({
    queryKey: articlesKey(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Article[];
    },
    staleTime: 60_000,
  });
}

export function useArticleBySlug(slug: string | null | undefined) {
  return useQuery<Article | null>({
    queryKey: articleBySlugKey(slug ?? undefined),
    queryFn: async () => {
      if (!slug) return null;
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
    staleTime: 5 * 60_000,
  });
}
