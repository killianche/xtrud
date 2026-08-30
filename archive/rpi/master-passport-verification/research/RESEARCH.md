# Research Report — Master Passport Verification (UI)

**Feature slug:** `master-passport-verification`
**Date:** 2026-05-20
**Phase:** RPI Step 2 — Research (GO/NO-GO gate)
**Source:** [rpi/master-passport-verification/REQUEST.md](../REQUEST.md)
**Backend spec:** [docs/VERIFICATION.md](../../../docs/VERIFICATION.md)

---

## Executive Summary

**Recommendation: GO. Confidence: High.**

The backend for master passport verification has been live in production since 2026-05-15 (migration 0070: `master_verifications` table, RLS, private Storage bucket, triggers) with **zero UI consumers** — a textbook `connect-the-dots.md` violation that the project constitution explicitly forbids. The proposed UI work has HIGH technical feasibility (no new dependencies, all primitives exist), HIGH product viability (Profi.ru/YouDo canonical pattern, launch-critical trust differentiation), and a clean constitutional alignment check.

Effort estimate: **~6 hours focused** for 6 new files + 3 modified, ~700–900 lines. Phased in 3 increments (foundations / screen+nudge / badges).

The single biggest risk is **operational** (manual moderation throughput via Supabase Dashboard) — mitigated by widened SLA copy and a planned post-launch Telegram webhook from a DB trigger. Other risks (EXIF leak, partial-upload orphans, perception penalty for unverified masters) are addressable inside this RPI's scope.

---

## Feature Overview

| Field | Value |
|---|---|
| **Name** | Master Passport Verification (UI) |
| **Type** | Trust / Identity (optional for master, visible to all) |
| **Component** | `app/(tabs)/profile/verification.tsx` (new), `src/features/master-verification/` (new), badge integrations |
| **Complexity** | Medium |
| **Priority** | Critical (launch blocker) |
| **Backend state** | Fully shipped 2026-05-15 — do NOT touch |
| **Frontend state** | Absent — clean slate |

---

## Requirements Summary

### Functional

1. **Master can submit a verification request** (selfie + passport main page).
2. **Master sees current status** (`not_submitted` / `pending` / `approved` / `rejected`) on `/profile` as a contextual card.
3. **Master can re-submit after rejection** with the rejection reason visible.
4. **Master can withdraw a pending request** (DELETE row + Storage cleanup).
5. **Master can view submitted documents** read-only (signed URLs, TTL 1h) on `/profile/verification` in pending/approved states.
6. **Clients and other users see a "Паспорт подтверждён" badge** on `/master/[id]` (inline chip) and in card lists (icon-only).
7. **State machine is consistent** with backend RLS — `INSERT` only when row absent, `UPDATE` only `rejected → pending`, `DELETE` always allowed.

### Non-functional

- **PII safety:** private Storage bucket, signed URLs ≤ 3600s, no `getPublicUrl` for verification documents, explicit Storage cleanup on withdraw, EXIF empirically validated.
- **TS clean:** `npx tsc --noEmit` passes.
- **Dark theme:** all 4 states render correctly in both themes.
- **No email** (CLAUDE.md rule №6).
- **Icons:** Phosphor only (`SealCheck` weight=fill).
- **No subtitle under H1** (design-quality rule G).
- **RU copy only** (no i18n layer).
- **No new packages** — all dependencies already in `package.json`.

---

## Product Analysis

### User value

| Stakeholder | Impact | Justification |
|---|---|---|
| **Client** | **High** | Single most decisive trust signal before contacting a stranger. Without it, every master reads as anonymous. |
| **Master** | **Medium** | Delayed payoff (no sort-boost yet). Motivation is competitive ("Profi.ru has it") and reputational. Adoption may be slower than backend assumes. |
| **Platform** | **High** | Catalog conversion lift, dispute reduction, future sort-boost lever already DB-ready. Closes a documented launch blocker. |

### Market fit

Profi.ru and YouDo both run essentially this flow (selfie + passport main page → manual moderation → badge). The REQUEST.md correctly mirrors that canonical RU/CIS pattern. TaskRabbit/Thumbtack-style background check is explicitly excluded (US-specific, SSN-based, out of reach for Ingushetia).

### Constitutional alignment

