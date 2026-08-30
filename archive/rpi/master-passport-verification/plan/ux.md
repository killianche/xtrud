# UX Design — Master Passport Verification (UI)

**Feature slug:** `master-passport-verification`
**Phase:** RPI Step 5 — UX Design
**Date:** 2026-05-20
**Inputs:** [REQUEST.md](../REQUEST.md) · [research/RESEARCH.md](../research/RESEARCH.md) · [docs/VERIFICATION.md](../../../docs/VERIFICATION.md)
**Audience:** implementation agent + `code-reviewer` + product owner

---

## 1. Design Principles (Vercel-inspired, xtrud overrides)

These principles override personal taste. Every decision below ladders up to one of them.

1. **One primary action per screen.** On the submission form — «Отправить на проверку». On the pending state — «Отозвать заявку» (only ghost-action, no competing CTA). On the approved state — no CTA at all (badge + footer copy only). On `/profile` nudge — exactly one button.
2. **Thin hairlines, dense secondary actions.** Borders are `border-hairline` (single token, theme-aware). Secondary controls (image-picker tiles, checkbox-row) use `border-hairline` + `bg-canvas`, never accent colors.
3. **Monospace for numerals.** Submission date «20.05.2026», countdown «59:42», file size «1.2 MB», approval date в badge tooltip — все через `<AppText weight="mono" />` / `text-mono-caption`. Tabular alignment, Vercel-grade trust signal.
4. **No subtitle under H1 (design-quality rule G).** `ScreenHeader.subtitle` запрещён. Любой объясняющий текст идёт **в body** как первый параграф, не как accessory строка под заголовком. На `BottomSheet` — то же самое (`subtitle` prop не используется).
5. **Phosphor `SealCheck` weight=fill = verified.** Цвет `tc.success` (зелёный) в карточках клиентов / каталоге (нейтрально-позитивно, не претендует на «accent brand»). На странице approved state — крупная `SealCheck` 48px тем же `tc.success`. Никаких других иконок для verified-состояния (не `CheckCircle`, не `BadgeCheck`).
6. **No inline `style={{color:…}}` / hex values.** Только NativeWind className c токенами из `colors.ts`. Исключение — `<Phosphor color={tc.success} />` через `useThemeColors(["success"])`.
7. **Empty / loading / error states покрыты для каждого экрана.** Loading = `<Skeleton>` соответствующих размеров (не `<ActivityIndicator>`). Empty = иконка 48px + title + body + CTA. Error = иконка + копия + «Повторить».
8. **Mutex-выбор где это применимо.** В этой фиче mutex почти нет (флоу линейный), но при выборе «снять с камеры / выбрать из галереи» через ActionSheet — выбор источника **заменяет** preview, не дополняет.
9. **Контраст бескомпромиссный.** `bg-primary` → всегда `text-on-primary`. `bg-error/10` (баннер) → `text-error`. Никогда не оставлять `text-button-lg` без явного `text-on-*`.

---

## 2. Lazyweb Research Plan (MANDATORY before UI implementation)

Implement-фаза **обязана** прогнать эти запросы перед написанием первого `<View>` экрана `/profile/verification`. Минимум 3 первых — gate, без них код не пишется. Результаты вклеиваются в коммит-message соответствующей фазы как «Lazyweb: искал X, посмотрел N, переиспользовал A/B, осознанно сделал иначе C».

### Query set

1. **`passport verification form mobile`** — `limit: 5`
   - Expected refs: Profi.ru, YouDo, российские banks (Тинькофф KYC), Bolt-driver onboarding.
   - **Copy:** двухслотовая структура (селфи отдельно от паспорта), полупрозрачный outline иконки внутри пустого слота, кнопка-CTA приклеена к низу (sticky footer pattern).
   - **Deliberately different:** не делаем «driving-license»-вкладок, не делаем live camera frame (out of scope, ActionSheet camera/gallery), не делаем «загрузите 2 разворота паспорта» — только главную.

2. **`verified badge marketplace profile`** — `limit: 5`
   - Expected refs: Profi.ru мастера, YouDo экспертов, Avito Услуги, Airbnb superhost, Etsy seller verified.
   - **Copy:** inline-chip рядом с именем + крупная version на детальной странице.
   - **Deliberately different:** не используем синий цвет (Twitter blue check ассоциация спорная), берём `tc.success`. Не используем emoji. Не клеим бейдж к аватару (overlay) — стандартная Phosphor `SealCheck` рядом с текстом.

3. **`id document upload selfie passport`** — `limit: 5`
   - Expected refs: Revolut KYC, Wise verification, Stripe Identity, Persona, Onfido demos.
   - **Copy:** «селфи держа паспорт» — формулировка «селфи с паспортом», placeholder с outline-силуэтом, instruction под слотом ≤ 1 строки.
   - **Deliberately different:** не делаем live face-detection (out of scope). Не требуем фото обратной стороны (Profi.ru-уровень, не банковский KYC).

4. **`status badge pending approved rejected`** — `limit: 5`
   - Expected refs: Linear issue states, Stripe Dashboard payouts, GitHub PR checks, Vercel deployments.
   - **Copy:** левая полоса-индикатор цвета + иконка + status-label моноширинным + сабтекст с датой/причиной.
   - **Deliberately different:** мы НЕ делаем coloured background card (Avito-style жёлтые/зелёные блоки). Bg остаётся `bg-canvas`, цвет несёт только иконка слева и тонкая `border-l-2`.

