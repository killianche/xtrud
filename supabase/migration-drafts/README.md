# Backend migration drafts

Files in this directory are design and local-fixture inputs only. They are not
part of the runnable Supabase migration chain and must never be applied to
production by filename, copied into `supabase/migrations/`, or registered in the
migration integrity baseline as-is.

Before promoting any draft:

1. capture the live read-only schema, policies, grants, functions, buckets and
   migration ledger;
2. create an encrypted backup and prove a rehearsal restore;
3. reconcile every preflight assumption against the live snapshot;
4. resolve all `requires_live_*` guards without weakening them;
5. create a newly numbered, forward-only migration in `supabase/migrations/`;
6. run the full role/RLS/ACL matrix against the restored production snapshot.
7. run the mandatory promotion assertion against that restored snapshot and
   require exit code `0` before approval:

   ```sh
   psql "$RESTORED_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
     -f scripts/supabase/universal-promotion-gate.sql
   ```

The local files deliberately fail closed when the real schema or interaction
contract is unknown. Passing the synthetic fixture proves only the draft's
internal invariants; it is not production approval.

Draft `0122` also creates a machine-readable
`universal_backend_promotion_blockers` gate. Its assertion function must fail
until snapshot-backed work proves every unresolved live surface. In particular,
the current draft does **not** claim complete blocking for profiles/search,
push, Realtime, storage/signed URLs or broad `SECURITY DEFINER`/RPC paths. It
also does not replace historical notification triggers blindly: promotion must
inventory them and prove that every matching/notification path requires an open
published order, enabled L1/L2 matching, the audited verification source, and
no block in either direction.

The standalone `scripts/supabase/universal-promotion-gate.sql` contains an
unconditional assertion executed as `service_role`; it intentionally exits
non-zero while any of the six blockers remains unresolved. It must be run in
the restored-snapshot rehearsal above. The synthetic fixture separately proves
that this failure occurs and catches the expected error only so the rest of its
negative role matrix can continue; that catch is never used by the standalone
promotion command.

## Classification service boundary

Draft `0121` enforces at most ten distinct L3 services in PostgreSQL and uses a
closed status/source matrix: `legacy/legacy`, `pending/fallback`, or
`classified` with `user_category`, `search_suggestion` or `moderator`.
An authenticated owner may still edit L2/L3 business choices on an open
`legacy/legacy` or user-selected `classified` order before the first response;
normal hierarchy, feature, uniqueness and ten-L3 guards remain active. Owners
cannot mutate classification status/source, moderation, note or audit fields,
and pending fallback/moderator classifications cannot use category edits to
bypass the trusted service transition.
Moderator classification is update-only, available through an invoker-mode RPC
granted solely to the standard Supabase `service_role`, and requires an explicit
user actor plus reason. Each transition writes append-only
`order_classification_audit` history; owners have no audit-table or RPC grant.
The synthetic role proves the design only. Promotion remains blocked until the
live `service_role` owner/grants/JWT execution path has been reconciled from a
read-only ACL snapshot; no application admin flag is assumed.

## Phone-field semantics and contact rollout

`public.users.contact_phone` and `public.users_private.phone` are not aliases:

- `users.contact_phone` is the public work number a master deliberately enters
  for client calls;
- `users_private.phone` is the private registration/login identifier and must
  never be used as a contact fallback.

CURRENT and old iOS intentionally support direct catalogue contact, including
anonymous `get_master_phone` execution. The universal-board TARGET says only an
authenticated client may open a master's work contact after that master
responded to the client's order. Draft `0122` therefore has a hard preflight:
it aborts on the CURRENT broad RPC or direct `contact_phone` column privilege
instead of silently revoking access and breaking an installed client. Promotion
requires a separate, observed client/contact compatibility phase first,
including audited table/column ACL and RLS; only then may a newly numbered
blocking migration enforce the narrower TARGET contract.

## Legacy order location

Old clients encode “Вся Ингушетия” as `city_id IS NULL AND district IS NULL`.
Draft `0121` preserves this through explicit `location_scope = 'region_wide'`.
Its trigger derives `region_wide`, `city` or `district` when a legacy client
omits the new field; new clients may explicitly send those scopes or `remote`.

## Moderation drafts — gaps Р3 and Р5

`0126_suspension_enforcement.sql` / `0127_revert_suspension_enforcement.sql`
close gap Р3 ("приостановка не приостанавливает"): a non-active account can no
longer create or edit orders, responses or reviews, and `public.users.status`
and `public.users.is_admin` stop being client-writable. Enforcement is by
trigger rather than by RLS, deliberately: the review path the product actually
uses is the live RPC `submit_master_review`, which has no migration file, runs
SECURITY DEFINER and is therefore not subject to `public.reviews` RLS at all.

`0128_order_moderation.sql` / `0129_revert_order_moderation.sql` close gap Р5
("жалоба на задание не имеет действий"): a moderator can hide and unhide a
reported task through `public.admin_set_order_hidden`, and can read the subject
of a report in any status. Hidden tasks leave every feed except the owner's and
accept no new responses.

**Ordering is enforced in SQL, not by convention.** `0128` aborts with
`order_moderation_requires_is_admin_hardening_first` unless the `is_admin` lock
from `0126` is already in place — every capability it adds is gated on
`users.is_admin`, which is self-settable in the CURRENT state
(`docs/ADMIN_PANEL.md` §2). `0127` refuses to run while `0128` is applied, and
`0129` refuses to run while any task is still hidden, so a rollback can never
silently republish moderated content.

Neither draft claims catalogue/search visibility of a suspended master,
`master_profiles` content, push, Realtime or storage. Neither can revoke an
administrator flag that is already set: `0126` stops new self-promotion only, so
promotion still requires a read-only inventory of live administrators first.

Local contract run (synthetic schema only, not production approval):

```sh
scripts/supabase/run-moderation-fixture.sh
```

It runs three phases — ordering guard, forward/behaviour/rollback contract, and
a negative-control sweep in which every mutation of the drafts must be caught by
the assertions. A mutation that is not caught fails the run.
