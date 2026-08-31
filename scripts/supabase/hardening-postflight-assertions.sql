-- Поведенческие проверки для черновиков 0135..0142.
--
-- Устройство и почему именно такое.
--
-- 1. Каждая проверка исполняется НАСТОЯЩЕЙ ролью (anon / authenticated), с
--    настоящими клеймами request.jwt.claims, а не под владельцем базы.
--    Проверка под postgres не значит ничего: у него есть всё.
--
-- 2. Каждая проверка выполняется во вложенной транзакции, которая всегда
--    откатывается. Иначе успешная запись из одной проверки меняла бы условия
--    следующей, и «зелёный» набор зависел бы от порядка.
--
-- 3. Ожидание указывается явно и различает три разных «нельзя»:
--      denied  — SQLSTATE 42501, то есть отказ ПРАВ или триггера;
--      ok0     — команда разрешена, но RLS не пропустил ни одной строки;
--      error   — любая другая ошибка (нарушение CHECK, RAISE в RPC).
--    Это принципиально: «0 строк» и «нет прав» — разные состояния, и
--    ассерт, который их путает, зеленеет, когда защита исчезла.
--
-- 4. Половина набора проверяет, что ОПУБЛИКОВАННЫЙ КЛИЕНТ ПРОДОЛЖАЕТ
--    РАБОТАТЬ. Сужение грантов, которое ломает приложение, — не защита, а
--    авария; такой набор обязан краснеть на слишком узком списке колонок так
--    же, как на слишком широком.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------------
-- Харнесс
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fx_check(
  p_label   text,
  p_role    text,
  p_uid     uuid,
  p_session uuid,
  p_aal     text,
  p_sql     text,
  p_expect  text      -- ok | ok0 | ok1 | denied | error | true | false
) RETURNS void
LANGUAGE plpgsql
AS $fx$
DECLARE
  v_state  text := 'ok';
  v_msg    text := '';
  v_rows   bigint := 0;
  v_bool   boolean;
  v_actual text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_uid IS NULL THEN ''
         ELSE json_build_object('sub', p_uid, 'session_id', p_session,
                                'aal', coalesce(p_aal, 'aal1'), 'role', p_role)::text
    END, true);

  BEGIN
    IF p_expect IN ('true', 'false') THEN
      EXECUTE p_sql INTO v_bool;
      v_rows := 0;
    ELSE
      EXECUTE p_sql;
      GET DIAGNOSTICS v_rows = ROW_COUNT;
    END IF;
    -- сигнальная ошибка: всегда откатывает всё, что проверка успела записать
    RAISE EXCEPTION 'fx_rollback' USING ERRCODE = 'XTF01';
  EXCEPTION
    WHEN SQLSTATE 'XTF01' THEN
      v_state := 'ok';
    WHEN OTHERS THEN
      v_state := SQLSTATE;
      v_msg := SQLERRM;
  END;

  v_actual := CASE
    WHEN v_state = '42501' THEN 'denied'
    WHEN v_state <> 'ok'   THEN 'error(' || v_state || ')'
    WHEN p_expect = 'true'  THEN CASE WHEN v_bool THEN 'true' ELSE 'false' END
    WHEN p_expect = 'false' THEN CASE WHEN v_bool THEN 'true' ELSE 'false' END
    WHEN v_rows = 0 THEN 'ok0'
    ELSE 'ok1'
  END;

  IF NOT (
       (p_expect = 'ok'     AND v_state = 'ok')
    OR (p_expect = 'ok0'    AND v_state = 'ok' AND v_rows = 0)
    OR (p_expect = 'ok1'    AND v_state = 'ok' AND v_rows >= 1)
    OR (p_expect = 'denied' AND v_state = '42501')
    OR (p_expect = 'error'  AND v_state NOT IN ('ok', '42501'))
    OR (p_expect = 'true'   AND v_state = 'ok' AND v_bool IS TRUE)
    OR (p_expect = 'false'  AND v_state = 'ok' AND v_bool IS FALSE)
  ) THEN
    RAISE EXCEPTION 'ASSERT FAIL [%]: ожидалось %, получено % %',
      p_label, p_expect, v_actual, coalesce('— ' || v_msg, '')
      USING ERRCODE = 'XTA01';
  END IF;
