# Technical Specification — Master Passport Verification (UI)

**Feature slug:** `master-passport-verification`
**Date:** 2026-05-20
**Phase:** RPI Step 5 — Engineering
**Sources:** [REQUEST.md](../REQUEST.md), [RESEARCH.md](../research/RESEARCH.md), [docs/VERIFICATION.md](../../../docs/VERIFICATION.md), [supabase/migrations/0070_master_verifications.sql](../../../supabase/migrations/0070_master_verifications.sql).

---

## 1. Overview

Backend is fully shipped (migration `0070` applied 2026-05-15 — table `master_verifications`, RLS, triggers, private Storage bucket, TS-types) and has had **zero UI consumers for a week**. This RPI closes that `connect-the-dots.md` gap with **6 new files**, **3 modified files**, and **zero new dependencies**. The implementation mirrors two existing codebase patterns: image-upload presets ([src/lib/image-upload.ts](../../../src/lib/image-upload.ts)) and TanStack Query mutation/query conventions ([src/features/profile/use-my-portfolio.ts](../../../src/features/profile/use-my-portfolio.ts), [src/features/uploads/use-upload-image.ts](../../../src/features/uploads/use-upload-image.ts)). No backend changes whatsoever — every operation goes through existing RLS and triggers.

---

## 2. File Structure

```
src/features/master-verification/         ← NEW feature folder
  use-my-verification.ts                   ← query: row | null
  use-submit-verification.ts               ← mutation: atomic upload + upsert + rollback
  use-verification-preview-urls.ts         ← query: createSignedUrl pair (TTL 3600s)
  use-withdraw-verification.ts             ← mutation: remove() Storage BEFORE DELETE row
  verification-preset.ts                   ← VERIFICATION_PRESET (maxDimension 1600, q 0.82)
  verification-schema.ts                   ← zod: { agreed: literal(true), selfiePresent, passportPresent }

src/components/VerificationBadge.tsx       ← NEW reusable badge (chip + icon-only)

app/(tabs)/profile/verification.tsx        ← NEW route — single screen, 4 status branches

Modified:
app/(tabs)/profile/index.tsx               ← inline <VerificationNudge /> around line 551
app/(tabs)/master/[id].tsx                 ← <VerificationBadge variant="chip" /> around line 135
src/components/MasterPreviewCard.tsx       ← <VerificationBadge variant="icon-only" /> around line 73

Documentation (after impl):
docs/VERIFICATION.md                       ← close §"UI flow (planned — часть 2)"
STATUS.md                                  ← entry in "Что готово" + "История ключевых решений"
SESSION_SUMMARY_2026-05-20.md              ← session report
.claude/rules/connect-the-dots.md          ← append to §"Известные случаи"
```

No new files under `supabase/migrations/`. No new packages in `package.json`. No new env vars.

---

## 3. Type Strategy

All types are derived from `src/types/database.ts` — no hand-written shapes:

```ts
import type { Tables, Enums } from "@/types/database";

type MasterVerification = Tables<"master_verifications">;
type VerificationStatus = Enums<"verification_status">;   // "pending" | "approved" | "rejected"

// UI-only enum that adds the "no row" case to the DB enum.
// Used by <VerificationNudge> and screen branching.
type VerificationStateUI = "not_submitted" | VerificationStatus;

function deriveUIState(row: MasterVerification | null): VerificationStateUI {
  return row ? row.status : "not_submitted";
}
```

`master_profiles.verification_level` is read by `<VerificationBadge>`. The hook stays cheap — we already query `master_profiles` in the master detail screen and card lists; we just thread `verification_level` into the prop.

---

## 4. Hook Contracts

### 4.1 `useMyVerification()`

```ts
function useMyVerification(): UseQueryResult<MasterVerification | null>
```

- **queryKey:** `["my-verification", userId]` where `userId = useAuthSession().session?.user.id ?? null`.
- **enabled:** `!!userId`.
- **staleTime:** `60_000` (60s — matches `useMasterPortfolio`).
- **refetch policy:** `refetchOnReconnect: true`. In addition, callers of the `/profile/verification` route wrap the query with `useFocusEffect` (Expo Router) to trigger `refetch()` on screen re-entry — covers the "admin approved while I had the app open" case.
- **queryFn pseudocode:**
  ```ts
  const { data, error } = await supabase
    .from("master_verifications")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
  ```
