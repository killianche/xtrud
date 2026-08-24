-- Assertions executed after 0120-0122 in the isolated local fixture database.

DO $assertions$
DECLARE
  v_client_id constant uuid := '10000000-0000-0000-0000-000000000001';
  v_master_id constant uuid := '20000000-0000-0000-0000-000000000002';
  v_unrelated_master_id constant uuid := '30000000-0000-0000-0000-000000000003';
  v_moderator_id constant uuid := '40000000-0000-4000-8000-000000000004';
  v_order_id uuid;
  v_exact_order_id uuid;
  v_region_wide_order_id uuid;
BEGIN
  IF (SELECT count(*) FROM public.categories_l1 WHERE NOT is_internal) <> 10 THEN
    RAISE EXCEPTION 'fixture_expected_10_user_l1';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.categories_l1
    WHERE id NOT IN ('construction', 'home-services', 'xtrud-internal')
      AND (task_creation_enabled OR catalog_enabled OR matching_enabled)
  ) THEN
    RAISE EXCEPTION 'fixture_restored_l1_must_be_feature_off';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.categories_l1
    WHERE id IN ('construction', 'home-services')
      AND NOT (task_creation_enabled AND catalog_enabled AND matching_enabled)
  ) THEN
    RAISE EXCEPTION 'fixture_current_scope_must_remain_enabled';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.categories_l1
    WHERE id NOT IN ('construction', 'home-services', 'xtrud-internal')
      AND is_active
  ) OR EXISTS (
    SELECT 1 FROM public.categories_l2
    WHERE l1_id NOT IN ('construction', 'home-services', 'xtrud-internal')
      AND (is_active OR is_visible)
  ) THEN
    RAISE EXCEPTION 'fixture_restored_legacy_visibility_must_be_off';
  END IF;

  IF has_function_privilege('anon', 'public.get_master_phone(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'fixture_anonymous_contact_acl_not_revoked';
  END IF;

  IF has_column_privilege('anon', 'public.users', 'contact_phone', 'SELECT')
     OR has_column_privilege(
       'authenticated',
       'public.users',
       'contact_phone',
       'SELECT'
     ) THEN
    RAISE EXCEPTION 'fixture_direct_contact_column_acl_not_revoked';
  END IF;

  IF pg_get_functiondef(to_regprocedure('public.get_master_phone(uuid)'))
       ~* 'users_private|upr[.]phone|coalesce[(]pu[.]contact_phone' THEN
    RAISE EXCEPTION 'fixture_private_phone_fallback_remains';
  END IF;

  INSERT INTO public.users (id, is_master, contact_phone) VALUES
    (v_client_id, false, NULL),
    (v_master_id, true, '+79000000000'),
    (v_unrelated_master_id, true, '+79000000001'),
    (v_moderator_id, false, NULL);

  -- Old clients omit every new 0121 field; defaults keep the insert valid.
  INSERT INTO public.orders (id, client_id, l2_id, l3_ids, city_id)
  VALUES (
    '50000000-0000-4000-8000-000000000005',
    v_client_id,
    'plumbing',
    ARRAY[]::text[],
    'magas'
  )
  RETURNING id INTO v_order_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = v_order_id
      AND classification_status = 'legacy'
      AND classification_source = 'legacy'
      AND moderation_status = 'published'
      AND work_mode = 'onsite'
      AND location_scope = 'city'
      AND publish_idempotency_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'fixture_old_insert_defaults_mismatch';
  END IF;

  -- Legacy UPDATE omits location_scope. The trigger re-derives semantic scope
  -- when the old city/district fields change.
  UPDATE public.orders SET city_id = NULL WHERE id = v_order_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = v_order_id
      AND location_scope = 'region_wide'
      AND city_id IS NULL
      AND district IS NULL
  ) THEN
    RAISE EXCEPTION 'fixture_legacy_region_wide_update_not_derived';
  END IF;
  UPDATE public.orders SET city_id = 'magas' WHERE id = v_order_id;

  -- L2-only classified tasks are valid; L3 is optional.
  INSERT INTO public.orders (
    client_id, l2_id, l3_ids, city_id, classification_status,
    classification_source, requested_service_text, moderation_status, work_mode
  ) VALUES (
    v_client_id, 'plumbing', ARRAY[]::text[], 'magas', 'classified',
    'user_category', 'Нужна сантехническая работа', 'published', 'onsite'
  ) RETURNING id INTO v_exact_order_id;

  -- The database, not only TypeScript, caps classification at ten distinct L3.
  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, requested_service_text
    ) VALUES (
      v_client_id,
      'plumbing',
      ARRAY[
        'faucet-replace',
        'plumbing-fixture-02',
        'plumbing-fixture-03',
        'plumbing-fixture-04',
        'plumbing-fixture-05',
        'plumbing-fixture-06',
        'plumbing-fixture-07',
        'plumbing-fixture-08',
        'plumbing-fixture-09',
        'plumbing-fixture-10',
        'plumbing-fixture-11'
      ],
      'classified',
      'user_category',
      'Слишком много точных услуг'
    );
    RAISE EXCEPTION 'fixture_l3_limit_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Every unsupported status/source pair fails closed.
  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, requested_service_text
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'pending',
      'user_category', 'Неверная матрица pending/user'
    );
    RAISE EXCEPTION 'fixture_pending_user_matrix_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, requested_service_text
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'legacy',
      'search_suggestion', 'Неверная матрица legacy/search'
    );
    RAISE EXCEPTION 'fixture_legacy_search_matrix_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, requested_service_text
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'classified',
      'fallback', 'Неверная матрица classified/fallback'
    );
    RAISE EXCEPTION 'fixture_classified_fallback_matrix_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, classification_note, requested_service_text
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'classified',
      'moderator', 'Попытка обхода сервиса', 'Запрещённый moderator insert'
    );
    RAISE EXCEPTION 'fixture_moderator_insert_not_blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  INSERT INTO public.orders (
    client_id, l2_id, l3_ids, classification_status,
    classification_source, requested_service_text
  ) VALUES (
    v_client_id, 'plumbing', ARRAY[]::text[], 'classified',
    'search_suggestion', 'Допустимая поисковая подсказка'
  );

  -- Dedicated open legacy order with no responses for authenticated owner edit.
  INSERT INTO public.orders (id, client_id, l2_id, l3_ids, city_id)
  VALUES (
    '60000000-0000-4000-8000-000000000006',
    v_client_id,
    'plumbing',
    ARRAY[]::text[],
    'magas'
  );

  -- Build one pending fallback row without enabling the universal branch for
  -- rollout. The flags are restored immediately; the row exists solely to
  -- prove that an owner category edit cannot bypass service moderation.
  UPDATE public.categories_l1
  SET is_active = true,
      task_creation_enabled = true
  WHERE id = 'xtrud-internal';
  UPDATE public.categories_l2
  SET is_active = true,
      task_creation_enabled = true
  WHERE id = 'other-services';

  INSERT INTO public.orders (
    id,
    client_id,
    l2_id,
    l3_ids,
    classification_status,
    classification_source,
    requested_service_text
  ) VALUES (
    '70000000-0000-4000-8000-000000000007',
    v_client_id,
    'other-services',
    ARRAY[]::text[],
    'pending',
    'fallback',
    'Нужна ручная классификация'
  );

  UPDATE public.categories_l2
  SET is_active = false,
      task_creation_enabled = false
  WHERE id = 'other-services';
  UPDATE public.categories_l1
  SET is_active = false,
      task_creation_enabled = false
  WHERE id = 'xtrud-internal';

  INSERT INTO public.orders (
    client_id, l2_id, l3_ids, city_id, moderation_status
  ) VALUES (
    v_client_id, 'plumbing', ARRAY[]::text[], 'magas', 'hidden'
  );

  BEGIN
    UPDATE public.orders
    SET requested_service_text = 'Подменённый исходный запрос'
    WHERE id = v_exact_order_id;
    RAISE EXCEPTION 'fixture_requested_service_text_immutability_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  -- Old NULL/NULL insert means “Вся Ингушетия”, not an invalid onsite order.
  INSERT INTO public.orders (client_id, l2_id, l3_ids)
  VALUES (v_client_id, 'plumbing', ARRAY[]::text[])
  RETURNING id INTO v_region_wide_order_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE id = v_region_wide_order_id
      AND work_mode = 'onsite'
      AND location_scope = 'region_wide'
      AND city_id IS NULL
      AND district IS NULL
  ) THEN
    RAISE EXCEPTION 'fixture_legacy_region_wide_insert_not_derived';
  END IF;

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, work_mode, location_scope
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'onsite', 'city'
    );
    RAISE EXCEPTION 'fixture_explicit_city_scope_without_city_not_rejected';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.orders (
    client_id, l2_id, l3_ids, work_mode, location_scope
  ) VALUES (
    v_client_id, 'plumbing', ARRAY[]::text[], 'remote', 'remote'
  );

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, city_id, classification_status,
      classification_source, requested_service_text
    ) VALUES (
      v_client_id, 'other-services', ARRAY[]::text[], 'magas', 'pending',
      'fallback', 'Нужна редкая услуга'
    );
    RAISE EXCEPTION 'fixture_fallback_feature_gate_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.order_responses (order_id, master_id, l2_id)
  VALUES (v_order_id, v_master_id, 'plumbing');

  UPDATE public.categories_l2
  SET matching_enabled = false
  WHERE id = 'plumbing';
  BEGIN
    INSERT INTO public.order_responses (order_id, master_id, l2_id)
    VALUES (v_order_id, v_unrelated_master_id, 'plumbing');
    RAISE EXCEPTION 'fixture_matching_gate_not_enforced';
  EXCEPTION
    WHEN no_data_found THEN NULL;
  END;
  UPDATE public.categories_l2
  SET matching_enabled = true,
      requires_verification = true
  WHERE id = 'plumbing';
  BEGIN
    INSERT INTO public.order_responses (order_id, master_id, l2_id)
    VALUES (v_order_id, v_unrelated_master_id, 'plumbing');
    RAISE EXCEPTION 'fixture_verification_fail_closed_not_enforced';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.categories_l2
  SET requires_verification = false
  WHERE id = 'plumbing';

  BEGIN
    INSERT INTO public.orders (client_id, l2_id, l3_ids, city_id)
    VALUES (v_client_id, 'plumbing', ARRAY['home-cleaning'], 'magas');
    RAISE EXCEPTION 'fixture_l3_parent_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.orders (
      client_id, l2_id, l3_ids, classification_status,
      classification_source, work_mode, city_id
    ) VALUES (
      v_client_id, 'plumbing', ARRAY[]::text[], 'classified',
      'user_category', 'remote', 'magas'
    );
    RAISE EXCEPTION 'fixture_remote_location_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.order_responses (order_id, master_id, l2_id)
    VALUES (v_order_id, v_master_id, 'cleaning');
    RAISE EXCEPTION 'fixture_response_l2_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.user_blocks (blocker_id, blocked_id)
    VALUES (v_client_id, v_client_id);
    RAISE EXCEPTION 'fixture_self_block_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  INSERT INTO public.reports (reporter_id, target_type, target_id)
  VALUES (v_client_id, 'response', gen_random_uuid());

  BEGIN
    INSERT INTO public.reports (reporter_id, target_type, target_id)
    VALUES (v_client_id, 'message', gen_random_uuid());
    RAISE EXCEPTION 'fixture_new_message_report_guard_not_enforced';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END
