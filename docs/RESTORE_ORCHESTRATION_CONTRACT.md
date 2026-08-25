# Exact-stack restore orchestration contract

Статус: **обязательная спецификация, реализация и runtime evidence отсутствуют**.
Этот документ не разрешает restore или production cutover. Он фиксирует единый
контракт, чтобы агент не заменил full-stack rehearsal набором ручных команд.

## Граница готовности

Restore считается доказанным только одной versioned state machine, которая
связывает:

- exact Supabase tag, commit, `docker/` tree, overlay и image digests;
- один неизменяемый private ciphertext DB backup на весь run;
- отдельный Storage ciphertext и per-object checksum manifest;
- новый disposable Compose project и новый PostgreSQL system identifier;
- outbound-isolated target;
- DB, Storage и service-level проверки;
- два независимых clean restore без ручного вмешательства.

DB-only restore, raw PostgreSQL clone и повторное применение dump в ту же базу
не закрывают этот gate.

## Approved backup set

До запуска владелец формирует private mode-0600 manifest вне Git. Он связывает
один backup-set ID, capture time/delta boundary, exact DB ciphertext SHA/bytes,
exact Storage ciphertext SHA/bytes и SHA/bytes каждого ожидаемого decrypted
DB entry, а также Storage object count/total bytes/checksum boundary.
Orchestrator сначала копирует оба ciphertext в private staging, затем
сравнивает копии с **заранее одобренным** manifest и до конца run использует
только эти байты. Age identity аутентифицирует получателя, но не заменяет
проверку provenance/approved SHA.

Initial resource policy: DB plaintext total не больше 16 GiB, один DB entry не
больше 8 GiB, Storage ciphertext не больше 1 TiB. До mutation вычисляются три
границы: staging free ≥ `DB ciphertext + Storage ciphertext + 3 × DB plaintext
total + 1 GiB`; local target volume free ≥ `1.2 × manifest object bytes + 1
GiB`; Beget S3 quota ≥ `1.2 × manifest object bytes + 1 GiB`. Применяется
большее из dynamic staging bound и общего минимума 30–40 GiB. Любое изменение
лимитов — reviewed versioned change, а не runtime override.

## Stop conditions до decrypt и target mutation

Остановиться, если выполняется хотя бы одно условие:

- свободно меньше 30–40 GiB или Compose меньше 2.24.4;
- snapshot/runtime env/rendered config не прошли tracked validators;
- target не новый disposable project или уже существуют его containers,
  volumes либо networks;
- archive, identity, runtime env или rendered config не являются absolute
  regular non-symlink private files вне Git;
- ciphertext, manifest, exact-entry allowlist, dump SHA или upstream pins не
  совпали;
- DB и Storage artifacts не связаны одним approved backup-set manifest;
- target PostgreSQL не major 17, не primary, не superuser-capable или не clean;
- не доказано, что работают только нужные bootstrap services, а перед restore —
  только `db`;
- нет outbound isolation либо используются Cloud/production credentials,
  endpoints или DNS;
- отсутствует явное решение по project migration ledger;
- Storage artifact текущего run не прошёл verifier или unified binding;
- фактически запущенные orchestrator/SQL/overlay не взяты из clean tracked
  commit либо их SHA не совпадают с versioned allowlist.

Все private files (ciphertext copy, identity, runtime/rendered config,
decrypted tar/SQL, private stderr) имеют mode `0600`; их parents/staging —
`0700`. Symlink components запрещены.

## Provenance и target ownership

Orchestrator запускается только из clean tracked commit. До mutation private
mode-0600 preflight journal фиксирует Git commit, ownership tuple и SHA-256
фактически запущенных script, SQL, base/overlay и image-lock files. Это
temporary input, не release evidence; второй run обязан использовать те же
tool hashes.

Каждый target получает случайный restore UUID, exact Compose project label,
volume/network IDs и PostgreSQL system identifier. На target действует
exclusive lock этого UUID. Mutation, teardown и удаление разрешены только при
одновременном совпадении marker, UUID, labels и system identifier; иначе STOP
без cleanup чужих ресурсов. Повтор на том же target запрещён до mutation.

## Проверяемая outbound isolation

- все digest images pull выполняются до появления secrets/plaintext;
- restore network создаётся internal, без default external route;
- `db` и `functions` получают явный egress deny; отсутствие published ports не
  считается egress control;
- локальный canary/negative probe без обращения к Интернету доказывает, что
  default route и запрещённые destinations недоступны;
- network IDs, policy hashes и результаты canary входят в redacted evidence.

## Target lifecycle

1. Создать новый Compose project, volumes и isolated network.
2. Поднять только `db`, затем Auth/Storage/Realtime для штатных provider
   migrations.
3. Снять provider-ledger baseline и остановить всё, кроме `db`.
4. Доказать clean target: новый system identifier, Auth users = 0, Storage
   buckets/objects = 0, project ledger и project relations соответствуют
   versioned baseline.
5. Выполнить DB restore одной транзакцией.
6. Выполнить DB postflight до запуска API.
7. Запустить только Storage во внутренней сети без public gateway и в local
   exact-stack восстановить bytes через Storage API в orchestrator-owned
   file-backed volume. Beget S3 проверяется отдельным mode только после reviewed
   S3 overlay/bucket; оба режима сверяют count, bytes и per-object checksums.
8. Затем запускать services по порядку Auth → REST → Realtime → уже проверенный
   Storage → Functions → gateway; Studio и pg-meta не публиковать.
9. Выполнить smoke и negative-auth QA.
10. Сохранить redacted evidence и полностью teardown project.
11. Повторить на новом project/volumes/system identifier; fingerprints обоих
    runs должны совпасть.