5. **`cooldown timer resubmit form`** — `limit: 3`
   - Expected refs: 2FA resend, SMS code resend, Stripe re-attempt payment.
   - **Copy:** disabled state кнопки + копия под кнопкой «Повторно можно через 59:42».
   - **Deliberately different:** показываем countdown по минутам, не по секундам (полно-секундный refresh — лишний motion, разряжает батарею и attention). При остатке < 60 сек переключаемся в «менее минуты».

### Output of Lazyweb research → into impl notes

Before file writing in impl phase:
- 2–4 строки выводов по каждому запросу
- ссылки/скриншоты (если Lazyweb их отдаёт)
- список «что переиспользуем», «что делаем иначе»

---

## 3. Information Architecture

```
/profile  (existing tab — app/(tabs)/profile/index.tsx)
  └─ <VerificationNudge />   ← NEW, inserted after Portfolio CTA (~line 551)
      ├─ State A: not_submitted  → «Подтвердите личность» + Начать
      ├─ State B: pending        → «На проверке» + Посмотреть
      ├─ State C: approved       → «Паспорт подтверждён» + Подробнее
      └─ State D: rejected       → «Заявка отклонена» + Загрузить заново

/profile/verification  (NEW route — app/(tabs)/profile/verification.tsx)
  ├─ State A (not_submitted) → submission form
  ├─ State B (pending)       → status header + read-only previews + withdraw
  ├─ State C (approved)      → success header + read-only previews + footer note
  └─ State D (rejected)      → red banner + submission form (re-submit mode)

/master/[id]  (existing — app/(tabs)/master/[id].tsx)
  └─ <VerificationBadge variant="chip" />  ← NEW, in trust-row (~line 135)

MasterPreviewCard  (existing — src/components/MasterPreviewCard.tsx)
  └─ <VerificationBadge variant="icon-only" />  ← NEW, inline with name (~line 73)
```

Route is **single** under `/profile/verification` — all 4 states branched by `useMyVerification().data?.status`. No `[id]` param, no nested routes. Matches Expo Router sibling convention (sits next to `edit-master.tsx`, `settings.tsx`, `portfolio/index.tsx`).

---

## 4. User Flows

### Flow 1 — First-time verification (happy path)

1. Master opens `/profile`. `useMyVerification()` returns `null`. Sees Nudge State A: card with `ShieldCheck` icon, title «Подтвердите личность», body «Покажите клиентам что вы реальный мастер. Это занимает 2 минуты.», CTA «Начать верификацию».
2. Taps CTA → `router.push("/profile/verification")`.
3. Lands on submission form. Reads body paragraph («Загрузите селфи и фотографию первой страницы паспорта. Проверка обычно 1–3 рабочих дня (до 5). Документы хранятся защищённо и доступны только модераторам.»).
4. Taps slot 1 «Селфи с паспортом» → ActionSheet appears: «Сделать снимок» / «Выбрать из галереи» / «Отмена».
5. Picks gallery, selects photo → after image-manipulator pipeline (resize 1600px, quality 0.82) → preview renders inside slot (circular thumbnail 96×96, `Pencil` overlay icon in corner indicating re-pick possible).
6. Taps slot 2 «Паспорт (главная страница)» → ActionSheet → camera → captures photo → preview renders (rectangular thumbnail 4:3, ~140×105).
7. Ticks disclaimer-checkbox «Соглашаюсь на обработку персональных данных в целях верификации личности.» (link wrapped «обработку персональных данных» = opens future policy modal — out of scope, для MVP неактивный underline).
8. CTA «Отправить на проверку» enables (was disabled until both photos + checkbox). Taps → `useSubmitVerification` runs (spinner replaces label «Отправляем…»). On success → screen state flips to pending: shows status header «На проверке», timestamp «Отправлено 20.05.2026 в 14:32», read-only previews of both photos, button «Отозвать заявку».

### Flow 2 — Re-submit after rejection

1. Master opens `/profile`. Nudge shows State D: red-indicator card «Заявка отклонена» + first line of rejection reason (truncated 1 line) + CTA «Загрузить заново».
2. Taps CTA → `/profile/verification`.
3. Sees red banner at top with full rejection_reason («Фото размыто, не читаются паспортные данные. Пересдайте при дневном свете.»). Below the banner — same submission form as State A (but RLS-aware: hook will use UPDATE not INSERT).
4. Taps slot 1 → ActionSheet → camera → new selfie.
5. Taps slot 2 → ActionSheet → gallery → new passport photo.
6. Re-ticks disclaimer-checkbox (was unticked on screen load even in rejected state — explicit consent each cycle).
7. Taps «Отправить на проверку» → mutation upserts (RLS: `rejected → pending` UPDATE path). Screen flips to pending state (Flow 1 step 8).

### Flow 3 — Withdraw pending request