$assertions$;

-- The only supported moderator transition is an invoker-mode call by the
-- trusted service role with an explicit actor and reason.
SET ROLE service_role;
SELECT public.reclassify_order_by_service(
  (
    SELECT id
    FROM public.orders
    WHERE requested_service_text = 'Нужна сантехническая работа'
    LIMIT 1
  ),
  '40000000-0000-4000-8000-000000000004',
  'plumbing',
  ARRAY['faucet-replace'],
  'faucet-replace',
  'Проверено оператором в synthetic fixture'
);

DO $promotion_gate_assertion$
BEGIN
  BEGIN
    PERFORM public.assert_universal_backend_promotion_ready();
    RAISE EXCEPTION 'fixture_unresolved_promotion_gate_not_enforced';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'universal_backend_promotion_blocked:%' THEN
        RAISE;
      END IF;
  END;
END
$promotion_gate_assertion$;
RESET ROLE;

DO $service_audit_assertions$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.orders AS order_row
    JOIN public.order_classification_audit AS audit
      ON audit.order_id = order_row.id
    WHERE order_row.requested_service_text = 'Нужна сантехническая работа'
      AND order_row.classification_status = 'classified'
      AND order_row.classification_source = 'moderator'
      AND order_row.primary_l3_id = 'faucet-replace'
      AND audit.actor_id = '40000000-0000-4000-8000-000000000004'
      AND audit.actor_role = 'service_role'
      AND audit.old_classification_source = 'user_category'
      AND audit.new_classification_source = 'moderator'
      AND audit.reason = 'Проверено оператором в synthetic fixture'
  ) THEN
    RAISE EXCEPTION 'fixture_service_reclassification_audit_missing';
  END IF;

  IF (
    SELECT count(*)
    FROM public.universal_backend_promotion_blockers
    WHERE NOT resolved
  ) <> 6 THEN
    RAISE EXCEPTION 'fixture_expected_six_live_promotion_blockers';
  END IF;