## DB bundle policy

| Entry | Exact-stack действие |
|---|---|
| `manifest.txt` | verify/evidence only |
| `roles.sql` | restore |
| `schema.sql` | restore |
| `data.sql` | restore |
| `migration-data.sql` | только отдельный project-ledger gate |
| `system-schema.sql` | запрещено; forensic/raw-clone only |
| `provider-ledger-data.sql` | запрещено; forensic/raw-clone only |

Orchestrator копирует ciphertext один раз в mode-0700 staging, фиксирует его SHA,
decrypt выполняет один раз и использует только эти байты. Нельзя сначала вызвать
verifier, а затем повторно decrypt исходного пути: это TOCTOU. Archive entries
должны быть exact, ordered, regular-only, без path traversal, links, devices,
FIFO, sparse/tar-bomb behaviour и duplicate names.

Разрешённые SQL выполняются одной `psql -X --no-psqlrc` транзакцией с
`ON_ERROR_STOP`, без DB URL или secret в argv, строго в порядке:
`roles → schema → SET LOCAL replica → data → cron off/pg_net clear → SET LOCAL
origin → commit`. После commit отдельная session подтверждает `origin`.
Любая ошибка означает rollback и отсутствие success receipt.

Cloud `auth.schema_migrations` и `storage.migrations` никогда не импортируются.
`supabase_migrations.schema_migrations` применяется только после отдельного
versioned comparator; до его реализации обязательное решение — explicit skip,
а run не является release evidence.

## Post-restore checks

До запуска API обязательны:

- `validate-restored-foreign-keys.sql`, ожидаемое ненулевое число FK и отсутствие
  orphan rows/unvalidated constraints;
- source-derived row-count и DDL fingerprints;
- sequences относительно `max(id)`;
- RLS, grants, policies, triggers, functions и critical RPC fingerprints;
- неизменность provider-ledger baseline;
- выключенные cron jobs, пустая `pg_net` queue и отсутствие Cloud/provider URLs.

После запуска services обязательны Auth login/recovery, REST/RLS/service-role,
Realtime, public/private Storage, gateway deny и route-specific negative-auth QA
`register-user`, `send-reset-email`, `notify`, `send-sms`.

## Storage gate

DB backup содержит Storage metadata, но не object bytes. Проверенный encrypted
Storage artifact уже существует, но пока нет versioned restore/verifier и
unified DB+Storage binding. Artifact mode не использует Cloud/source credential:
нужны decrypt identity и write-scoped target credential; delete разрешён только
для orchestrator-owned target по exact instance ID. Direct source copy, если
когда-либо понадобится, является отдельным явно versioned mode и не считается
immutable-artifact restore. Проверяются bucket contract, object count, total
bytes, per-object SHA, private/public semantics, presigned URLs, multipart/TUS
и отсутствие частично опубликованного target.

## Redacted evidence

После cleanup каждый run атомарно и один раз публикует отдельный immutable
mode-0600 receipt вне Git. Он содержит SHA-256 preflight journal/input set,
phase results и cleanup proof; temporary journal затем удаляется.
После двух runs создаётся третий pair receipt, который ссылается на hashes двух
неизменяемых run receipts и сравнивает fingerprints. Receipt содержит только:

- DB/Storage ciphertext SHA и source manifest fingerprints;
- orchestrator Git SHA, tag/commit/tree/images/config fingerprint;
- architecture, Compose/Postgres/tool versions;
- новый project/volume/network/system identifiers без paths и credentials;
- phase status/duration;
- aggregate row/DDL/FK/ledger/Storage fingerprints;
- HTTP status codes без tokens и response bodies;
- cleanup/teardown proof.

Run receipt получает `run_complete=true` только после cleanup собственного run;
`complete=true` допустим только в pair receipt после успешного второго restore.

## Cleanup invariant

Signal-safe trap действует на success, каждую phase failure, `INT`, `TERM` и
receipt collision. Он удаляет decrypted tar/SQL/private stderr, runtime/rendered
temporary files и только ресурсы с exact matching ownership tuple. Затем
доказывает отсутствие target containers/volumes/networks и plaintext. После
EXIT остаются только исходные ciphertext, approved backup-set manifest и
redacted immutable receipt; ciphertext никогда не удаляется cleanup.

## Обязательные тестовые слои

1. `restore-safety.test.mjs`: archive path/link/traversal/tar-bomb, immutable
   copy, checksums, forensic canaries, target-marker/lock, every phase failure,
   signal cleanup, no-output secret canary и receipt collision.
2. Disposable PostgreSQL integration: clean-target proof, transaction rollback,
   roles/schema/data, ledger policy, cron/pg_net safety, FK/DDL/count parity.
3. Exact-stack E2E: два новых Compose targets, Storage bytes и полный service
   smoke/negative-auth набор.

Повтор на том же target обязан завершаться до mutation. Два clean restore — это
два разных target instance с разными system identifiers и одинаковыми итоговыми
fingerprints.

## Текущие блокеры

- локально около 14 GiB свободно и нет Compose plugin;
- нет versioned outbound-isolation и Storage restore tooling;
- нет project-ledger comparator и source-derived unified DB+Storage manifest;
- runtime containers, два clean restore и service smoke не выполнялись.

Локальный file-backed rehearsal не требует Beget. Для следующего production-like
gate отдельно нужны Beget backend VPS 4 vCPU / 8 GiB / 100 GiB, S3 buckets,
scoped credentials и reviewed S3 overlay.

Пока все пункты не закрыты, runtime rehearsal и production cutover — **NO-GO**.