1. Master on `/profile/verification` in pending state.
2. Scrolls to bottom, taps «Отозвать заявку» (ghost button, `text-error`, `border-error/30`).
3. Confirm-dialog appears (`Alert.alert`): title «Отозвать заявку?», body «Загруженные фото будут удалены. Повторно подать можно сразу после.», buttons «Отмена» / «Отозвать» (destructive style on iOS).
4. Confirms → `useWithdrawVerification` runs: storage.remove([selfie_path, passport_path]) → DELETE row → invalidate queries. Spinner overlay for ~2 sec.
5. On success → `router.replace("/profile/verification")` (re-renders same route) → screen now shows submission form (State A). Nudge на `/profile` тоже обновится при возврате.

### Flow 4 — Cooldown after recent submission (rejected → re-submit too fast)

1. Master submitted rejected request 30 minutes ago, just got rejection notification, opens `/profile/verification` immediately.
2. Sees rejection banner + form. Fills photos + checkbox.
3. CTA region shows: button replaced by **disabled** primary button («Отправить на проверку» dimmed 50% opacity) + below it `text-mono-caption text-mute` строка «Повторно можно через 29:18». Live region updates every minute.
   - At remainder < 60 sec: copy switches to «Повторно можно меньше чем через минуту».
   - At remainder = 0: button enables, countdown disappears.

Cooldown source-of-truth: `data.submitted_at + 60min` from query. No localStorage. Refresh on screen focus + minute interval.

### Flow 5 — Client sees badge in catalog

1. Client opens `/search`. Result list renders `MasterPreviewCard` for each match. For masters with `verification_level >= 1`, card renders icon-only `SealCheck` (fill, 12px, `tc.success`) inline with name, with `accessibilityLabel="Паспорт подтверждён"`.
2. Client taps a verified master card → navigates to `/master/[id]`.
3. Detail screen renders trust-row: avatar → name → `<VerificationBadge variant="chip" />` showing `SealCheck` 14px + «Паспорт подтверждён» in `text-mono-caption text-success`, wrapped in `bg-success/10 rounded-full px-2 py-0.5`.
4. Below trust-row — rating, distance, etc. continue as before.
5. Web only: hovering the icon-only badge in card list shows native browser tooltip from `accessibilityLabel` (RN Web maps to `aria-label` + `title`).

---

## 5. Screen Specifications

Each screen below specifies layout, components, exact RU copy, icon names, states, and dark behavior.

### A. `/profile` — Nudge card insertion

**File:** `app/(tabs)/profile/index.tsx` — insert `<VerificationNudge />` after Portfolio CTA (~line 551).

**Component contract:** `<VerificationNudge />` is self-contained, calls `useMyVerification()` internally, returns `null` for non-master profiles, renders one of 4 cards otherwise.

**Layout (all 4 variants share):**
```
<Pressable onPress={…} className="mx-4 mt-4 rounded-lg border border-hairline bg-canvas p-4 flex-row items-center gap-3">
  <View className="h-10 w-10 rounded-full items-center justify-center" /* bg varies by state */>
    <PhosphorIcon size={22} weight="fill" color={…} />
  </View>
  <View className="flex-1">
    <AppText weight="semibold" className="text-body">{title}</AppText>
    <AppText className="text-caption text-mute mt-0.5" numberOfLines={2}>{body}</AppText>
  </View>
  <CaretRight size={18} weight="bold" color={tc.mute} />
</Pressable>
```

**State A (not_submitted):**
- Icon: `ShieldCheck` weight=fill, color `tc.brand`, bg `bg-brand/10`.
- Title: «Подтвердите личность»
- Body: «Покажите клиентам что вы реальный мастер. Это занимает 2 минуты.»
- onPress: `router.push("/profile/verification")`

**State B (pending):**
- Icon: `Hourglass` weight=fill, color `tc.warning`, bg `bg-warning/10`.
- Title: «Заявка на проверке»
- Body: «Обычно 1–3 рабочих дня. Покажем результат здесь.»
- onPress: `router.push("/profile/verification")`

**State C (approved):**
- Icon: `SealCheck` weight=fill, color `tc.success`, bg `bg-success/10`.
- Title: «Паспорт подтверждён»
- Body: `Подтверждено ${formatDate(reviewed_at, "DD.MM.YYYY")}` (date via mono weight inline или просто mono-caption всей строки)
- onPress: `router.push("/profile/verification")` — opens read-only view

**State D (rejected):**
- Icon: `X` weight=bold, color `tc.error`, bg `bg-error/10`.
- Title: «Заявка отклонена»
- Body: `{rejection_reason}` truncated to 2 lines (numberOfLines=2 already covers).
- onPress: `router.push("/profile/verification")`

**Loading state:** `<Skeleton className="mx-4 mt-4 h-16 rounded-lg" />` — same dimensions, no flicker.

**Dark theme:** All `tc.*` colors auto-flip via `useThemeColors`. `bg-canvas`/`border-hairline`/`text-mute` tokens already theme-aware.

**Accessibility:** Pressable has `accessibilityRole="button"` + `accessibilityLabel={\`${title}. ${body}\`}` + `accessibilityHint="Открыть страницу верификации"`.

---

### B. `/profile/verification` — Submission form (not_submitted + rejected modes)

**File:** `app/(tabs)/profile/verification.tsx` (NEW).

**Layout (top to bottom):**