- **RLS guarantee:** `master_verifications_owner_select` ensures only own row is visible; the explicit `.eq("user_id", userId)` is for query-key correctness, not security.

### 4.2 `useSubmitVerification()`

```ts
function useSubmitVerification(): UseMutationResult<
  { selfiePath: string; passportPath: string },
  Error,
  { selfieLocalUri: string; passportLocalUri: string;
    selfieSize: { width: number; height: number };
    passportSize: { width: number; height: number } }
>
```

**Atomic flow (with rollback on partial failure):**

```ts
// 1. Resize selfie via VERIFICATION_PRESET (manipulateAsync 1600 / 0.82 / jpeg).
const selfieResized = await resizeImage(
  { uri: selfieLocalUri, ...selfieSize },
  VERIFICATION_PRESET,
);

// 2. Build deterministic path.
const ts = Date.now();
const selfiePath = `${userId}/selfie-${ts}.jpg`;
const passportPath = `${userId}/passport-${ts}.jpg`;

// 3. Upload selfie.
const selfieBuf = await fetch(selfieResized.uri).then(r => r.arrayBuffer());
const { error: e1 } = await supabase.storage
  .from("master-verifications")
  .upload(selfiePath, selfieBuf, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
if (e1) throw new Error(`Не удалось загрузить селфи: ${e1.message}`);

// 4. Resize passport.
const passportResized = await resizeImage(
  { uri: passportLocalUri, ...passportSize },
  VERIFICATION_PRESET,
);

// 5. Upload passport.
const passportBuf = await fetch(passportResized.uri).then(r => r.arrayBuffer());
const { error: e2 } = await supabase.storage
  .from("master-verifications")
  .upload(passportPath, passportBuf, {
    contentType: "image/jpeg",
    upsert: false,
    cacheControl: "3600",
  });
if (e2) {
  // ROLLBACK: selfie uploaded, passport failed → orphan selfie. Remove it.
  await supabase.storage.from("master-verifications").remove([selfiePath]);
  throw new Error(`Не удалось загрузить паспорт: ${e2.message}`);
}

// 6. Upsert master_verifications. RLS handles INSERT vs UPDATE branching:
//    - row absent → INSERT allowed (status=pending).
//    - row exists with status=rejected → UPDATE allowed (rejected → pending).
//    - row exists with status=pending/approved → RLS rejects (we shouldn't reach
//      this branch from the UI; submit button is disabled in those states).
const { error: e3 } = await supabase
  .from("master_verifications")
  .upsert({
    user_id: userId,
    status: "pending",
    selfie_path: selfiePath,
    passport_main_path: passportPath,
    submitted_at: new Date().toISOString(),
    rejection_reason: null,
    reviewed_at: null,
    reviewed_by: null,
  }, { onConflict: "user_id" });

if (e3) {
  // ROLLBACK: both files uploaded, DB upsert failed → remove orphans.
  await supabase.storage.from("master-verifications").remove([selfiePath, passportPath]);
  throw new Error(`Не удалось сохранить заявку: ${e3.message}`);
}

return { selfiePath, passportPath };
```

**onSuccess invalidations:**
```ts
qc.invalidateQueries({ queryKey: ["my-verification", userId] });
qc.invalidateQueries({ queryKey: ["verification-preview-urls", userId] });
qc.invalidateQueries({ queryKey: ["master-public", userId] });   // may show new badge after admin approval
```

### 4.3 `useVerificationPreviewUrls(row)`

```ts
function useVerificationPreviewUrls(row: MasterVerification | null): {
  selfieUrl: string | null;
  passportUrl: string | null;
  isLoading: boolean;
  refetch: () => void;
}
```

- **queryKey:** `["verification-preview-urls", row?.user_id]`.
- **enabled:** `!!row`.
- **staleTime:** `3_000_000` (50 minutes — safely under the 1-hour signed-URL TTL).
- **gcTime:** `3_600_000` (1 hour — auto-evict after TTL expires).
- **queryFn pseudocode:**
  ```ts
  const [{ data: s }, { data: p }] = await Promise.all([
    supabase.storage.from("master-verifications").createSignedUrl(row.selfie_path, 3600),
    supabase.storage.from("master-verifications").createSignedUrl(row.passport_main_path, 3600),
  ]);
  return { selfieUrl: s?.signedUrl ?? null, passportUrl: p?.signedUrl ?? null };
  ```
