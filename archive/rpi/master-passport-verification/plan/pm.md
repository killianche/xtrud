# Product Requirements Document — Master Passport Verification (UI)

**Feature slug:** `master-passport-verification`
**Date:** 2026-05-20
**Phase:** RPI Step 5 — Plan (Product Requirements)
**Owner:** PM agent
**Status:** Approved for implementation (research GO, all 6 conditions confirmed)

**Source documents:**
- [REQUEST.md](../REQUEST.md) — original feature brief
- [research/RESEARCH.md](../research/RESEARCH.md) — research report (GO, High confidence)
- [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) — backend specification (shipped 2026-05-15)
- [CLAUDE.md](../../../CLAUDE.md) — project constitution

---

## 1. Executive Summary

Master Passport Verification adds the missing UI layer on top of an already-shipped backend (migration 0070, table `master_verifications`, private Storage bucket, RLS, triggers) so masters can prove identity with selfie + passport main page and earn a "Паспорт подтверждён" badge after manual admin review. The feature unlocks the catalog's primary trust signal for clients before launch and closes a textbook `connect-the-dots` violation — backend live for a week, zero UI consumers. It targets clients (decisive trust signal at choice moment), masters (reputation parity with Profi.ru/YouDo), and the platform (catalog conversion lift, future sort-boost lever).

## 2. Feature Description

A master sees a contextual nudge on `/profile` with one of four states (`not_submitted`, `pending`, `approved`, `rejected`) and can navigate to a single route `/profile/verification` that branches on state to either a submission form (zod + react-hook-form, image-manipulator pre-processing) or a read-only document preview with signed URLs. Successful approval flips `master_profiles.verification_level` from 0 to 1 via the existing DB trigger, which surfaces a `SealCheck` (Phosphor, weight=fill) badge on `/master/[id]` (inline chip with text) and in catalog cards (`MasterPreviewCard`, top-masters grid, masters-by-l2 grid — icon-only variant). Masters can withdraw pending requests (DB row + Storage objects both deleted) and re-submit after rejection within a 60-minute client-side cooldown. The full backend contract (RLS, triggers, Storage layout, types) is locked and not modified by this RPI — see [docs/VERIFICATION.md](../../../docs/VERIFICATION.md).

## 3. Constitutional Alignment

**Phone-only (rule №6).** No email anywhere — no submission email, no rejection email, no badge-earned email. Result notifications deferred to Sprint 2 push pipeline.

**MVP scope discipline.** Feature operates on `verification_level=1` only (passport). Levels 2+ (прописка, юр.лицо, проф.сертификаты) reserved in schema, explicitly out of scope here.

**No stubs / production-ready.** All four status branches, all three badge surfaces, empty / loading / error states, RU copy, dark mode — every leaf must be finished before close. No `() => {}` handlers, no `Alert.alert("Скоро")` placeholders.

**Design-quality bar.** Phosphor icons only (`SealCheck` fill), no subtitle under H1 (rule §G), `bg-primary` always paired with `text-on-primary` (rule §A), minimum 12px font (rule §C). Lazyweb-first mandatory before form layout and approved-card design.

**Connect-the-dots.** This RPI exists specifically to close the gap. On completion, the rule's "Известные случаи" gets a new entry; `STATUS.md` § "Готовый бэк, не подключён в UI" loses the verification entry.

## 4. Business Value & Success Metrics

**Business value:**
- **Trust differentiation in catalog — launch-critical.** Without a verified-vs-unverified visual distinction, the catalog reads as anonymous; clients won't risk prepayment. This is the documented launch blocker from REQUEST.md.
- **Future sort-boost lever — DB-ready.** `master_profiles.verification_level` already exists and is updated by trigger. Once the badge ships and ≥30% of active masters are verified, we can promote verified profiles in ranking (deferred to a separate RPI).
- **Dispute-reduction signal.** A real ID on file is a soft deterrent to abusive behaviour and a recovery aid for client disputes (admin can match identity to the registered phone).
- **Risk closure — backend dry-run.** Trigger `sync_master_verification_level` and the RLS rules have been live for a week with zero production traffic. Shipping the UI is also the first end-to-end validation of the backend.