END
$fx$;

-- Одна строка журнала, чтобы проверки на неизменяемость имели что ломать.
-- Пишется владельцем базы напрямую: RLS его не ограничивает (FORCE не включён),
-- а триггеры запрещают только UPDATE/DELETE/TRUNCATE.
DO $seed$
BEGIN
  IF to_regclass('public.admin_actions') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.admin_actions) THEN
    INSERT INTO public.admin_actions (admin_id, admin_label, report_id, target_type, target_id, action, reason)
    VALUES ('a0000000-0000-4000-8000-000000000009', 'Администратор',
            'd0000000-0000-4000-8000-000000000001', 'user',
            'a0000000-0000-4000-8000-00000000000a', 'warn', 'запись для проверок неизменяемости');
  END IF;
END
$seed$;

\echo ''
\echo '=== A. ОПУБЛИКОВАННЫЙ КЛИЕНТ ПРОДОЛЖАЕТ РАБОТАТЬ ==========================='

-- клиент a0..01, мастер a0..02, второй мастер a0..03, новый a0..04,
-- админ a0..09 (aal2-сессия 50..01, aal1-сессия 50..02), жертва a0..0a
SELECT public.fx_check('A01 users PATCH имя (клиент)', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET first_name='Алина', last_name='И.' WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'ok1');

SELECT public.fx_check('A02 users PATCH avatar_url', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET avatar_url='https://x/y.jpg' WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'ok1');

SELECT public.fx_check('A03 users PATCH active_role (мастер)', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.users SET active_role='client' WHERE id='a0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A04 users PATCH профиль мастера (имя/район/телефон)', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.users SET first_name='Иса', last_name='Ц.', city_id='magas', district='Центр', contact_phone='79280000000' WHERE id='a0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A05 RPC mark_feed_seen() — SECURITY INVOKER, пишет last_seen_feed_at', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$SELECT public.mark_feed_seen()$$, 'ok');

SELECT public.fx_check('A06 RPC complete_master_onboarding() — INVOKER, users + INSERT master_profiles', 'authenticated',
  'a0000000-0000-4000-8000-000000000004', NULL, 'aal1',
  $$SELECT public.complete_master_onboarding('Ахмед','М.','magas','Центр','био',4,false,false)$$, 'ok');

SELECT public.fx_check('A07 RPC finalize_master_onboarding() — INVOKER', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$SELECT public.finalize_master_onboarding()$$, 'ok');

SELECT public.fx_check('A08 master_profiles upsert из онбординга', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$INSERT INTO public.master_profiles (user_id,bio,experience_years,has_tools,has_transport,whatsapp_same_as_phone,whatsapp_phone)
    VALUES ('a0000000-0000-4000-8000-000000000002','новое био',6,false,false,false,'79280000001')
    ON CONFLICT (user_id) DO UPDATE SET
      user_id=EXCLUDED.user_id, bio=EXCLUDED.bio, experience_years=EXCLUDED.experience_years,
      has_tools=EXCLUDED.has_tools, has_transport=EXCLUDED.has_transport,
      whatsapp_same_as_phone=EXCLUDED.whatsapp_same_as_phone, whatsapp_phone=EXCLUDED.whatsapp_phone$$, 'ok1');

SELECT public.fx_check('A09 master_profiles публикация профиля (status=active)', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET status='active' WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A10 master_profiles скрыть профиль из поиска', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET is_hidden_from_search=true WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A11 orders INSERT — полный payload use-create-order', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$INSERT INTO public.orders (client_id,l2_id,title,contact_name,description,city_id,district,urgency,preferred_date,budget_kind,budget_value,photo_urls,status)
    VALUES ('a0000000-0000-4000-8000-000000000001','l2-plumbing','Заменить смеситель','Алина','описание','magas','Центр','by_date','2026-09-10','fixed',3000,'{}','open')$$, 'ok1');