- **Note:** `createSignedUrl` is the **first use in the codebase**. The pattern is documented inline in the hook's header comment so future callers can copy it without re-discovering.

### 4.4 `useWithdrawVerification()`

```ts
function useWithdrawVerification(): UseMutationResult<void, Error, void>
```

**Flow (remove Storage **before** row delete to avoid PII orphans):**

```ts
// 1. Read current row from cache (no extra fetch).
const row = qc.getQueryData<MasterVerification | null>(["my-verification", userId]);
if (!row) return;  // no-op

// 2. Remove Storage objects FIRST. Best-effort: if remove fails, files remain
//    RLS-isolated (no security issue) and we proceed with row delete.
const { error: removeErr } = await supabase.storage
  .from("master-verifications")
  .remove([row.selfie_path, row.passport_main_path]);
if (removeErr) {
  console.warn("verification: storage.remove failed, proceeding with row delete", removeErr);
}

// 3. Delete row. Trigger reset_verification_level_on_delete fires → level = 0.
const { error: deleteErr } = await supabase
  .from("master_verifications")
  .delete()
  .eq("user_id", userId);
if (deleteErr) throw new Error(`Не удалось отозвать заявку: ${deleteErr.message}`);
```

**onSuccess invalidations:**
```ts
qc.invalidateQueries({ queryKey: ["my-verification", userId] });
qc.invalidateQueries({ queryKey: ["verification-preview-urls", userId] });
qc.invalidateQueries({ queryKey: ["master-public", userId] });
```

---

## 5. Component Contracts

### 5.1 `<VerificationBadge>`

```tsx
interface VerificationBadgeProps {
  level: number;                          // master_profiles.verification_level (0, 1, 2+)
  variant: "chip" | "icon-only";
  size?: number;                          // icon size, default 14
}

export function VerificationBadge({ level, variant, size = 14 }: VerificationBadgeProps) {
  if (level < 1) return null;
  const tc = useThemeColors(["success"]);

  if (variant === "icon-only") {
    return (
      <SealCheck weight="fill" size={size} color={tc.success}
                 accessibilityLabel="Паспорт подтверждён" />
    );
  }

  return (
    <View className="flex-row items-center gap-1 rounded-full bg-success/10 px-2 py-0.5">
      <SealCheck weight="fill" size={size} color={tc.success} />
      <AppText className="text-mono-caption text-success">Паспорт подтверждён</AppText>
    </View>
  );
}
```

**Used by:**
- `app/(tabs)/master/[id].tsx` ~line 135 (variant=`"chip"`, size 14, next to master name).
- `src/components/MasterPreviewCard.tsx` ~line 73 (variant=`"icon-only"`, size 14, inline after name).
- Read-only badge on `/profile/verification` approved branch (variant=`"chip"`, size 16).

### 5.2 `<VerificationNudge>` (inline component in `profile/index.tsx`)

Not a separate file — it's only used in one place and tightly bound to `profile/index.tsx` layout. Four branches by status:

| Status | Visual | Action |
|---|---|---|
| `not_submitted` | Card with `IdentificationCard` icon + title "Подтвердите личность" + body copy | CTA `Начать` → `/profile/verification` |
| `pending` | Card with `Clock` icon + title "Заявка на проверке" + body "Обычно 1–3 рабочих дня, до 5" | Link `Посмотреть` → `/profile/verification` |
| `approved` | Card with `SealCheck` fill (success color) + title "Паспорт подтверждён" + dated copy | Link `Подробнее` → `/profile/verification` |
| `rejected` | Card with `XCircle` (error color) + title "Отклонено" + `rejection_reason` body | CTA `Загрузить заново` → `/profile/verification` |

Full visual spec in [ux.md §5A](./ux.md).

---

## 6. Form Strategy

`/profile/verification` form uses **react-hook-form + zod** (existing pattern, see master-profile-schema.ts).

```ts
// verification-schema.ts
import { z } from "zod";

export const verificationFormSchema = z.object({
  agreed: z.literal(true, {
    errorMap: () => ({ message: "Согласие обязательно" }),
  }),
  selfiePresent: z.literal(true, { errorMap: () => ({ message: "Загрузите селфи" }) }),
  passportPresent: z.literal(true, { errorMap: () => ({ message: "Загрузите паспорт" }) }),
});

export type VerificationFormValues = z.infer<typeof verificationFormSchema>;
```