| Principle | Status | Note |
|---|---|---|
| Phone-only (rule №6) | ✅ Aligned | No email anywhere in spec. |
| No empty stubs / production-ready quality | ✅ Aligned | All 4 status branches, all badge surfaces, empty/loading/error states in scope. |
| Connect-the-dots | ✅ Aligned (this IS the fix) | Backend live 1 week, zero UI — canonical case. |
| RU-only copy | ✅ Aligned | No i18n attempted. |
| No subtitle under H1 (design-quality G) | ✅ Aligned | Explicitly called out in REQUEST. |
| Phosphor icons only | ✅ Aligned | `SealCheck` weight=fill specified. |
| Lazyweb-first for new UI | ⚠️ Not explicit | **Must be added in `/rpi:plan` phase** for the verification form layout and approved-card display. |

### Product risks (with mitigations)

1. **Manual moderation throughput.** No admin queue UI — moderator uses Supabase Dashboard. SLA "1–2 рабочих дня" may slip to 7+. Mitigation: (a) widen copy to "обычно 1–3 дня, до 5 рабочих дней"; (b) post-launch Telegram webhook from DB trigger on `status='pending'` insert.
2. **Re-submit loop spam.** Rejected master can resubmit indefinitely. Mitigation: 60-minute client-side cooldown (in `useSubmitVerification`).
3. **Unverified-master conversion penalty.** Badge presence makes badge absence read as "suspicious". Mitigation: 2-week push-to-verify campaign before badges become prominent on list cards; consider badge-on-detail-only until ~30% verified.
4. **EXIF leak (PII).** `expo-image-manipulator` re-encoding via JPEG *typically* strips EXIF; needs empirical confirmation during implementation.
5. **Rejection-reason shame.** Free-text field — admin must follow neutral-tone guidance. Document canonical rejection-reason list internally for now (no admin UI in scope).

### Product viability score

**High.** Backend is fully battle-tested at the schema/RLS/Storage layer; only the UI gap remains. Reference flow is canonical (Profi.ru) so no UX-invention risk. Scope is well-bounded. Effort concentrated in known patterns the codebase already has.

---

## Technical Discovery (Phase 2.5)

### Backend confirmation (read only — do NOT touch)

- Migration: [supabase/migrations/0070_master_verifications.sql](../../../supabase/migrations/0070_master_verifications.sql) (applied 2026-05-15).
- Table `master_verifications` columns: `user_id PK`, `status` (enum), `selfie_path`, `passport_main_path`, `submitted_at`, `reviewed_at` (null), `reviewed_by` (null), `rejection_reason` (null).
- RLS (lines 91–140):
  - `master_verifications_owner_select` (SELECT own).
  - `master_verifications_owner_insert` (INSERT only `status='pending'` + reviewed_* IS NULL).
  - `master_verifications_owner_resubmit` (UPDATE only `rejected → pending`).
  - `master_verifications_owner_delete` (DELETE own).
- Triggers (lines 146–202): `sync_master_verification_level` (`approved → master_profiles.verification_level=1`, unapprove → 0); `reset_verification_level_on_delete`.
- Storage bucket `master-verifications` (PRIVATE, lines 209–252) with RLS enforcing `(storage.foldername(name))[1] = auth.uid()::text`.
- TS types: [src/types/database.ts:600-627, 1775, 1975](../../../src/types/database.ts).

### Surface area (where UI lands)

| File | Action | Approx line |
|---|---|---|
| [app/(tabs)/profile/index.tsx](../../../app/(tabs)/profile/index.tsx) | Insert `<VerificationNudge />` after Portfolio CTA | ~551 |
| [app/(tabs)/master/[id].tsx](../../../app/(tabs)/master/[id].tsx) | Insert `<VerificationBadge variant="chip" />` in trust-row | ~135 |
| [src/components/MasterPreviewCard.tsx](../../../src/components/MasterPreviewCard.tsx) | Insert `<VerificationBadge variant="icon-only" />` after name | ~73 |
| [app/(tabs)/profile/verification.tsx](../../../app/(tabs)/profile/) | NEW route (sibling of `edit-master.tsx`, `settings.tsx`) | — |

### Reusable infrastructure (do NOT reinvent)