```
<ScreenContainer>
  <ScreenHeader title="Подтверждение личности" />   {/* NO subtitle */}

  <ScrollView contentContainerClassName="px-4 pb-32" keyboardShouldPersistTaps="handled">

    {/* IF rejected: red banner — body content, not subtitle */}
    {isRejected && (
      <View className="mt-4 rounded-lg border border-error/30 bg-error/5 p-3 flex-row gap-2">
        <Warning size={18} weight="fill" color={tc.error} />
        <View className="flex-1">
          <AppText weight="semibold" className="text-body text-error">Заявка отклонена</AppText>
          <AppText className="text-body-sm text-ink mt-1">{rejection_reason}</AppText>
        </View>
      </View>
    )}

    {/* Explanatory paragraph — body, not subtitle */}
    <AppText className="text-body text-ink mt-6">
      Загрузите селфи и фотографию первой страницы паспорта. Проверка занимает обычно
      1–3 рабочих дня (до 5). Документы хранятся защищённо и доступны только модераторам.
    </AppText>

    {/* Slot 1 — selfie */}
    <Pressable className="mt-8 items-center" onPress={pickSelfie} accessibilityRole="button" accessibilityLabel="Загрузить селфи с паспортом">
      {selfieUri ? (
        <Image source={{ uri: selfieUri }} className="h-44 w-44 rounded-full" accessibilityLabel="Селфи с паспортом" />
      ) : (
        <View className="h-44 w-44 rounded-full border-2 border-dashed border-hairline items-center justify-center bg-canvas-soft">
          <UserCircle size={56} weight="bold" color={tc.mute} />
        </View>
      )}
      <AppText weight="semibold" className="text-body mt-3">Селфи с паспортом</AppText>
      <AppText className="text-caption text-mute mt-0.5">{selfieUri ? "Нажмите чтобы заменить" : "Держите паспорт рядом с лицом"}</AppText>
    </Pressable>

    {/* Slot 2 — passport */}
    <Pressable className="mt-8" onPress={pickPassport} accessibilityRole="button" accessibilityLabel="Загрузить фото паспорта">
      {passportUri ? (
        <Image source={{ uri: passportUri }} className="h-44 w-full rounded-lg" resizeMode="cover" accessibilityLabel="Фото паспорта" />
      ) : (
        <View className="h-44 w-full rounded-lg border-2 border-dashed border-hairline items-center justify-center bg-canvas-soft">
          <IdentificationCard size={56} weight="bold" color={tc.mute} />
        </View>
      )}
      <AppText weight="semibold" className="text-body mt-3">Паспорт (главная страница)</AppText>
      <AppText className="text-caption text-mute mt-0.5">{passportUri ? "Нажмите чтобы заменить" : "Разворот с фотографией"}</AppText>
    </Pressable>

    {/* Disclaimer checkbox */}
    <Pressable
      className="mt-8 flex-row items-start gap-3"
      onPress={() => setAgreed(v => !v)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: agreed }}
      accessibilityLabel="Согласие на обработку персональных данных"
    >
      <View className={cn(
        "h-5 w-5 rounded border-2 mt-0.5 items-center justify-center",
        agreed ? "bg-primary border-primary" : "bg-canvas border-hairline"
      )}>
        {agreed && <Check size={14} weight="bold" color={tc.onPrimary} />}
      </View>
      <AppText className="flex-1 text-body-sm text-ink">
        Соглашаюсь на обработку персональных данных в целях верификации личности.
      </AppText>
    </Pressable>

    {/* CTA + (если cooldown) countdown */}
    <View className="mt-6">
      <Pressable
        disabled={!canSubmit || mutation.isPending || cooldownRemainingSec > 0}
        onPress={onSubmit}
        className={cn(
          "h-12 rounded-full items-center justify-center",
          canSubmit && !cooldownRemainingSec ? "bg-primary" : "bg-primary/40"
        )}
        accessibilityRole="button"
        accessibilityLabel="Отправить заявку на проверку"
      >
        <AppText className="text-button-lg text-on-primary">
          {mutation.isPending ? "Отправляем…" : "Отправить на проверку"}
        </AppText>
      </Pressable>
      {cooldownRemainingSec > 0 && (
        <AppText
          className="text-mono-caption text-mute mt-2 text-center"
          accessibilityLiveRegion="polite"
        >
          {cooldownRemainingSec >= 60
            ? `Повторно можно через ${formatMmSs(cooldownRemainingSec)}`
            : "Повторно можно меньше чем через минуту"}
        </AppText>
      )}
    </View>

  </ScrollView>
</ScreenContainer>
```

**Phosphor icons used:** `Warning` (banner), `UserCircle` (selfie placeholder), `IdentificationCard` (passport placeholder), `Check` (checkbox tick), `CaretLeft` (header back).

**Empty state for slots:** dashed border + 56px outline icon — no «click to upload» label inside the slot (the title below the slot already says what it is). Keeps slot visually quiet.

**Loading state for picker action:** ActionSheet is OS-native (`expo-image-picker`), no custom loading. After picking, while image-manipulator runs (~300ms), slot shows `<Skeleton className="h-44 w-44 rounded-full" />` overlay.

**Loading state for mutation:** CTA label becomes «Отправляем…», button disabled, spinner not separately rendered (label change is the indicator).