SELECT public.fx_check('A12 orders PATCH — полный payload use-update-order', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.orders SET l2_id='l2-plumbing', title='Новый заголовок задачи', contact_name='Алина',
      description='новое описание', city_id='magas', district='Центр', urgency='flexible',
      preferred_date=NULL, budget_kind='negotiable', budget_value=NULL, photo_urls='{}'
    WHERE id='b0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A13 orders отмена заказа с причиной', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.orders SET status='cancelled', cancel_reason='передумала', cancelled_by='a0000000-0000-4000-8000-000000000001'
     WHERE id='b0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A14 order_responses INSERT (триггер пишет orders.responses_count)', 'authenticated',
  'a0000000-0000-4000-8000-000000000003', NULL, 'aal1',
  $$INSERT INTO public.order_responses (order_id,master_id,l2_id,lead_time,message,price_kind,price_value)
    VALUES ('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','l2-plumbing','сегодня','Возьмусь за работу','fixed',2500)$$, 'ok1');

SELECT public.fx_check('A15 RPC mark_order_responses_viewed() — INVOKER, пишет order_responses.status', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT public.mark_order_responses_viewed('b0000000-0000-4000-8000-000000000001')$$, 'ok');

SELECT public.fx_check('A16 RPC accept_response() — INVOKER, пишет orders.picked_master_id', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT public.accept_response('c0000000-0000-4000-8000-000000000001')$$, 'ok');

SELECT public.fx_check('A17 reviews INSERT (триггер пересчёта рейтинга мастера)', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$INSERT INTO public.reviews (order_id,author_id,target_id,direction,rating,text,l2_id)
    VALUES ('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','client_to_master',5,'отлично','l2-plumbing')$$, 'ok1');

SELECT public.fx_check('A18 orders DELETE своего открытого заказа', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$DELETE FROM public.orders WHERE id='b0000000-0000-4000-8000-000000000002'$$, 'ok1');

SELECT public.fx_check('A19 RPC touch_last_active() — SECURITY DEFINER, гранта не требует', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT public.touch_last_active()$$, 'ok');

SELECT public.fx_check('A20 anon читает открытые задания', 'anon', NULL, NULL, NULL,
  $$SELECT count(*) FROM public.orders$$, 'ok');

\echo ''
\echo '=== B. ЗАКРЫТЫЕ ДЫРЫ ======================================================='

SELECT public.fx_check('B01 мастер поднимает себя в каталоге (ranking_score)', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET ranking_score=999999 WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B02 ranking_score через INSERT нового профиля', 'authenticated',
  'a0000000-0000-4000-8000-000000000004', NULL, 'aal1',
  $$INSERT INTO public.master_profiles (user_id,bio,ranking_score) VALUES ('a0000000-0000-4000-8000-000000000004','био',999999)$$, 'denied');

SELECT public.fx_check('B03 мастер повышает свой уровень верификации', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET verification_level=5 WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B04 мастер дорисовывает себе закрытые сделки', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET closed_deals=500 WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B05 мастер ставит себе рейтинг 5.0', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET rating_overall_avg=5.0, rating_overall_count=99 WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B06 мастер меняет тип аккаунта и размер бригады', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.master_profiles SET account_type='company', team_size=50 WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B07 самоназначение в администраторы через UPDATE', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET is_admin=true WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B08 самоназначение через INSERT — 0130 этот путь НЕ закрывает', 'authenticated',
  'a0000000-0000-4000-8000-00000000000b', NULL, 'aal1',
  $$INSERT INTO public.users (id,first_name,is_admin) VALUES ('a0000000-0000-4000-8000-00000000000b','Новый',true)$$, 'denied');