- **Image upload:** [src/lib/image-upload.ts](../../../src/lib/image-upload.ts) — `pickImage()` with camera/gallery ActionSheet, AVATAR_PRESET (512px), PORTFOLIO_PRESET (1920px). Need new `VERIFICATION_PRESET` (1600px, quality 0.82).
- **Upload mutation pattern:** [src/features/uploads/use-upload-image.ts](../../../src/features/uploads/use-upload-image.ts) — mirror `useUploadAvatar(userId)` / `useUploadPortfolioImage(userId)`.
- **Auth:** [src/features/auth/use-auth-session.ts](../../../src/features/auth/use-auth-session.ts) — `useAuthSession()` → `session.user.id`.
- **Supabase client:** [src/lib/supabase.ts](../../../src/lib/supabase.ts).
- **TanStack Query v5 conventions:** seen in [src/features/profile/use-my-portfolio.ts](../../../src/features/profile/use-my-portfolio.ts) — key `["entity", id]`, invalidation via `useQueryClient`.
- **UI primitives:** `BottomSheet`, `Card`, `ScreenHeader`, `Avatar`, `EmptyState`, `Skeleton` — all in `src/components/ui/`.
- **Theme colors:** [src/lib/use-theme-color.ts](../../../src/lib/use-theme-color.ts) — `useThemeColors(["success", "error", ...])`. Tokens for `success`/`error`/`warning` in [src/lib/colors.ts](../../../src/lib/colors.ts).

### Gaps (first-in-codebase or absent primitives)

- **`createSignedUrl` is not yet used anywhere** in `src/`. This feature is the first. One-line Supabase JS API — no risk, but document the pattern so it can be reused.
- **No toast/snackbar system.** Codebase uses `Alert.alert()`. Acceptable for MVP — success/error use Alert.
- **No automated test suite for screens** — visual verification via Claude Preview MCP is the convention.
- **No i18n.** All RU strings hardcoded.

---

## Technical Approach

### New files (6)

```
src/features/master-verification/
  use-my-verification.ts            # query → Tables<"master_verifications"> | null
  use-submit-verification.ts        # mutation (atomic upload with rollback)
  use-verification-preview-urls.ts  # query → signed URLs (TTL 3600s)
  use-withdraw-verification.ts      # mutation (remove() Storage BEFORE DELETE row)
  verification-preset.ts            # VERIFICATION_PRESET = { maxDim: 1600, compress: 0.82 }
  verification-schema.ts            # zod: { agreed: true, selfieUri, passportUri }

src/components/VerificationBadge.tsx  # <VerificationBadge level={0|1|2} variant="chip"|"icon-only" />
app/(tabs)/profile/verification.tsx   # single route, 4 status branches
```

### Modified files (3)

- [app/(tabs)/profile/index.tsx](../../../app/(tabs)/profile/index.tsx) — insert nudge card around line 551.
- [app/(tabs)/master/[id].tsx](../../../app/(tabs)/master/[id].tsx) — insert chip badge around line 135 (trust-row).
- [src/components/MasterPreviewCard.tsx](../../../src/components/MasterPreviewCard.tsx) — insert icon-only badge after name (~line 73) for both variants.

### Hook contracts

```ts
function useMyVerification(): UseQueryResult<Tables<"master_verifications"> | null>
// queryKey: ["my-verification", userId], staleTime: 60_000, refetchOnFocus: true

function useSubmitVerification(): UseMutationResult<void, Error, { selfieUri: string; passportUri: string }>
// 1. resize both via VERIFICATION_PRESET
// 2. upload selfie → `${userId}/selfie-${unix_ts}.jpg`
// 3. upload passport → `${userId}/passport-${unix_ts}.jpg`
//    ON ERROR after step 2: storage.remove([selfiePath]) → throw
// 4. supabase.from("master_verifications").upsert({...}, { onConflict: "user_id" })
// 5. invalidate ["my-verification"], ["master-profile", userId]

function useVerificationPreviewUrls(row: Row | null): { selfieUrl, passportUrl, isLoading }
// supabase.storage.from("master-verifications").createSignedUrl(path, 3600)
// queryKey: ["verification-preview-urls", row?.user_id], staleTime: 3_000_000 (50min)

function useWithdrawVerification(): UseMutationResult<void, Error, void>
// 1. storage.remove([selfie_path, passport_path])    ← BEFORE row delete
// 2. supabase.from("master_verifications").delete().eq("user_id", userId)
// 3. trigger reset_on_delete → verification_level = 0
// 4. invalidate ["my-verification"], ["master-profile", userId]
```