**Error state for mutation:** `Alert.alert("Не удалось отправить", error.message ?? "Попробуйте ещё раз")`.

**Dark theme:** Selfie/passport `bg-canvas-soft` flips to dark-elevated tone. Banner `bg-error/5` already alpha-overlay so works in both. Checkbox `bg-primary` flips automatically.

---

### C. `/profile/verification` — Pending state

**Same file, branch on `data.status === "pending"`.**

**Layout:**

```
<ScreenContainer>
  <ScreenHeader title="На проверке" />   {/* NO subtitle */}

  <ScrollView contentContainerClassName="px-4 pb-32">

    {/* Status row */}
    <View className="mt-6 flex-row items-center gap-3">
      <View className="h-12 w-12 rounded-full bg-warning/10 items-center justify-center">
        <Hourglass size={26} weight="fill" color={tc.warning} />
      </View>
      <View className="flex-1">
        <AppText weight="semibold" className="text-body">Заявка на проверке</AppText>
        <AppText className="text-mono-caption text-mute mt-0.5">
          Отправлено {formatDateTime(submitted_at)}
        </AppText>
      </View>
    </View>

    <AppText className="text-body-sm text-mute mt-4">
      Обычно проверяем за 1–3 рабочих дня, в редких случаях до 5. Покажем результат здесь
      и в карточке профиля.
    </AppText>

    {/* Read-only previews */}
    <View className="mt-8 gap-6">
      <View>
        <AppText weight="semibold" className="text-body">Селфи с паспортом</AppText>
        {selfieUrl ? (
          <Image source={{ uri: selfieUrl }} className="h-44 w-44 rounded-full mt-2" accessibilityLabel="Селфи с паспортом" />
        ) : (
          <View className="h-44 w-44 rounded-full bg-canvas-soft mt-2 items-center justify-center">
            <AppText className="text-caption text-mute">Превью недоступно</AppText>
          </View>
        )}
      </View>
      <View>
        <AppText weight="semibold" className="text-body">Паспорт</AppText>
        {passportUrl ? (
          <Image source={{ uri: passportUrl }} className="h-44 w-full rounded-lg mt-2" resizeMode="cover" accessibilityLabel="Фото паспорта" />
        ) : (
          <View className="h-44 w-full rounded-lg bg-canvas-soft mt-2 items-center justify-center">
            <AppText className="text-caption text-mute">Превью недоступно</AppText>
          </View>
        )}
      </View>
    </View>

    {/* Withdraw */}
    <Pressable
      className="mt-10 h-12 rounded-full border border-error/30 items-center justify-center"
      onPress={onWithdraw}
      accessibilityRole="button"
      accessibilityLabel="Отозвать заявку на проверку"
      disabled={withdrawMutation.isPending}
    >
      <AppText className="text-button text-error">
        {withdrawMutation.isPending ? "Отзываем…" : "Отозвать заявку"}
      </AppText>
    </Pressable>

  </ScrollView>
</ScreenContainer>
```

**Loading state for signed URLs:** Each `<Image>` slot shows `<Skeleton h-44 ... />` while `useVerificationPreviewUrls` is pending.

**Error state for signed URLs:** fallback grey block с копией «Превью недоступно» (см. layout).

---

### D. `/profile/verification` — Approved state

**Layout:**

```
<ScreenContainer>
  <ScreenHeader title="Паспорт подтверждён" />

  <ScrollView contentContainerClassName="px-4 pb-16">

    {/* Hero status — SealCheck centered */}
    <View className="mt-8 items-center">
      <View className="h-16 w-16 rounded-full bg-success/10 items-center justify-center">
        <SealCheck size={36} weight="fill" color={tc.success} />
      </View>
      <AppText weight="semibold" className="text-display-sm mt-4 text-center">
        Личность подтверждена
      </AppText>
      <AppText className="text-mono-caption text-mute mt-1">
        Подтверждено {formatDate(reviewed_at, "DD.MM.YYYY")}
      </AppText>
    </View>

    {/* Read-only smaller thumbnails */}
    <View className="mt-10 flex-row gap-4">
      <View className="flex-1">
        <AppText className="text-caption text-mute">Селфи</AppText>
        {selfieUrl ? (
          <Image source={{ uri: selfieUrl }} className="h-32 w-32 rounded-full mt-2" accessibilityLabel="Селфи с паспортом" />
        ) : (
          <View className="h-32 w-32 rounded-full bg-canvas-soft mt-2" />
        )}
      </View>
      <View className="flex-1">
        <AppText className="text-caption text-mute">Паспорт</AppText>
        {passportUrl ? (
          <Image source={{ uri: passportUrl }} className="h-24 w-full rounded-lg mt-2" resizeMode="cover" accessibilityLabel="Фото паспорта" />
        ) : (
          <View className="h-24 w-full rounded-lg bg-canvas-soft mt-2" />
        )}
      </View>
    </View>

    {/* Footer privacy note */}
    <View className="mt-10 rounded-lg border border-hairline bg-canvas-soft p-3 flex-row items-start gap-2">
      <Lock size={16} weight="bold" color={tc.mute} className="mt-0.5" />
      <AppText className="flex-1 text-caption text-mute">
        Документы хранятся защищённо. Видны только модераторам.
      </AppText>
    </View>

  </ScrollView>
</ScreenContainer>
```

