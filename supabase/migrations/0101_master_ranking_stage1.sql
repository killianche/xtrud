-- 0101_master_ranking_stage1.sql
-- Внутренний рейтинг мастеров — Этап 1 (docs/MASTER_RANKING_PLAN.md §3–4).
--
-- Цель: продвигать «хороших» мастеров выше в поиске/категориях, а не
-- сортировать примитивно по звёздам. Единый балл 0..~88 (медленная часть)
-- + бонус доступности применяется на лету при сортировке (гибрид §3.6).
--
-- Медленная часть (эта функция, ночной cron):
--   A. Отзывы (вес 30) — байесовский средний (cold-start: новичок ≈ среднее, не 0).
--   B. Заполненность профиля (вес 22) — доля из 7 пунктов.
--   D. Откликается (вес 18) — кол-во откликов за 30 дней, насыщение на 10.
--   E. Активность (вес 10) — по last_seen_feed_at (прокси, точную отметку заведём в Этап 2).
--   + Cold-start буст новизны (до +8, затухает за 30 дней).
-- Быстрая часть (в хуках при сортировке): C. Доступность «готов сегодня/неделе»
--   (бонус 0..20) — чтобы нажатие «Готов сегодня» поднимало мгновенно, не дожидаясь cron.
--
-- D и E пока на Этап-1 прокси (кол-во откликов / last_seen_feed_at). В Этап 2
-- заменим на «долю откликов» и честную отметку last_active_at (см. план §4).

-- 1. Колонка для материализованного балла (быстрая сортировка/индекс).
alter table public.master_profiles
  add column if not exists ranking_score numeric not null default 0;

create index if not exists idx_master_profiles_ranking_score
  on public.master_profiles (ranking_score desc);

-- 2. Функция пересчёта балла для всех мастеров.
create or replace function public.recompute_master_ranking_scores()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with calc as (
    select
      mp.user_id,
      -- A. Отзывы — байесовский средний (C=5, m=4.5) → норм 0..1.
      greatest(0, least(1,
        ( (5 * 4.5 + coalesce(mp.rating_overall_avg, 0) * coalesce(mp.rating_overall_count, 0))
          / (5 + coalesce(mp.rating_overall_count, 0)) - 1) / 4.0
      )) as reviews_norm,
      -- B. Заполненность профиля — доля из 7 пунктов (портфолио даёт частичный балл).
      (
        (case when coalesce(u.avatar_url, '') <> '' then 1 else 0 end)
        + (case when char_length(coalesce(mp.bio, '')) >= 40 then 1 else 0 end)
        + (case when coalesce(mp.experience_years, 0) > 0 then 1 else 0 end)
        + (case when (select count(*) from master_categories mc where mc.master_id = mp.user_id) >= 1 then 1 else 0 end)
        + (case
             when (select count(*) from portfolio_items pi where pi.master_id = mp.user_id) >= 5 then 1.0
             when (select count(*) from portfolio_items pi where pi.master_id = mp.user_id) >= 1 then 0.5
             else 0 end)
        + (case when exists (
             select 1 from master_categories mc
             where mc.master_id = mp.user_id and mc.pricing_mode in ('per_hour', 'per_unit')
           ) then 1 else 0 end)
        + (case when (mp.whatsapp_same_as_phone = true or coalesce(mp.whatsapp_phone, '') <> '') then 1 else 0 end)
      ) / 7.0 as profile_norm,
      -- D. Отклики за 30 дней (Этап-1 прокси), насыщение на 10.
      least(
        (select count(*) from order_responses orr
          where orr.master_id = mp.user_id and orr.created_at > now() - interval '30 days'),
        10
      ) / 10.0 as responsiveness_norm,
      -- E. Активность по last_seen_feed_at (Этап-1 прокси).
      (case
        when u.last_seen_feed_at is null then 0.1
        when u.last_seen_feed_at > now() - interval '7 days' then 1.0
        when u.last_seen_feed_at > now() - interval '30 days' then 0.5
        else 0.1 end) as activity_norm,
      -- Cold-start: буст новизны, линейно затухает к нулю за 30 дней.
      greatest(0,
        8.0 * (1 - least(1,
          extract(epoch from (now() - coalesce(u.onboarding_completed_at, mp.created_at))) / (30 * 86400.0)
        ))
      ) as newness_boost
    from master_profiles mp
    join users u on u.id = mp.user_id
  )
  update master_profiles mp
  set ranking_score = round((
        100 * (
          0.30 * c.reviews_norm
          + 0.22 * c.profile_norm
          + 0.18 * c.responsiveness_norm
          + 0.10 * c.activity_norm
        ) + c.newness_boost
      )::numeric)
  from calc c
  where c.user_id = mp.user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Балл считается только сервером (cron) — клиентам вызывать незачем.
revoke all on function public.recompute_master_ranking_scores() from public;
revoke all on function public.recompute_master_ranking_scores() from anon;
revoke all on function public.recompute_master_ranking_scores() from authenticated;

-- 3. Ночные задания pg_cron. unschedule+schedule в DO-блоке — идемпотентно
--    (повторный прогон миграции не падает на «job already exists»).
do $$
begin
  begin perform cron.unschedule('recompute_master_ranking'); exception when others then null; end;
  begin perform cron.unschedule('nightly_expire_availability'); exception when others then null; end;
  -- 02:00 — гасим протухшую доступность «готов сегодня» (фикс пробела: функция
  -- expire_availability() была, но в расписании её не было).
  perform cron.schedule('nightly_expire_availability', '0 2 * * *', 'SELECT public.expire_availability();');
  -- 02:30 — пересчёт балла (после гашения доступности; хотя доступность в балл
  -- не входит, порядок логичный: сначала привели статусы в актуальное состояние).
  perform cron.schedule('recompute_master_ranking', '30 2 * * *', 'SELECT public.recompute_master_ranking_scores();');
end $$;

-- 4. Начальный расчёт, чтобы балл заполнился сразу после миграции.
select public.recompute_master_ranking_scores();