**Success metrics (measure 30 / 60 / 90 days post-launch):**

| Metric | Type | Target (30d) | Target (90d) | Notes |
|---|---|---|---|---|
| % active masters with `verification_level >= 1` | Leading | ≥ 40% | ≥ 65% | "Active" = ≥1 response in last 14 days. |
| Catalog conversion lift on cards with badge vs without | Lagging | +15% click-to-detail | +20% | Cohorted A/B view; requires ≥50 verified masters before measurement starts. |
| Median admin moderation latency (pending → terminal state) | Operational | ≤ 48h | ≤ 24h | Tracked via `(reviewed_at - submitted_at)`. Widened SLA copy ("1–3 дня, до 5 рабочих") buys runway. |
| Re-submit rate after rejection | Quality | ≥ 50% within 7d | ≥ 70% within 7d | If low, rejection-reason copy needs work. |
| Withdraw rate of pending requests | Quality | ≤ 10% | ≤ 5% | High withdraw = bad form UX or buyer's remorse. |
| Storage orphan count (files without matching DB row) | Hygiene | 0 | 0 | Withdraw mutation removes Storage objects atomically. |

## 5. User Personas & Use Cases

### Persona A — **Master (Хава, мастер по плитке, 34, г. Назрань)**

Self-employed tiler, registered 2 weeks ago, 0 responses so far. Saw on a competitor's app that profiles with a verified badge get more replies. Cautious about giving documents — wants assurance they won't leak.

- **Use case 1:** Хава opens `/profile`, sees a card saying her profile isn't verified, taps "Начать верификацию", selects two photos (selfie + passport main page), agrees to PD processing, submits, sees "На проверке · обычно 1–3 дня".
- **Use case 2:** Two days later Хава gets rejected ("Фото размыто"), opens the same screen, sees the red banner with the reason, re-takes the passport photo, submits again, sees pending.

### Persona B — **Client (Магомед, ищет мастера для ремонта ванной, 41, Магас)**

Has been burned before by a no-show on Avito. Compares 3–5 master cards before contacting anyone. Looks for signals he can trust at a glance.

- **Use case 1:** Магомед searches "плиточник Магас", sees a grid of cards; two have a small green `SealCheck` icon next to the name. He taps one of those first.
- **Use case 2:** On the master detail screen he sees an inline chip "Паспорт подтверждён" near the name, reads it as a reassurance signal, taps "Написать" with more confidence.

### Persona C — **Admin (Руслан, владелец проекта, out of scope of this RPI's UI)**

Sole moderator for now. Will process pending requests via the Supabase Dashboard until an admin UI ships in a later sprint.

- **Use case 1:** Руслан opens Supabase Dashboard, filters `master_verifications` by `status='pending'`, opens each row, downloads selfie + passport via signed URL, decides approve/reject, updates the row.
- **Use case 2:** When rejecting, Руслан picks a reason from the canonical list (blur / partial / wrong document / face mismatch / glare / cropped / other) documented in `docs/VERIFICATION.md` and writes the user-facing string in `rejection_reason`.

## 6. User Stories

> Format: **Как [persona], я хочу [действие], чтобы [результат].** Acceptance criteria use Given-When-Then. All stories are testable with the existing demo accounts (see `DEMO_ACCOUNTS.md`).

### Story 1 — Master sees the nudge

**Как мастер**, я хочу видеть на `/profile` подсказку о возможности подтвердить паспорт, **чтобы** понимать что для повышения доверия клиентов есть конкретный шаг.

- **Given** мастер залогинен и в `master_verifications` нет его row;
- **When** он открывает `/profile`;
- **Then** он видит карточку «Подтвердите личность · Повышает доверие клиентов» с CTA «Начать верификацию»;
- **And** CTA ведёт на `/profile/verification`.

