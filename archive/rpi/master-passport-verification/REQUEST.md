# Feature Request — Master Passport Verification (UI)

**Slug:** `master-passport-verification`
**Дата:** 2026-05-20
**Тип:** Trust feature, опциональная для мастера, обязательная для launch (≥ Profi.ru-уровень доверия в каталоге).
**Приоритет:** P0 — launch-блокер trust.

---

## TL;DR

Реализовать UI-flow верификации паспорта мастера поверх **полностью готового backend** (миграция 0070, схема `master_verifications`, RLS, private Storage bucket `master-verifications`, триггер `sync_master_verification_level`, TS-types). Мастер загружает селфи + фото главной страницы паспорта → ждёт ручную проверку админа → после approval на профиле и в каталоге появляется badge «Паспорт подтверждён ✓».

Backend задокументирован в [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md). Frontend — **полностью отсутствует** (grep по `app/` и `src/features/` даёт 0 матчей на `verification` кроме сгенерированных типов).

---

## Проблема

### Что хочет пользователь

**Клиент (приоритет):**
> «Я не понимаю, кто этот мастер из каталога. У него аватар, имя — но мог зарегистрироваться кто угодно. Я не доверяю отдать предоплату незнакомцу.»

**Мастер (вторичный):**
> «Я готов подтвердить личность чтобы клиент мне доверял. В Profi.ru это есть, я ожидаю того же здесь.»

**Админ (будущий, не в scope этой задачи):**
> «Мне нужна очередь pending-заявок чтобы их обрабатывать. Не входит в этот RPI — будет отдельная админка через service-role.»

### Текущее состояние

- В каталоге нет визуального различия между «зарегистрировался 5 минут назад» и «работающий 2 года мастер».
- В `master_profiles.verification_level` уже есть колонка (`integer NOT NULL DEFAULT 0`), backend готов её апдейтить через триггер, но **никто** UI её не использует.
- На странице `/profile` мастера нет CTA для верификации.
- На детальной странице мастера `/master/[id]` нет badge.
- В карточках мастеров (`MasterCard`, ленты `home`, `top-masters`, `masters-by-l2`) нет badge.

### Почему сейчас

1. **Launch trust.** Без verification UI клиент не доверяет каталогу — это закроет conversion.
2. **Backend риск.** Триггер `sync_master_verification_level` работает в проде уже неделю, но никто его не дергает — если в нём bug, мы узнаём только при первом approval. Нужно прогнать end-to-end путь.
3. **Future-ready.** После запуска админки админ начнёт обрабатывать заявки — UI должен быть готов **до** этого.

---

## Эталон / референсы

- **Profi.ru** — паспорт-верификация как стандарт RU-marketplace. Селфи + паспорт-главная, ручная модерация, badge на карточке мастера в выдаче.
- **YouDo** — аналогично, плюс «подтверждённый телефон» (у нас по умолчанию через OTP).
- **TaskRabbit / Thumbtack** — background check, US-специфика (SSN/SIN). Не подходит для RU, не берём.

Дизайн badge — Phosphor `SealCheck` weight=fill, цвет accent (`tc.brand`), inline-текст «Паспорт подтверждён» в нужных местах, иконка-only где места мало (карточка в ленте).

---

## Готовый backend (НЕ трогать)

См. [`docs/VERIFICATION.md`](../../docs/VERIFICATION.md) — полная спецификация. Кратко:

- ✅ Миграция `0070_master_verifications.sql` применена в prod 2026-05-15.
- ✅ ENUM `verification_status` = `'pending' | 'approved' | 'rejected'`.
- ✅ Таблица `master_verifications` (user_id PK, status, selfie_path, passport_main_path, submitted_at, reviewed_at, reviewed_by, rejection_reason).
- ✅ RLS:
  - `master_verifications_owner_select` — SELECT свою row.
  - `master_verifications_owner_insert` — INSERT только status=`pending` и reviewed_* IS NULL.
  - `master_verifications_owner_resubmit` — UPDATE только `rejected → pending`.
  - `master_verifications_owner_delete` — DELETE свою row.
- ✅ Storage bucket `master-verifications` PRIVATE с RLS (первый сегмент пути = `auth.uid()::text`).
- ✅ Триггеры `sync_master_verification_level` (на approved → level=1) и `reset_verification_level_on_delete`.
- ✅ TS-types в `src/types/database.ts` (строки 600+, 1775).
- ✅ `verification_level` колонка в `master_profiles` (default 0).

**Что планировалось в части 2 (см. docs/VERIFICATION.md §«UI flow (planned — часть 2)»):**

