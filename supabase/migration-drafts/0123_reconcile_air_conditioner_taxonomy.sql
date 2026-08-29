-- DRAFT ONLY — do not apply directly. Promotion requires the live snapshot,
-- encrypted backup and restored-snapshot gates from migration-drafts/README.md.
--
-- Canonical decision: CATEGORIES_AND_PROFILES.md (2026-05-27) moved all
-- air-conditioner work from `climate` to `appliance-repair`. Current production
-- L3 rows already follow it, but legacy exact search terms still point to
-- `climate` and can override the correct services.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'appliance-repair') THEN
    RAISE EXCEPTION 'requires_live_appliance_repair_category';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.categories_l2 WHERE id = 'climate') THEN
    RAISE EXCEPTION 'requires_live_climate_category';
  END IF;
END;
$$;

UPDATE public.categories_l3
SET l2_id = 'appliance-repair'
WHERE id IN ('appl-ac', 'ac-install', 'ac-service', 'ac-uninstall')
  AND l2_id IS DISTINCT FROM 'appliance-repair';

DELETE FROM public.category_terms stale
WHERE stale.l2_id = 'climate'
  AND stale.l3_id IS NULL
  AND lower(stale.term) IN ('кондиционер', 'установка кондиционера', 'сплит', 'сплит-система')
  AND EXISTS (
    SELECT 1
    FROM public.category_terms canonical
    WHERE canonical.l2_id = 'appliance-repair'
      AND canonical.l3_id IS NULL
      AND lower(canonical.term) = lower(stale.term)
  );

UPDATE public.category_terms
SET l2_id = 'appliance-repair'
WHERE l2_id = 'climate'
  AND l3_id IS NULL
  AND lower(term) IN ('кондиционер', 'установка кондиционера', 'сплит', 'сплит-система');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.category_terms
    WHERE l2_id = 'climate'
      AND lower(term) IN ('кондиционер', 'установка кондиционера', 'сплит', 'сплит-система')
  ) THEN
    RAISE EXCEPTION 'air_conditioner_search_terms_still_point_to_climate';
  END IF;
END;
$$;