**Phosphor icons:** `SealCheck` (hero), `Lock` (footer note).

**No CTA, no withdraw button.** Approved is terminal — user cannot self-revoke after approval (avoids accidental tap-loss of trust signal; if needed, support deletes via service-role).

---

### E. `/profile/verification` — Rejected state

Same as State A (submission form) **plus** red banner at top (described in §5.B layout already — `isRejected` branch). No separate screen. The form below the banner is in re-submit mode — `useSubmitVerification` internally chooses INSERT vs UPDATE based on existing row.

The disclaimer checkbox starts un-ticked even on re-submit (explicit consent each cycle).

---

### F. `/master/[id]` — Inline chip badge

**File:** `app/(tabs)/master/[id].tsx` — modify trust-row (~line 135).

**Component:** `<VerificationBadge variant="chip" level={masterProfile.verification_level} />`.

**Render contract (chip variant, when `level >= 1`):**
```tsx
<View className="flex-row items-center gap-1 bg-success/10 rounded-full px-2 py-0.5">
  <SealCheck size={14} weight="fill" color={tc.success} />
  <AppText className="text-mono-caption text-success">Паспорт подтверждён</AppText>
</View>
```

**Position in trust-row:** after the master name, before rating/distance. Wrap container should be `flex-wrap` to handle long names + chip on small screens.

**When `level === 0`:** component returns `null`. No "unverified" badge — absence is the signal (per research §«Unverified-master conversion penalty» — discussed but resolved by not showing red "unverified" pill).

**Accessibility:** `accessibilityLabel="Паспорт подтверждён модераторами"` on the wrapping View.

**Dark theme:** `bg-success/10` reads slightly darker; `text-success` flips brighter — sufficient contrast.

---

### G. `MasterPreviewCard` — Icon-only badge

**File:** `src/components/MasterPreviewCard.tsx` — modify name row (~line 73).

**Component:** `<VerificationBadge variant="icon-only" level={…} />`.

**Render contract (icon-only variant, when `level >= 1`):**
```tsx
<SealCheck
  size={12}
  weight="fill"
  color={tc.success}
  accessibilityLabel="Паспорт подтверждён"
/>
```

**Position:** inline with name, right after it, separated by `gap-1`. Both name `<AppText>` and badge wrapped in a `flex-row items-center gap-1` row, with name having `flex-shrink` so it truncates before pushing badge off-screen.

**Hit target:** badge itself is not pressable; the whole card is. No tap-tooltip needed on mobile; on web `aria-label` provides the hover-tooltip naturally.

**Dark theme:** SVG color flips via `tc.success` token.

---

## 6. Empty / Loading / Error states (per screen)

| Screen | State | Behavior |
|---|---|---|
| `/profile` Nudge | Query loading | `<Skeleton className="mx-4 mt-4 h-16 rounded-lg" />` matching nudge dims. |
| `/profile` Nudge | Query error | Nudge does not render (returns `null`). Profile screen otherwise unaffected. Logs error via `console.warn`. |
| `/profile/verification` form | Slot picking | Skeleton overlay on slot while image-manipulator processes. |
| `/profile/verification` form | Submit pending | CTA label → «Отправляем…», disabled. |
| `/profile/verification` form | Submit error | `Alert.alert("Не удалось отправить", err.message ?? "Попробуйте ещё раз")` + CTA re-enables. |
| `/profile/verification` pending/approved | Query loading | Top-level `<Skeleton>` blocks for status row (`h-12 w-full`), each preview (`h-44 w-44 rounded-full`, `h-44 w-full rounded-lg`). |
| `/profile/verification` pending/approved | Query error | EmptyState component: `WifiSlash` icon 48px + title «Не удалось загрузить статус» + body «Проверьте соединение и попробуйте обновить.» + button «Повторить» calling `refetch()`. |
| `/profile/verification` previews | Signed URL fails or expires | Per-image fallback: grey `bg-canvas-soft` block of same dims + caption «Превью недоступно» inside. Other elements render normally. |
| `/profile/verification` withdraw | Mutation pending | Button label «Отзываем…», disabled. |
| `/profile/verification` withdraw | Mutation error | `Alert.alert("Не удалось отозвать", err.message)`. |
| `/master/[id]` chip | Master profile loading | Existing trust-row Skeleton; badge renders after profile resolves. No special handling. |
| `MasterPreviewCard` icon-only | Card loading | Existing card Skeleton; badge naturally absent until level ≥ 1 resolves. |

---

## 7. Accessibility

Mandatory for every interactive element:

