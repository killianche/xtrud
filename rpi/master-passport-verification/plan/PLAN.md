# Implementation Plan — Master Passport Verification (UI)

**Feature:** `master-passport-verification`
**Created:** 2026-05-20
**Phase:** RPI Step 3 — Plan (post-Research GO verdict)
**Source docs:** [REQUEST.md](../REQUEST.md) · [RESEARCH.md](../research/RESEARCH.md) · [pm.md](pm.md) · [ux.md](ux.md) · [eng.md](eng.md) · [docs/VERIFICATION.md](../../../docs/VERIFICATION.md)

---

## TL;DR

3 фазы по ~2/2.5/1.5 часа, итого ~6h focused. **Никаких новых пакетов**, миграции БД (0070) уже применены, всё backend готово. UI закрывает documented `connect-the-dots` violation.

| Phase | Focus | Effort | Deliverable | Validation gate |
|---|---|---|---|---|
| **Phase 1** | Foundations: 4 hooks + badge + EXIF test | ~2h | Контракты определены, TS clean, EXIF подтверждён или зафиксирован риск | `tsc --noEmit`, EXIF empirical-test pass |
| **Phase 2** | Screen + nudge — основной user-flow | ~2.5h | Submit→pending→approved cycle работает end-to-end через Dashboard | Preview MCP: 5 ручных сценариев из eng.md §10 |
| **Phase 3** | Badges + docs — feature complete | ~1.5h | Badge в карточках + детали + документация закрыта | Preview MCP: badge виден в light/dark, документы обновлены |

**Critical path:** Phase 1 → Phase 2 → Phase 3. Параллелизация внутри фаз ограничена (~30% задач можно делать параллельно — см. §"Parallelization").

---

## Pre-flight checks (do before Phase 1)

- [ ] **Branch ready:** убедиться что текущая ветка чистая или создать feature branch (`git checkout -b feat/master-passport-verification`).
- [ ] **Demo accounts:** `+7 900 000-00-03` (Руслан Хамхоев) подходит для master-side тестирования. `+7 900 000-00-01` (Алина) — для client-side просмотра badge. Из [DEMO_ACCOUNTS.md](../../../DEMO_ACCOUNTS.md).
- [ ] **Preview MCP server running:** `xtrud-web` запущен через `preview_start`.
- [ ] **Supabase Dashboard access:** для ручной модерации в Phase 2/3.
- [ ] **Lazyweb queries done:** 5 запросов из [ux.md §2](ux.md) выполнены, скриншоты залогированы в implement лог.
- [ ] **Read:** [pm.md](pm.md), [ux.md](ux.md), [eng.md](eng.md) полностью до старта Phase 1.

---

## Phase 1 — Foundations (~2h)

**Цель:** контракты hooks + Badge компонент + EXIF empirical test. **Никаких видимых пользователю изменений.** Если кто-то откроет приложение в середине Phase 1 — он ничего не заметит.

### Tasks

| # | Task | File | Complexity | Depends on |
|---|---|---|---|---|
| 1.1 | Создать папку `src/features/master-verification/` | folder | Low | — |
| 1.2 | `verification-preset.ts` — VERIFICATION_PRESET (maxDim 1600, compress 0.82, format jpeg) | new | Low | 1.1 |
| 1.3 | `verification-schema.ts` — zod schema (`agreed: true`, `selfiePresent`, `passportPresent`) | new | Low | 1.1 |
| 1.4 | `use-my-verification.ts` — query (`maybeSingle()`, key `["my-verification", userId]`, staleTime 60s) | new | Medium | 1.1 |
| 1.5 | `use-verification-preview-urls.ts` — query `createSignedUrl(path, 3600)` для обоих фото, staleTime 50min | new | Medium | 1.1, 1.4 |
| 1.6 | `use-submit-verification.ts` — mutation с atomic rollback (см. [eng.md §4.2](eng.md)) | new | High | 1.1, 1.2, 1.3, 1.4 |
| 1.7 | `use-withdraw-verification.ts` — mutation (remove() **до** DELETE row) | new | Medium | 1.1, 1.4 |
| 1.8 | `src/components/VerificationBadge.tsx` — компонент с variant `chip` / `icon-only` | new | Low | — |
| 1.9 | **EXIF empirical test** — pick photo с GPS-тегом, прогнать через manipulateAsync, проверить отсутствие EXIF блоков в выходе | one-off script | Medium | 1.2 |
| 1.10 | TypeScript check: `npx tsc --noEmit` clean | shell | Low | все выше |
| 1.11 | Lint check: `npx biome check src/features/master-verification/ src/components/VerificationBadge.tsx` clean | shell | Low | все выше |

### Параллелизация в Phase 1

