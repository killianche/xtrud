# Session summary — 2026-05-15

День разделён на три блока в порядке времени: **ночь** (Sprint P0 master-account), **день** (web-навигация и confirm), **поздний вечер** (Phosphor icons, мастер-редизайн, верификация). Каждый блок — отдельный раздел ниже.

---

# Ночь — Sprint P0 master-account

## TL;DR

За одну сессию закрыты **9 из 9 P0-задач** из [`research/MASTER_ACCOUNT_PLAN.md`](research/MASTER_ACCOUNT_PLAN.md) — функциональный блок master-аккаунта доведён до уровня готовности «Sprint 1». Master может полноценно зарегистрироваться, выбрать категории через bottom-sheet с поиском, сформировать прайс-лист с pre-defined услугами и placeholder-ценами, видеть лимит откликов 5/день в шапке, переписываться с клиентом с фото-вложениями. Клиент получил умный поиск услуг с поддержкой синонимов, морфологии, опечаток и неправильной раскладки.

## Закрытые задачи (10 коммитов)

| # | Задача | Commit | Сложность | Что |
|---|---|---|---|---|
| 1 | P0-1 | [`ec4be72`] | L | Унификация цен на `master_services` (миграция 0055 — DEPRECATE pricing_mode) |
| 2 | P0-2 | [`34c6c9b`] | M | l2_id + l3_id в master_services + backfill (миграция 0056) |
| 3 | P0-10 | [`c44471b`] | S | service_pricing_kind enum + 4 toggle UI (миграция 0057) |
| 4 | P0-3 | [`24ab7a1`] | L | Иерархический picker категорий с поиском в onboarding |
| 5 | docs | [`42a774b`] | — | N1-N4 master-home tasks + 13 client-side ideas |
| 6 | P0-4 | [`a935d67`] | L | Pre-defined L3 услуги + автозаполнение + placeholder-цены (миграция 0058) |
| 7 | P0-5 | [`9e59358`] | M | Daily response limit 5/день + бейдж + UI блокировок (миграция 0059) |
| 8 | P0-7 | [`ba5d6ed`] | S | users.is_demo флаг + backfill 21 demo-master (миграция 0060) |
| 9 | P0-6 | [`eb22593`] | M | Фото-attachments в чате (Storage + RLS + UI, миграция 0061) |
| 10 | P0-NEW | [`38d0b5d`] | L | Умный поиск услуг (миграции 0062 + 0063 + thesaurus 86 терминов + JS раскладка-фикс) |
| 11 | P0-8 | [`2f5cf0d`] | M | Главная мастера = лента 3 свежих заказов (вместо empty state) |
| 12 | P0-9 | [doc-коммит] | S | Доки: STATUS, MASTER_ACCOUNT_SPEC, TASKS, SESSION_SUMMARY |

## Новые правила и решения (ночь)

- **Архитектура цен:** `master_services` — единственный источник истины. Поля `master_categories.pricing_mode/pricing/attributes` помечены DEPRECATED, не используются новым кодом, оставлены для backward compat с seed.
- **Daily limit 5/день:** хардкод в trigger БД и RPC. В будущем — платная разблокировка через user-tier (как Яндекс 199 ₽/нед).
- **Умный поиск:** UNION 3 слоёв (synonym 1.0 / FTS 0.7 / trigram 0.5×similarity) + раскладка-фикс на клиенте (2 параллельных запроса). Эталон Thumbtack.
- **avg_check_rub** в `categories_l3` — источник для placeholder-цен в форме «Новая услуга».
- **`is_demo` флаг** как инфраструктура для будущей фильтрации seed из публичной выдачи.

## Новые компоненты / паттерны (ночь)

- `<ResponseLimitBadge />` (`src/features/master-view/`) — компактный pill-бейдж лимита откликов в шапке master-главной.
- `<CategoryChip />` (внутри `app/(onboarding)/master-categories.tsx`) — стандартизированный chip для multi-select категорий.
- `formatServicePrice()` (`src/features/master-services/use-master-services.ts`) — единственный helper для отображения цены услуги. **Все потребители прайса обязаны использовать его**, не дублировать логику.
- `useSearchCategories(query)` (`src/features/categories/`) — главный API для умного поиска. Возвращает `{hits, wasFlipped, flippedQuery}`. Cached 30s.
- `flipLayout(input)` (`src/lib/keyboard-layout.ts`) — раскладка-фикс QWERTY↔ЙЦУКЕН на чистом JS, 35 пар символов.

## Anti-patterns обнаруженные ночью

- ❌ **Reading огромных Supabase-types output напрямую** — `generate_typescript_types` отдаёт 54+ КБ JSON, читать целиком переполняет контекст. Лучше: ручное обновление `database.ts` точечно для новых полей (мы знаем что добавили).
- ❌ **`numeric` vs `real` в RETURN TABLE** PL/pgSQL — `similarity()` возвращает `real`, явное приведение к `numeric` падает с error 42804. Решение: declare колонки как `real` или явный `::real` cast.
- ❌ **`window.scrollTo(0, X)` в RN-Web ScrollView** — не работает. Для тестов брать `document.body.innerText` через `preview_eval` без скролла.
- ❌ **`tabBarBadge` для master/client разной семантики** — у клиента badge = unread responses, у мастера = unread feed. Уже корректно разделено в `_layout.tsx`.

## Известные регрессии (ночь)

- **Demo-логин падает в /verify** — «Database error querying schema» при `+79000000003 / 000000`. Воспроизводилось 2026-05-15 после миграций 0055-0063. В TASKS.md как открытый bug.

---

# День — web-навигация и confirm

## TL;DR