### Screen branching (`/profile/verification`)

```
data === null                  → submission form (zod + react-hook-form)
data.status === "pending"      → status card + previews + "Отозвать"
data.status === "approved"     → success card + read-only previews + "Документы хранятся защищённо"
data.status === "rejected"     → red banner with reason + previews + "Подать повторно" (form mode=resubmit)
```

### Alternatives rejected

- **Camera-only selfie via `expo-camera` + face-detect** — out of scope for MVP. Use standard `expo-image-picker` ActionSheet.
- **Two separate mutations per photo** — atomic preferred. Avoids orphan Storage objects on partial failure. Trade-off: no per-photo progress bar; acceptable at <5s broadband.
- **Two separate screens (form + status)** — single screen with branches preferred. Matches Expo Router sibling-route convention, avoids `router.replace` churn.
- **`getPublicUrl` with obscure path** — rejected. Bucket is private by design; `createSignedUrl(3600)` is the correct primitive.

---

## Risk Analysis & Mitigations

### Technical risks

| Risk | Severity | Mitigation |
|---|---|---|
| EXIF metadata leak (PII) | Medium | Empirical test in Phase 1 of impl: pick photo with GPS tag, push through `manipulateAsync({ format: 'jpeg', compress: 0.82 })`, verify no EXIF. JPEG re-encode typically strips. If not clean → 30–100 line workaround as P1 follow-up. |
| Partial-upload orphans (selfie ok, passport fails) | Medium | `useSubmitVerification` wraps uploads in try/catch; on failure after step 1, `storage.remove([selfiePath])` before throwing. |
| Storage cleanup on withdraw | Medium | `useWithdrawVerification` calls `storage.remove([selfie_path, passport_path])` BEFORE `DELETE row`. Best-effort; orphan files are RLS-isolated if remove fails. |
| `createSignedUrl` TTL race | Low | TTL 3600s; query staleTime 50min; refetch on focus. |
| RLS UPDATE constraint violation | Low | Hooks always go through `upsert` with `onConflict`; UI never exposes "edit while pending". |
| Image size > 10MB | Low | Defensive pre-check on `result.assets[0].fileSize`. After resize typical output 200–800KB. |
| Concurrent re-submit double-tap | Low | `useMutation.isPending` disables submit button. |
| State drift after admin approves | Low | `staleTime: 60s` + `refetchOnFocus` regenerates query on screen entry. |
| Phosphor `SealCheck` availability | None | Confirmed in standard set, weight=fill supported. |

### Operational risks

| Risk | Severity | Mitigation |
|---|---|---|
| Moderation queue stagnation | High | Widen SLA copy to "обычно 1–3 дня, до 5 рабочих дней". P1 follow-up: DB trigger → Telegram webhook for admin alert. |
| Rejection-reason shame UX | Medium | Internal canonical rejection-reason list (blur / partial / wrong document / face mismatch / glare / cropped / other) — admin picks from list. Document in `docs/VERIFICATION.md`. |
| Re-submit loop spam | Low | 60-minute client-side cooldown in `useSubmitVerification` (read `submitted_at`, disable button + countdown copy). DB-level limit deferred to v2 if abuse appears. |

### Product / strategic risks

| Risk | Severity | Mitigation |
|---|---|---|
| Unverified-master conversion penalty | Medium | Pre-launch push-to-verify campaign (2 weeks); consider badge-on-detail-only until ~30% of active masters verified. |
| Trigger `sync_master_verification_level` first real invocation | Low | End-to-end demo-master test in Phase 2 covers it. |

---

## Engineering Verdicts on Open Issues

| Issue | Verdict | Rationale |
|---|---|---|
| Admin tooling parity | **Ship now, manual Dashboard moderation** | Admin UI is a separate scope; launch volume is low; widened SLA copy + planned Telegram webhook cover throughput. |
| EXIF strip | **Empirical first, no extra code in this RPI** | JPEG re-encode via image-manipulator typically strips. Test once; if fails, file P1 with 30–100 line workaround. |
| Upload UX | **Atomic — single spinner** | Data integrity > UX nicety on <5s upload. |
| Re-submit rate-limit | **Client-only, 60-min disable** | DB migration out of scope; only matters if spam appears. |

---