### Story 2 — Master submits selfie + passport

**Как мастер**, я хочу загрузить селфи и фото главной страницы паспорта, **чтобы** отправить заявку на проверку.

- **Given** мастер на `/profile/verification` в состоянии `not_submitted`;
- **When** он выбирает оба фото через image-picker, ставит галочку согласия на обработку ПДн и жмёт «Отправить на проверку»;
- **Then** оба файла загружаются в `master-verifications/{user_id}/selfie-{ts}.jpg` и `passport-{ts}.jpg`, INSERT в `master_verifications` с `status='pending'`;
- **And** UI переключается в pending-состояние без `router.replace`;
- **And** на `/profile` карточка теперь показывает «Заявка на проверке · обычно 1–3 дня, до 5 рабочих дней».

### Story 3 — Master views pending status and withdraws

**Как мастер**, я хочу посмотреть что я загрузил и отозвать заявку, **чтобы** контролировать свои персональные данные.

- **Given** у мастера `master_verifications.status='pending'`;
- **When** он открывает `/profile/verification`;
- **Then** видит превью обоих фото через signed URL (TTL 3600s);
- **And** видит ghost-кнопку «Отозвать заявку» цветом error;
- **When** он нажимает «Отозвать» и подтверждает в Alert;
- **Then** Storage-файлы (selfie + passport) удаляются ДО DELETE row;
- **And** DB-row удаляется, триггер `reset_verification_level_on_delete` сбрасывает `verification_level` в 0;
- **And** UI возвращается в состояние `not_submitted`.

### Story 4 — Master sees rejection reason and re-submits

**Как мастер**, я хочу увидеть причину отказа и загрузить заново, **чтобы** исправить и пройти проверку.

- **Given** у мастера `master_verifications.status='rejected'` с `rejection_reason='Фото паспорта размыто, перефотографируйте при дневном свете'`;
- **When** он открывает `/profile/verification`;
- **Then** он видит красный inline-баннер с текстом причины;
- **And** видит форму с новыми слотами под фото;
- **When** он выбирает новые фото и жмёт «Отправить повторно»;
- **Then** мутация делает UPDATE (RLS-разрешённый переход `rejected → pending`), не INSERT;
- **And** статус становится `pending`.

### Story 5 — Master sees approved badge on own profile

**Как мастер**, я хочу видеть подтверждённый статус на своём публичном профиле, **чтобы** убедиться что badge виден клиентам.

- **Given** у мастера `master_verifications.status='approved'` и трigger обновил `master_profiles.verification_level=1`;
- **When** он открывает `/master/[id]` со своим id (например через «Посмотреть как клиент»);
- **Then** рядом с именем мастера виден chip `SealCheck` fill + «Паспорт подтверждён» (size sm, mono-caption, accent цвет);
- **And** на `/profile` карточка показывает «Паспорт подтверждён · DD.MM.YYYY» с иконкой `SealCheck` fill.

### Story 6 — Client sees badge in catalog cards

**Как клиент**, я хочу видеть отметку о верификации в карточках мастеров в каталоге, **чтобы** на этапе скролла выделять проверенных.

- **Given** в выдаче есть мастера с `verification_level=1` и без;
- **When** клиент открывает `/(tabs)/index.tsx`, `/(tabs)/search.tsx`, страницу top-masters или masters-by-l2;
- **Then** в карточках `MasterPreviewCard` рядом с именем верифицированных мастеров видна icon-only `SealCheck` fill (size 14, accent цвет);
- **And** у не верифицированных иконки нет — никаких placeholder'ов «непроверен».

### Story 7 — Client sees inline chip on detail screen

**Как клиент**, я хочу видеть подтверждение паспорта на детальном экране мастера, **чтобы** на этапе финального выбора иметь полноразмерный trust-сигнал.