- Hook `useMyVerification(userId)` — query.
- Hook `useSubmitVerification(userId)` — mutation (upload селфи → upload паспорт → INSERT/UPDATE).
- Hook `useVerificationPreviewUrls(row)` — signed URLs для превью.
- Экран `/profile/verification`.
- Nudge-карточка на `/profile`.
- Badge на `/master/[id]` и в карточках лент.

---

## Желаемый UX

### Состояния (для мастера на `/profile`)

| Логический статус | Условие | Карточка на `/profile` | CTA |
|---|---|---|---|
| `not_submitted` | Нет row в `master_verifications` | «Подтвердите личность» — повышает доверие клиентов | `Начать верификацию` → `/profile/verification` |
| `pending` | row.status = `'pending'` | «Заявка на проверке · 1–2 рабочих дня» — иконка часов | `Посмотреть` → `/profile/verification` (read-only превью) |
| `approved` | row.status = `'approved'` | «Паспорт подтверждён · DD.MM.YYYY» — иконка `SealCheck` fill, цвет accent | (нет CTA, ссылка `Подробнее` опционально) |
| `rejected` | row.status = `'rejected'` | «Отклонено: {rejection_reason}» — иконка `X` цвет error | `Загрузить заново` → `/profile/verification` (форма с показом причины) |

### Экран `/profile/verification`

Один маршрут под все 4 состояния, поведение зависит от `useMyVerification()`:

**not_submitted / rejected:**
- ScreenHeader (CaretLeft back).
- Title: «Подтверждение личности».
- Body:
  - (если rejected) Inline-баннер с rejection_reason на error-фоне.
  - Краткое объяснение (1 предложение, **без subtitle под заголовком** — design-quality правило G): «Загрузите селфи и паспорт. Проверка занимает 1–2 рабочих дня. Данные доступны только админам, не публикуются.»
  - Слот 1: Селфи — image picker → preview.
  - Слот 2: Паспорт (главная страница) — image picker → preview.
  - Disclaimer-checkbox: «Соглашаюсь на обработку персональных данных» (обязательный).
  - CTA «Отправить на проверку» (bg-primary text-on-primary, h-12, pill).

**pending / approved:**
- Read-only превью загруженных фото через `useVerificationPreviewUrls()` (signed URLs, TTL 1h).
- Status-badge сверху.
- Кнопка «Отозвать заявку» (тонкая ghost-button, цвет error) — DELETE row → возврат в not_submitted.

### Badge на `/master/[id]` (detail) и карточках лент

- На `/master/[id]` — inline-чип рядом с именем мастера: `SealCheck fill` + «Паспорт подтверждён» (size sm, mono-caption).
- В карточках лент (`MasterCard`, грид `top-masters`, `masters-by-l2`) — иконка-only `SealCheck fill` рядом с именем (size 14, цвет accent).

### Image-picker presets

- `expo-image-picker` (уже в depencies).
- `mediaTypes: ['images']`, `quality: 0.82`.
- Pre-validate в JS: размер ≤ 10MB, тип `image/jpeg` | `image/png`.
- Compress + resize через `expo-image-manipulator` (уже в depencies): max-dimension 1600px, `compress: 0.82`, `format: 'jpeg'`. Аналог portfolio uploader.
- Imageupload path:
  ```
  {user_id}/selfie-{unix_ts}.jpg
  {user_id}/passport-{unix_ts}.jpg
  ```

---

## Scope

### IN

1. Хук `useMyVerification(userId)` — query на `master_verifications`, возврат `{ status: VerificationStatus | 'not_submitted', row | null }`.
2. Хук `useSubmitVerification(userId)` — mutation: image-manipulator → upload селфи → upload паспорт → INSERT (not_submitted) / UPDATE (rejected → pending) → invalidate.
3. Хук `useVerificationPreviewUrls(row)` — `createSignedUrl` для обоих путей, TTL 3600 сек.
4. Хук `useWithdrawVerification(userId)` — mutation DELETE row + Storage objects → invalidate.
5. Экран `/profile/verification` (новый маршрут `app/(tabs)/profile/verification.tsx`).
6. Nudge-карточка на `/profile` (4 состояния, см. таблицу).
7. Badge на `/master/[id]` (`master_profiles.verification_level >= 1`).
8. Badge в карточках лент: `MasterCard`, top-masters grid, masters-by-l2 grid.
9. Empty / loading / error states (skeleton при загрузке, retry при error).
10. Dark theme — обязательно работает.
11. Документация: `STATUS.md`, `docs/VERIFICATION.md` (закрыть «часть 2 — frontend»), `SESSION_SUMMARY_<дата>.md`.

### OUT (явно вне scope)