## Strategic Recommendation

**GO.** Confidence: **High**.

Backend has been live for a week with zero UI consumers — this is the exact `connect-the-dots` violation the constitution forbids. Phase 2 confirms launch-critical user value, Phase 3 confirms HIGH feasibility (~6h, zero new deps), Phase 4 confirms strategic alignment with every constitutional principle. There is no reason to defer and one strong reason to act: every day this stays unwired is a day the catalog ships without its decisive trust signal.

---

## Recommended Path Forward (3 phases for `/rpi:plan`)

| Phase | Focus | Effort | Deliverable |
|---|---|---|---|
| 1 — Foundations | `src/features/master-verification/` (4 hooks + preset + schema) + `<VerificationBadge>` + empirical EXIF test | ~2h | TS clean, contracts defined, no screens yet |
| 2 — Screen + nudge | `app/(tabs)/profile/verification.tsx` (4 branches) + nudge in `profile/index.tsx`. **Lazyweb-first** for form + approved-card. End-to-end manual cycle. | ~2.5h | Master can submit/withdraw/resubmit; Dashboard approval visible |
| 3 — Badges + docs | Badges in `master/[id]` + `MasterPreviewCard`. Light/dark verify. Update STATUS.md, `docs/VERIFICATION.md` (Part 2 — Frontend), SESSION_SUMMARY_2026-05-20.md. Tick `connect-the-dots` checklist. | ~1.5h | Feature complete, documented |

**Total: ~6 hours focused.**

---

## Conditions for Proceeding to `/rpi:plan`

Confirm with user (all recommended "yes"):

1. **Storage cleanup on withdraw IS in scope** (PM pushback adopted — PII compliance).
2. **"Подробнее" on approved card opens read-only `/profile/verification`** (no new route).
3. **60-minute client-side re-submit cooldown** adopted.
4. **SLA copy widened** to "обычно 1–3 дня, до 5 рабочих дней".
5. **Lazyweb-first applies** — planner must include explicit Lazyweb queries for "passport verification form mobile" and "verified badge marketplace profile" before UI code.
6. **EXIF check empirical** during Phase 1 implementation (not a research-blocker).

No backend changes. No new dependencies. No scope creep beyond `docs/VERIFICATION.md`.

---

## Top 3 Risks for Stakeholder Awareness

1. **Moderation throughput** — single admin via Dashboard; SLA may slip. Mitigation: widened copy + post-launch Telegram webhook.
2. **PII residual** — EXIF + partial-upload orphans + signed-URL discipline. Mitigation: empirical EXIF test + rollback logic + remove-before-delete on withdraw.
3. **Unverified-master conversion penalty** — once badge exists, absence reads as suspicious. Mitigation: pre-launch push-to-verify campaign; badge-on-detail-only until critical mass.

---

## Next Steps

**Recommendation:** GO.

1. **Confirm 6 conditions above** with user (one short message expected).
2. **Run `/rpi:plan master-passport-verification`** — generates `plan/pm.md` + `plan/ux.md` + `plan/eng.md` + `plan/PLAN.md`. **Plan must include explicit Lazyweb queries** for verification form and badge.
3. **Run `/rpi:implement master-passport-verification`** in 3 phases per the path above.
4. **On completion:** STATUS.md updated, `docs/VERIFICATION.md` part 2 closed, SESSION_SUMMARY_2026-05-20.md written, `connect-the-dots.md` § "Известные случаи" gets a new entry: "2026-05-20: closed `master_verifications` UI gap (Sprint master-passport-verification)".

---

## Appendix — Key References

- [REQUEST.md](../REQUEST.md) — feature spec.
- [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) — backend reference.
- [supabase/migrations/0070_master_verifications.sql](../../../supabase/migrations/0070_master_verifications.sql) — schema.
- [.claude/rules/connect-the-dots.md](../../../.claude/rules/connect-the-dots.md) — the rule this RPI closes.
- [.claude/rules/design-quality.md](../../../.claude/rules/design-quality.md) — UI quality bar.
- [.claude/rules/preview-rules.md](../../../.claude/rules/preview-rules.md) — dev-server verification flow.
- [docs/UI_ICONS.md](../../../docs/UI_ICONS.md) — Phosphor icon strategy.
- [CLAUDE.md](../../../CLAUDE.md) — project constitution.
