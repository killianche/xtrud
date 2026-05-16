# Мастер-верификация (паспорт)

Опциональная фича: мастер загружает селфи + фото главной страницы паспорта → ждёт ручную проверку админа → после approval на профиле появляется badge «Паспорт подтверждён».

**Имя для запроса:** «верификация», «verification», «паспорт мастера», «badge подтверждён».

**Статус:** backend готов (миграция 0070, RLS, Storage bucket, TS-types). Frontend — в работе.

## Зачем

- **Доверие к мастеру у клиента.** Без верификации в каталоге сидят анонимы — клиент боится. С badge «Паспорт подтверждён» — реальный человек, в случае проблемы понятно кому претензии.
- **Будущий rating-boost.** После появления админки и >0 проверенных — верифицированные получат +N к sort-score и будут выше в выдаче (rating, top-masters, search). Сейчас boost **не** реализован, только статус + badge.
- **Опциональность.** Не блокирует ни одну функцию мастера. Nudge-карточка на /profile, мастер сам решает когда (и решает ли вообще) пройти верификацию.

## Эталон

- **Profi.ru / YouDo** — paspport-verification как стандарт RU-marketplace услуг.
- **TaskRabbit / Thumbtack** — background check (но это US-специфика, требует SSN/SIN).

## Схема БД

### ENUM `verification_status`

```sql
'pending' | 'approved' | 'rejected'
```

- `pending` — заявка отправлена, ждёт админа.
- `approved` — паспорт подтверждён. На профиле badge «Паспорт подтверждён ✓».
- `rejected` — админ отклонил с причиной. Мастер видит причину, может re-submit (rejected → pending через UPDATE).

Отсутствие row в `master_verifications` = «не подавал заявку» (логический статус `not_submitted` на UI).

### TABLE `master_verifications`

| Колонка | Тип | Описание |
|---|---|---|
| `user_id` | uuid PK | FK → `auth.users.id ON DELETE CASCADE`. 1:1. |
| `status` | `verification_status` | Default `'pending'`. |
| `selfie_path` | text NOT NULL | Path в bucket `master-verifications`: `{user_id}/selfie-<ts>.jpg`. |
| `passport_main_path` | text NOT NULL | Path: `{user_id}/passport-<ts>.jpg`. |
| `submitted_at` | timestamptz NOT NULL | Default now(). Перезаписывается при re-submit. |
| `reviewed_at` | timestamptz NULL | Заполняется админом. |
| `reviewed_by` | uuid NULL | FK → `auth.users.id ON DELETE SET NULL`. |
| `rejection_reason` | text NULL | Заполняется админом при `rejected`. Показывается мастеру. |

**CHECK constraints:**
- `selfie_path` и `passport_main_path` не пустые (длина > 0).

**Индекс:** `(status, submitted_at DESC)` — для будущего админ-листа pending (ORDER BY submitted_at DESC).

### Sync с `master_profiles.verification_level`

Поле `master_profiles.verification_level` (`integer NOT NULL DEFAULT 0`) уже существовало в схеме — переиспользовано. Значения:

- `0` — не верифицирован.
- `1` — паспорт подтверждён (этот flow).
- `2+` — зарезервировано (прописка, юр.лицо, проф.сертификаты).

**Trigger `sync_master_verification_level`** (`AFTER INSERT OR UPDATE OF status`):
- `status = 'approved'` (новое значение, не было раньше) → `master_profiles.verification_level = GREATEST(level, 1)`.
- Было `'approved'`, стало другое → `level = 0`.

**Trigger `reset_verification_level_on_delete`** (`AFTER DELETE`):
- Если удалён row со status `'approved'` → `level = 0`.

Обе функции `SECURITY DEFINER` — иначе RLS на `master_profiles` блокирует UPDATE из триггера.

## RLS

Все политики только для роли `authenticated`. Service-role обходит RLS автоматически (используется будущей админкой).

| Policy | Action | Условие |
|---|---|---|
| `master_verifications_owner_select` | SELECT | `auth.uid() = user_id` |
| `master_verifications_owner_insert` | INSERT | `auth.uid() = user_id AND status = 'pending' AND reviewed_* IS NULL` |
| `master_verifications_owner_resubmit` | UPDATE | USING `auth.uid() = user_id AND status = 'rejected'`<br>WITH CHECK `auth.uid() = user_id AND status = 'pending' AND reviewed_* IS NULL` |
| `master_verifications_owner_delete` | DELETE | `auth.uid() = user_id` |