**Critical:** photo URIs live in component `useState`, **not** in form state. Form only carries booleans that mirror "is a photo present". This keeps the form serializable, lightweight, and matches the existing master-profile-form pattern.

```tsx
const [selfieUri, setSelfieUri] = useState<string | null>(null);
const [selfieSize, setSelfieSize] = useState<{ width: number; height: number } | null>(null);
const [passportUri, setPassportUri] = useState<string | null>(null);
const [passportSize, setPassportSize] = useState<{ width: number; height: number } | null>(null);

const form = useForm<VerificationFormValues>({
  resolver: zodResolver(verificationFormSchema),
  defaultValues: { agreed: false, selfiePresent: false, passportPresent: false },
});

// Sync form booleans whenever URIs change.
useEffect(() => { form.setValue("selfiePresent", !!selfieUri, { shouldValidate: true }); }, [selfieUri]);
useEffect(() => { form.setValue("passportPresent", !!passportUri, { shouldValidate: true }); }, [passportUri]);
```

Photo picker: reuses `pickImage({ title: "Селфи" })` and `pickImage({ title: "Главная страница паспорта" })` from existing `src/lib/image-upload.ts` (no aspect lock — selfies and passports have natural aspect ratios).

---

## 7. Database Operations Summary

All client operations route through `supabase.from("master_verifications")` with RLS enforcing access:

| Operation | Hook | RLS policy gating it | Trigger fires |
|---|---|---|---|
| SELECT own row | `useMyVerification` | `master_verifications_owner_select` | — |
| INSERT (first submit) | `useSubmitVerification` (upsert) | `master_verifications_owner_insert` (forces `status='pending'`, reviewed_* IS NULL) | `master_verifications_sync_level` (no-op on pending) |
| UPDATE (re-submit from rejected) | `useSubmitVerification` (upsert) | `master_verifications_owner_resubmit` (only `rejected → pending`) | `master_verifications_sync_level` (no-op on pending) |
| DELETE (withdraw) | `useWithdrawVerification` | `master_verifications_owner_delete` | `master_verifications_reset_level_on_delete` |

**Storage operations:**

| Operation | Bucket policy | Notes |
|---|---|---|
| `.upload({user_id}/selfie-…)` | `master_verifications_upload_own` | First segment = `auth.uid()::text` |
| `.upload({user_id}/passport-…)` | `master_verifications_upload_own` | Same constraint |
| `.createSignedUrl(path, 3600)` | `master_verifications_select_own` | Owner-only; **never** `getPublicUrl` |
| `.remove([selfie, passport])` | `master_verifications_delete_own` | Called on withdraw + rollback |

**Zero RPC calls.** **Zero admin operations from client.** Admin moderation happens via Supabase Dashboard (service-role bypass) — out of scope for this RPI.

---

## 8. PII Safety Checklist

- ✅ Storage bucket `master-verifications` is `public=false` (verified in migration line 211).
- ✅ All preview rendering uses `supabase.storage.from("master-verifications").createSignedUrl(path, 3600)`.
- ✅ **NEVER** call `getPublicUrl()` for these files. Grep guard in pre-commit: `grep -rn 'master-verifications' src/ app/ | grep 'getPublicUrl'` must return nothing.
- ✅ Rollback on partial upload — `useSubmitVerification` removes orphan selfie if passport upload fails (step 5 of §4.2).
- ✅ Rollback on DB failure — both files removed if upsert fails (step 6 of §4.2).
- ✅ `remove()` **before** `delete` on withdraw — files cleared before RLS forgets ownership chain.
- ⚠️ **EXIF empirical test** (Phase 1 of impl): pick a photo with a GPS tag (real camera-taken outside photo), push through `manipulateAsync({ format: 'jpeg', compress: 0.82 })` from `VERIFICATION_PRESET`, run `xxd` on output, confirm no EXIF blocks (look for `Exif\0\0`, `JFIF`, GPS markers). If JPEG re-encode leaves EXIF intact (unlikely but possible with the underlying iOS/Android implementation), file P1 follow-up — does not block Phase 2 since selfie+passport main page typically contain less geolocation risk than e.g. a portfolio outdoor shot.
- ⚠️ **Signed URL leakage** — TTL hard-capped at 3600s. No URLs logged to analytics. No copy-to-clipboard buttons. Preview `<Image>` only.