SELECT public.fx_check('B09 подмена username мимо RPC set_username', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET username='alina' WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B10 накрутка last_active_at (подбалл активности в ранжировании)', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.users SET last_active_at=now() WHERE id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

SELECT public.fx_check('B11 клиент ставит себе рейтинг заказчика', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET rating_as_client_avg=5.0 WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B12 заказ не истекает никогда (expires_at)', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.orders SET expires_at=now()+interval '10 years' WHERE id='b0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B13 передача чужого заказа себе (client_id)', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.orders SET client_id='a0000000-0000-4000-8000-000000000002' WHERE id='b0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B14 фальшивый счётчик откликов при создании заказа', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$INSERT INTO public.orders (client_id,l2_id,title,responses_count) VALUES ('a0000000-0000-4000-8000-000000000001','l2-plumbing','Заголовок задачи',99)$$, 'denied');

SELECT public.fx_check('B15 мастер переписывает текст своего отклика задним числом', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.order_responses SET message='совсем другой текст отклика' WHERE id='c0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B16 мастер меняет цену уже принятого отклика', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$UPDATE public.order_responses SET price_kind='fixed', price_value=1 WHERE id='c0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B17 anon пишет в users (раньше это было «0 строк», а не отказ)', 'anon', NULL, NULL, NULL,
  $$UPDATE public.users SET first_name='кто угодно' WHERE id='a0000000-0000-4000-8000-000000000001'$$, 'denied');

SELECT public.fx_check('B18 anon создаёт заказ', 'anon', NULL, NULL, NULL,
  $$INSERT INTO public.orders (client_id,l2_id,title) VALUES ('a0000000-0000-4000-8000-000000000001','l2-plumbing','Заголовок задачи')$$, 'denied');

SELECT public.fx_check('B19 TRUNCATE users — TRUNCATE не подчиняется RLS', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$TRUNCATE public.users CASCADE$$, 'denied');

SELECT public.fx_check('B20 удаление своего профиля мастера мимо delete_my_account', 'authenticated',
  'a0000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000004', 'aal1',
  $$DELETE FROM public.master_profiles WHERE user_id='a0000000-0000-4000-8000-000000000002'$$, 'denied');

\echo ''
\echo '=== C. is_admin_session() =================================================='

SELECT public.fx_check('C01 админ в сессии aal2', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT public.is_admin_session()$$, 'true');

SELECT public.fx_check('C02 админ, сессия aal1, но КЛЕЙМ JWT врёт про aal2', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000002', 'aal2',
  $$SELECT public.is_admin_session()$$, 'false');

SELECT public.fx_check('C03 админ, session_id отсутствует в auth.sessions', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-0000000000ff', 'aal2',
  $$SELECT public.is_admin_session()$$, 'false');

SELECT public.fx_check('C04 обычный пользователь в сессии aal2', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT public.is_admin_session()$$, 'false');

SELECT public.fx_check('C05 без клеймов вовсе', 'authenticated', NULL, NULL, NULL,
  $$SELECT public.is_admin_session()$$, 'false');

SELECT public.fx_check('C05b заблокированный администратор в сессии aal2', 'authenticated',
  'a0000000-0000-4000-8000-00000000000c', '50000000-0000-4000-8000-000000000005', 'aal2',
  $$SELECT public.is_admin_session()$$, 'false');

SELECT public.fx_check('C06 anon не может вызвать is_admin_session()', 'anon', NULL, NULL, NULL,
  $$SELECT public.is_admin_session()$$, 'denied');

SELECT public.fx_check('C07 anon не может читать auth.sessions напрямую', 'anon', NULL, NULL, NULL,
  $$SELECT count(*) FROM auth.sessions$$, 'denied');

\echo ''
\echo '=== D. СУЖЕННАЯ ПОЛИТИКА users_admin_update ================================'

SELECT public.fx_check('D01 админ(aal2) меняет статус другого пользователя', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET status='suspended' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'ok1');

SELECT public.fx_check('D02 админ(aal2) переписывает чужое имя', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET first_name='Подменённое' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'denied');

SELECT public.fx_check('D03 админ(aal2) переписывает чужой контактный телефон', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET contact_phone='79990000000' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'denied');

SELECT public.fx_check('D04 админ(aal2) меняет статус И имя одной командой', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET status='banned', first_name='Подменённое' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'denied');

SELECT public.fx_check('D05 админ БЕЗ второго фактора меняет статус — политика не пропускает', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000002', 'aal2',
  $$UPDATE public.users SET status='banned' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'ok0');

SELECT public.fx_check('D06 обычный пользователь меняет чужой статус', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$UPDATE public.users SET status='banned' WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'ok0');

SELECT public.fx_check('D07 админ правит СВОЮ строку обычным путём', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET first_name='Админ' WHERE id='a0000000-0000-4000-8000-000000000009'$$, 'ok1');

SELECT public.fx_check('D08 админ(aal2) выдаёт права администратора другому', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.users SET is_admin=true WHERE id='a0000000-0000-4000-8000-00000000000a'$$, 'denied');

\echo ''
\echo '=== E. ЖУРНАЛ admin_actions ================================================'

SELECT public.fx_check('E01 обычный пользователь пишет в журнал напрямую', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$INSERT INTO public.admin_actions (admin_id,target_type,target_id,action,reason)
    VALUES ('a0000000-0000-4000-8000-000000000001','user','a0000000-0000-4000-8000-00000000000a','ban','я так решил')$$, 'denied');

SELECT public.fx_check('E02 админ(aal2) пишет в журнал напрямую, минуя RPC', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$INSERT INTO public.admin_actions (admin_id,target_type,target_id,action,reason)
    VALUES ('a0000000-0000-4000-8000-000000000009','user','a0000000-0000-4000-8000-00000000000a','ban','мимо RPC')$$, 'denied');

SELECT public.fx_check('E03 anon читает журнал', 'anon', NULL, NULL, NULL,
  $$SELECT count(*) FROM public.admin_actions$$, 'denied');

SELECT public.fx_check('E04 обычный пользователь читает журнал — грант есть, RLS не пускает', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT * FROM public.admin_actions$$, 'ok0');

SELECT public.fx_check('E05 админ(aal2) читает журнал', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT * FROM public.admin_actions$$, 'ok1');

SELECT public.fx_check('E06 админ БЕЗ второго фактора читает журнал', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000002', 'aal2',
  $$SELECT * FROM public.admin_actions$$, 'ok0');

SELECT public.fx_check('E07 админ(aal2) пишет действие через RPC', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT public.admin_log_action('suspend','user','a0000000-0000-4000-8000-00000000000a','спам в откликах','d0000000-0000-4000-8000-000000000001')$$, 'ok');

SELECT public.fx_check('E08 админ БЕЗ второго фактора пишет через RPC', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000002', 'aal2',
  $$SELECT public.admin_log_action('suspend','user','a0000000-0000-4000-8000-00000000000a','спам','d0000000-0000-4000-8000-000000000001')$$, 'denied');

SELECT public.fx_check('E09 обычный пользователь пишет через RPC', 'authenticated',
  'a0000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', 'aal2',
  $$SELECT public.admin_log_action('ban','user','a0000000-0000-4000-8000-00000000000a','просто так')$$, 'denied');

SELECT public.fx_check('E10 anon вызывает RPC журнала', 'anon', NULL, NULL, NULL,
  $$SELECT public.admin_log_action('ban','user','a0000000-0000-4000-8000-00000000000a','просто так')$$, 'denied');

SELECT public.fx_check('E11 действие без причины', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT public.admin_log_action('ban','user','a0000000-0000-4000-8000-00000000000a','   ')$$, 'error');

SELECT public.fx_check('E12 неизвестное действие', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT public.admin_log_action('delete_everything','user','a0000000-0000-4000-8000-00000000000a','причина')$$, 'error');

SELECT public.fx_check('E13 отмена ссылается на несуществующее действие', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$SELECT public.admin_log_action('unsuspend','user','a0000000-0000-4000-8000-00000000000a','ошибочная санкция',NULL,'{}'::jsonb,'00000000-0000-4000-8000-0000000000ff')$$, 'error');

SELECT public.fx_check('E14 админ(aal2) правит запись журнала', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$UPDATE public.admin_actions SET reason='другая причина'$$, 'denied');

SELECT public.fx_check('E15 админ(aal2) удаляет запись журнала', 'authenticated',
  'a0000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000001', 'aal2',
  $$DELETE FROM public.admin_actions$$, 'denied');

-- Неизменяемость «даже для владельца базы» проверяется отдельно: fx_check
-- работает под API-ролью, а весь смысл требования — что не помогает и postgres.
DO $owner$
DECLARE v_ok boolean;
BEGIN
  BEGIN
    UPDATE public.admin_actions SET reason = 'подмена владельцем базы';
    RAISE EXCEPTION 'ASSERT FAIL [E16 владелец базы правит журнал]: UPDATE прошёл' USING ERRCODE='XTA01';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DELETE FROM public.admin_actions;
    RAISE EXCEPTION 'ASSERT FAIL [E17 владелец базы удаляет запись журнала]: DELETE прошёл' USING ERRCODE='XTA01';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    TRUNCATE public.admin_actions;
    RAISE EXCEPTION 'ASSERT FAIL [E18 владелец базы делает TRUNCATE журнала]: TRUNCATE прошёл' USING ERRCODE='XTA01';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  SELECT count(*) = 1 INTO v_ok FROM public.admin_actions;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'ASSERT FAIL [E19 журнал не потерял записи]' USING ERRCODE='XTA01';
  END IF;
END
$owner$;

\echo ''
\echo '=== F. СТРУКТУРНЫЕ ИНВАРИАНТЫ ============================================='

DO $structural$
DECLARE
  v_bad text;
  v_tbl text;
BEGIN
  -- F01 табличных привилегий записи у API-ролей не осталось: без этого вся
  --     колоночная модель фиктивна.
  FOREACH v_tbl IN ARRAY ARRAY['users', 'master_profiles', 'orders', 'order_responses'] LOOP
    IF has_table_privilege('authenticated', ('public.' || v_tbl)::regclass, 'UPDATE')
       OR has_table_privilege('authenticated', ('public.' || v_tbl)::regclass, 'INSERT') THEN
      RAISE EXCEPTION 'ASSERT FAIL [F01 табличный INSERT/UPDATE у authenticated на public.%]', v_tbl USING ERRCODE='XTA01';
    END IF;
  END LOOP;

  -- F02 применённая 0130 на месте
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid='public.users'::regclass
                    AND t.tgname='users_guard_privilege_columns'
                    AND NOT t.tgisinternal AND t.tgenabled <> 'D') THEN
    RAISE EXCEPTION 'ASSERT FAIL [F02 триггер 0130 отсутствует или выключен]' USING ERRCODE='XTA01';
  END IF;

  -- F03 триггер сужения админского пути на месте
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                  WHERE t.tgrelid='public.users'::regclass
                    AND t.tgname='users_guard_admin_scope'
                    AND NOT t.tgisinternal AND t.tgenabled <> 'D') THEN
    RAISE EXCEPTION 'ASSERT FAIL [F03 триггер users_guard_admin_scope отсутствует или выключен]' USING ERRCODE='XTA01';
  END IF;

  -- F04 админская политика больше не опирается на is_current_user_admin()
  SELECT coalesce(qual,'') INTO v_bad FROM pg_policies
   WHERE schemaname='public' AND tablename='users' AND policyname='users_admin_update';
  IF v_bad NOT LIKE '%is_admin_session%' THEN
    RAISE EXCEPTION 'ASSERT FAIL [F04 users_admin_update не переведена на is_admin_session]: %', v_bad USING ERRCODE='XTA01';
  END IF;

  -- F05 три триггера неизменяемости журнала на месте
  FOREACH v_tbl IN ARRAY ARRAY['admin_actions_no_update','admin_actions_no_delete','admin_actions_no_truncate'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger t
                    WHERE t.tgrelid='public.admin_actions'::regclass
                      AND t.tgname=v_tbl AND NOT t.tgisinternal AND t.tgenabled <> 'D') THEN
      RAISE EXCEPTION 'ASSERT FAIL [F05 триггер % журнала отсутствует или выключен]', v_tbl USING ERRCODE='XTA01';
    END IF;
  END LOOP;

  -- F06 recalc_master_rating() исполняется правами владельца, иначе
  --     рейтинговые колонки пришлось бы держать открытыми
  IF NOT (SELECT prosecdef FROM pg_proc
           WHERE pronamespace='public'::regnamespace AND proname='recalc_master_rating' AND pronargs=0) THEN
    RAISE EXCEPTION 'ASSERT FAIL [F06 recalc_master_rating() не SECURITY DEFINER]' USING ERRCODE='XTA01';
  END IF;

  -- F07 снимок ACL для отката существует
  IF to_regclass('public.api_grants_baseline_0135') IS NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [F07 нет снимка ACL: откат 0136 невозможен]' USING ERRCODE='XTA01';
  END IF;

  -- F08 у anon не осталось ни одной привилегии записи, а у authenticated —
  --     TRUNCATE. Эти два факта проверяются структурно, а не поведением, и
  --     вот почему: после 0141 попытка anon писать в users падает на
  --     EXECUTE-гранте функции политики, а не на гранте таблицы, а TRUNCATE
  --     с CASCADE упирается в отсутствие права на связанные таблицы. То есть
  --     поведенческая проверка вернула бы «отказано» даже с восстановленным
  --     грантом — и не заметила бы регрессию. Слои защиты — это хорошо, но
  --     проверять надо каждый слой отдельно.
  FOREACH v_tbl IN ARRAY ARRAY['users', 'master_profiles', 'orders', 'order_responses'] LOOP
    SELECT string_agg(p, ', ') INTO v_bad FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE has_table_privilege('anon', ('public.' || v_tbl)::regclass, p);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'ASSERT FAIL [F08 у anon остались табличные привилегии записи на public.%: %]', v_tbl, v_bad USING ERRCODE='XTA01';
    END IF;

    -- has_column_privilege знает только SELECT/INSERT/UPDATE/REFERENCES
    SELECT string_agg(p, ', ') INTO v_bad FROM unnest(ARRAY['INSERT','UPDATE','REFERENCES']) p
     WHERE EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema='public' AND c.table_name=v_tbl
                      AND has_column_privilege('anon', ('public.' || v_tbl)::regclass, c.column_name, p));
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'ASSERT FAIL [F08 у anon остались колоночные привилегии записи на public.%: %]', v_tbl, v_bad USING ERRCODE='XTA01';
    END IF;

    IF has_table_privilege('authenticated', ('public.' || v_tbl)::regclass, 'TRUNCATE') THEN
      RAISE EXCEPTION 'ASSERT FAIL [F08 у authenticated остался TRUNCATE на public.%]', v_tbl USING ERRCODE='XTA01';
    END IF;
  END LOOP;

  -- F09 у журнала ровно одна выданная привилегия: SELECT для authenticated.
  SELECT string_agg(g || ':' || p, ', ') INTO v_bad
    FROM unnest(ARRAY['anon','service_role']) g,
         unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   WHERE has_table_privilege(g, 'public.admin_actions', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [F09 у журнала лишние привилегии: %]', v_bad USING ERRCODE='XTA01';
  END IF;

  SELECT string_agg(p, ', ') INTO v_bad FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
   WHERE has_table_privilege('authenticated', 'public.admin_actions', p);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'ASSERT FAIL [F09 у authenticated на журнале есть запись: %]', v_bad USING ERRCODE='XTA01';
  END IF;

  RAISE NOTICE 'F: структурные инварианты на месте.';
END
$structural$;

-- Харнесс — принадлежность репетиции, а не схемы: в базе после проверок он не
-- остаётся. Если проверка упала, функция уцелеет вместе с упавшей базой — это
-- удобно для разбора и безвредно, потому что базы одноразовые.
DROP FUNCTION public.fx_check(text, text, uuid, uuid, text, text, text);

\echo ''
\echo 'POSTFLIGHT: все проверки пройдены.'
