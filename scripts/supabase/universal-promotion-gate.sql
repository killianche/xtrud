-- Mandatory restored-snapshot rehearsal gate for the universal backend.
--
-- Run only after applying the newly numbered candidate migration to a restored
-- production snapshot. A non-zero exit is the intended result while any live
-- audit blocker remains unresolved. Do not wrap this assertion in an exception
-- handler and do not use the synthetic fixture passing as production approval.

\set ON_ERROR_STOP on

BEGIN;
SET LOCAL ROLE service_role;
SELECT public.assert_universal_backend_promotion_ready();
ROLLBACK;