---

## 9. Error Handling Matrix

| Error case | Detection | UI feedback | Rollback | Re-try strategy |
|---|---|---|---|---|
| Picker cancelled | `pickImage` returns `null` | None (silent) | — | User picks again |
| Camera permission denied | `requestCameraPermissionsAsync().granted === false` | `Alert.alert("Нет доступа к камере", …)` | — | Open Settings (existing pattern) |
| Library permission denied | `requestMediaLibraryPermissionsAsync().granted === false` | `Alert.alert("Нет доступа к фото", …)` | — | Open Settings |
| File > 10 MB (post-resize unlikely) | `result.assets[0].fileSize` pre-check | `Alert.alert("Файл слишком большой", "Максимум 10 МБ")` | — | Pick another |
| Network during upload | `supabase.storage.upload` throws | `Alert.alert("Не удалось загрузить", e.message)` | Selfie removed if passport failed | Submit button remains active, state preserved |
| Storage permission/RLS error | `error.message` from upload | `Alert.alert("Ошибка загрузки", e.message)` + `console.error` | Selfie removed if passport failed | User can retry |
| DB upsert error | `error` from `.upsert()` | `Alert.alert("Не удалось сохранить", e.message)` | **Both files removed** | User can retry; form state preserved |
| Signed URL generation fails | `createSignedUrl` returns no signedUrl | Placeholder `<View>` + `<AppText>Превью недоступно</AppText>` | — | Hook auto-retries on refocus |
| DELETE on withdraw fails | `error` from `.delete()` | `Alert.alert("Не удалось отозвать", e.message)` | — | User retries; if Storage already removed, retry just deletes row |
| Concurrent re-submit (double-tap) | `mutation.isPending === true` | Submit button `disabled` + spinner | — | Prevented at UI level |

---

## 10. Testing Strategy

**Static checks (must pass before commit):**
- `npx tsc --noEmit` — zero errors in new files.
- `npx biome check src/features/master-verification/ src/components/VerificationBadge.tsx 'app/(tabs)/profile/verification.tsx'` — zero warnings/errors.

**Manual verification via Claude Preview MCP** (per `.claude/rules/preview-rules.md`):
1. `mcp__Claude_Preview__preview_start({ name: "xtrud-web" })`.
2. `mcp__Claude_Preview__preview_eval` to confirm DOM contains new copy.
3. `mcp__Claude_Preview__preview_screenshot` for visual confirmation in both themes.

**End-to-end scenarios (Phase 3 of impl):**

1. **Submit (happy path):** demo master with no row → `/profile` nudge says "Подтвердите личность" → tap → form → upload selfie + passport → check disclaimer → submit → nudge changes to "Заявка на проверке".
2. **Admin approval:** in Supabase Dashboard, set `status='approved'`, `reviewed_at=now()`, `reviewed_by=<admin-uuid>` → refocus app → nudge becomes "Паспорт подтверждён · DD.MM.YYYY" → `/master/{id}` shows chip badge → master list cards show icon-only badge.
3. **Admin rejection with reason:** Dashboard sets `status='rejected'`, `rejection_reason='Фото размыто'`, `reviewed_at=now()`. App nudge becomes red "Отклонено: Фото размыто" with "Загрузить заново". Re-submitting transitions row `rejected → pending` via UPDATE.
4. **Re-submit cycle:** repeat (3), then re-upload → status back to pending.
5. **Withdraw:** from pending state, tap "Отозвать заявку" → confirm → row gone, Storage objects removed (verify in Dashboard), nudge back to "Подтвердите личность".

**No automated tests** — xtrud convention is visual verification via Preview MCP. Documented in `.claude/rules/preview-rules.md`.

---

## 11. Performance Considerations