- 1.2 + 1.3 + 1.8 — независимы (можно делать одновременно).
- 1.4, 1.5, 1.6, 1.7 — последовательно (зависят друг от друга по invalidation keys).
- 1.9 (EXIF test) — независим от хуков, делать одновременно с 1.4–1.7.

### Success criteria — Phase 1

- [ ] `tsc --noEmit` exits 0.
- [ ] `biome check` экранов из этой фазы — без error/warning.
- [ ] `<VerificationBadge level={1} variant="chip" />` рендерится в Expo Snack-минимальном scenario (или просто React-render в screen-stub).
- [ ] EXIF empirical test:
  - **Pass case (default):** обычное JPEG re-encode стрипит EXIF — продолжаем без extra code.
  - **Fail case:** EXIF остаётся → зафиксировать в [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) §"Known limitations", открыть P1-задачу "EXIF strip workaround for verification uploads", **не блокировать Phase 2**.
- [ ] Все 4 хука имеют console.error в catch блоках mutationFn (audit trail для будущего debugging).

### Validation gate before Phase 2

- TS + lint clean.
- Empirical EXIF test done (pass или зафиксирован риск).
- Хук-контракты соответствуют [eng.md §4](eng.md).

---

## Phase 2 — Screen + nudge (~2.5h)

**Цель:** видимый пользователю flow — master может пройти полный happy path и через Dashboard получить approval. Visible launch-блокирующая часть.

### Pre-Phase-2 (mandatory) — Lazyweb research

Прежде чем писать UI код — выполнить 5 Lazyweb запросов из [ux.md §2](ux.md):

1. `"passport verification form mobile"` — для layout формы /profile/verification.
2. `"verified badge marketplace profile"` — для chip и icon-only badge.
3. `"id document upload selfie passport"` — для двойного UploadSlot UX.
4. `"status badge pending approved rejected"` — для 4-state card на /profile.
5. `"cooldown timer resubmit form"` — для 60-min cooldown UI.

**Залогировать в implement лог:** запрос, кол-во просмотренных скриншотов, какие паттерны переиспользую, что осознанно делаю иначе.

### Tasks

| # | Task | File | Complexity | Depends on |
|---|---|---|---|---|
| 2.1 | Lazyweb research — 5 queries | external | Medium | Phase 1 done |
| 2.2 | Создать `app/(tabs)/profile/verification.tsx` — единый route, 4 status branches (см. [ux.md §5B-E](ux.md)) | new | High | 2.1, Phase 1 |
| 2.3 | UploadSlot подкомпонент (внутри verification.tsx) — image-picker + preview + remove | inline | Medium | 2.2 |
| 2.4 | Form integration — react-hook-form + zod (agreed checkbox + presence flags) | inside 2.2 | Medium | 2.2, 1.3 |
| 2.5 | Cooldown UI — 60min countdown через `submitted_at + 60min` (см. [ux.md §5B](ux.md) cooldown variant) | inside 2.2 | Medium | 2.2 |
| 2.6 | `<VerificationNudge>` подкомпонент — 4 status states (см. [ux.md §5A](ux.md)) | new (inline) | Medium | Phase 1 |
| 2.7 | Вставить `<VerificationNudge>` в [app/(tabs)/profile/index.tsx](../../../app/(tabs)/profile/index.tsx) ~line 551 после Portfolio CTA, before theme switcher | modify | Low | 2.6 |
| 2.8 | Empty / Loading / Error states (см. [ux.md §6](ux.md)) для всех 4 status branches | inside 2.2 | Medium | 2.2 |
| 2.9 | Dark mode проверка (preview screenshot в light + dark) | manual | Low | 2.7 |
| 2.10 | End-to-end manual flow через Dashboard: submit → pending → approve via SQL → app sees approved | manual | Medium | 2.7 |
| 2.11 | Re-submit cycle: status=rejected → re-submit → status=pending | manual | Medium | 2.10 |
| 2.12 | Withdraw cycle: status=pending → "Отозвать" → confirm → row+files удалены | manual | Medium | 2.10 |
| 2.13 | Cooldown verification: re-submit в течение часа → button disabled с countdown | manual | Low | 2.11 |
| 2.14 | TS check + Biome lint | shell | Low | все |

### Параллелизация в Phase 2

- 2.1 (Lazyweb) можно начать ДО окончания Phase 1.
- 2.6 + 2.7 (Nudge insertion) можно делать параллельно с 2.2-2.5 (verification screen).
- Manual tests 2.10-2.13 — последовательно (зависят от состояния).

### Success criteria — Phase 2