- **Given** у мастера `verification_level >= 1`;
- **When** клиент открывает `/master/[id]`;
- **Then** в trust-row (рядом с рейтингом, годами опыта) виден inline-chip `SealCheck` fill + текст «Паспорт подтверждён»;
- **And** chip визуально подчинён имени и аватарке (secondary visual weight), не доминирует.

### Story 8 — Master hits the 60-minute re-submit cooldown

**Как мастер**, я хочу понимать почему я не могу сразу подать снова после отзыва или отказа, **чтобы** не флудить заявками.

- **Given** мастер отправил заявку и в течение 60 минут отозвал её или получил rejected → попытался подать снова;
- **When** он на `/profile/verification` пытается отправить повторно (или re-submit form is open);
- **Then** кнопка «Отправить» disabled;
- **And** под кнопкой видна подсказка «Повторная отправка через MM:SS» с обратным отсчётом;
- **And** после истечения 60 минут (с момента `submitted_at` последней заявки) кнопка становится активной без перезагрузки экрана.

### Story 9 — PII safety on withdraw

**Как мастер**, я хочу быть уверенным что мои документы удаляются полностью при отзыве, **чтобы** мои данные не оставались на сервере.

- **Given** мастер с `status='pending'`, файлы лежат в `master-verifications/{user_id}/`;
- **When** мастер жмёт «Отозвать заявку» и подтверждает;
- **Then** мутация сначала вызывает `supabase.storage.from("master-verifications").remove([selfie_path, passport_path])`;
- **And** ТОЛЬКО ПОСЛЕ успешного Storage.remove делает DELETE row;
- **And** если Storage.remove падает (network) — DELETE row не выполняется, мастер видит ошибку с CTA «Повторить»;
- **And** в обычном happy path в bucket `master-verifications/{user_id}/` после операции 0 объектов (verified through Dashboard).

## 7. Acceptance Criteria (cross-cutting)

Эти критерии **must hold across all 9 stories**:

- **PII safety:** доступ к файлам — только через `createSignedUrl(path, 3600)`. Никаких `getPublicUrl()` для bucket `master-verifications`. URLs не логируются и не показываются в копируемом виде. EXIF empirically validated в Phase 1 (см. RESEARCH §Risk Analysis).
- **TS clean:** `npx tsc --noEmit` без ошибок. Новые hooks типизированы через `Tables<"master_verifications">`.
- **Dark mode:** все 4 status-branch'а отрисованы корректно в обеих темах (verified через `preview_screenshot` с переключением ThemeSwitcher).
- **RU copy only:** никакого i18n-слоя. Все строки в коде на русском. Никаких английских fallback'ов.
- **Phosphor icons:** `SealCheck` weight=fill для approved badge. Никакого Lucide, никаких эмодзи (✓, 🛂, 📷) — правило design-quality §D.
- **No subtitle under H1:** ScreenHeader на `/profile/verification` без `subtitle` prop'а. Объяснение через body-параграф под формой. Banner с rejection-reason — это inline-баннер, не subtitle.
- **Lazyweb-first:** до написания JSX для формы и approved-card сделан минимум 1 Lazyweb-запрос «passport verification form mobile» и 1 «verified badge marketplace profile». Результаты (3–5 экранов) изучены, выводы (что переиспользуем, что осознанно делаем иначе) зафиксированы в Phase 2 implement-логе.
- **Empty / loading / error states:** loading = skeleton (не `<ActivityIndicator>`), empty = EmptyState с иконкой и CTA, error = inline-баннер + retry-кнопка.
- **No stubs:** все 9 stories реализованы end-to-end. Никаких `onPress={() => {}}` или `Alert.alert("Скоро")`. Если что-то не успели — контрол скрыт, а не зафиксирован как stub.
- **Atomic upload:** если upload селфи прошёл, а паспорта упал — `storage.remove([selfiePath])` ДО throw. Никаких orphan-файлов на partial failure.
- **Atomic withdraw:** Storage.remove ПЕРЕД DELETE row. Если первое падает — второе не выполняется.
- **No new deps:** все пакеты уже в `package.json` (`expo-image-picker`, `expo-image-manipulator`, `react-hook-form`, `zod`, `phosphor-react-native`, `@tanstack/react-query`). `npm install` не требуется.