- **Skeleton during query loading** — `<Skeleton>` with realistic dimensions (avatar circle + 2 text rows + button rectangle). NOT `<ActivityIndicator>` on empty screen (design-quality rule §5).
- **Image-manipulator runs on JS thread** — show "Обрабатываем фото…" copy with `<ActivityIndicator size="small">` while `manipulateAsync` runs. Two resizes back-to-back take ~300–800ms on mid-range Android; not a freeze risk but not instant either.
- **Preview signed URLs cached** in react-query with `staleTime: 3_000_000` — no re-fetch on every screen entry. Refresh only after URL TTL approaches (50min) or via explicit `refetch()`.
- **Badge renders are cheap** — single Phosphor icon (variant=`"icon-only"`) or icon + 1 line of text (variant=`"chip"`). No perf concern in long card lists; React Native re-uses pure functional component instances.
- **No prefetching** — verification preview URLs are only fetched when the master opens `/profile/verification`. The nudge on `/profile` reads only `useMyVerification` (cheap row read), not URLs.
- **Upload size** — after `VERIFICATION_PRESET` resize (1600px max, q 0.82, JPEG) typical output is 180–600KB per file. Two files upload sequentially in ~3–8s on broadband, ~10–25s on 3G. Acceptable; no progress bar (atomic submit per RESEARCH.md verdict).

---

## 12. Phased Implementation Plan

Total estimated effort: **~6 hours focused**, mapped to `PLAN.md` phases.

### Phase 1 — Foundations (~2h)
- Create `src/features/master-verification/` directory.
- Implement 4 hooks (`use-my-verification.ts`, `use-submit-verification.ts`, `use-verification-preview-urls.ts`, `use-withdraw-verification.ts`).
- Implement `verification-preset.ts` and `verification-schema.ts`.
- Implement `<VerificationBadge>` component.
- Run empirical EXIF test (real GPS-tagged photo → manipulateAsync → `xxd` inspection).
- `npx tsc --noEmit` clean.
- **No screens yet, no UI changes visible to user.**

### Phase 2 — Screen + nudge (~2.5h)
- Lazyweb queries **before** UI code:
  - "passport verification upload form mobile" (5 results).
  - "verification status pending card mobile" (3 results).
  - "rejection reason banner mobile" (3 results).
- Build `app/(tabs)/profile/verification.tsx` with all 4 status branches (form / pending / approved / rejected).
- Insert `<VerificationNudge>` in `app/(tabs)/profile/index.tsx` around line 551 (after Portfolio CTA).
- End-to-end manual cycle: submit → pending → admin approves via Dashboard → app sees the change after focus refresh.
- Light + dark mode screenshots for all 4 states.

### Phase 3 — Badges + docs (~1.5h)
- Insert `<VerificationBadge variant="chip">` in `app/(tabs)/master/[id].tsx` (~line 135, trust-row next to master name).
- Insert `<VerificationBadge variant="icon-only">` in `src/components/MasterPreviewCard.tsx` (~line 73, inline after name).
- Light + dark mode screenshots of both surfaces.
- Update `docs/VERIFICATION.md` — close §"UI flow (planned — часть 2)", add §"UI flow (implemented)".
- Update `STATUS.md` with feature-complete entry + decision log.
- Write `SESSION_SUMMARY_2026-05-20.md`.
- Append `2026-05-20` entry to `.claude/rules/connect-the-dots.md` §"Известные случаи".

---

## 13. Risks (technical only)

| Risk | Severity | Mitigation |
|---|---|---|
| EXIF metadata leak | Medium | Empirical Phase 1 test. JPEG re-encode via `expo-image-manipulator` typically strips. If fails, P1 follow-up with explicit binary strip (30–100 lines, `react-native-exify` or canvas re-encode). |
| Partial-upload orphans | Medium | Atomic try/catch in `useSubmitVerification` removes orphans on every failure path (§4.2 steps 5 and 6). |
| Storage objects not cleaned on withdraw | Medium | `useWithdrawVerification` calls `remove()` **before** `delete()`. If remove fails, warn-log + proceed; orphan files remain RLS-isolated. |
| Signed URL TTL race | Low | TTL 3600s; query `staleTime` 50min; `refetchOnFocus` covers near-expiry. |
| RLS UPDATE constraint violation | Low | All writes go through `upsert` with `onConflict: "user_id"`. UI never exposes "edit while pending/approved" — submit button is hidden in those states. |
| Image > 10 MB pre-resize | Low | Defensive `result.assets[0].fileSize` check. Post-resize output is always ≤ 1 MB. |
| Concurrent submit double-tap | Low | `mutation.isPending` disables submit button. |
| State drift after admin approves | Low | `staleTime: 60s` + `refetchOnFocus` regenerates the query on screen re-entry. Admin moderation latency is minutes-to-days, so manual refresh is acceptable. |
| `createSignedUrl` first-use surprise | Low | Documented in hook header. Same supabase-js API as elsewhere — no migration or feature flag needed. |