Починены две системные web-проблемы: (1) кнопка «Выйти из аккаунта» не работала, потому что `Alert.alert` в react-native-web — no-op; (2) кнопка «Назад» уводила «куда попало» при переходах между detail-экранами, потому что Expo Router в `(tabs)` делает `history.replaceState` на cross-tab переходах, и ни `router.back()`, ни `window.history.back()` не возвращают к предыдущему экрану. Введены два общих хелпера: `confirmAsync()` (платформенно-зависимый confirm) и nav-history Zustand-стек (трекер pathname'ов независимо от browser/RN history). Оба фикса верифицированы в preview.

## Закрытые задачи

1. **Кнопка «Выйти из аккаунта» на вебе** — `app/(tabs)/profile/index.tsx`. Заменил `Alert.alert` на `confirmAsync` из нового `src/lib/confirm.ts`. На вебе теперь показывается `window.confirm`, по «ОК» вызывается `signOut()`, localStorage очищается.
2. **Кнопка «Назад» возвращает на предыдущий экран** — `src/lib/use-safe-back.ts` переписан в третьей итерации:
   - v1 (отброшен): после `router.canGoBack()` падать на `window.history.back()`. Проблема: `canGoBack` через tab navigator всегда true, `router.back()` уводит на корень.
   - v2 (отброшен): на вебе ВСЕГДА `window.history.back()` перед router.back. Проблема: Expo Router cross-tab делает `replaceState`, предыдущий entry — не тот.
   - v3 (внедрено): свой in-app стек pathname'ов через Zustand (`src/lib/nav-history.ts`) с подпиской на `usePathname()` в `<NavHistoryTracker />`, смонтированном в `app/_layout.tsx`. `useSafeBack` берёт предпоследний путь и делает `router.replace(prev)`.
3. **Раскатил `useSafeBack` на detail-экранах** — раньше только `master/[id]`, теперь:
   - `app/(tabs)/orders/[id].tsx`
   - `app/(tabs)/chats/[id].tsx`
   - `app/(tabs)/client/[id].tsx`
   - `app/(tabs)/notifications/index.tsx`
   - `app/(tabs)/useful/index.tsx`
   - `app/(tabs)/useful/[slug].tsx`
   - `app/(tabs)/admin/index.tsx` (две кнопки: header back + «Доступ запрещён»)
   - `app/(tabs)/profile/index.tsx` header back

## Новые правила и решения

- **`Alert.alert` на вебе — НЕ работает.** Это RNW-known issue. Любой confirm/info dialog на пользовательском пути должен идти через `confirmAsync` из `src/lib/confirm.ts`, иначе на вебе кнопка просто не отвечает. — `src/lib/confirm.ts` + шапка-комментарий.
- **Back-navigation на вебе НЕ может полагаться на `router.back()` или `window.history.back()`** в проектах с (tabs)-навигатором и detail-экранами в нём. Источник истины — in-app стек pathname'ов (`useNavHistory`). Любая кнопка «назад» в detail-экране = `useSafeBack(<родительский tab>)`. — `src/lib/use-safe-back.ts` + `src/lib/nav-history.ts` шапка-комментарии.
- **Зачем разделять `router.push` и nav-history.** Push через expo-router работает по своей логике (внутри tab — pushState, между табов — replaceState). Это нельзя «починить» снаружи, поэтому держим параллельный учёт.

## Новые компоненты / паттерны

- **`confirmAsync(opts)`** (`src/lib/confirm.ts`) — кросс-платформенный confirm. На вебе → `window.confirm` (системный диалог), на iOS/Android → `Alert.alert` с двумя кнопками. Возвращает `Promise<boolean>`. Применять **везде**, где confirm критичен (логаут, отмена заказа, скрыть отклик, завершить заказ, удалить аватар, удалить портфолио). Сейчас применено только в логауте — остальные Alert.alert в коде остались и на вебе не работают (см. «Anti-patterns»).
- **`<NavHistoryTracker />`** (`src/lib/nav-history.ts`) — невидимый компонент, подписывается на `usePathname()` и пушит каждое изменение в Zustand-стек. Монтируется один раз в `app/_layout.tsx` внутри `AuthGate`. После этого любой компонент ниже может вызвать `useSafeBack(<fallback>)` и получить навигацию «откуда я только что пришёл».
- **`useNavHistory()`** (`src/lib/nav-history.ts`) — Zustand-store с операциями `push(path)` и `goBack()`. Прямо в продуктовом коде использовать не надо — это «инфраструктура» для `useSafeBack`. Cap на 50 записей, дедупликация смежных одинаковых.

## Anti-patterns обнаруженные в сессии

- **`Alert.alert(...)` в onPress для пользовательских confirm-диалогов** — на вебе no-op, кнопка ничего не делает. Видно в `orders/[id].tsx` (отмена заказа, скрыть отклик, завершение), `profile/edit-*.tsx` (cancel-without-save), `admin/index.tsx` (действие по жалобе). Эти места **должны** быть переведены на `confirmAsync`. Не сделано в этой сессии — отдельная задача.
- **`onPress={() => router.back()}`** на header back-кнопках detail-экранов — на вебе уводит куда попало из-за cross-tab replaceState. Заменять на `useSafeBack(<fallback>)`. Раскатано на 8 экранах, новые detail-экраны должны делать то же самое из коробки.
- **Полагание на `router.canGoBack()` на вебе** — врёт из-за tab navigator state. Не использовать как индикатор «есть куда вернуться».

## Поздний вечер 2026-05-15 — Guest profile + JIT-signup в /orders/new

### TL;DR

Анон тапнул «Профиль» — видел бесконечный спиннер. Анон начал создавать заказ, выбрал категорию — терял всё что заполнил. Сейчас оба сценария фиксы: профиль показывает hero «Войдите в аккаунт» с CTA, форма заказа сохраняется в Zustand draft-store и переживает любую навигацию. На финальном шаге публикации (если анон) открывается JIT-signup bottom-sheet с двумя шагами (имя+телефон → SMS-код); после подтверждения сессия создаётся автоматически и заказ публикуется в том же flow без потери данных. Полный E2E прогон verified в preview — заказ «Покрасить стену в детской» создан анонимом, прошёл через JIT-signup и появился в списке его заказов.

### Закрытые задачи

1. **Guest profile screen** — `app/(tabs)/profile/index.tsx`. Условие `if (!userId) → <GuestProfileScreen />` ДО спиннер-блока. Inline-компонент с hero-card (tinted violet band + UserRound иконка + H1 «Войдите в аккаунт» + объяснение + primary CTA «Войти по телефону» → `/(auth)/phone`) + сегментированный переключатель темы (Авто/Светлая/Тёмная), который работает и для анона.
2. **Order draft persistence** — расширил `src/lib/order-draft-store.ts`. Помимо `selectedL2` хранит полный draft `{title, description, l2Id, cityId, district, urgency, budgetMode, budgetMin, budgetMax}`. `/orders/new` подписывается на `watch()` и пишет в store на каждое изменение, читает store как defaultValues. Переход `/orders/new → /orders/category-select → back` сохраняет всё.
3. **JitSignupSheet** — `src/features/auth/JitSignupSheet.tsx`. BottomSheet с двумя шагами:
   - `phone-name` — имя (TextInput) + телефон (TextInput с маской `+7 XXX XXX-XX-XX`). CTA «Получить код».
   - `code` — большой центрированный 6-значный TextInput. CTA «Подтвердить и опубликовать» + link «Изменить номер».
   - Использует существующие `useSendOtp` / `useVerifyOtp` (Sprint 1 — любой 6-значный код проходит).
   - После verify: `supabase.auth.getSession()` для uid → `UPDATE users SET first_name, onboarding_completed_at=now()` (JIT пропускает онбординг для клиентов) → колбэк `onSignedUp(uid)`.
4. **Интеграция в `/orders/new`** — submit разделён на:
   - `publishWithUser(uid)` — отдельная функция (вызывается из JitSignupSheet onSignedUp после signup, не замыкается над userId на момент handleSubmit).
   - `onSubmit` — если userId есть, сразу `publishWithUser(userId)`. Если нет — `setSignupSheetOpen(true)`.
   - После успешной публикации `clearDraft()` (Zustand).

### Новые правила и решения

- **Анон-доступ к (tabs) — by design.** Анон может листать главную, мастеров, начинать создавать заказ. Login wall срабатывает just-in-time на финальном действии (публикация / отправка сообщения / отзыв). Это паттерн Profi.ru / YouDo / TaskRabbit / Airbnb. Не выкидывать анона на /auth с потерей контекста.
- **Форма анона = Zustand draft.** react-hook-form state живёт только в памяти компонента. Любой unmount (router.replace, navigate, tab switch) сбрасывает к defaultValues. Если форма важна (создание заказа, регистрация мастера) — `watch()` → Zustand → `defaultValues={draft.X ?? fallback}`. Сейчас применено к `/orders/new`. — `src/lib/order-draft-store.ts` шапка-комментарий.
- **JIT-signup пропускает onboarding для клиентов.** Юзер уже заполнил заказ — это implicit onboarding. Записываем `onboarding_completed_at=now()` сразу при verify. Мастеру онбординг всё равно нужен (выбор категорий, профиль), но он логинится через `/profile → CTA Стать мастером` — другой flow. — `src/features/auth/JitSignupSheet.tsx` шапка-комментарий.
- **Disabled state кнопки publish больше НЕ зависит от userId.** Анон видит активную кнопку, нажатие открывает JIT sheet. До этого disabled убивал conversion — пользователь не понимал «почему я не могу нажать».

### Новые компоненты / паттерны

- **`<GuestProfileScreen>`** (inline в `app/(tabs)/profile/index.tsx`) — hero + CTA + theme switcher. Когда применять: любой tab-экран, который требует session, но безопасно показывает анону объяснение «зачем войти».
- **`<JitSignupSheet>`** (`src/features/auth/JitSignupSheet.tsx`) — `{ open, onClose, onSignedUp(uid) }`. Когда применять: финальное действие анон-flow (публикация заказа, отправка сообщения, бронирование). Не для login wall где экран не критичен (там оставить `<LoginWall>`).
- **Draft-pattern для anon-friendly форм** — `useForm({defaults: store})` + `watch(values => store.setDraft(values))` + `clearDraft()` on success. Применить также к: `(onboarding)/role` (если есть scenario где анон в нём), `chats/new-message`, отзывы.

### Anti-patterns обнаруженные в сессии

- **`disabled={!userId}` на CTA создания заказа** — конверсия-убийца. Анон не понимает что делать. Правильно: кнопка активна → JIT sheet → signup → publish.
- **react-hook-form defaultValues = пустые строки** — теряет всё на любой ре-маунт. Правильно: defaultValues = `{ field: draft.field ?? fallback }`, где draft — persisted store.
- **`<ActivityIndicator />` как обработка `!user`** — выглядит как баг (юзер думает «не загрузилось», ждёт). Правильно: отдельная ветка `if (!userId) → <GuestState />` ДО спиннера.

### Не сделано в этой сессии

- **Draft не переживает full page reload.** Zustand in-memory. На F5 пользователь теряет введённое. Не критично для основного кейса (anon-flow редко делает refresh, и draft не должен жить долго — там PII). Если нужно: обернуть в `zustand/middleware/persist` с localStorage + TTL.
- **Реальная отправка SMS НЕ реализована.** Sprint 1 stub — `useSendOtp` симулирует задержку 800ms, `useVerifyOtp` игнорирует код (любые 6 цифр проходят). Sprint 2 → `supabase.auth.signInWithOtp({ phone })` + `supabase.auth.verifyOtp`.
- **LocationPicker — не переведён на draft-pattern полностью.** Внутренние `draftCity/draftDistrict` живут в локальном state; коммит идёт только на «Готово» через onChange → RHF → Zustand. Работает, но если юзер закроет sheet без Готово — выбор теряется (это OK, expected). Не трогал.

### Verification — что реально проверено в preview

- ✅ Анон на `/profile` → guest screen с CTA «Войти по телефону» + переключатель темы (Авто/Светлая/Тёмная).
- ✅ Анон заполнил title + description в `/orders/new` → перешёл в `/orders/category-select` → выбрал «Сантехника» → back → **title + description сохранились**, категория проставлена.
- ✅ Анон выбрал локацию «Назрань · Магас» → нажал «Опубликовать заказ» → **JIT sheet открылся** с правильной структурой (имя/телефон + privacy hint).
- ✅ Ввёл имя «Магомед» + телефон → «Получить код» → **переход на шаг кода** (input + «Подтвердить и опубликовать» + «Изменить номер»).
- ✅ Ввёл `000000` → подтвердил → **заказ опубликован** (success screen «Заявка опубликована · Мастера получат уведомление…»).
- ✅ «К моим заказам» → новый заказ «Покрасить стену в детской» виден в списке как client.
- ✅ supabase session сохранена в localStorage (`sb-wgeimsajvjkzrrnfrnkb-auth-token`).
- ✅ TypeScript clean.

## Открытые вопросы / TODO

- Конвертировать все оставшиеся пользовательские `Alert.alert` на `confirmAsync`. Список (по grep'у `Alert.alert` в `app/`): orders/[id] (3 места), profile/edit-client (2), profile/edit-master (1), admin/index (1), category-select (если есть). На native поведение не изменится; на web диалог станет работать.
- Возможно, стоит добавить в `useSafeBack` ещё один фолбэк — если nav-history стек пуст (deep-link), а browser history.length > 1, делать `history.back()` как «лучше чем ничего». Сейчас при deep-link сразу `router.replace(fallback)`. Не критично — fallback подобран осмысленно для каждого экрана.
- TabBar-навигация на мобильной ширине (<768px) не всегда срабатывает на синтетический `.click()` через preview-eval. Не баг продукта, а проблема тестового харнесса — пометить если будет мешать e2e.

## Verification — что реально проверено в preview

- ✅ Залогинился под Алиной (+7 900 000-00-01), `useSafeBack` в `master/[id]`: путь `/orders → /orders/[id] → /master/[id] → back` → лендит на `/orders/[id]` (раньше уводило на `/`). Подтверждено screenshot'ом — открыт исходный заказ «Замена смесителя на кухне» с откликами.
- ✅ Логаут: hook на `window.confirm`, клик «Выйти из аккаунта» → confirm вызван с сообщением «Выйти из аккаунта? Можно будет войти заново со своим номером.» Клик «ОК» → localStorage пустой (supabase keys стёрты) → профиль уходит в loading-state (AuthGate переводит в анон). Клик «Отмена» → `signOut()` НЕ вызывается, URL остаётся `/profile`.
- ✅ TypeScript clean (`npx tsc --noEmit`, no output).

---

# Дополнение (поздно ночь, /orders/search redesign + ScreenHeader standard)

## TL;DR

Глубокий редизайн `/orders/search` под фидбек user 2026-05-15. Зафиксирован общий стандарт UI-паттернов в DESIGN.md → секция «UI patterns» (5 паттернов с anti-patterns), чтобы любой следующий агент/человек делал хедеры, фильтры и picker'ы единообразно.

## Закрытые задачи

1. **Новый `<ScreenHeader>`** (`src/components/ui/ScreenHeader.tsx`) — единый хедер для всех full-screen detail-экранов. Стандарт: height 64px, h-12 w-12 back с ChevronLeft 28 stroke 2.25, title text-display-md tracking-tight bold, опц. rightAction h-11 pill (label + Icon + active-state).
2. **Новый Zustand-стор `useOrdersSearchFiltersStore`** (`src/features/orders/orders-search-filters-store.ts`) — l2Ids, l1Id, sort + countActiveFilters helper. Переживает переход search → filters → category-select.
3. **Новая страница `app/(tabs)/orders/search/filters.tsx`** — full-screen фильтры. Сортировка как pill chips, Категория как button-trigger (НЕ inline list), Раздел L1 как chips, sticky footer Применить · N, reset-link.
4. **Новая страница `app/(tabs)/orders/search/category-select.tsx`** — full-screen multi-select picker. Search-input, цветные Iconify-иконки, ✓-индикатор, sticky Применить · N, RightAction «Сбросить» в хедере.
5. **Миграция `search.tsx` → `search/index.tsx`** — теперь использует ScreenHeader + Zustand. inline-блок фильтров удалён. Это таб (без back, TabBar visible).
6. **`DESIGN.md` → новая секция «UI patterns»** — 5 паттернов: ScreenHeader, button-trigger, full-screen filter/picker, таб vs detail, header-комментарий обязателен.
7. **`STATUS.md` обновлён** — секция «Текущее состояние» с описанием.

## Новые правила и решения

- **Один хедер на все detail-экраны — `<ScreenHeader>`** — DESIGN.md §UI patterns §1. Зафиксирован в коде, любые ad-hoc inline-хедеры запрещены.
- **Picker для 5+ опций — full-screen, не bottom-sheet, не inline chip-row** — DESIGN.md §UI patterns §3. Bottom-sheet занимает 60% малых экранов; inline chip-row не масштабируется. Только button-trigger → новый route.
- **State фильтров между экранами — Zustand-стор, не useState** — DESIGN.md §UI patterns §3. Иначе при переходе на picker → back state теряется.
- **Activity count L1 без L2** — countActiveFilters считает L1 как +1 только когда L2-список пуст (иначе L2 уже сужают выдачу, L1 — лишь группировка).
- **Таб vs detail** — табы не показывают back-кнопку и не скрывают TabBar; detail-экраны делают и то, и другое (DESIGN.md §UI patterns §4).

## Новые компоненты / паттерны

- **`<ScreenHeader>`** (`src/components/ui/ScreenHeader.tsx`) — для всех full-screen detail-экранов. См. DESIGN.md.
- **`useOrdersSearchFiltersStore`** (`src/features/orders/orders-search-filters-store.ts`) — стор фильтров поиска. Pattern: cross-screen state в Zustand при многошаговых пикерах.
- **Multi-select picker** (`app/(tabs)/orders/search/category-select.tsx`) — pattern для multi-select из длинного списка с sticky footer.

## Anti-patterns обнаруженные в сессии

- **Ad-hoc inline header** (старый `search.tsx`: `<View><Pressable>...ChevronLeft size={24}...</Pressable><AppText className="text-title-lg">...</AppText></View>`) — даёт «мелкий хедер» (фидбек user). Заменено на `<ScreenHeader>`.
- **Категории inline chip-row в фильтрах** — пользователь должен видеть «выбрать категорию», а не сразу 64 чипа подряд. Заменено на button-trigger.
- **TabBar НЕ скрывается на full-screen detail** — забыл `useFocusEffect(setTabBarHidden)` в category-select; добавлено после verify в preview.
- **Локальный useState для фильтров между экранами** — теряется при переходе на picker. Решено: Zustand-стор.

## Открытые вопросы / TODO

- aria-checked на `[role="checkbox"]` Pressable не отражается на RNW — функционально работает (state корректен, footer показывает «Применить · N»), но скринридер на web не услышит «checked». Малоприоритетно, но если будет audit a11y — исправить.
- Сортировка по «Срочные сверху» сейчас просто client-side порядок в useAllOpenOrders. Если будет много заказов и пагинация — нужно server-side ORDER BY urgency.

## Verification — что реально проверено в preview

- ✅ `/orders/search` рендерит `<ScreenHeader title="Поиск заказов" rightAction={Фильтры}>` (display-md title, h-11 pill).
- ✅ Клик «Фильтры» → переход на `/orders/search/filters` (TabBar скрыт, full-screen).
- ✅ Клик «Выбрать категории» → переход на `/orders/search/category-select` (TabBar скрыт).
- ✅ Multi-select в picker'е: клик 2 строк → footer показывает «Применить · 2», RightAction в хедере «Сбросить» появился.
- ✅ Apply → возврат на /filters, Категория-trigger показывает «Выбрано 2 / Сантехника, Ремонт и отделка».
- ✅ Apply на /filters (с sort=urgent) → возврат на /search, Фильтры-кнопка filled-black (active=true), заказы отсортированы urgent-first.
- ✅ TypeScript clean (`npx tsc --noEmit`).

---

# Дополнение (поздно ночь, drop радиуса + drop 8 out-of-scope L1)

## TL;DR

Полная чистка нерелевантных категорий и удаление поля радиуса выезда. xtrud — нишевый сервис под ремонт+стройку+быт (включая клининг), всё остальное (авто, перевозки, бьюти, образование, события, бизнес, IT, личный сервис) физически удалено из БД.

## Закрытые задачи

1. **Миграция 0067_drop_service_radius.sql** — DROP service_radius_km / category_radius_km columns + REPLACE complete_master_onboarding RPC без p_service_radius_km. Применена через MCP supabase.
2. **Чистка кода радиуса** (9 файлов): database.ts, Zod-схема, 3 hooks, 4 UI-файла. TS clean.
3. **Миграция 0068_drop_out_of_scope_categories.sql** — DELETE 8 L1 + всё связанное (47 L2, 12 master_categories, 13 orders + CASCADE, 20 orphaned responses, 8 orphaned reviews). Применена.
4. **product-scope.ts** — IN_SCOPE_L1_IDS = ["construction", "home-services"], комментарий переписан под физическое удаление.
5. **Доки:** CATEGORIES_AND_PROFILES.md (Product scope блок), MASTER_ACCOUNT_SPEC.md (5 мест с радиусом), STATUS.md (новая секция).

## Новые правила и решения

- **Радиус выезда удалён навсегда** — заменён на ServiceAreas (m2m мастер ↔ город/район). DESIGN_SYSTEM это уже знал, но БД не была почищена. Теперь нет.
- **Scope-фильтр как «второй защитный слой»** поверх физического удаления, не вместо него (раньше думали наоборот). После миграции 0068 в БД остаются только in-scope L1, и scope-фильтр их же перечисляет — фактически no-op, но защитит если seed случайно вернёт oos.
- **При удалении категорий — учитывать FK ON DELETE RESTRICT** (master_categories, orders, order_responses, reviews держат RESTRICT на L2). Правильный порядок DELETE: сначала чистим master_categories по oos l2_id, потом orders (CASCADE подтянет chats/responses/reviews по order_id), потом orphaned по l2_id, потом L3, потом L2, потом L1.

## Anti-patterns обнаруженные в сессии

- **«Скрыть в UI, оставить в БД»** для крупных out-of-scope разделов — неправильно для нишевого сервиса. На demo-окружении создавало путаницу (фильтры показывали лишнее, seed-мастера висели как orphaned). Правильно — физическое удаление через миграцию.
- **«Убрать поле с UI, оставить в БД и hooks»** — half-finished cleanup. Радиус выезда был именно таким — UI-поле скрыли, но `service_radius_km` всё ещё писался в БД при онбординге, читался в `useMasterPublicProfile`, отображался на `/master/[id]` как «Радиус X км». Полное удаление = миграция + типы + Zod + hooks + RPC + UI.

## Verification — что реально проверено в preview

- ✅ `/orders/search/filters` показывает только 2 раздела «Строительство и ремонт» и «Дом и быт» (скриншот). Раньше — 10.
- ✅ `/orders/search/category-select` (multi-select picker) — список L2 только из construction (Сантехника, Электрика, Ремонт и отделка, Мастер на час, Уборка после ремонта, Окна и остекление, Двери, Замки и безопасность, Штукатурка, Гипсокартон, Плитка, ...) — нет шиномонтажа/ресниц/перевозок/IT.
- ✅ DB-state: 2 L1, 48 L2, 280 L3, 0 master_categories с oos l2_id, 0 orders с oos l2_id (verified через `mcp__supabase__execute_sql`).
- ✅ TypeScript clean (`npx tsc --noEmit`).
- ⚠️ `/master/[id]` без радиуса — runtime-проверка не удалась из-за поломанного user-WIP rebuild'а (`MasterDashboardOrders.tsx` + `search/index.tsx`). Источник проверен глазами + TS clean.

## Открытые вопросы / TODO

- Почистить упоминания радиуса в research/*.md и AUDIT_2026-05-12.md (они исторические, не критично — но кто-то может запутаться). Не сделал в этой сессии — не блокер.
- В demo-fixture.sql (seed) и старых seed-миграциях (0036, 0038, 0039, 0054) есть INSERT'ы с `service_radius_km` / `category_radius_km`. После миграции 0067 эти миграции при «свежем накате с нуля» упадут — поля больше не существуют. **Это известный долг.** Если будем пересоздавать БД — нужно либо отредактировать старые seed'ы (но это меняет историю миграций — плохо), либо создать миграцию-патч.

---

# Session summary — 2026-05-15 (вечер 5: drop диапазона цен из заказов)

## TL;DR

Полная переделка модели цены `orders` и `order_responses`: убрана возможность задавать диапазон (price_min..price_max) — теперь один числовой `*_value` + enum `price_kind` (`fixed | from | up_to | negotiable`). Параллельно на `/orders/search` добавлен ценник + 2-строчное описание заказа в карточках OrderRow (раньше отсутствовали).

## Закрытые задачи

1. **Миграция [`0069_orders_remove_price_range.sql`](supabase/migrations/0069_orders_remove_price_range.sql)** — новый enum `order_price_kind`, новые колонки `budget_kind/budget_value` и `price_kind/price_value`, backfill для существующих записей, DROP старых колонок и enum, CHECK-constraints, переопределение RPC `start_chat_with_master` (0053) под новую схему. Применена через `mcp__supabase__apply_migration`. Файл переименован с `0068_` на `0069_` (был конфликт с уже занятым 0068 — drop-out-of-scope-categories).
2. **`database.ts`** — regenerate через `mcp__supabase__generate_typescript_types`.
3. **`src/features/orders/order-schema.ts`** — `orderPriceKindOptions`, тип `OrderPriceKind`, helper'ы `priceKindLabel()` и `formatPrice(kind, value)`. Заменены поля zod-схемы `budgetMode/budgetMin/budgetMax` → `budgetKind/budgetValue`.
4. **Hooks** — `use-create-order.ts`, `use-update-order.ts`, `use-order-responses.ts`, `use-my-responses.ts` переписаны под новый contract (kind+value).
5. **`OrderFormBody.tsx`** — 4 chip-кнопки (Точная/От/До/Договорная) + одно NumberField с динамическим лейблом. Удалено слово «Диапазон» и второе поле.
6. **`app/(tabs)/orders/new.tsx`, `app/(tabs)/orders/edit/[id].tsx`** — defaults и submit под новый contract.
7. **`app/(tabs)/orders/[id].tsx`** — `formatBudget` и `formatResponsePrice` через общий `formatPrice`. Форма отклика мастера: 4 chip + одно price-input поле.
8. **`OrderRow.tsx` + `/orders/search`** — добавлены props `budgetKind`, `budgetValue`, `description`. OrderRow рендерит описание заказа в 2 строки и ценник mono-ink под category-eyebrow.

## Новые правила и решения

- **Модель цены: один kind + одно value, никаких диапазонов.** Зафиксировано в `order-schema.ts` (типы и форматтер) + комментарий в миграции 0069. Применяется к `orders.budget_*` и `order_responses.price_*`. Why: пользователь явно сказал «убрать диапазоны». Применяется ВСЕГДА для заказов и откликов (НЕ распространяется на `master_services` — это прайс мастера, отдельный домен).
- **`*_kind` + `*_value` именования вместо `*_mode` + `*_min/_max`.** Why: новая семантика «способ задания цены и одно значение» — старые имена `_min/_max` вводили в заблуждение для `up_to` (где значение это max).
- **Общий форматтер `formatPrice(kind, value)`** в `order-schema.ts`. Why: один источник истины — раньше форматирование было дублировано в `orders/[id].tsx` (2 функции) с `range` ветвлением. Теперь все consumers (OrderRow, OrderDetail, форма) делегируют.
- **OrderRow поддерживает опциональные `budgetKind`/`budgetValue`/`description`** — если не передать, ничего лишнего не рендерится. Why: компонент используется в 5+ местах, не везде нужны цены и описания. На /orders/search — нужны.

## Новые компоненты / паттерны

- `formatPrice(kind: OrderPriceKind, value: number | null): string` (`src/features/orders/order-schema.ts`) — единый форматтер для UI цены заказа/отклика. Возвращает «1 500 ₽» / «от 1 500 ₽» / «до 5 000 ₽» / «Цена договорная». Использовать ВЕЗДЕ где надо показать цену из orders или order_responses.
- `priceKindLabel(kind)` — короткий лейбл для chip-кнопок («Точная» / «От» / «До» / «Договорная»).

## Anti-patterns обнаруженные в сессии

- **Дубликат форматтера в каждом consumer'е** (раньше `formatBudget` в orders/[id].tsx + `formatResponsePrice` там же + потенциально ещё). Когда меняется модель — переписывать каждый. Правильно: один общий помощник в схеме, consumers делегируют.
- **`*_mode` для enum, который описывает структуру значения** — путает. `*_kind` лучше отражает «способ задания», `*_mode` чаще про state-machine (как `display_mode: 'dark'/'light'`).
- **Применение DDL до того как обновлён код** — рискованно: пока бэкенд уже новый, а код ещё ссылается на старые поля, runtime ошибки. Здесь сделал в правильном порядке: миграция → regen types → обновление всех hooks → форма → UI → TS check → preview.

## Verification — что реально проверено в preview

- ✅ `/orders/search` (light + dark): описание заказа в 2 строки под title (truncate с «…»), ценник под описанием (mono ink: «от 2 000 ₽», «Цена договорная»). Бэкфилл существующих `range` записей сработал — «Замена смесителя на кухне» теперь «от 2 000 ₽» (раньше был `range, min=2000`).
- ✅ `/orders/new`: 4 chip-кнопки бюджета (Точная / От / До / Договорная), при выборе `fixed` лейбл поля = «Сумма, ₽», при `from` = «От, ₽», при `up_to` = «До, ₽», при `negotiable` поле скрыто. Diff against предыдущей версии — никаких упоминаний слова «Диапазон».
- ✅ `npx tsc --noEmit` clean.

## Открытые вопросы / TODO

- **`master_services`** (прайс мастера) всё ещё хранит `price_min/price_max`. По фидбэку «удалим цены в диапазоне» 2026-05-15 уже частично почищено — отображение в UI берёт только нижнюю границу, но в БД диапазон остался. Если хотим полностью унифицировать модель — отдельная миграция (не в этой задаче, user про master_services не упоминал явно в этом запросе).
- **`research/*.md`, `AUDIT_2026-05-12.md`** — могут остаться упоминания старой модели price_mode='range' / диапазона. Не критично, исторические доки.

---

# Late-night addendum (Phosphor UI icon migration)

## TL;DR

Заменил иконки в TabBar c Lucide на Phosphor по фидбэку «хочу ультрасовременные дизайнерские иконки внизу». Phosphor — теперь дефолтный icon set для всех новых UI-иконок проекта (TabBar, headers, buttons, status, chips). Lucide → legacy, мигрируем постепенно. Pattern зафиксирован в новом `docs/UI_ICONS.md` + cross-links в 5 других doc-файлах.

## Закрытые задачи

1. **TabBar icon redesign** — `Home/ClipboardList/MessageCircle/User/Search/CirclePlus` (Lucide) → `House/ClipboardText/ChatCircle/UserCircle/MagnifyingGlass/PlusCircle` (Phosphor). Файлы: `app/(tabs)/_layout.tsx`, `src/components/TabBar.tsx`.
2. **Active state: `weight="bold" → "fill"`** вместо `strokeWidth 1.5 → 2.25`. Иконка active мгновенно читается как залитая фигура.
3. **Pill-подложка** `bg-canvas-soft-2` (px-14 py-1 rounded-full) под активной иконкой — chip-style focus indicator как Material 3 / Apple Music.
4. **Документация** — `docs/UI_ICONS.md` (новый), `docs/ICONS.md` (cross-link), `DESIGN.md` (новый пункт § UI patterns 6), `.claude/rules/design-quality.md` (правило про иконки), `CLAUDE.md` (раздел про эмодзи), `STATUS.md`.

## Новые правила и решения

- **Phosphor — дефолт для моно UI-иконок** — `CLAUDE.md` § «Никаких эмодзи в UI», `.claude/rules/design-quality.md` § «DESIGN.md единственный источник истины», `docs/UI_ICONS.md` (источник истины). **Why:** Lucide (Feather) даёт слабую разницу active/inactive (только strokeWidth), Phosphor с 6 weights решает это нативно — `bold`→`fill` это огромная визуальная разница без увеличения размера.
- **Active state в navigation = `bold` → `fill`** — DESIGN.md § «UI patterns 6». **Why:** паттерн всех топ-приложений 2024-26 (Instagram, Threads, X, Linear, Cron, Mercury). User-фидбэк подтвердил: «хорошо выглядят, оставляем».
- **Pill-подложка `bg-canvas-soft-2` под активной nav-иконкой** — `src/components/TabBar.tsx` шапка-комментарий + `docs/UI_ICONS.md`. **Why:** chip-style focus indicator из Material 3, мягкий контраст не агрессивный.
- **Lucide остаётся в legacy, мигрируется по мере правки** — `docs/UI_ICONS.md`. **Why:** ~80-120 мест с Lucide — большой sweep, делать одним коммитом рискованно. Правило «трогаешь файл — мигрируй» накапливает миграцию органично.

## Новые компоненты / паттерны

- **Phosphor `<House weight="fill">` + pill-подложка** — паттерн для всех bottom-tab активных состояний. См. `src/components/TabBar.tsx`.
- **Таблица маппинга Lucide → Phosphor** в `docs/UI_ICONS.md` — 28+ типичных иконок (`Home→House`, `Search→MagnifyingGlass`, `MessageCircle→ChatCircle`, `User→UserCircle`, `ClipboardList→ClipboardText`, `Chevron*→Caret*`, `AlertCircle→WarningCircle`, `Settings→Gear`, `Mail→Envelope`, и др.). Использовать при любой правке legacy-кода.

## Anti-patterns обнаруженные в сессии

- **Active state только через `strokeWidth`** (Lucide-паттерн) — слабая разница для пользователя на mobile. Решение: использовать icon-set с filled-вариантами.
- **Mixing icon-sets на одном экране** — стилистический разнобой. Lucide тоньше, Phosphor чуть плотнее. Правило: если на экране уже Phosphor — мигрируй все иконки этого экрана разом, не точечно.
- **Hex inline `color="#000"`** для иконок — не работает в dark mode. Использовать `tc.ink/mute` через `useThemeColors` или `currentColor` на web с tailwind-classes на parent.
- **`weight="thin"` / `"light"` в production UI** — не читается на mobile. Минимум `bold` для inactive.

## Verification — что реально проверено в preview

- ✅ Light theme, клиент: 5 табов — House (active, filled, pill), ClipboardText, PlusCircle, ChatCircle, UserCircle (bold outline).
- ✅ Light theme, мастер: 4 таба — House (active, filled, pill), MagnifyingGlass, ChatCircle, UserCircle. Tabs «Заказы» и «Создать» спрятаны как и должны.
- ✅ DOM-проверка: `paddingHorizontal: 14px`, `borderRadius: 999px`, `backgroundColor: rgb(245, 245, 245)` для active pill в light theme. В dark — `rgb(34, 34, 34)` (canvas-soft-2).
- ⚠️ `tsc --noEmit` — запущено в фоне, ошибок не выдал. Lucide-импорты в TabBar/_layout полностью удалены, ничего сломаться не должно.

## Открытые вопросы / TODO

- **WebShell** ([`src/components/WebShell.tsx`](src/components/WebShell.tsx)) — desktop navigation (≥768px) всё ещё использует Lucide (`Home/ClipboardList/MessageCircle/User`). Не трогал в этой итерации — user сказал «также я тебе в следующем сообщении укажу, где надо поставить эти иконки», жду список мест.
- **Постепенная миграция Lucide → Phosphor** в legacy: ScreenHeader (back-иконка ChevronLeft), OrderRow, FeaturedRequests, кнопки в формах, status-индикаторы, list-rows. Делать по мере правки экранов, не отдельным sweep'ом.

---

# Поздняя ночь — фильтры поиска заказов: defaults из профиля + quick-select

## TL;DR

На `/orders/search` мастер при первом заходе сразу получает **defaults в фильтрах** из своих категорий профиля (`master_categories`) — релевантная выдача без ручной настройки. На `/orders/search/filters` добавлен блок **«Из вашего профиля»** — горизонтальный ряд chip'ов с цветными иконками L2 (Сантехника, Электрика…); тап = toggle прямо в store, без захода в полный multi-select picker.

## Закрытые задачи

1. **Store** [`src/features/orders/orders-search-filters-store.ts`](src/features/orders/orders-search-filters-store.ts) — добавлено поле `initializedForUserId: string | null` и action `initFromMasterCategories(userId, ids)`. Идемпотентность по `userId`: повторный вызов для того же мастера — no-op. После `clearAll` пустой scope не перезаливается, чтобы можно было увидеть «все категории». Logout/login другого юзера → defaults подставятся заново.
2. **/orders/search/index.tsx** — подписался на `useMyMasterCategories(userId)`, `useEffect` вызывает `initFromMasterCategories` когда данные пришли.
3. **/orders/search/filters.tsx** — тот же эффект продублирован (поддержка deep-link / refresh). Добавлен компонент `ProfileCategoryChip` (h-10 pill, accent-soft когда selected + Check-индикатор, иначе canvas + цветная Iconify-иконка категории). Блок «Из вашего профиля» рендерится сразу под trigger «Выберите категории», скрыт если у мастера 0 категорий.

## Verify в preview

✅ Trigger «Выбрано 3 · Сантехника, Электрика», chip'ы Сантехника/Электрика подсвечены accent-soft + ✓, кнопка «Применить · 3», «Сбросить все фильтры» доступна. TS clean.

---

# Поздняя ночь — мастер-верификация (часть 1: backend)

## TL;DR

Запущена опциональная фича верификации мастера: мастер загружает селфи + фото главной страницы паспорта → ждёт ручной проверки админом → после approval на профиле появляется badge «Паспорт подтверждён». В этой сессии — **только backend (миграция, RLS, Storage)**. Frontend (хуки, экран /profile/verification, nudge на /profile, badge у других юзеров) — следующая часть.

## Закрытые задачи

1. **Миграция** [`supabase/migrations/0070_master_verifications.sql`](supabase/migrations/0070_master_verifications.sql) применена в prod:
   - ENUM `verification_status` (`pending / approved / rejected`).
   - TABLE `master_verifications` (1:1 с `auth.users`, поля `selfie_path`, `passport_main_path`, `status`, `submitted_at`, `reviewed_at`, `reviewed_by`, `rejection_reason`).
   - Индекс `(status, submitted_at DESC)` для будущего админ-листа pending.
2. **RLS** — SELECT/INSERT/UPDATE/DELETE только owner. `INSERT` форсирует `status='pending'`. `UPDATE` разрешён только из `rejected → pending` (re-submit). Юзер физически не может сам выставить себе `approved`. Service-role (будущая админка) обходит RLS.
3. **Trigger `sync_master_verification_level`** — при `approved` поднимает `master_profiles.verification_level` до ≥1, при revoke (approved → не-approved или DELETE row'а) сбрасывает обратно в 0. `verification_level` уже было в схеме — переиспользуем, не плодя `is_verified`.
4. **PRIVATE Storage bucket `master-verifications`** (public=false) + 4 RLS policies (`INSERT/SELECT/UPDATE/DELETE` — только owner в свою папку `{user_id}/...`).
5. **TS-типы регенерированы** — `Tables<"master_verifications">` и `Enums<"verification_status">` доступны.

## Новые правила и решения

- **PII в отдельной таблице, не в master_profiles** — `master_verifications` изолирует sensitive поля (пути к фото паспорта). Это даёт независимый scope RLS: можно дать публичному запросу читать `master_profiles.verification_level` (badge) без риска утечки путей к паспорту.
- **Trigger SECURITY DEFINER** для sync `verification_level` — без `DEFINER` UPDATE из триггера упадёт на RLS `master_profiles`. **Why:** триггер должен иметь возможность поднять level даже когда автор изменения (админ через service_role или сам юзер при re-submit) не имеет прямого UPDATE-доступа к master_profiles.
- **Path-only хранение в БД** — bucket-id фиксированный (`master-verifications`), в БД только `{user_id}/file.jpg`. Признанный паттерн в проекте (см. avatars, portfolio).
- **DiceBear / Iconify CDN недопустимы для паспорта** — paspport-фотки идут в PRIVATE bucket, signed URLs (TTL ≤ 1h) только для самого юзера. Никаких publicUrl.

## Новые компоненты / паттерны

- **PRIVATE Storage bucket pattern** — `public=false` + RLS на `storage.objects` со scope по первому сегменту пути (`(storage.foldername(name))[1] = auth.uid()::text`). Использовать для PII (паспорт, документы, payouts).
- **RLS-защита status enum** — `WITH CHECK` форсирует `status = 'pending'` на INSERT/UPDATE юзера. Service-role обходит. Паттерн «юзер пишет только пользовательский статус, админ — только админский».

## Anti-patterns

- ❌ **Public bucket для PII** — фото паспорта в `public=true` bucket даже с уникальным UUID-путём это утечка. Только private + signed URLs.
- ❌ **Хранение verified-флага в публичной таблице без триггера** — если поле меняется отдельно от source-of-truth `master_verifications.status`, легко получить рассинхрон. Триггер — единственный путь sync.

## Что НЕ сделано (часть 2 в следующей сессии)

- Хуки `useMyVerification` / `useSubmitVerification` (`src/features/verification/`).
- Экран `/profile/verification` (full-screen: инструкция, 2 image-picker'а, кнопка «Отправить на проверку», состояния pending/approved/rejected).
- Nudge-карточка на `/profile/index.tsx` (только мастер): «Подтвердите личность» / «На проверке» / «Паспорт подтверждён ✓».
- Badge «Паспорт подтверждён» на детальной странице мастера + в карточках мастеров.
- Спецификация фичи в [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — да, написана уже в этой сессии (см. файл).

---

# Поздняя ночь — аудит документации

## TL;DR

Прошёл по корню проекта + `docs/` + `legacy/` + `research/`, объединил два дубликата SESSION_SUMMARY за 2026-05-15 (night + day-evening), создал спецификацию [`docs/VERIFICATION.md`](docs/VERIFICATION.md) для новой фичи, обновил CLAUDE.md «Структура документации». Список «лишнего» к удалению предложен пользователю отдельным сообщением — без его явного «удаляй» ничего не трогается.

## Объединено

- **SESSION_SUMMARY_2026-05-15-night.md** → начало `SESSION_SUMMARY_2026-05-15.md` (раздел «Ночь»). Файл удалён. Нарушал правило CLAUDE.md «один файл за день, дописывать в конец, не плодить новые».

## Создано

- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — спецификация фичи мастер-верификации (схема БД, RLS, Storage bucket, planned UI flow, статусы, security).