**Что это даёт:**

- Юзер видит **только свою** заявку.
- Юзер **не может** выставить себе `approved` — RLS форсирует `pending` на INSERT, и на UPDATE разрешает только `rejected → pending` (re-submit). Любая попытка задать `approved` через клиент Supabase упадёт.
- Юзер **не может** трогать `reviewed_at` / `reviewed_by` / `rejection_reason` — RLS форсирует NULL при write.
- Сторонние юзеры (клиент, другой мастер) **не видят** заявок других — только свою, при условии что у них есть строка.
- Админка через service-role читает всё, апдейтит `status`, `reviewed_*` — RLS не применяется.

## Storage

### Bucket `master-verifications`

- **Private** (`public=false`).
- Файлы доступны:
  - Самому юзеру — через `createSignedUrl` (TTL ≤ 3600 сек).
  - Service-role (админке) — прямым `download` или `getPublicUrl` через service client.
- **Никаких publicUrl** для PII. Никаких CDN-share.

### Policies на `storage.objects`

Все по паттерну: `bucket_id = 'master-verifications' AND (storage.foldername(name))[1] = auth.uid()::text`. То есть первый сегмент пути обязан быть равен `user_id`. Применено для INSERT / SELECT / UPDATE / DELETE.

### Naming convention

```
{user_id}/selfie-{unix_ts}.jpg
{user_id}/passport-{unix_ts}.jpg
```

- Timestamp в имени — чтобы re-submit не upsert'ил поверх (история уходит). Старые файлы можно периодически чистить через GC-задачу (не реализована).
- JPEG, max-dimension 1600px (preset аналогично portfolio), compress 0.82.

## UI flow (planned — часть 2)

### Состояния и экраны

```
not_submitted (нет row)
  └─ /profile (nudge-карточка «Подтвердите личность» с CTA)
     └─ /profile/verification (форма: селфи + паспорт + кнопка «Отправить»)
        └─ submit() → pending

pending (status=pending)
  └─ /profile (карточка «На проверке · 1–2 дня»)
     └─ /profile/verification (read-only превью загруженного, можно «Отозвать»)

approved (status=approved)
  └─ /profile (карточка «Паспорт подтверждён · YYYY-MM-DD»)
     └─ /profile/verification (read-only превью)

rejected (status=rejected)
  └─ /profile (карточка «Отклонено: {reason}» + CTA «Загрузить заново»)
     └─ /profile/verification (форма с показом причины, submit re-uses UPDATE)
```

### Hooks

- `useMyVerification(userId)` — query на `master_verifications` row текущего юзера. Возвращает `{ status: VerificationStatus | 'not_submitted', ...row }`.
- `useSubmitVerification(userId)` — mutation: upload селфи → upload паспорт → INSERT (или UPDATE при re-submit) → invalidate query.
- `useVerificationPreviewUrls(row)` — массив signed URLs (TTL 1h) для отображения превью загруженных фото самому юзеру.

### Badge у других пользователей

- На детальной странице мастера и в карточках row — `master_profiles.verification_level >= 1` → показать badge.
- Badge: Phosphor `SealCheck` weight=fill, цвет accent, текст «Паспорт подтверждён».

## Security checklist

- ✅ PII в отдельной таблице, не в `master_profiles`.
- ✅ Storage bucket PRIVATE.
- ✅ RLS блокирует self-approve.
- ✅ RLS блокирует чтение чужих заявок.
- ✅ Trigger sync через `SECURITY DEFINER` (RLS-safe).
- ✅ Никаких publicUrl на PII.
- ⏳ (часть 2) Frontend uses `createSignedUrl` для превью, TTL ≤ 1h.
- ⏳ (часть 2) Image-picker pre-validate: размер ≤ 10MB, тип `image/jpeg|png`.
- ⏳ (будущее) GC старых файлов из rejected/cancelled заявок.

## История решений

- **2026-05-15** — миграция 0070 применена в prod (`apply_migration` success). User подтвердил: селфи + паспорт-главная (2 фото), без прописки. Boost в выдаче отложен до появления админки и >0 проверенных.