Operational and product risks (moderation throughput, conversion penalty, rejection-reason shame) are covered in [pm.md](./pm.md) — not technical scope.

---

## 14. Dependencies

**Zero new packages.** All required libraries are already in `package.json`:

| Library | Version (current) | Purpose |
|---|---|---|
| `react-hook-form` | already installed | Form state |
| `zod` + `@hookform/resolvers` | already installed | Schema validation |
| `expo-image-picker` | already installed | Photo selection (camera + library) |
| `expo-image-manipulator` | already installed | Resize + JPEG re-encode |
| `@supabase/supabase-js` | already installed | DB + Storage client. `createSignedUrl` is **first use in codebase** but existing API surface. |
| `phosphor-react-native` | already installed | `SealCheck`, `IdentificationCard`, `Clock`, `XCircle`, `CaretLeft` |
| `@tanstack/react-query` v5 | already installed | Query + mutation |

No native code changes (no `expo prebuild` needed). No Supabase migrations. No env vars.

---

## 15. Open Engineering Questions

Three small items deferred to the implement phase — each with a default decision documented so impl doesn't block on them:

1. **EXIF strip failure handling.** If the Phase 1 empirical test shows EXIF survives JPEG re-encode on web (browser canvas) or Android (Skia), what's the response?
   **Default:** accept, document in `SESSION_SUMMARY_2026-05-20.md`, file P1 follow-up. Selfie + passport main page have lower geolocation risk than portfolio outdoor shots, so launch isn't blocked. Override only if test reveals device-info leaks (camera serial, model).

2. **Shared photo-uploader hook vs verification-specific.** Could `useUploadAvatar` / `useUploadPortfolioImage` be generalized to a single `useUploadImage({ bucket, preset, path, upsert })`?
   **Default:** keep verification-specific. Path naming (`selfie-` / `passport-` prefix), the private bucket, and the rollback semantics (two files atomic) are different enough that a generic abstraction would leak the differences anyway. Refactor opportunity for a separate sprint after we see 4+ upload sites.

3. **Skeleton vs ActivityIndicator on `/profile/verification` initial load.**
   **Default:** Skeleton with 2 photo placeholder rectangles + button rectangle. Consistent with `/profile/portfolio` convention. ActivityIndicator only inside the submit button during mutation.

---

## Appendix — Code References

- Existing patterns reused:
  - [src/lib/image-upload.ts](../../../src/lib/image-upload.ts) — `pickImage`, `resizeImage`, `VERIFICATION_PRESET` mirrors `AVATAR_PRESET` / `PORTFOLIO_PRESET`.
  - [src/features/uploads/use-upload-image.ts](../../../src/features/uploads/use-upload-image.ts) — TanStack mutation conventions.
  - [src/features/profile/use-my-portfolio.ts](../../../src/features/profile/use-my-portfolio.ts) — query/invalidation pattern, `portfolioKey` helper.
  - [src/features/auth/use-auth-session.ts](../../../src/features/auth/use-auth-session.ts) — `useAuthSession()` → `session?.user.id`.

- Backend reference (do NOT modify):
  - [supabase/migrations/0070_master_verifications.sql](../../../supabase/migrations/0070_master_verifications.sql) — schema, RLS, triggers, Storage policies.
  - [src/types/database.ts:600+, 1775](../../../src/types/database.ts) — generated types.
  - [docs/VERIFICATION.md](../../../docs/VERIFICATION.md) — backend spec to be closed in Phase 3.

- Rules enforced:
  - [.claude/rules/connect-the-dots.md](../../../.claude/rules/connect-the-dots.md) — the rule this RPI closes.
  - [.claude/rules/design-quality.md](../../../.claude/rules/design-quality.md) §G — no subtitle under H1.
  - [.claude/rules/preview-rules.md](../../../.claude/rules/preview-rules.md) — Preview MCP flow for verification.
  - [docs/UI_ICONS.md](../../../docs/UI_ICONS.md) — Phosphor weight conventions.