- **All Pressables** — `accessibilityRole="button"` + descriptive `accessibilityLabel`. Examples in §5.
- **Checkbox** — `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}` + `accessibilityLabel="Согласие на обработку персональных данных"`.
- **Image previews** — `accessibilityLabel="Селфи с паспортом"` / `"Фото паспорта"` on `<Image>`. Decorative placeholder views (when no image) have `accessibilityElementsHidden`.
- **Cooldown countdown** — `<AppText accessibilityLiveRegion="polite">` so screen readers announce minute changes without spam. Web maps to `aria-live="polite"`.
- **Status header** (pending/approved) — wrap the status row in `<View accessibilityRole="header">` so VoiceOver/TalkBack treats it as section header.
- **Badge chip** — `accessibilityLabel="Паспорт подтверждён модераторами"` on container View.
- **Badge icon-only** — `accessibilityLabel="Паспорт подтверждён"` directly on the Phosphor icon (it forwards to underlying SVG `aria-label`).
- **Rejection banner** — `accessibilityRole="alert"` on the banner View, so it gets announced immediately when screen loads in rejected state.
- **Min tap target 44×44** — image-picker slots are 176px (h-44/w-44), CTA is h-12 = 48px. Checkbox row entire Pressable area covers >44 tap height.
- **Color is never the only signal** — every state has an icon (`Hourglass`, `SealCheck`, `X`, `Warning`) accompanying the colour.
- **Focus order (web):** ScrollView → banner (if rejected) → body paragraph → slot 1 → slot 2 → checkbox → CTA → cooldown text → (footer ghost button if applicable). Linear, predictable.
- **Keyboard (web):** all Pressables focusable. Enter/Space activates. Tab moves down. No focus traps. ScrollView gets keyboard scroll automatically.

---

## 8. Copy reference table (RU only)

Single source of truth for every visible string. If implementation deviates from this, update this table and the file in the same commit.

| # | Screen | Key | Text |
|---|---|---|---|
| 1 | `/profile` nudge A | title | Подтвердите личность |
| 2 | `/profile` nudge A | body | Покажите клиентам что вы реальный мастер. Это занимает 2 минуты. |
| 3 | `/profile` nudge B | title | Заявка на проверке |
| 4 | `/profile` nudge B | body | Обычно 1–3 рабочих дня. Покажем результат здесь. |
| 5 | `/profile` nudge C | title | Паспорт подтверждён |
| 6 | `/profile` nudge C | body | Подтверждено {DD.MM.YYYY} |
| 7 | `/profile` nudge D | title | Заявка отклонена |
| 8 | `/profile` nudge D | body | {rejection_reason} (truncated) |
| 9 | `/profile/verification` | header.title | Подтверждение личности |
| 10 | `/profile/verification` | body.intro | Загрузите селфи и фотографию первой страницы паспорта. Проверка занимает обычно 1–3 рабочих дня (до 5). Документы хранятся защищённо и доступны только модераторам. |
| 11 | `/profile/verification` rejected | banner.title | Заявка отклонена |
| 12 | `/profile/verification` rejected | banner.body | {rejection_reason} |
| 13 | `/profile/verification` | slot1.title | Селфи с паспортом |
| 14 | `/profile/verification` | slot1.hint.empty | Держите паспорт рядом с лицом |
| 15 | `/profile/verification` | slot1.hint.filled | Нажмите чтобы заменить |
| 16 | `/profile/verification` | slot2.title | Паспорт (главная страница) |
| 17 | `/profile/verification` | slot2.hint.empty | Разворот с фотографией |
| 18 | `/profile/verification` | slot2.hint.filled | Нажмите чтобы заменить |
| 19 | `/profile/verification` | checkbox.label | Соглашаюсь на обработку персональных данных в целях верификации личности. |
| 20 | `/profile/verification` | cta.idle | Отправить на проверку |
| 21 | `/profile/verification` | cta.pending | Отправляем… |
| 22 | `/profile/verification` | cooldown.ge60 | Повторно можно через {MM:SS} |
| 23 | `/profile/verification` | cooldown.lt60 | Повторно можно меньше чем через минуту |
| 24 | `/profile/verification` actionsheet | option.camera | Сделать снимок |
| 25 | `/profile/verification` actionsheet | option.gallery | Выбрать из галереи |
| 26 | `/profile/verification` actionsheet | option.cancel | Отмена |
| 27 | `/profile/verification` pending | header.title | На проверке |
| 28 | `/profile/verification` pending | status.title | Заявка на проверке |
| 29 | `/profile/verification` pending | status.timestamp | Отправлено {DD.MM.YYYY в HH:MM} |
| 30 | `/profile/verification` pending | status.body | Обычно проверяем за 1–3 рабочих дня, в редких случаях до 5. Покажем результат здесь и в карточке профиля. |
| 31 | `/profile/verification` pending | preview.selfie | Селфи с паспортом |
| 32 | `/profile/verification` pending | preview.passport | Паспорт |
| 33 | `/profile/verification` pending | withdraw.cta | Отозвать заявку |
| 34 | `/profile/verification` pending | withdraw.pending | Отзываем… |
| 35 | `/profile/verification` pending | withdraw.confirm.title | Отозвать заявку? |
| 36 | `/profile/verification` pending | withdraw.confirm.body | Загруженные фото будут удалены. Повторно подать можно сразу после. |
| 37 | `/profile/verification` pending | withdraw.confirm.cancel | Отмена |
| 38 | `/profile/verification` pending | withdraw.confirm.confirm | Отозвать |
| 39 | `/profile/verification` approved | header.title | Паспорт подтверждён |
| 40 | `/profile/verification` approved | hero.title | Личность подтверждена |
| 41 | `/profile/verification` approved | hero.date | Подтверждено {DD.MM.YYYY} |
| 42 | `/profile/verification` approved | preview.selfie.label | Селфи |
| 43 | `/profile/verification` approved | preview.passport.label | Паспорт |
| 44 | `/profile/verification` approved | footer.note | Документы хранятся защищённо. Видны только модераторам. |
| 45 | `/profile/verification` errors | submit.fail | Не удалось отправить |
| 46 | `/profile/verification` errors | submit.fail.retry | Попробуйте ещё раз |
| 47 | `/profile/verification` errors | withdraw.fail | Не удалось отозвать |
| 48 | `/profile/verification` errors | query.fail.title | Не удалось загрузить статус |
| 49 | `/profile/verification` errors | query.fail.body | Проверьте соединение и попробуйте обновить. |
| 50 | `/profile/verification` errors | query.fail.cta | Повторить |
| 51 | preview fallback | image.unavailable | Превью недоступно |
| 52 | `/master/[id]` chip | text | Паспорт подтверждён |
| 53 | `/master/[id]` chip a11y | label | Паспорт подтверждён модераторами |
| 54 | `MasterPreviewCard` icon a11y | label | Паспорт подтверждён |