END
$service_audit_assertions$;

SET ROLE anon;
DO $anonymous_assertions$
BEGIN
  IF public.current_user_can_interact_with(
    '20000000-0000-0000-0000-000000000002'
  ) THEN
    RAISE EXCEPTION 'fixture_anonymous_interaction_helper_not_fail_closed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders WHERE moderation_status <> 'published'
  ) THEN
    RAISE EXCEPTION 'fixture_moderated_order_visible_to_anonymous';
  END IF;

  BEGIN
    PERFORM public.get_master_phone('20000000-0000-0000-0000-000000000002');
    RAISE EXCEPTION 'fixture_anonymous_contact_execution_not_revoked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$anonymous_assertions$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
DO $owner_pre_block_assertions$
BEGIN
  BEGIN
    PERFORM public.reclassify_order_by_service(
      (SELECT id FROM public.orders LIMIT 1),
      '10000000-0000-0000-0000-000000000001',
      'plumbing',
      ARRAY[]::text[],
      NULL,
      'Попытка владельца'
    );
    RAISE EXCEPTION 'fixture_owner_reclassification_rpc_not_revoked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  -- Current/legacy owner category editing remains compatible for an open order
  -- with no responses. The normal hierarchy/L3/feature checks still execute.
  UPDATE public.orders
  SET l2_id = 'cleaning',
      l3_ids = ARRAY['home-cleaning'],
      primary_l3_id = 'home-cleaning'
  WHERE id = '60000000-0000-4000-8000-000000000006';

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = '60000000-0000-4000-8000-000000000006'
      AND l2_id = 'cleaning'
      AND l3_ids = ARRAY['home-cleaning']
      AND primary_l3_id = 'home-cleaning'
      AND classification_status = 'legacy'
      AND classification_source = 'legacy'
      AND moderation_status = 'published'
  ) THEN
    RAISE EXCEPTION 'fixture_authenticated_owner_category_edit_failed';
  END IF;

  BEGIN
    UPDATE public.orders
    SET l2_id = 'cleaning',
        l3_ids = ARRAY['home-cleaning'],
        primary_l3_id = 'home-cleaning'
    WHERE id = '50000000-0000-4000-8000-000000000005';
    RAISE EXCEPTION 'fixture_owner_category_edit_after_response_not_blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.orders
    SET l2_id = 'cleaning',
        l3_ids = ARRAY['home-cleaning'],
        primary_l3_id = 'home-cleaning'
    WHERE id = '70000000-0000-4000-8000-000000000007';
    RAISE EXCEPTION 'fixture_fallback_owner_category_bypass_not_blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  IF (SELECT count(*) FROM public.orders WHERE moderation_status = 'hidden') <> 1 THEN
    RAISE EXCEPTION 'fixture_owner_cannot_read_own_moderated_order';
  END IF;

  IF public.get_master_phone('20000000-0000-0000-0000-000000000002')
       IS DISTINCT FROM '+79000000000' THEN
    RAISE EXCEPTION 'fixture_eligible_contact_not_returned';
  END IF;

  IF public.get_master_phone('30000000-0000-0000-0000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'fixture_unrelated_contact_disclosed';
  END IF;

  BEGIN
    UPDATE public.orders
    SET moderation_status = 'hidden'
    WHERE moderation_status = 'published';
    RAISE EXCEPTION 'fixture_owner_service_field_mutation_not_blocked';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;
END
$owner_pre_block_assertions$;

INSERT INTO public.user_blocks (blocker_id, blocked_id)
VALUES (
  '10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

DO $owner_blocking_assertions$
BEGIN
  IF public.get_master_phone('20000000-0000-0000-0000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'fixture_blocked_contact_not_hidden';
  END IF;

  IF (SELECT count(*) FROM public.user_blocks) <> 1 THEN
    RAISE EXCEPTION 'fixture_block_owner_cannot_read_own_block';
  END IF;
END
$owner_blocking_assertions$;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);
DO $blocking_assertions$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.orders
    WHERE client_id = '10000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'fixture_blocked_direct_order_read_not_hidden';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_blocks) THEN
    RAISE EXCEPTION 'fixture_non_owner_can_read_foreign_block';
  END IF;

  BEGIN
    INSERT INTO public.order_responses (order_id, master_id, l2_id)
    VALUES (
      '50000000-0000-4000-8000-000000000005',
      '20000000-0000-0000-0000-000000000002',
      'plumbing'
    );
    RAISE EXCEPTION 'fixture_blocked_response_insert_not_rejected';
  EXCEPTION
    WHEN insufficient_privilege OR no_data_found THEN NULL;
  END;
END
$blocking_assertions$;
RESET ROLE;
