/**
 * Hook: список мастеров, работающих в конкретной L2 категории.
 *
 * Показывается в category-detail. Два запроса:
 *  1) master_categories JOIN users + master_profiles по master_id.
 *  2) cities по уникальным city_id из шага 1.
 *
 * Сортировка по rating_overall_avg DESC (NULLS LAST), затем closed_deals DESC,
 * затем experience_years DESC — сначала проверенные мастера.
 *
 * RLS: read-public на всех трёх таблицах.
 */

import { useQuery } from "@tanstack/react-query";
import { rankingSortValue } from "@/features/master-view/availability";
import { shouldHideDemo } from "@/lib/demo-mode";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export type MasterInCategory = {
  master_id: string;
  user: Pick<
    Tables<"users">,
    "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district"
  >;
  profile: Pick<
    Tables<"master_profiles">,
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "experience_years"
    | "bio"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
    | "ranking_score"
    | "whatsapp_phone"
    | "whatsapp_same_as_phone"
  > | null;
  city: Pick<Tables<"cities">, "id" | "name"> | null;
};

type Row = {
  master_id: string;
  user: Pick<
    Tables<"users">,
    "id" | "first_name" | "last_name" | "avatar_url" | "city_id" | "district"
  > | null;
  profile: Pick<
    Tables<"master_profiles">,
    | "rating_overall_avg"
    | "rating_overall_count"
    | "closed_deals"
    | "experience_years"
    | "bio"
    | "account_type"
    | "team_size"
    | "availability_status"
    | "availability_until"
    | "ranking_score"
    | "whatsapp_phone"
    | "whatsapp_same_as_phone"
  > | null;
};

/** Простой completeness-score (0–5) — сколько ключевых полей заполнено.
 *  Используется как primary sort key чтобы пустые профили не оказывались
 *  выше нормальных только за счёт большого `experience_years` или
 *  «возрастной» позиции в БД. */
function profileCompleteness(m: MasterInCategory): number {
  let score = 0;
  const p = m.profile;
  const u = m.user;
  // Содержательное описание (≥ 20 символов — фильтр от «...» и кратких заглушек).
  if (p?.bio && p.bio.trim().length >= 20) score += 1;
  // Есть хоть один отзыв.
  if ((p?.rating_overall_count ?? 0) > 0) score += 1;
  // Есть закрытые сделки (proof of real activity).
  if ((p?.closed_deals ?? 0) > 0) score += 1;
  // Фото профиля загружено.
  if (u?.avatar_url) score += 1;
  // Указан тип аккаунта (individual / sole_trader / company).
  if (p?.account_type) score += 1;
  return score;
}

