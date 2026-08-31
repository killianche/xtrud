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

These build on the APPLIED migration
`supabase/migrations/0130_guard_user_privilege_columns.sql`, which locks
`users.is_admin` and `users.is_demo` and deliberately leaves `users.status`
open. Neither draft recreates, replaces or drops anything 0130 owns.

`0126_suspension_enforcement.sql` / `0127_revert_suspension_enforcement.sql`
close gap Р3 ("приостановка не приостанавливает"): a non-active account can no
longer create or edit orders, responses or reviews, nor relocate a listing
between categories and cities, and `users.status` becomes moderator-managed.
Enforcement is by trigger rather than by RLS, and that is now a verified rather
than an inferred choice: read-only inspection of production shows
`public.submit_master_review(uuid,integer,text)` is `SECURITY DEFINER` owned by
`postgres` — so `public.reviews` RLS does not apply to it — and it has no
migration file anywhere in `supabase/migrations/`.

The status lock is a **second trigger** (`users_guard_status_column`), not a
`CREATE OR REPLACE` of 0130's function. Extending the applied function would
make rollback a restore instead of a removal: `0127` would have to recreate
0130's body from a copy in this repository, and a live hotfix would then be
silently overwritten by a stale privilege guard. One extra trigger is the
smaller evil, and `0127` asserts 0130 is still standing after it runs.

`0128_order_moderation.sql` / `0129_revert_order_moderation.sql` close gap Р5
("жалоба на задание не имеет действий"): a moderator can hide and unhide a
reported task through `public.admin_set_order_hidden`, and can read the subject
of a report in any status. Hidden tasks leave every feed except the owner's and
accept no new responses. `0128` does **not** depend on `0126`; the two features
share a moderator and nothing else, so either may be rolled back alone.

**Dependency is enforced in SQL, not by convention.** Both drafts abort unless
the 0130 guard is present *and* is the object 0130 installed — right signature,
returns `trigger`, `SECURITY INVOKER`, owned by a non-API role, body mentioning
`is_admin`, reached by an enabled trigger on `public.users`. Existence of the
name alone is not accepted. `0129` refuses to run while any task is still
hidden, so a rollback can never silently republish moderated content.

**A live fact blocks Р5 regardless of this code.** Read-only inventory of
production on 2026-08-30: exactly one administrator exists and it is the demo
account (`is_admin AND is_demo`) seeded by `0104_admin_demo_account.sql`, whose
password is in Git history. Every capability gated on `users.is_admin` is
therefore exercisable by anyone who reads that. Creating a real moderator
account and removing admin from the demo account is a prerequisite for `0128`.

Neither draft claims catalogue/search visibility of a suspended master,
`master_profiles` content, push, Realtime or storage.

Local contract run (synthetic schema only, not production approval):

```sh
scripts/supabase/run-moderation-fixture.sh
```

Three phases: dependency guards (drafts refused without 0130 and against a
foreign object of the same name), the forward/behaviour/rollback contract, and a
negative-control sweep in which every mutation of the drafts must be caught by
the assertions. A mutation that is not caught fails the run.

## Закалка базы под веб-админку — черновики 0135–0142

Шаг 1 из [`docs/ADMIN_PANEL.md`](../../docs/ADMIN_PANEL.md) §9: гранты, функция
админской сессии, журнал и сужение админской политики. Четыре пары
forward/revert, применяются в порядке номеров:

| Черновик | Что делает | Откат |
|---|---|---|
| `0135_api_column_grants.sql` | колоночные гранты для `anon`/`authenticated` на `users`, `master_profiles`, `orders`, `order_responses`; `recalc_master_rating()` → `SECURITY DEFINER` | `0136` |
| `0137_admin_session_function.sql` | `public.is_admin_session()` — админ читается из БД, `aal2` читается из `auth.sessions` | `0138` |
| `0139_admin_actions_journal.sql` | неизменяемый журнал `public.admin_actions` и единственный путь записи `admin_log_action()` | `0140` |
| `0141_narrow_admin_user_update.sql` | `users_admin_update` → `is_admin_session()` плюс триггер, ограничивающий админский путь одной колонкой `status` | `0142` |

`0139` и `0141` зависят от `0137`, `0141` — ещё и от применённой
`supabase/migrations/0130_guard_user_privilege_columns.sql`. Зависимости
проверяются в SQL по форме объекта: чужой объект с тем же именем отвергается.

### Свойство PostgreSQL, вокруг которого построена 0135

`REVOKE UPDATE (колонка) ... FROM authenticated` **ничего не делает**, пока
роли выдан табличный `UPDATE`: команда завершается успешно, без WARNING, а
привилегия остаётся. Поэтому 0135 снимает привилегию на уровне таблицы и
выдаёт обратно явный список колонок, а затем сама проверяет результат через
`has_column_privilege` и падает, если ACL не совпал с намерением.

Список разрешённых колонок шире, чем хочется, и это не небрежность: семь
функций и триггеров объявлены `SECURITY INVOKER` и пишут привилегированные
колонки правами вызывающего (`mark_feed_seen`, `complete_master_onboarding`,
`finalize_master_onboarding`, `accept_response`, `mark_order_responses_viewed`,
`update_order_responses_count`, `recalc_master_rating`). Каждая оставленная
колонка помечена в 0135 именем функции, которая её удерживает.

### Что блокирует применение прямо сейчас

`0141` отказывается применяться: в production нет ни одного администратора с
подтверждённым вторым фактором (`auth.mfa_factors`, `status = 'verified'` — 0
строк на 2026-08-31). Без этого миграция заперла бы модерацию снаружи.
Порядок из §10 (сначала веб-панель, потом урезание мобильной админки) она тоже
не отменяет: после неё админка в приложении перестаёт менять статус.

### Репетиция

```sh
scripts/supabase/run-hardening-fixture.sh
```

Четыре фазы: предусловия (черновики обязаны отказаться), контракт, **проверка
того, что ассерты умеют краснеть** (тот же набор на незакалённой базе обязан
упасть) и негативные контроли — 33 мутации, каждая обязана быть поймана.

Фикстура намеренно воспроизводит живые гранты Supabase. Репетиция на схеме,
снятой с `--no-privileges`, для этой работы бесполезна: там любое «нельзя»
проходит потому, что права не выдавались, и результат ложно-зелёный. Скрипт
отказывается работать со снимком без строк `GRANT`.

С настоящим снимком схемы добавляется фаза 0 — применимость к живой схеме,
совпадение списка колонок и точность отката:

```sh
pg_dump --schema-only -n public -n auth -f live.sql     # НЕ --no-privileges
XTRUD_LIVE_SCHEMA_SQL=$PWD/live.sql scripts/supabase/run-hardening-fixture.sh
```

Фаза 0 не проверяет поведение: снимок схемы не содержит строк.
