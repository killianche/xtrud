-- 0103_master_ranking_stage2_3.sql
-- Рейтинг мастеров — Этап 2 + Этап 3 (docs/MASTER_RANKING_PLAN.md §4).
-- Обновляет recompute_master_ranking_scores(), добавляя:
--
-- Этап 2:
--   D. Доля откликов — вместо «кол-ва» считаем «откликнулся ÷ подходящих заказов
--      (по категории) за 30 дней», если подходящих ≥3 (есть статистика); иначе
--      fallback на прокси (кол-во с насыщением).
--   E. Активность — по честной отметке last_active_at (fallback last_seen_feed_at).
--
-- Этап 3:
--   A. Time-decay + анти-накрутка отзывов: считаем байес НЕ из агрегата
--      rating_overall_avg, а напрямую из reviews с экспоненциальным затуханием
--      (свежий отзыв весит больше, период полу-затухания ~180 дней) И дедупом по
--      автору (несколько отзывов одного клиента считаются как один усреднённый —
--      один клиент не «накрутит» счётчик). Только status='visible'.
--   Штраф за срывы: мастер отменил заказ, на который был выбран
--      (picked_master_id = master, status=cancelled, cancelled_by=master) за 90
--      дней → −3 за каждый, до −15. Споры (resolution_kind) пока не штрафуем:
--      dispute-flow в classified-модели свёрнут, значения resolution_kind не
--      определены — добавим, когда появятся реальные данные/семантика.
--
-- Гибрид §3.6 не меняется: доступность (C) по-прежнему бонусом на лету в хуках.

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
      -- A. Отзывы — байес с time-decay (период ~180 дней) и дедупом по автору.
      greatest(0, least(1,
        ((
          select (5 * 4.5 + coalesce(sum(a.wsum), 0)) / (5 + coalesce(sum(a.w), 0))
          from (
            select
              avg(r.rating) * exp(-extract(epoch from (now() - max(r.created_at))) / (180 * 86400.0)) as wsum,
              exp(-extract(epoch from (now() - max(r.created_at))) / (180 * 86400.0)) as w
            from reviews r
            where r.target_id = mp.user_id
              and r.direction = 'client_to_master'
              and r.status = 'visible'
            group by r.author_id
          ) a
        ) - 1) / 4.0
      )) as reviews_norm,
      -- B. Заполненность профиля — доля из 7 пунктов.
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
      -- D. Доля откликов (Этап 2): откликнулся ÷ подходящих заказов по категории
      --    за 30 дней, если подходящих ≥3; иначе прокси по количеству.
      (case
         when (
           select count(*) from orders o
           where o.created_at > now() - interval '30 days'
             and o.l2_id in (select mc.l2_id from master_categories mc where mc.master_id = mp.user_id)
         ) >= 3
         then least(1,
           (select count(*) from order_responses orr
             where orr.master_id = mp.user_id and orr.created_at > now() - interval '30 days')::numeric
           / nullif((
             select count(*) from orders o
             where o.created_at > now() - interval '30 days'
               and o.l2_id in (select mc.l2_id from master_categories mc where mc.master_id = mp.user_id)
           ), 0)
         )
         else least(
           (select count(*) from order_responses orr
             where orr.master_id = mp.user_id and orr.created_at > now() - interval '30 days'),
           10
         ) / 10.0
       end) as responsiveness_norm,
      -- E. Активность (Этап 2): честная отметка last_active_at (fallback на прокси).
      (case
         when coalesce(u.last_active_at, u.last_seen_feed_at) is null then 0.1
         when coalesce(u.last_active_at, u.last_seen_feed_at) > now() - interval '7 days' then 1.0
         when coalesce(u.last_active_at, u.last_seen_feed_at) > now() - interval '30 days' then 0.5
         else 0.1 end) as activity_norm,
      -- Cold-start: буст новизны, линейно затухает к нулю за 30 дней.
      greatest(0,
        8.0 * (1 - least(1,
          extract(epoch from (now() - coalesce(u.onboarding_completed_at, mp.created_at))) / (30 * 86400.0)
        ))
      ) as newness_boost,
      -- Штраф за срывы (Этап 3): мастер отменил заказ, на который был выбран.
      least(
        (select count(*) from orders o
          where o.picked_master_id = mp.user_id
            and o.status = 'cancelled'
            and o.cancelled_by = mp.user_id
            and o.updated_at > now() - interval '90 days'),
        5
      ) * 3 as penalty
    from master_profiles mp
    join users u on u.id = mp.user_id
  )
  update master_profiles mp
  set ranking_score = greatest(0, round((
        100 * (
          0.30 * c.reviews_norm
          + 0.22 * c.profile_norm
          + 0.18 * coalesce(c.responsiveness_norm, 0)
          + 0.10 * c.activity_norm
        ) + c.newness_boost - c.penalty
      )::numeric))
  from calc c
  where c.user_id = mp.user_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.recompute_master_ranking_scores() from public;
revoke all on function public.recompute_master_ranking_scores() from anon;
revoke all on function public.recompute_master_ranking_scores() from authenticated;

-- Пересчёт с новой формулой.
select public.recompute_master_ranking_scores();