export function useMastersByL2(l2Id: string | null | undefined) {
  return useQuery<MasterInCategory[]>({
    queryKey: ["masters-by-l2", l2Id],
    queryFn: async () => {
      if (!l2Id) return [];

      // FK master_categories.master_id ссылается на master_profiles(user_id),
      // НЕ на users(id). Поэтому JOIN до users делаем через master_profiles:
      // master_categories → master_profiles → users.
      const { data, error } = await supabase
        .from("master_categories")
        .select(
          `
          master_id,
          profile:master_profiles!master_categories_master_id_fkey (
            rating_overall_avg, rating_overall_count, closed_deals, experience_years, bio,
            account_type, team_size, availability_status, availability_until,
            ranking_score, is_hidden_from_search,
            whatsapp_phone, whatsapp_same_as_phone,
            user:users!master_profiles_user_id_fkey (
              id, first_name, last_name, avatar_url, city_id, district, is_demo
            )
          )
          `,
        )
        .eq("l2_id", l2Id);
      if (error) throw error;

      // Sprint 0078: фильтруем мастеров, которые сами скрыли профиль через
      // /profile/settings → «Скрыть профиль от клиентов».
      // Sprint 0092 P0-09: дополнительно скрываем demo-аккаунты в production
      // (EXPO_PUBLIC_DEMO_MODE=false). Без этого реальные клиенты увидят
      // 30 тестовых мастеров вперемешку.
      const hideDemo = shouldHideDemo();
      const filtered = (data ?? []).filter((r) => {
        if (r.profile?.is_hidden_from_search === true) return false;
        if (hideDemo && (r.profile as { user?: { is_demo?: boolean } } | null)?.user?.is_demo)
          return false;
        // Скрываем мастеров без описания (пустой bio) — недозаполненные профили
        // не должны висеть в поиске (решение владельца 2026-05-27). Категория
        // у них есть по определению (фильтр .eq(l2_id) выше), но без описания
        // клиент не понимает, кто это, — пустышка-профиль засоряет ленту.
        const bio = r.profile?.bio?.trim() ?? "";
        if (bio.length === 0) return false;
        return true;
      });

      // Развёртываем nested user из profile → row.user (чтобы дальнейший код
      // работал с прежним shape).
      type NestedRow = {
        master_id: string;
        profile:
          | (Omit<NonNullable<Row["profile"]>, never> & {
              user: Row["user"];
            })
          | null;
      };
      const rows: Row[] = (filtered as unknown as NestedRow[]).map((r) => ({
        master_id: r.master_id,
        user: r.profile?.user ?? null,
        profile: r.profile
          ? {
              rating_overall_avg: r.profile.rating_overall_avg,
              rating_overall_count: r.profile.rating_overall_count,
              closed_deals: r.profile.closed_deals,
              experience_years: r.profile.experience_years,
              bio: r.profile.bio,
              account_type: r.profile.account_type,
              team_size: r.profile.team_size,
              availability_status: r.profile.availability_status,
              availability_until: r.profile.availability_until,
              ranking_score: r.profile.ranking_score,
              whatsapp_phone: r.profile.whatsapp_phone,
              whatsapp_same_as_phone: r.profile.whatsapp_same_as_phone,
            }
          : null,
      }));

      const cityIds = Array.from(
        new Set(rows.map((r) => r.user?.city_id).filter((v): v is string => !!v)),
      );

      let citiesMap = new Map<string, { id: string; name: string }>();
      if (cityIds.length > 0) {
        const { data: cityData, error: cityErr } = await supabase
          .from("cities")
          .select("id, name")
          .in("id", cityIds);
        if (cityErr) throw cityErr;
        citiesMap = new Map(cityData?.map((c) => [c.id, c]) ?? []);
      }

      const seen = new Set<string>();
      const list: MasterInCategory[] = [];
      for (const r of rows) {
        if (!r.user || seen.has(r.master_id)) continue;
        seen.add(r.master_id);
        list.push({
          master_id: r.master_id,
          user: r.user,
          profile: r.profile,
          city: r.user.city_id ? (citiesMap.get(r.user.city_id) ?? null) : null,
        });
      }

      // Сортировка:
      //  1. Полнота профиля — мастера с пустыми профилями (нет bio / нет фото /
      //     нет отзывов / нет account_type) ВСЕГДА в конце ленты. Это анти-spam
      //     против фейковых аккаунтов с придуманным «66 лет опыта» и пустыми
      //     остальными полями. Решение владельца 2026-05-27.
      //  2. ranking_score (cron-вычисляемый) + availability boost.
      //  3. Тай-брейк: closed_deals → experience_years.
      list.sort((a, b) => {
        const ca = profileCompleteness(a);
        const cb = profileCompleteness(b);
        // Низкая полнота (≤ 1) → в самый конец, перед нормальными профилями.
        const aLow = ca <= 1 ? 1 : 0;
        const bLow = cb <= 1 ? 1 : 0;
        if (aLow !== bLow) return aLow - bLow;
        // Внутри одной группы — completeness DESC (5 баллов выше 2 баллов).
        if (cb !== ca) return cb - ca;

        const sa = rankingSortValue(
          a.profile?.ranking_score,
          a.profile?.availability_status,
          a.profile?.availability_until,
        );
        const sb = rankingSortValue(
          b.profile?.ranking_score,
          b.profile?.availability_status,
          b.profile?.availability_until,
        );
        if (sb !== sa) return sb - sa;
        const da = a.profile?.closed_deals ?? 0;
        const db = b.profile?.closed_deals ?? 0;
        if (db !== da) return db - da;
        const ea = a.profile?.experience_years ?? 0;
        const eb = b.profile?.experience_years ?? 0;
        return eb - ea;
      });

      return list;
    },
    enabled: !!l2Id,
    staleTime: 60_000,
  });
}