- [ ] Master в demo-аккаунте проходит: открыть `/profile` → видит nudge "Подтвердите личность" → tap → `/profile/verification` → загружает 2 фото → submit → видит pending card с превью.
- [ ] Admin вручную через Supabase Dashboard SQL: `UPDATE master_verifications SET status='approved' WHERE user_id=...` → app (после focus-refresh) показывает "Паспрот подтверждён".
- [ ] Admin: `UPDATE ... SET status='rejected', rejection_reason='Фото размыто'` → app показывает rejected banner + form для re-submit.
- [ ] Re-submit работает → status=pending.
- [ ] Withdraw из pending: row deleted + Storage objects deleted (проверить в Dashboard).
- [ ] Cooldown: повторный submit в течение 60min блокирован с видимым countdown.
- [ ] Light + dark mode — preview screenshots для каждой из 4 status state.
- [ ] TS + lint clean.
- [ ] **8 grep-чеков из [design-enforcement.md](../../../.claude/rules/design-enforcement.md)** — все pass.

### Validation gate before Phase 3

- Все 5 manual flow tests pass.
- Lazyweb research зафиксирован в implement лог.
- Design-enforcement 8 grep-чеков pass.

---

## Phase 3 — Badges + docs (~1.5h)

**Цель:** Badge виден другим пользователям (клиентам в каталоге, на master detail). Feature становится visible в публичной части продукта.

### Tasks

| # | Task | File | Complexity | Depends on |
|---|---|---|---|---|
| 3.1 | Вставить `<VerificationBadge variant="chip" />` в [app/(tabs)/master/[id].tsx](../../../app/(tabs)/master/[id].tsx) — trust-row ~line 135, when `verification_level >= 1` | modify | Low | Phase 1 (Badge) |
| 3.2 | Вставить `<VerificationBadge variant="icon-only" />` в [src/components/MasterPreviewCard.tsx](../../../src/components/MasterPreviewCard.tsx) ~line 73 (horizontal variant) | modify | Low | Phase 1 |
| 3.3 | MasterPreviewCard row-variant — те же изменения (если структура другая) | modify | Low | 3.2 |
| 3.4 | Проверить badge propagation в потребителях: home (top-masters), search results, masters-by-l2 grid — если они используют MasterPreviewCard, ничего больше делать не нужно | verify | Low | 3.2 |
| 3.5 | Light + dark mode skinshots: `/master/{verified_id}`, `/search`, home feed | manual | Low | 3.4 |
| 3.6 | Update [STATUS.md](../../../STATUS.md) — новая запись §"Текущее состояние" с feature done | modify | Low | 3.4 |
| 3.7 | Update [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) — закрыть §"UI flow (planned — часть 2)", переименовать на "UI flow (shipped 2026-05-20)" | modify | Low | 3.4 |
| 3.8 | Create [SESSION_SUMMARY_2026-05-20.md](../../../SESSION_SUMMARY_2026-05-20.md) (или дописать если уже есть) — секция о verification feature | new/modify | Medium | 3.6, 3.7 |
| 3.9 | Update [.claude/rules/connect-the-dots.md](../../../.claude/rules/connect-the-dots.md) §"Известные случаи" — добавить "2026-05-20: closed master_verifications UI gap" | modify | Low | 3.4 |
| 3.10 | TS check + Biome lint final pass | shell | Low | все |
| 3.11 | Все 8 grep-чеков [design-enforcement.md](../../../.claude/rules/design-enforcement.md) — final pass | shell | Low | все |

### Параллелизация в Phase 3

- 3.1, 3.2, 3.3 — независимы, делать параллельно (3 разных файла).
- 3.6, 3.7, 3.8, 3.9 — независимы (4 разных doc файла).

### Success criteria — Phase 3

- [ ] Открыть `/master/{verified_id}` (мастер с verification_level=1 из Phase 2 тестов) → видеть chip "Паспорт подтверждён" в trust-row.
- [ ] Открыть `/search` → найти этого мастера → видеть icon-only SealCheck рядом с именем в карточке.
- [ ] Light + dark mode — каждый скриншот.
- [ ] STATUS.md обновлён.
- [ ] docs/VERIFICATION.md часть 2 закрыта.
- [ ] SESSION_SUMMARY_2026-05-20.md содержит feature summary.
- [ ] connect-the-dots.md "Known cases" обновлён.
- [ ] TS + lint final pass.
- [ ] **8 grep-чеков pass.**

### Final validation gate

- [ ] Master happy path (Phase 2 manual cycle) — повторно прогнан с уже approved=true: badge виден везде.
- [ ] Client UX: открыть demo-клиент аккаунт `+7 900 000-00-01` → перейти на `/master/{verified_id}` → видеть полный chip "Паспорт подтверждён".
- [ ] No regressions: остальные мастера без verification (verification_level=0) не показывают badge.
- [ ] PII safety re-check: открыть DevTools Network на /profile/verification → подтвердить что URL изображений это signed URL (содержит `?token=...`), не publicUrl.