## 8. Out of Scope (explicit)

Следующие пункты **сознательно НЕ входят** в данный RPI и отложены в отдельные задачи:

- **Админка для обработки pending-очереди.** Модератор работает через Supabase Dashboard. Отдельный RPI запланирован после launch — см. `docs/VERIFICATION.md` § Admin UI (planned).
- **Email-уведомления** о результате проверки. Нарушает CLAUDE.md правило №6. Никогда.
- **Push-уведомления** о результате (approved/rejected). Push-стек ещё не построен, отдельный Sprint 2 будет.
- **Sort-boost для verified в каталоге.** Отложено до >0 проверенных мастеров и анализа conversion-lift (90-day метрика выше).
- **Higher verification levels** (`verification_level >= 2`): прописка, статус самозанятого, ИП, проф.сертификаты. Схема уже поддерживает, UI и admin-flow — отдельные RPI после launch.
- **iOS/Android NFC паспорт-скан / liveness detection.** Overkill для MVP, требует native-модули и платных SDK. Не нужно для RU-marketplace.
- **`expo-camera` со встроенной face-detection для селфи.** Стандартный `expo-image-picker` ActionSheet (Camera / Library) достаточен.
- **Background GC для orphan Storage файлов.** Immediate cleanup на withdraw в scope (Story 9). Периодический GC для случаев "файл загружен, INSERT упал" — Sprint 2 (rare edge case, защищён try/catch в submit).
- **DB-level rate-limit на re-submit.** Client-side 60-минутный cooldown достаточен для MVP. Если появится abuse — отдельная миграция.
- **A/B-тест бейджа** (показывать / не показывать у части юзеров). Метрику conversion-lift собираем cohort-сравнением verified vs unverified, не randomization.
- **Перевод существующих legal-текстов на новые** — disclaimer-чекбокс ссылается на действующую Privacy Policy (`/profile/privacy`), не создаём новый legal-документ.

## 9. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Moderation throughput stagnation** — один модератор через Dashboard, SLA «1–2 дня» может уплыть в 7+ | Medium | (a) расширенная SLA-копия «обычно 1–3 дня, до 5 рабочих дней» в UI; (b) post-launch P1: DB-trigger → Telegram webhook о новых pending; (c) внутренний канонический список rejection-reasons чтобы admin не тратил время на формулировки. |
| **EXIF metadata leak** — фото паспорта с GPS-тегом утечёт админу или (хуже) клиенту через signed URL | Medium | Empirical test в Phase 1 implement: загрузить фото с известным GPS-тегом, прогнать через `manipulateAsync({ format: 'jpeg', compress: 0.82 })`, проверить exiftool'ом / EXIF-парсером в браузере. JPEG re-encode обычно стрипит. Если нет — 30–100 строк ручного strip через canvas (P1 follow-up, не блокирует launch). |
| **Partial-upload orphans** — селфи загрузился, паспорт упал на сети, в Storage висит мусор | Medium | Atomic-rollback в `useSubmitVerification`: try/catch вокруг upload passport, в catch — `storage.remove([selfiePath])` перед re-throw. Если и `remove` падает — лог в console, файл остаётся (rare double-failure), RLS защищает от чужого доступа. |
| **Unverified-master conversion penalty** — после ввода бейджа отсутствие бейджа читается как «подозрительный» | Medium | (a) 2-недельная push-to-verify кампания мастерам перед тем как badge станет prominent в card-list; (b) опция: badge только на detail-screen первые 30 дней, в карточках включаем когда ≥30% verified; (c) контент-стратегия «нет бейджа ≠ непроверен» в FAQ. |
| **First production invocation of `sync_master_verification_level` trigger** — функция в проде неделю без traffic | Low | End-to-end demo-master cycle в Phase 2 (submit → admin approves через Dashboard → проверка `master_profiles.verification_level=1` → проверка badge на `/master/[id]`). Если триггер сломан — поправить миграцией 0071 до launch. |
| **`createSignedUrl` TTL race на approved screen** | Low | TTL 3600s + staleTime 50min + refetchOnFocus. Юзер уйдёт со screen раньше чем TTL истечёт. |
| **Re-submit loop spam после rejection** | Low | 60-минутный client-side cooldown в `useSubmitVerification` (Story 8). DB-level rate-limit отложен в out-of-scope. |
| **Storage Bucket privacy regression** — если кто-то по ошибке создаст public-URL helper | Low | Code-review гейт: grep `getPublicUrl.*master-verifications` в PR обязателен (zero matches). Документируем в `docs/VERIFICATION.md`. |
| **Concurrent double-tap "Отправить"** | Low | `useMutation.isPending` дизейблит кнопку. |
| **State drift после admin approve через Dashboard** | Low | `staleTime: 60s` + `refetchOnFocus` обновляет query при возврате на screen. Если мастер не выходил со screen — 60s стейл, потом refetch. |
| **Rejection-reason shame UX** — admin пишет в свободной форме, может быть резко | Low | Internal canonical list rejection-reasons в `docs/VERIFICATION.md` (blur / partial / wrong document / face mismatch / glare / cropped / other). Admin копирует канонические формулировки. |