- Админка для обработки pending-очереди (отдельный sprint, через service-role).
- Email-уведомление о результате (никаких email — правило №6 CLAUDE.md). Только push (если будет — отдельная задача).
- Sort-boost для verified в каталоге (отложено в `docs/VERIFICATION.md` до >0 проверенных).
- Прописка / юр.лицо / проф.сертификаты (`verification_level` 2+) — зарезервировано.
- GC-задача удаления старых файлов rejected/cancelled заявок.
- iOS/Android native проверка через ID документ / NFC — overkill для MVP.
- Реализация capturing selfie через `expo-camera` с face-detection — пользуемся стандартным image-picker.

---

## Success criteria

1. **Happy path работает end-to-end.** Demo-мастер заходит на `/profile`, видит nudge, переходит в `/profile/verification`, загружает 2 фото, отправляет, видит «На проверке». Админ через Supabase Dashboard вручную меняет `status=approved` → мастер видит «Паспорт подтверждён» + триггер обновляет `verification_level=1`. Badge появляется на `/master/[id]`.
2. **RLS защищает.** Попытка через client SQL выставить себе `status='approved'` падает (verified manually).
3. **Re-submit работает.** Admin отклоняет (status=rejected, rejection_reason='Фото размыто'). Мастер видит причину, загружает заново → status=pending.
4. **Withdraw работает.** Мастер на pending нажимает «Отозвать», row + Storage objects удаляются. Возврат в not_submitted.
5. **Badge виден другим пользователям.** Клиент-демо открывает `/master/{verified_id}` → видит «Паспорт подтверждён» chip + иконку.
6. **PII не утекает.** `master-verifications` остаётся PRIVATE, никаких `getPublicUrl()`. Сторонний юзер не может прочитать чужое фото даже зная path.
7. **TS clean.** `npx tsc --noEmit` без ошибок.
8. **Dark mode работает.** Все 4 состояния в dark проверены preview-скриншотом.

---

## Constraints / руководящие правила

- **CLAUDE.md правило №6** — никакого email. Уведомления только push (вне scope).
- **CLAUDE.md `connect-the-dots.md`** — backend готов, всё внимание на подключение к UI. После задачи: проверить grep `master_verifications` → каждый референс через hook, не raw query.
- **`.claude/rules/design-quality.md`:**
  - bg-primary → text-on-primary обязательно.
  - Никаких inline hex.
  - Phosphor (не Lucide) для иконок.
  - **Никакого subtitle под H1** (правило G) — в forms объяснение текстом в body, не subtitle.
  - Empty / loading / error states обязательны.
- **`.claude/rules/preview-rules.md`** — verify через `preview_start({ name: "xtrud-web" })` + screenshot.
- **`docs/UI_ICONS.md`** — Phosphor `SealCheck` weight=fill (accent цвет) — стандарт для verified-badge.
- **PII safety:** signed URLs only, TTL ≤ 1h, никаких publicUrl. Image-manipulator pre-strip EXIF (если возможно — `expo-image-manipulator` не страйпит, нужно проверить).
- **Re-submit RLS:** UPDATE разрешён только `rejected → pending`. Любая другая попытка — упадёт. Это уже работает в БД, frontend должен **корректно использовать** этот переход (не пытаться INSERT при rejected).

---

## Open questions (для research-фазы)

1. **EXIF strip.** `expo-image-manipulator` не страйпит EXIF (geolocation, device info). Нужно ли это для PII compliance? Если да — какая библиотека или ручной strip через canvas?
2. **Disclaimer-text.** Текст согласия на обработку ПДн — взять из существующих legal-доков (`legal/` папка?) или написать новый? Кто его утверждает (продукт-owner)?
3. **Selfie живость (liveness).** Не делаем (out of scope), но как защитимся от фото-чужого-паспорта? Ответ: ничего на MVP, только admin-eye. Зафиксировать как accepted risk.
4. **Rate-limit на submit.** Мастер может re-submit бесконечно после rejection. Нужен ли cooldown? (По умолчанию — нет, спросить).
5. **Чистка Storage при withdraw / re-submit.** При DELETE row триггер `sync_master_verification_level` сбросит level, но **файлы в Storage останутся**. Нужно ли в `useWithdrawVerification` удалять Storage objects явно? (По защите PII — да).
6. **Badge в текстовом виде vs icon-only.** Inline chip на `/master/[id]` — текст + icon, в карточках лент — icon-only. Согласовать с design tokens (см. UI_PATTERNS.md).

---

## Артефакты для следующего шага

После `/rpi:research master-passport-verification` ожидаем:

- `rpi/master-passport-verification/research/RESEARCH.md` с GO/NO-GO.
- Подтверждение что backend готов на 100% (re-check миграция, RLS, types).
- Чёткий список «что точно в scope», «что под вопросом», «что отложено».
- Risk list с mitigation.
- Оценка усилий: фаз / задач / сложности.