---

## Cross-cutting requirements

(применяются ко всем фазам, валидируются на каждом validation gate)

### PII Safety

- Storage bucket `master-verifications` остаётся `public=false`.
- ВСЕ превью через `createSignedUrl(path, 3600)`. **Никогда `getPublicUrl()`** для verification файлов.
- Rollback при partial upload (`storage.remove([selfiePath])` при ошибке uploadа паспорта).
- `useWithdrawVerification` вызывает `storage.remove([selfie, passport])` **до** `DELETE row`.
- НИКАКОГО логгирования signed URLs в analytics / Sentry.

### Design Quality (enforcement rules)

Перед каждым commit прогнать 8 grep-чеков из [design-enforcement.md](../../../.claude/rules/design-enforcement.md):

1. Subtitle под H1 (правило §G).
2. Inline hex `color="#..."`.
3. Lucide imports в новом коде.
4. Шрифт < 12px.
5. Пустые onPress.
6. bg-primary без text-on-primary.
7. ScreenHeader.subtitle.
8. BottomSheet.subtitle.

### Testing convention

- xtrud НЕ использует автотесты для UI screens.
- Validation = TS check + biome lint + manual Preview MCP verification + screenshot in light/dark.
- Phase 2/3 manual flows документированы выше — выполнить каждый, отметить в implement лог.

### Russian copy only

Никакой i18n инфраструктуры не добавлять. Все строки inline на русском. Точный copy — в [ux.md §8 (copy table)](ux.md).

### Documentation discipline

После Phase 3:
- STATUS.md новая запись с датой 2026-05-20.
- docs/VERIFICATION.md "часть 2 — frontend" → "shipped 2026-05-20".
- SESSION_SUMMARY_2026-05-20.md — секция о verification со ссылками на 4 plan-файла + 1 research-файл.
- connect-the-dots.md "Known cases" — новый item.

---

## Risk hot-list (top 5 для implement phase)

| # | Risk | Severity | Mitigation in plan |
|---|---|---|---|
| 1 | **EXIF не стрипится JPEG re-encode** | Medium | Phase 1 task 1.9 — empirical test. Если fail → P1 follow-up, accept residual risk, document. |
| 2 | **Partial-upload orphan** (selfie ok, passport fails) | Medium | `useSubmitVerification` (eng.md §4.2) делает `remove(selfiePath)` перед throw. |
| 3 | **Storage cleanup on withdraw race** | Medium | `useWithdrawVerification` (eng.md §4.4) — remove() **до** DELETE. Если remove fails, файл RLS-isolated. |
| 4 | **createSignedUrl первый раз в кодовой базе** | Low | API простой; staleTime 50min < TTL 60min гарантирует refresh. |
| 5 | **Moderation throughput** (operational, не technical) | High | Не в scope этой RPI. Widened SLA copy "1–3 дня, до 5 рабочих дней" в [ux.md](ux.md). Telegram webhook — P1 follow-up. |

---

## Out of scope (явно НЕ делать в этой RPI)

См. [pm.md §8](pm.md). Кратко:
- Admin queue UI / moderation tooling.
- Email / push notifications о результате.
- Sort-boost для verified в каталоге.
- `verification_level >= 2` (прописка / юр.лицо / проф.сертификаты).
- NFC / liveness detection.
- Periodic GC orphan Storage files.
- DB-level rate-limit на re-submit.

---

## How to start implementation

```bash
# 1. Branch
git checkout -b feat/master-passport-verification

# 2. Verify pre-flight
ls rpi/master-passport-verification/plan/   # должны быть pm.md, ux.md, eng.md, PLAN.md
git status                                  # clean

# 3. Запустить /rpi:implement
/rpi:implement master-passport-verification
```

`/rpi:implement` пройдёт по этому PLAN.md фазу за фазой с validation gate между ними.

---

## Appendix — Cross-references

- [REQUEST.md](../REQUEST.md) — original feature description.
- [RESEARCH.md](../research/RESEARCH.md) — GO verdict + risks.
- [pm.md](pm.md) — product requirements, user stories, acceptance criteria.
- [ux.md](ux.md) — Lazyweb plan, IA, flows, screen specs, copy table.
- [eng.md](eng.md) — file structure, hook contracts, PII safety, error matrix.
- [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) — backend reference.
- [.claude/rules/design-quality.md](../../../.claude/rules/design-quality.md) — UI quality bar.
- [.claude/rules/design-enforcement.md](../../../.claude/rules/design-enforcement.md) — 8 grep-чеков + protocol.
- [.claude/rules/connect-the-dots.md](../../../.claude/rules/connect-the-dots.md) — "Известные случаи" — этот RPI закроет.