---

## 9. Animation / motion

Minimal motion budget; we are not Stripe Dashboard. The fewer transitions, the more "Vercel-grade" trust.

- **Screen transitions** — default Expo Router stack push/pop (~250ms slide). No custom.
- **State-flip after submit** — when `useSubmitVerification` succeeds, screen branches from "form" to "pending" via React render. No explicit fade. The `<ScreenHeader>` title changes from «Подтверждение личности» to «На проверке»; the new content tree mounts. ~16ms paint, no animation overlay.
- **Skeleton shimmer** — if `<Skeleton>` component supports a shimmer (check current impl); if not, static `bg-canvas-soft-2` placeholders are acceptable.
- **Image picker → preview** — native `<Image>` mount transition; iOS gives a free fade-in via `Image.onLoad`. No custom animation.
- **Checkbox tick** — `Pressable` highlights via opacity (RN default). No custom 150ms color transition.
- **Cooldown countdown** — minute-precision; updates via React state on a 60s `setInterval`. No per-second tick to avoid battery drain and motion noise. On screen focus (`useFocusEffect`), recompute remainder once.
- **Rejection banner mount** — appears on initial render, no slide-in. Static. Loud-enough by color contrast alone.
- **CTA disabled → enabled** — opacity 0.4 → 1.0 transitions automatically via Tailwind class swap (RN doesn't animate but the discrete change is perceived correctly).

If implementation discovers a state-change feels jarring (specifically rejected → pending after re-submit), add a 200ms fade via `Animated.View` — but only after verifying with screenshot pair. Not pre-emptive.

---

## 10. Open UX questions

Three small decisions the `/rpi:implement` phase should confirm with the product owner before commit:

1. **Confirm-dialog on "Отозвать заявку"?**
   **Recommendation: YES.** Action deletes Storage files (irreversible from user POV — even if they re-take photos, they re-submit a new request, not "undo"). `Alert.alert` with destructive style on iOS is standard. Two-tap pattern matches Apple HIG. Copy already in §8 rows 35–38.

2. **Cooldown timer refresh cadence — per-second or per-minute?**
   **Recommendation: per-minute + on focus.** Per-second updates would be a "Vercel-grade" loss (visual noise, accessibility live-region spam, battery cost). User does not need second-precision — they need "is it ready yet". Minute-precision + recompute on `useFocusEffect` gives the right resolution. At remainder < 60 sec, switch copy to «менее минуты» and stop the interval (since it doesn't matter anymore — user can refresh manually).

3. **Icon-only badge tooltip on web (hover)?**
   **Recommendation: YES via accessibilityLabel.** React Native Web maps `accessibilityLabel` → `aria-label`, and most browsers expose it as a tooltip on focus (and some on hover when title is also set). We rely on the native mapping rather than building a custom Tooltip component. If product wants explicit visible tooltip on hover web-only — that's a P1 follow-up, not P0.

---

## Appendix — Cross-reference checklist for implementation

Before commit, implementor must verify:

- [ ] No `subtitle=` prop usage on `<ScreenHeader>` or `<BottomSheet>` in this feature's files (design-quality rule G).
- [ ] No inline `style={{ color: "#..." }}` or `backgroundColor: "#..."` anywhere (rule B).
- [ ] All `bg-primary` / `bg-success` / `bg-error` paired with `text-on-*` token in same element tree (rule A).
- [ ] All icons from `phosphor-react-native`, none from `lucide-react-native` in new files (rule D).
- [ ] No `text-caption-xs` / `fontSize: 10` (rule C).
- [ ] No empty `onPress={() => {}}` or `Alert.alert("Скоро")` stubs (rule F).
- [ ] No `disclaimer` text under H1 — explanatory paragraph lives in body (rule G).
- [ ] Lazyweb queries from §2 run before UI code written; output pasted in commit message.
- [ ] Light + dark mode screenshots taken via `mcp__Claude_Preview__preview_screenshot` for all 4 states of `/profile/verification` + nudge variants + chip badge.
- [ ] All copy strings from §8 table present verbatim in code.
- [ ] `accessibilityLabel` on every Pressable / Image / icon-only badge.
- [ ] Cooldown live region uses `accessibilityLiveRegion="polite"`.

End of `ux.md`.