## 10. Priority

**Critical (P0) — launch blocker для App Store / Google Play submission.**

Три причины:

1. Каталог без verified-badge — анонимный список незнакомцев. Клиент не отдаст предоплату, conversion обвалится. Это документировано в REQUEST.md, RESEARCH.md и PRODUCT_BLINDSPOTS.md как launch-критичная проблема.
2. Backend жив в проде неделю без single UI consumer — `connect-the-dots` violation. Каждый день промедления = риск что в триггере или RLS spot-bug обнаружится только при первом реальном approval (после launch, на live-юзере).
3. Конкурентный паритет с Profi.ru / YouDo: на момент 2026-05-20 они оба показывают verified badge как стандарт, отсутствие у нас читается как «недоделанный продукт».

## 11. Stakeholder Alignment

**User-owner (Руслан, владелец проекта):** подтвердил все 6 conditions для proceed из RESEARCH.md § «Conditions for Proceeding to /rpi:plan»:

1. ✅ Storage cleanup on withdraw IS в scope (PII compliance).
2. ✅ «Подробнее» на approved-карточке открывает read-only `/profile/verification` — без отдельного маршрута.
3. ✅ 60-минутный client-side re-submit cooldown.
4. ✅ SLA-копия расширена до «обычно 1–3 дня, до 5 рабочих дней».
5. ✅ Lazyweb-first обязателен — planner и implementer делают запросы по форме и бейджу до UI-кода.
6. ✅ EXIF check empirical в Phase 1 implement (не research-блокер).

**PM verdict (research):** Critical for launch. Trust-сигнал в каталоге = conversion driver.

**Engineering feasibility (research):** HIGH. Zero new dependencies, все примитивы в codebase (image-upload, mutation-pattern, BottomSheet, EmptyState, Skeleton, useThemeColors). Effort ~6h focused, 6 новых файлов + 3 модифицированных, ~700–900 строк. Backend полностью готов и не трогается.

**CTO verdict (research):** GO with High confidence. Strategic alignment с every constitutional principle. No reason to defer, one strong reason to act now (each day without UI = day backend trigger is untested in real flow + day catalog ships without decisive trust signal).

**Hand-off:** PM → UX agent (`ux.md`) → Engineering agent (`eng.md`) → `PLAN.md` aggregator → `/rpi:implement` in 3 phases.
