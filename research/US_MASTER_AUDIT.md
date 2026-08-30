# Аудит pro-аккаунтов: американские и международные сервисы услуг

**Версия:** 2026-05-15 · **Аудитор:** AI-агент (research-mode) · **Цель:** реверс-инжиниринг pro-стороны 9 платформ для адаптации лучших паттернов в xtrud (РФ, Республика Ингушетия, **free-tier** для мастеров).

---

## TL;DR (5 минут)

1. **Две доминирующие монетизации в US:** (а) commission/service-fee от транзакции — TaskRabbit, Handy, Fiverr/Upwork; (б) pay-per-lead — Thumbtack, Angi, Bark. Houzz Pro и Jobber — **SaaS-подписка** на pro-tools, не маркетплейс лидов. Все они платные для pro в той или иной форме; **xtrud — единственный кейс «полностью бесплатно для мастера»**, поэтому economic-incentive у нас работает иначе (мы не «выжимаем» pro деньгами, мы должны выжимать **внимание** через активность и репутацию).
2. **Онбординг pro в US ≠ instant signup.** TaskRabbit — $25 регистрационный сбор + Checkr background check + 4 рабочих дня обработки + обязательный orientation. Thumbtack — instant signup, но требует phone-verification и опциональный background check для badge. Angi — long-form application, проверка лицензии и страховки через Checkr. Handy — application + ID + background + интервью. **Trust-через-friction** — главный паттерн. xtrud для РФ может сделать промежуточный вариант: instant-signup для скрытого профиля + verification-required для попадания в выдачу.
3. **Категории: 50 (TaskRabbit плоско) ↔ 500–1100 (Thumbtack/Angi иерархически).** Лучший UX-паттерн — **multi-select chips + search + рекомендации на основе локации**. Pro выбирает все категории, в которых работает; платформа потом показывает рекомендованную ставку **per-category**, не одну общую. У xtrud сейчас 64 L2 категории — это идеально по объёму, но критично нужна **per-category ставка**, не одна общая для мастера.
4. **Ценообразование:** TaskRabbit — hourly с pricing guidance per metro+category+experience; Handy — flat-rate, выставляет платформа; Thumbtack/Angi/Bark — quote-based, pro отправляет custom; Fiverr — tiered packages (Basic/Standard/Premium); IKEA-сегмент TaskRabbit — flat-rate per-item. **Главный insight: pricing helper «pros in your area charge $X-$Y» резко повышает конверсию.** Мы должны построить это даже на seed-данных.
5. **Lead-modes — спектр от instant-book до bidding:** TaskRabbit/Handy/Jobber Booking = customer-driven instant-confirm; Thumbtack/Angi = pro отправляет quote, customer выбирает; Bark = pro платит credits чтобы получить контакты, customer выбирает. xtrud — quote-based близко к Thumbtack/Bark, но без оплаты лидов. Нам нужно решить **anti-spam и качество** другими средствами (лимит откликов, репутация, response-time gamification).
6. **Trust & Safety — обязательный stack:** ID-check, criminal background check (Checkr), insurance/Happiness Pledge до $1M (TaskRabbit) / $10K per task (TaskRabbit Pledge) / license verification (Angi badge). В РФ Checkr недоступен, нужны российские аналоги (Госуслуги-верификация, ИНН, скан паспорта вручную). Insurance заменим **на собственный «Гарантия xtrud»** (резервный фонд + dispute resolution).
7. **Mobile-first pro-apps — стандарт:** TaskRabbit Tasker app, Thumbtack Pro app, Houzz Pro mobile, Bark for Professionals, Jobber mobile — **отдельные** приложения от клиентских. Это упрощает онбординг (welcome flow в pro-app) и улучшает UX за счёт фокуса на pro-задачах (календарь, чат, payouts, dashboard). xtrud сейчас single-app с role-switch — это **может быть нашим преимуществом для dual-role пользователей** (мастер/клиент в одном лице), но требует ультра-чистого UX переключения.

---

## Платформа 1: TaskRabbit

**URL:** https://www.taskrabbit.com/ · **Год основания:** 2008 · **Принадлежит IKEA с 2017.** Бытовые задачи: сборка мебели (флагман — IKEA), мелкий ремонт, переезды, уборка, выгул собак, ожидание в очереди. **Гиг-экономика** в чистом виде.

### 1.1. Sign-up / Onboarding для Tasker

**Стандарт:** 6 шагов, обязательный $25 не-возвратный регистрационный сбор, физ-лицо (SSN), смартфон iOS 9+/Android 4.3+, банковский **checking account** (не savings, не prepaid). Возраст 18+.

Конкретные шаги по [официальной странице](https://www.taskrabbit.com/become-a-tasker):

1. **Account creation + app download.** Email/phone + установка Tasker-app (отдельное приложение от клиентского). Web-онбординг есть, но **финальные шаги делаются в app**.
2. **Profile building.** Выбор категорий услуг (multi-select из ~50), фото, bio.
3. **Identity verification.** SSN (Social Security Number) → Checkr → criminal + sex offender + identity. **1–4 рабочих дня обработки**, в большинстве городов <4 дней.
4. **$25 registration fee** через credit card (не дебетовка). В некоторых городах есть бесплатные периоды.
5. **Schedule + work area setup.** Календарь, ZIP/радиус, hourly rate per category.
6. **Orientation + Best Practices.** Обязательный материал для прочтения; Quora-обсуждения упоминают **video orientation** в US, **in-person** в UK исторически.

**Background check.** Через [Checkr](https://checkr.com/blog/6-questions-with-taskrabbit) — Identity + Criminal (national, county, sex offender). Стоимость заложена в $25 fee. Pro платит, не платформа.

**Welcome flow.** «Same Day Invitations» toggle в Home-screen — pro вручную включает доступность для срочных задач. Acceptance Rate и Reliability Rate отслеживаются с первого дня.

**Mobile-first.** Sign-up можно начать в web, **но активная работа возможна только через Tasker app**. Клиентское приложение и Tasker app — разные.

**Длительность.** Реальная пропускная способность: 2–7 дней от регистрации до первого инвайта. Опытные таскеры жалуются, что **первые инвайты иногда не приходят 2–3 недели** в насыщенных городах — platform-side rate-limiting для новых.

### 1.2. Заполнение профиля Tasker

**Поля:**

- **Photo** (обязательно, реальное, не аватар).
- **First name** + last initial (для безопасности).
- **Bio** (~150–500 chars). Подсказки: «опишите опыт, инструменты, что отличает».
- **Years of experience** на услугу (per-category).
- **Skills/quick highlights** (per-category).
- **Languages.**
- **Vehicle** (для truck-assisted tasks): тип машины, объём cargo.
- **Tools** owned (drill, ladder, и т.д.).
- **Service area:** workspace map с центром + радиусом (по умолчанию ~10–15 миль).
- **Categories chosen** (см. §1.3).
- **Hourly rate per category** (см. §1.4).

**Reviews & ratings.** Отображаются после каждой задачи. Видны как Positive Rating % + total tasks completed. Pro может **отвечать** на отзыв.

**Badges:**

- **Elite Tasker** — top 35% performance score в metro+skill, 98%+ positive rating, без TOS-violations за 90 дней ([source](https://support.taskrabbit.com/hc/en-us/articles/17958442241933-Elite-Status-Overview)). **Перки:** featured в выдаче, специальная маркетинг-поддержка, доступ к exclusive promos.
- **Background Checked** — после прохождения Checkr.
- **Tasker since YYYY.**
- **Same Day available.**

### 1.3. Категории услуг

**Структура:** ~50 task types, **плоская** (не иерархия), вручную курируемая TaskRabbit. Примеры из [help](https://support.taskrabbit.com/hc/en-us/articles/360052736472-Which-Task-Categories-Should-I-Add-To-My-Profile):

- Furniture Assembly (флагман — IKEA)
- IKEA Assembly (отдельный sub-flow с per-item pricing)
- General Mounting · TV Mounting
- Indoor Painting · Outdoor Painting · Wallpapering
- Plumbing Help · Electrical Help · Wall Repair · Sealing & Caulking · Light Carpentry
- Cleaning · Organization · Packing & Unpacking
- Help Moving · Heavy Lifting · Truck-Assisted Moving
- Yard Work · Landscaping · Snow Removal · Power Washing
- Errands · Waiting in Line · Executive Assistant
- Interior Design · Decoration · Project Coordination

**UX выбора:** multi-select **chips** в onboarding. Tasker может добавить/удалить **в любой момент** через Profile → Categories. Лимит на число услуг — **нет** официально, но help-центр рекомендует «add categories you have real experience in».

**Не позволяет:** создавать custom category. Если задача нестандартная — она попадает в «General Errands» или клиент пишет ad-hoc.

**[Service Catalog API](https://developer.taskrabbit.com/docs/get-service-catalog)** позволяет видеть все категории с pricing и requirements — TaskRabbit делает каталог first-class data structure.

### 1.4. Ценообразование

**Модель:** Hourly rate, **per-category**, **per-Tasker**. Минимум 1 час, далее 15-минутные инкременты.

Из [официального support](https://support.taskrabbit.com/hc/en-us/articles/35682300983181-Tasker-Rates-Minimum-Hours-Policy):

- Tasker сам устанавливает ставку. **TaskRabbit Service Fee** добавляется поверх ставки и взимается с клиента (~15–30% от ставки, варьируется).
- Pricing Guidance feature ([blog](https://www.taskrabbit.com/blog/how-pricing-guidance-works-on-taskrabbit/)) показывает рекомендованную ставку на основе **metro + category + experience level**. Guidance обновляется по мере накопления опыта.
- Pricing **отдельно для same-day и для regular** задач.
- Pro может включить **2-hour minimum** для hourly-rate задач (для часто-избегаемых короткозадач типа «отнести коробку на 3 этаж»).
- Tasker keeps 100% of rate + tips. **Все service fees платит клиент**.

**IKEA Assembly exception.** Flat-rate per-item ($52+ start, варьируется по типу мебели). Tasker получает фиксированную часть, IKEA + TaskRabbit берут свою долю. UX checkout на ikea.com встроен — клиент платит сразу при покупке мебели, Tasker подтверждает время.

**Helper UI.** «Pros in your area for [category] charge $X–$Y, we recommend $Z. Setting your rate too high may reduce invitations; too low — also.» — приблизительный текст из app-screenshots.

### 1.5. Получение лидов

**Модель:** **Invitation-based**, не lead-buying. Клиент создаёт задачу → TaskRabbit алгоритм отбирает 3–5 Taskers → отправляет invitations.

**Tasker может:**

- Принять invitation → задача забронирована.
- Отклонить.
- Не отвечать → influence on Acceptance Rate.

**Same Day Invitations** — отдельный toggle, выключается каждую ночь в 00:00. Pro **сам активирует утром** — это и UX-друг, и платформенный rate-limit на новичков.

**Acceptance Rate** ([blog](https://taskers.taskrabbit.com/2018/06/01/acceptance-rate-what-is-it/)) — % инвайтов, на которые pro ответил (любым способом). Низкая rate = меньше будущих invitations.

**Notification UX:** push + email + in-app badge. Top Taskers рекомендуют отвечать в течение 1 часа на дневные инвайты.

**Нет lead-fee.** TaskRabbit не берёт деньги за получение инвайта — берёт service fee с клиента после завершения задачи. Радикально отличает от Thumbtack/Bark.

### 1.6. Calendar и Availability

[Calendar UX](https://support.taskrabbit.com/hc/en-us/articles/204409570-How-Do-I-Set-My-Availability):

- Tasker app → Home → Get Hired → Calendar tab.
- Выбор даты → зелёный «+» → задаёт блок доступности.
- Минимум 2.5 часа на блок (иначе не учитывается для не-same-day задач).
- Можно драг-н-дроп для resize.
- До 17 дней вперёд.
- Same-day overlay — отдельный.
- **Sync с внешним календарём — нет** (это критика app-store reviews; Jobber и Houzz Pro в этом сильнее).

### 1.7. Chat и общение с клиентом

**Stream Chat-powered** ([source](https://getstream.io/blog/stream-chat-taskrabbit/)).

Возможности:

- Текст.
- **Фото attachments** — критично для оценки scope «вот стиральная машина, которую нужно поднять».
- **Phone-call masking:** клиент видит TaskRabbit-номер, не реальный номер Tasker'а.
- Все коммуникации хранятся в chat thread, ссылка к задаче.
- **Templates / quick replies** — нет официально; pro в community часто просят.

**Anti-circumvention:** активный мониторинг попыток обмена внешними контактами. Жёсткое правило: попытка увести клиента «в кэш мимо платформы» — ban.

### 1.8. Платежи и payouts

Через **Stripe** ([source](https://support.taskrabbit.com/hc/en-us/articles/9726793176717-What-Is-Stripe-and-How-Does-It-Work)).

- Direct deposit в US-checking account.
- Payout 1–3 рабочих дня после завершения task.
- **Tipping** — клиент добавляет в app после завершения, 100% к Tasker.
- 1099 tax reporting — TaskRabbit генерирует 1099-NEC при $600+ годовом доходе.

**Hold для нового pro** — первые несколько payouts могут задерживаться (платформа защищается от fraud).

### 1.9. Pro tools и аналитика

- **Performance Score Ranking** per metro+skill.
- **Reliability Rate** — % задач без cancellation от Tasker.
- **Positive Rating** %.
- **Acceptance Rate** %.
- **Earnings dashboard** — weekly/monthly.
- **Tasker Analytics** — comparable to peers in metro.

Tasker Updates ([blog](https://www.taskrabbit.com/blog/tasker-update-app-version-4-58-0/)) приходят в виде in-app announcement про новые версии app.

### 1.10. Trust, safety, support

- **Happiness Pledge** ([source](https://support.taskrabbit.com/hc/en-us/articles/360035570011-The-Taskrabbit-Happiness-Pledge)):
  - **$10,000 per task** для property damage (от негентного Tasker).
  - $10,000 per task для bodily injury.
  - **Не страховка** в юр-смысле — это «pledge», TaskRabbit может отказать.
  - 14 дней на claim submission.
  - User должен сначала иметь личную страховку, потом TaskRabbit.
- **Checkr background check** + ongoing re-check каждые ~2 года.
- **Dispute resolution.** Tickets через Help Center, ~24-48h response.
- **Suspension/deactivation rules.** TOS-violations, low ratings (<4.5/5 sustained), policy abuse → warning → temporary suspension → permanent ban.

### 1.11. Mobile app для Pro

**Tasker by TaskRabbit** ([iOS](https://apps.apple.com/us/app/tasker-by-taskrabbit/id1455415833) / [Android](https://play.google.com/store/apps/details?id=com.taskrabbit.droid.rabbit)).

Отдельное приложение. Содержит:

- Home (invitations, same-day toggle, earnings).
- Get Hired → Calendar / Categories / Workspace.
- Chat (с клиентами).
- Profile.
- Wallet (payouts, transactions).

**Web pro-dashboard минимален** — всё активное в app.

### 1.12. Уникальные фичи TaskRabbit

- **IKEA Partnership** — full integration в ikea.com checkout. 50% больше клиентов добавляют assembly, AOV ×4.7, returns -40% ([Retail Dive](https://www.retaildive.com/news/ikea-streamlines-taskrabbit-furniture-assembly-service-checkout/740315/)).
- **Pricing Guidance per metro+category+experience** — на основе real client market data.
- **Tasker Analytics** — peer-comparison в metro.
- **Real-time location** во время задачи (client видит, что Tasker едет / на месте).
- **Same Day toggle** — daily reset, заставляет pro делать осознанный выбор.
- **Elite Status** — top-35% by performance score, не просто высокие ratings.

---

## Платформа 2: Thumbtack

**URL:** https://www.thumbtack.com/ · **Год основания:** 2008 · ~500 категорий услуг. **Pay-per-lead** маркетплейс — pro платит за каждый lead, customer бесплатно.

### 2.1. Sign-up / Onboarding для Pro

**Instant signup** на [thumbtack.com/register](https://www.thumbtack.com/register):

1. Email + phone verification.
2. **Business name** + **service category** (выбор из ~500). Можно multi-select.
3. **Service area** (ZIP + radius).
4. **Profile photo** (личное фото или логотип).
5. **Business description / intro** (free text).
6. **License/insurance** (optional, но даёт badge).
7. **Background check** (optional, free; даёт badge).
8. **Targeting preferences** (типы клиентов, бюджет, locations, времена).
9. **Payment method** — credit card для lead-purchases.

[Everlance pro requirements](https://www.everlance.com/gig-guides/thumbtack-requirements): возрастных или SSN-требований **нет** для signup, но background check требует SSN если хочется badge.

**Welcome flow:** **«$100 free credits» promotion** для новых pro (нужно активировать targeting + добавить review с прошлых клиентов). Это конвертирует pro в pay-per-lead покупки.

**Длительность:** регистрация — 15–30 минут. Background check — 1–3 дня. **First leads приходят в течение часов**, не дней.

### 2.2. Заполнение профиля Pro

**Структура** ([Thumbtack profile guide](https://help.thumbtack.com/article/profile-guide)):

- **Business name, photo, intro**.
- **Services offered** (multi-select).
- **Credentials**: license #, insurance, certifications. **License badge** = Thumbtack проверил номер.
- **Background check badge** (опц.).
- **Photos** (work portfolio).
- **FAQ section** (pro отвечает на типовые вопросы — SEO-полезно).
- **Reviews** — от Thumbtack-customers + import из других платформ (Google Reviews и т.п. via «outside reviews»).
- **Service area** (ZIPs + radius).
- **Hours of operation**.
- **Link to website / social.**

**Top Pro badge.** Платиновый статус из Pro Rewards = «current Top Pro» на профиле. См. §2.10.

### 2.3. Категории услуг

**~500 категорий**, иерархическая структура. Каждая категория имеет свой sub-flow для customer (custom questions) и для pro (matching preferences).

**Pro может выбрать unlimited категорий**, но платит за лиды в каждой отдельно.

**UX выбора:** search + browse-tree. Категории организованы под high-level группы (Home Improvement, Wellness, Pets, Business, и т.д.). Каждая категория имеет sub-services («Plumbing → Drain repair / Toilet install / Pipe leak repair»).

Пример из community: «У pro 12 категорий активно — bathroom remodeling, kitchen remodeling, general handyman, electrical, plumbing, и т.д.»

### 2.4. Ценообразование

**Quote-based.** Pro не публикует прайс на профиле (обычно). Когда приходит lead, pro отправляет **custom quote** клиенту.

**Pro tools для pricing:**

- Prices Page ([thumbtack.com/prices](https://www.thumbtack.com/prices)) — Thumbtack показывает customers оценки «у нас в области plumbing-репайр стоит $X–$Y», что помогает pro калибровать quotes.
- **Базовая ставка / per-project** — pro решает сам.
- В quote pro может приложить **breakdown** (часов работы, материалов, дополнительных сборов).

**Customer payments:** идут напрямую от клиента к pro **mod-платформы**. Thumbtack не процессит payments (исключение — некоторые pilots).

### 2.5. Получение лидов

**Два режима** ([source](https://help.thumbtack.com/article/types-of-leads)):

**A. Direct Leads (Instant Match):**

- Customer заполняет request → Thumbtack matches с pro чьи targeting preferences = customer request → **lead продаётся pro автоматически**.
- Pro получает phone-number клиента сразу.
- Lead дешевле ($15–$80 типично).
- Pro платит даже если не закроет работу.

**B. Booking Inquiry Leads (Opportunities):**

- Customer обращается к нескольким pro вручную.
- Pro видит в Opportunities tab → отвечает в chat → платит только если customer бронирует.
- Lead дороже (2x–4x), но pay-per-success.

**Lead pricing model:**

- $1.50/credit base, объёмные скидки.
- Лиды от 1–80 credits ($1.50–$120) в зависимости от value (Thumbtack оценивает project value через customer answers).
- Лиды дороже в emergency-категориях (plumbing leak) и high-ticket (full kitchen remodel).
- Dynamic — алгоритм может менять цену недели на неделю.

[Procured.us 2026 review](https://procured.us/articles/thumbtack-pricing): typical lead cost $15–$80, peak $200+.

**Targeting preferences:**

- **Service types** (которые из 500+ категорий).
- **Geo** — ZIPs или radius.
- **Job preferences** — например, в plumbing pro может ограничить «only emergency / only commercial / only single-family homes».
- **Weekly budget** — лимит spend в неделю.
- **Customer types** — например, «только клиенты с photos», «только с budgets >$1000».
- **Calendar availability**.

**Auto-decline rules** — если customer-request fails any targeting filter → не приходит pro вообще, не платит.

### 2.6. Calendar и Availability

В targeting preferences — недельная availability (block-out часы, вне часов lead не приходит).

**Не такая granular, как у TaskRabbit** — больше для определения «когда я готов получать leads», а не «когда у меня свободно для конкретной задачи».

### 2.7. Chat и общение с клиентом

In-app chat:

- Текст + photo.
- Phone-number masking (для Direct Leads — нет, pro получает реальный номер).
- Quick reply templates — есть для frequent answers.
- **Voice messages** — не вижу подтверждения, скорее нет.

**Anti-circumvention:** активная блокировка попыток обмена контактами в чате (фильтр на email/phone-pattern в Booking Inquiry leads).

### 2.8. Платежи и payouts

Thumbtack **не процессит payments** в большинстве категорий — pro и клиент сами договариваются (cash, Venmo, чек, бизнес-инвойс).

**Исключение:** Thumbtack Payments pilots для отдельных категорий (cleaning, lawn care) — Stripe-backed.

**Booking Inquiry leads** — pro платит lead-fee только когда booking подтверждён в системе.

### 2.9. Pro tools и аналитика

**Performance dashboard** ([help](https://help.thumbtack.com/article/insights)):

- Lead-to-hire ratio.
- Profile views.
- Response rate.
- Response time.
- Spend / earnings (estimated).
- Pro Rewards points + tier progress.

**Pro Rewards (§2.10)** — gamification.

### 2.10. Trust, safety, support — и Pro Rewards

**Pro Rewards tiers** ([source](https://help.thumbtack.com/article/thumbtack-pro-rewards-program)):

- **Silver** — entry tier, нет response-rate-требования. 300 points/period.
- **Gold** — 65% response rate within 1 hour (8am–8pm local), 1200 points.
- **Platinum (= Top Pro)** — 75% response rate within 1 hour, 2400 points.

Перки Platinum: featured-в-выдаче, **lead discounts**, экспонент в маркетинге, badge.

**Background check** через Checkr — opt-in, бесплатно, badge на профиле.

**License badge** — Thumbtack verifies license # против state-database.

**Dispute resolution** — через Pro Support.

**Suspension** — за low ratings, multiple unresolved disputes, abuse.

### 2.11. Mobile app для Pro

**Thumbtack Pro app** — отдельное от customer-app. Контент:

- Leads tab — incoming Direct Leads + Opportunities.
- Inbox — chats.
- Insights / dashboard.
- Profile management.
- Wallet / payment method.

Большинство pro работает **mobile-first**, но web pro-portal тоже полнофункционален.

### 2.12. Уникальные фичи Thumbtack

- **Instant Match marketplace** — automated lead distribution по targeting preferences.
- **Pro Rewards с 1-час response gamification** — radical incentive.
- **FAQ section на профиле** — SEO-полезный паттерн.
- **License # verification badge** — даёт trust signal даже без полного background check.
- **«Prices Page»** для customers с aggregate pricing — pro их видит и калибрует quotes.
- **Targeting preferences гранулярны** — pro может ограничиться по project value, customer type, urgency.

---

## Платформа 3: Angi (бывший Angie's List) + HomeAdvisor

**URL:** https://www.angi.com/ · Слияние Angi + HomeAdvisor в 2022. **Lead-based** маркетплейс с annual subscription модели для контрактов. Фокус — home services (renovation, plumbing, HVAC, electrical, painting).

### 3.1. Sign-up / Onboarding для Pro

[signup.angi.com/pro](https://signup.angi.com/pro):

1. **Business info:** name, ZIP code, primary service category.
2. **Service area** + specific trades.
3. **Verification:** license + insurance docs upload. **Mandatory** для большинства категорий.
4. **Checkr background check** для business owner — 1–3 дня.
5. **Business description** + project photos upload.
6. **Annual contract signing** — $300/year membership + per-lead pricing.
7. **Dedicated onboarding rep** для Pro members.

Это **самый friction-heavy onboarding** из всех платформ. Цель — отсеять unverified / unlicensed подрядчиков.

### 3.2. Заполнение профиля Pro

- Business name, photos, intro.
- **License # + state** (mandatory) — verification badge.
- **Insurance certificates** — verification badge.
- Years in business.
- Past projects (photos with descriptions).
- Reviews & ratings (Angi legacy = Angie's List 30-year review database).
- Service area.

### 3.3. Категории услуг

50+ high-level, **1,000+ home services** в иерархии. Структура:

- **Interior** → drywall, electrical, painting, flooring, etc.
- **Exterior** → roofing, siding, deck, fence, concrete, etc.
- **Lawn & Garden** → mowing, landscaping, tree, pool, etc.
- **Major Renovations** → kitchen remodel, bathroom remodel, addition.
- **Specialized** → moving, cleaning, pest control, HVAC.

200,000+ professionals по [Angi data](https://www.angi.com/).

### 3.4. Ценообразование

**Quote-based** — pro отправляет custom quote на каждый lead, как Thumbtack.

**Pro pays:**

- **Annual membership $300/year**.
- **Per-lead $15–$85+ typical**, **$100+ для high-value trades**.
- **Same lead shared among 3–8 contractors** simultaneously.
- Effective cost-per-conversion: $200–$250 per won job.

**Contract terms:** 12 months, 30–35% early-cancellation penalty, auto-renew, до +10%/year price increase.

**Angi Services pre-priced** — отдельный sub-program где Angi сам ставит flat price (как Handy).

### 3.5. Получение лидов

- **Quote requests** от customers → Angi distributes к 3–8 matched pros simultaneously.
- **Same-second lead distribution** — first responder wins ~70% of time.
- Pro видит project description, timeline, budget, photos в lead.
- **No phone-masking** — lead включает customer phone.

### 3.6-3.11. (Standard features)

Calendar, chat, payouts — similar to Thumbtack but more focus на dispatcher-call-center (Angi has live operators triaging some leads).

### 3.12. Уникальные фичи Angi

- **Angi Key membership** ([source](https://ir.angi.com/news-releases)) — $29.99/year **customer subscription** с 20% off pre-priced projects + Happiness Guarantee + Affirm financing. 100,000+ members.
- **Happiness Guarantee** — money-back up to project price для Angi Key members.
- **«Angi Approved» badge** — multi-step verification (license, insurance, background, business legitimacy).
- **Legacy review database** — 30+ years (Angie's List founded 1995).
- **Dedicated onboarding rep** — high-touch sales для new pros.

---

## Платформа 4: Handy (Angi Services)

**URL:** https://www.handy.com/ · Принадлежит Angi с 2018. **Flat-rate dispatcher model** — Handy сам ставит цену и раздаёт jobs pro.

### 4.1. Sign-up / Onboarding

[handy.com/apply](https://www.handy.com/apply):

1. Service type выбор (cleaning, handyman).
2. SSN + DOB → background check.
3. Identity verification (driver's license / passport + selfie).
4. Lengthy TOS + Professional Agreement.
5. App download.
6. **Approval — может быть отказ** без явной причины.

**Прошлая experience required** — Handy требует доказательств paid work as cleaner/handyman.

### 4.2. Профиль

Minimal — Handy is dispatcher model, pro профиль скрыт от customer до bookings. Photo + first name + ratings + completed jobs count видны клиенту после booking.

### 4.3. Категории

Простая структура: cleaning, handyman, moving, IKEA-style assembly (через Handy, не TaskRabbit).

### 4.4. Ценообразование

**Платформа ставит rate.** Pro **не выбирает** — Handy показывает «available jobs at $X/hr» в app.

- Cleaners — up to $22/hr.
- Handyman — up to $45/hr.
- Job paid as flat-rate per job, рассчитан исходя из expected hours × rate.
- Rate bumps:
  - **+$5/hr** для 30 jobs in last 30 days at 4.5+ rating.
  - Additional bumps по rating, location, expertise.

**Fines** — Handy штрафует pro за cancellations, late arrivals, low ratings. Это **самая контроверсиональная** часть модели.

### 4.5. Получение лидов

**Pro listing** показывает available jobs → pro **claims** job → confirmed. First-come-first-served.

**Notification UX:** push для new available jobs in area.

**Acceptance/cancellation policy** жёсткий — slot of $X claimed and not delivered = fine + suspension risk.

### 4.6-4.11. Standard

- Calendar — pro выбирает available days в app.
- Chat — limited, mostly через Handy operators.
- Payments — **instant payout** после job completion.
- Insurance — Handy carrier coverage до certain limits.

### 4.12. Уникальные фичи Handy

- **Dispatcher model** — platform полностью контролирует rate + lead distribution. Это **antithesis** TaskRabbit.
- **Instant payout** post-job.
- **Rate bumps** as gamification.
- **Fines** как negative incentive.

---

## Платформа 5: Bark.com

**URL:** https://www.bark.com/ · **UK-based, международный** (US, AU, CA, IE). **Credit-based lead bidding** маркетплейс.

### 5.1. Sign-up / Onboarding

[bark.com/sellers/create](https://www.bark.com/en/gb/sellers/create/):

1. Email + business name.
2. Service categories выбор.
3. Service area.
4. **Free starter pack** — несколько free credits для первого ответа.
5. **Live leads start immediately** в inbox.

**Очень low-friction.** Identity verification не обязательна для signup.

### 5.2. Профиль

Online profile is part of value-prop — boosts pro web-presence. Включает:

- Business name, photo, description.
- Service list + categories.
- Past customer reviews (от Bark + internal).
- Response history (visible to customers).

### 5.3. Категории

1000+ категорий в US/UK. От dog walking до legal advice. Структура иерархическая, но broader чем Thumbtack — включает niche services.

### 5.4. Ценообразование

**Quote-based.** Pro отправляет custom quote после оплаты credits за lead.

### 5.5. Получение лидов

**Credit-based bidding model:**

- Pro получает **free leads from signup** (browsing-only — может видеть, но не отвечать).
- Чтобы ответить на lead → потратить **credits**.
- 1 credit = $1.85 индивидуально, $1.57 в bulk pack.
- Стандартный lead = **2–35+ credits** ($4–$80+ effective).
- Высокоценные категории (legal, business services) — **до $300+ effective** на lead.

**Money-back guarantee:** не выиграл клиента с первого пака credits → refund. 100% credits возврат.

**No commission, no monthly fee** — only one-off lead credit cost.

**Subscription option:** Elite Pro Subscription — 5 free leads/month + 20% discount on credits.

### 5.6-5.11. Standard

- Calendar — basic availability settings.
- Chat — text + phone (after credit-purchase).
- Payments — outside platform (cash / Venmo / invoice).
- Reviews — built-in.

### 5.12. Уникальные фичи Bark

- **Money-back guarantee** — снимает risk для new pro («попробуй, не зайдёт — вернём»).
- **Browsing-before-paying** — pro видит leads до credit-purchase.
- **3-month credit expiry** — давление использовать credits.
- **No-commission model** — 100% earnings to pro post-payment.

---

## Платформа 6: Houzz Pro

**URL:** https://www.houzz.com/pro · Дочка Houzz (design-photo-database). **SaaS + маркетплейс**. Целевая аудитория — interior designers, contractors, architects.

### 6.1. Sign-up / Onboarding

Subscription-based, не маркетплейс лидов в чистом виде. [Pricing tiers](https://www.itqlick.com/houzz-pro/pricing):

- **Starter** — $55/mo annual.
- **Essential** — для businesses ≤$250K/year revenue.
- **Pro** — для ≤$500K/year.
- **Custom/Enterprise** — negotiated.

Onboarding: 1:1 setup help в higher tiers, chat/email во всех. **Известна как «atrocious» onboarding** — 50–80 hrs для базовой proficiency (G2 reviews).

### 6.2. Профиль

**Portfolio-first:**

- Огромные photo galleries проектов.
- Project descriptions с before/after.
- Style tags (modern, traditional, transitional, etc.).
- Reviews from Houzz customers.
- Awards section.
- Custom-branded marketing website (with custom domain).
- Premium directory listings.

### 6.3. Категории

Design-focused: interior design, kitchen design, bathroom design, landscape design, architecture, general contracting, custom building, remodeling. Less «trade-based», more «discipline-based».

### 6.4. Ценообразование

Pro не публикует цены на профиле напрямую — **lead-driven quotes** через Houzz Pro inbound system.

В Houzz Pro есть **AI-powered Project Estimating** — из templates pro генерирует quote с line items, materials, labor.

### 6.5. Получение лидов

Inbound через Houzz directory + advertising. **Lead Capture & CRM** автоматически интейкает inquiries.

Customer находит pro в Houzz photo-database → нажимает «Contact» → CRM intake form → pro отвечает.

### 6.6. Calendar

Sync с iCloud / Gmail / Exchange / Office 365 / Outlook. **Сильнее, чем TaskRabbit или Thumbtack.**

### 6.7. Chat

Branded client portal с private chat, document sharing, design approvals.

### 6.8. Платежи

Houzz Pro Payments — invoicing, ACH, credit card. Можно подключить Stripe.

Прогрессивный billing — milestone-based payments. Client портал показывает paid / outstanding / retainer balance.

### 6.9. Pro tools

**Major USP — full operating system:**

- CRM.
- Quoting templates.
- 3D Floor Planner (life-sized walkthrough на iPad / phone).
- Mood Board Creator (drag-n-drop visual concepts).
- Document management.
- Daily Logs (для строительства).
- Project Management timeline.
- Marketing website builder.
- Email marketing campaigns.
- Accounting integration (QuickBooks).
- Time tracking.

### 6.10. Trust & safety

Standard verification, license checks, insurance.

### 6.11. Mobile

[Houzz Pro app](https://www.houzz.com/pro). Includes 3D floor planner via phone-camera scanning.

### 6.12. Уникальные фичи Houzz Pro

- **Portfolio-first** — 1000+ project photos в database — отличие от любой US-pro-платформы.
- **3D Floor Planner** через phone-camera room scanning.
- **Mood Board Creator** — visual proposal tool.
- **Branded client portal** with custom domain — pro feels professional.
- **Daily Logs** — для длительных строек.
- **Full vertical** для design/build — CRM + accounting + estimating + portfolio + lead-capture все в одном.

---

## Платформа 7: Jobber

**URL:** https://getjobber.com/ · **SaaS для service businesses**, не маркетплейс. ~200K subscribers. Целевая — established service businesses (cleaning, lawn care, HVAC, plumbing).

### 7.1. Sign-up / Onboarding

14-day free trial без credit card.

Pricing:

- **Core** $39/mo (1 user).
- **Connect** $119/mo.
- **Grow** $199/mo.
- **Connect Team** $169/mo (multi-user).
- **Grow Team** $349/mo.
- **Plus** $599/mo.

Onboarding: dedicated person для setup, recognized "fastest setup in HVAC" by users.

### 7.2-7.11. Standard pro features

**Jobber не имеет «профиля» в маркетплейсном смысле** — это software для управления своим бизнесом. У pro есть:

- **Online booking page** — customer может book appointment direct.
- **Quotes** — professional PDF, e-signature.
- **Client Hub** — branded portal where customer sees quotes, invoices, jobs, can pay online.
- **Scheduling + dispatch** — drag-n-drop calendar для multi-tech business.
- **Jobs management** — tasks, checklists, photos.
- **Invoicing + payments** — Jobber Payments (Stripe) или integrations.
- **CRM** — client database, notes, history.
- **Marketing tools** — email campaigns, review requests.

### 7.12. Уникальные фичи Jobber

- **Progress invoicing** — split job в multiple invoices for cash flow.
- **Online booking** — customer self-serve, auto-schedules team member.
- **Real-time dispatch** — multi-tech crews.
- **Client Hub self-serve** — pay invoices, approve quotes, request work без звонков.

**Для xtrud взять:** идея **Client Hub** как customer-portal с history of all jobs and payments — отличное keep-customer-on-platform решение, даже без commission.

---

## Платформа 8: Fiverr (лёгкое касание)

**URL:** https://www.fiverr.com/ · Гиг-маркетплейс. **Service-listing first** — pro публикует «Gigs», customer покупает.

### 8.1. Sign-up

Email + verification. Setup профиля 30 мин.

### 8.2. Профиль

Username, photo, bio, languages, skills, education, certifications.

### 8.3. Категории

Категории-таксономия для search — graphic design, writing, programming, etc.

### 8.4. Ценообразование — **TIERED PACKAGES**

**Главная фишка Fiverr:**

- **Basic** — entry level, $5–25 typically.
- **Standard** — 2–3× Basic, mid-tier с extras.
- **Premium** — 4–6× Basic, full-scope.

Каждый package имеет:

- Description.
- Delivery time.
- Revisions count.
- Specific deliverables (e.g., «3 logo concepts», «source files», «commercial rights»).

**Gig Extras** — separately purchasable upgrades (additional revision, faster delivery, extra source files).

### 8.5-8.11. Standard

- Buyers initiate orders, pro delivers in promised time.
- Chat + file attachments.
- Payment held by Fiverr, released after delivery + customer acceptance.

### 8.12. Уникальные фичи

- **Tiered packages** — ultimate pricing pattern, повышает AOV и снимает «sticker shock».
- **Levels system** (Level 1 / Level 2 / Top Rated) — gamification по completed orders + reviews.
- **Gig Extras** — upsell mechanism.

---

## Платформа 9: Upwork (лёгкое касание)

**URL:** https://www.upwork.com/ · Лидер фриланс-биржи.

### 9.1. Sign-up

Multi-step. Profile build с скиллами, опытом, education, portfolio. Категории — до 4 при создании.

### 9.2. Профиль

Title + overview + skills + work history + photo + hourly rate + portfolio + видео-introduction (опц.).

### 9.3-9.4. Pricing

**Hourly или fixed-price.** Hourly rate — starting point, не fixed.

### 9.5. Получение работы — **CONNECTS**

**Connects** — виртуальные tokens для отправки proposals.

- $0.15/connect, sold в bundles.
- 1–6 connects per proposal (зависит от project value).
- **Boosted Proposal** — extra connects = top placement в client's list.

Очень похоже на Bark credits — pro платит за **возможность ответить**, не за win.

### 9.12. Уникальные фичи

- **Connects + Boost** — competitive bidding с visibility-boost via spend.
- **Client search engine** — pro может search-и-apply, не только wait-and-receive.
- **Top Rated Plus** — top tier для freelancers, перки visibility.

---

## Сводная таблица: 12 разделов × 9 платформ

| # | Раздел | TaskRabbit | Thumbtack | Angi | Handy | Bark | Houzz Pro | Jobber | Fiverr | Upwork |
|---|--------|-----------|-----------|------|-------|------|-----------|--------|--------|--------|
| 1 | Onboarding | $25 fee, 4 дня, app-required | Instant, free | Annual contract $300+, dedicated rep, slow | App + interview + BG | Free, instant, BG optional | SaaS subscription $55+/mo, 1:1 setup | SaaS 14-day trial, fast | Free, instant | Free, multi-step |
| 2 | Profile depth | Medium (photo, bio, categories, rate) | Deep (FAQ, photos, license, reviews, services list) | Deep (license, insurance, photos, years) | Minimal (dispatch-only) | Medium | Portfolio-first (1000+ photos) | N/A (SaaS) | Deep (bio, skills, portfolio) | Deep (bio, portfolio, skills) |
| 3 | Categories | ~50 flat | ~500 hierarchical | 1000+ hierarchical | ~10 flat | 1000+ hierarchical | ~20 design-focused | N/A | Search-tag | Search-tag |
| 4 | Pricing | Hourly, per-category guidance | Quote-based, prices-page hints | Quote-based | Platform-set flat | Quote-based | AI-quote templates | N/A (sets own) | **Tiered packages** | Hourly/Fixed |
| 5 | Lead model | Invitation (no fee) | **Pay-per-lead $15–$80** | **Pay-per-lead + $300/yr** | Dispatcher (claim) | **Pay-per-lead credits** | Inbound CRM | N/A | Direct purchase | **Connects bidding** |
| 6 | Calendar | In-app, 17 days, no sync | Weekly availability | Weekly | App-based | Basic | **Multi-platform sync** | Robust + dispatch | N/A | N/A |
| 7 | Chat | Stream Chat, photos, phone-mask | In-app, templates, mask | In-app + phone | Limited | In-app | Branded client portal | Client Hub | In-app, files | In-app, files |
| 8 | Payments | Stripe, 1–3 days | Off-platform mostly | Off-platform | Instant via Handy | Off-platform | Houzz Payments / Stripe | Jobber Payments / Stripe | Held by platform | Escrow + milestones |
| 9 | Dashboard | Performance Score, Reliability, Acceptance | Lead-to-hire, response time, profile views | Lead history | Job count, ratings | Lead sources, win rate | Project mgmt, financials | Full business mgmt | Order stats, levels | Earnings, JSS (Job Success Score) |
| 10 | Trust & Insurance | $10K Happiness Pledge + Checkr | License badge, BG-check badge | Angi Approved, Happiness Guarantee | Handy carrier coverage | None mandatory | Standard | N/A | Order protection | Hourly Protection (timesheet) |
| 11 | Mobile pro-app | **Tasker app** (separate) | **Thumbtack Pro app** (separate) | Angi Pro app | Handy Pro app | Bark for Pros app | Houzz Pro app | Jobber mobile | iOS/Android | iOS/Android |
| 12 | Unique | IKEA integration, real-time location | Pro Rewards 1-hr response gamif. | Angi Key membership, legacy DB | Dispatcher + fines | Money-back guarantee | 3D Floor Planner, Mood Board | Client Hub self-serve | Tiered packages | Connects + Boost |

---

## Best practices: что взять в xtrud (free-tier, РФ-аудитория)

### A. Онбординг — двухэтапный verification

**Паттерн:** instant signup для **спрятанного** профиля → verification required для **public** + **lead receipt**.

**Шаги для xtrud (рекомендация):**

1. **Email/phone + password** — мгновенно.
2. **Role pick** (мастер / клиент / оба).
3. **Категории** (multi-select из 64 L2 + chips). **Возможность отложить и зайти потом.**
4. **Service area** — через карту или radius от ZIP-аналога (для РФ — населённый пункт + радиус).
5. **Photo + bio** — отложенный shake-out.
6. **Verification** — паспорт-фото + selfie (manual review + future Госуслуги OAuth).
7. **«Готов получать заявки»** toggle — pro сам активирует, как Same Day у TaskRabbit. Это psychological commitment + защита от half-onboarded pro.

**Welcome flow в первой сессии:**

- Sample профиль preview («так увидят клиенты»).
- Sample задача в категории pro («вот пример заявки, отвечайте быстро»).
- **First-job incentive:** «Закройте первую заявку — получите Verified Pro badge досрочно» (не денежная награда).

### B. Категории — multi-select + smart defaults

**Текущий xtrud:** 64 L2 категории — оптимальный объём.

**Что добавить:**

- **Multi-select chips с group-by-L1** (10 групп).
- **Search-as-you-type** — pro вводит «электр» → видит «электрик», «электромонтаж», «электротехника».
- **«Похожие на ваши» рекомендации** — если pro выбрал «Сантехник», предложить «Электрик», «Мелкий ремонт».
- **Per-category стаж и краткое описание** — pro заполняет на каждую: «Сантехник, 5 лет опыта, специализируюсь на установке смесителей и душевых».
- **Лимит** — рекомендую 5–10 категорий per pro, мягкое предупреждение «слишком много категорий = выглядит непрофессионально». Жёсткого лимита нет.

### C. Ценообразование — per-category + helper

**Главный gap в xtrud сейчас — нет per-category pricing.**

**Что взять у TaskRabbit:**

- Каждая выбранная категория имеет **свою ставку** (час / выезд / fixed).
- **Pricing helper:** «В Ингушетии мастера в категории "Электрик" берут 800–1500 ₽/час, мы рекомендуем 1000 ₽».
- Pricing-data source: **изначально seed-данные (на основе аналитики РФ-рынка), потом — реальные данные xtrud**.
- **Three pricing types per service:**
  - Hourly («800 ₽/час»).
  - Visit/Trip («2000 ₽ выезд + работа»).
  - Fixed («Установка смесителя — 3000 ₽»).
  - + ability to mark «уточняется после осмотра».

**Что взять у Fiverr:**

- **Tiered packages** для категорий где это релевантно (репетиторы, фото-сессии, ремонт). Например, ремонт квартир: «Базовый ремонт — 3000 ₽/м², Стандарт — 5000 ₽/м², Премиум — 8000 ₽/м²».
- Tiers необязательны — pro может оставить одну ставку, но если включит — UX premium.

### D. Lead-modes — multiple, no fees

**Free-tier означает: мы не можем "выжимать" pro через lead-cost. Значит, нужны другие incentives:**

1. **Invitation-based (как TaskRabbit):** клиент создаёт заявку → алгоритм рассылает 3–5 ближайшим pro в категории. **Это default.**
2. **Open marketplace («Биржа заявок»):** все заявки видны всем подходящим pro. Pro выбирает на что отвечать. **Защита от спама:** лимит откликов в день (5–10 free, далее ждать до завтра).
3. **Instant Book (как TaskRabbit IKEA):** для категорий с fixed-pricing — клиент выбирает pro + время + платит → подтверждение.

**Anti-spam без денег:**

- **Daily response limit** — 5–10 откликов в день для нового pro, увеличивается с репутацией.
- **Response-time gamification** — Top Pro badge для тех, кто отвечает быстро (как Thumbtack Pro Rewards).
- **Quality score** — если 50%+ откликов клиент игнорирует, лимит снижается.

### E. Профиль — глубокий, портфолио-friendly

Что взять:

- **Photo gallery** (Houzz-style) — pro загружает 5–20 фото работ.
- **FAQ section** (Thumbtack) — pro отвечает на типовые вопросы клиентов. SEO + конверсия.
- **License/certifications** — если есть (для медиков, юристов и пр.).
- **Languages** (РФ — русский + ингушский + при необходимости арабский).
- **Years in business / годы опыта.**
- **Response time stats** — «обычно отвечает за 15 минут».
- **Completion rate %.**
- **Total clients served counter.**

### F. Calendar и availability — простой, но синхронизируемый

**Что взять:**

- **Weekly recurring schedule** (как Bark) — pn-pt 9-18, sb 10-14.
- **Day-by-day overrides** (как TaskRabbit) — на конкретные даты блокировать или разблокировать.
- **2-week look-ahead** минимум; идеально 30 дней.
- **iCal / Google Calendar sync** — это сильный USP против Avito-style решений.

### G. Chat — robust + secure

- Текст + photo (must).
- Voice messages (особенно для РФ-аудитории, где voice — норма в WhatsApp).
- **Phone-call masking** через виртуальные номера (важно для безопасности pro и клиентов).
- **Quick reply templates** — «Скажите адрес», «Когда удобно подъехать», «Сколько примерно?»
- **Anti-circumvention soft warning:** при попытке отправить телефон/email в чате — non-blocking баннер «Помните: связь через xtrud защищает обе стороны».

### H. Pro Dashboard — analytics + gamification

**Метрики:**

- Заявок в этом месяце.
- Откликов / приглашений.
- Конверсия в забронированную задачу.
- Среднее время ответа.
- Rating (звёзды).
- Completion rate.
- Profile views.
- **Position в выдаче для основной категории + ZIP** (рекомендация увеличить response time, добавить фото и т.д.).

**Gamification badges (без денежных перков):**

- **Verified Pro** (после идентификации).
- **Top Responder** (отвечает <30 минут в 75%+ случаев).
- **Local Expert** (10+ работ в категории+area за 90 дней).
- **5-star Pro** (avg rating ≥4.8 на 10+ заказах).
- **xtrud since YYYY** (loyalty).

**Без денежных лидов** — gamification работает на **social proof и intrinsic motivation**.

### I. Trust & Safety — РФ-адаптация

- **ID verification:** скан паспорта + selfie с паспортом. Manual review в начале (через support).
- **Будущее: Госуслуги OAuth** — automated ID-verification, sex-offender check через гос-реестры.
- **License verification badge** для категорий, где нужно (медики, юристы, electricians с разрешением — verify через профильные реестры или manual upload диплома).
- **Резервный фонд xtrud** — заменитель Happiness Pledge. Платформа держит fund (даже маленький — 100К–500К ₽), из которого компенсирует подтверждённый ущерб клиенту от мастера. Маркетируется как «Гарантия xtrud».
- **Dispute resolution** — chat-based ticketing.
- **Suspension rules** — opaque до момента нарушения, transparent при ban (объяснить за что).

### J. Mobile-first, но dual-role

**xtrud не делает отдельное pro-app** — это наше отличие. Single-app с role-switch:

- В bottom-nav для pro: Лента заявок, Заявки, Чаты, Профиль (вместо клиентских tabs).
- Для dual-role users — toggle в header / settings: «Сейчас я… клиент / мастер».
- **Преимущество:** маленькая аудитория Ингушетии не выдержит 2 app downloads + 2 onboarding'а.

---

## Anti-patterns: что НЕ повторять

1. **TaskRabbit $25 registration fee** — у нас free-tier, и в РФ это вызывает мгновенное недоверие («что за платная подписка?»). Не делать.
2. **Angi 12-month contract + auto-renew** — anti-pro, портит репутацию. NPS Angi среди контракторов плохой именно из-за contracts. Не делать.
3. **Handy fines** — драконовские штрафы за late/cancellation. Pro чувствуют себя сотрудниками без прав. Альтернатива — мягкие consequences (рейтинг, видимость), не финансовые штрафы.
4. **Thumbtack pay-per-lead без guarantee on hire** — основная причина hate-reviews. Pro платит $30 за lead, lead его игнорирует — это feels-like-fraud.
5. **Bark «aggressive sales»** — pro-community жалуется на pushy sales reps. Не выстраивать sales-driven onboarding.
6. **Houzz Pro 50-80hr learning curve** — overload features. Хороший pro-product — это **simple core + optional advanced**.
7. **Avito-style: куча мелких бейджей, цветных лейблов, рекламных баннеров в feed.** Не повторять. Vercel-aesthetics + functional badges only.
8. **Custom service создание (или «другое») в категориях** — приводит к каше в выдаче и поломке SEO. Лучше fixed taxonomy, expand через official additions.
9. **Phone-numbers в публичном профиле сразу** — anti-pattern для безопасности и платформенной retention. Phone доступен после booking, как у TaskRabbit/Thumbtack Direct Leads.
10. **Mandatory background checks для всех категорий с первого дня** — для xtrud это убьёт adoption. Делать optional с badge-incentive, как Thumbtack.

---

## Что НЕ адаптируется для РФ

| Что | Почему |
|-----|--------|
| **Checkr background check** | Checkr — US-only API, нет аналога в РФ. Альтернатива: manual ID-verification + Госуслуги OAuth (когда подключим). |
| **SSN requirement** | Нет в РФ. Аналог — ИНН + паспортные данные. |
| **1099 tax reporting** | Другая регуляторика. РФ требует self-employed (НПД) или ИП регистрации; xtrud может предлагать **automated НПД-чеки** через ФНС API (пример: WB, Ozon делают для самозанятых). |
| **Stripe Connect** | Не доступен в РФ. Альтернативы: ЮKassa, Тинькофф-эквайринг, СБП-переводы, Робокасса. Для free-tier xtrud это не критично — оплата идёт между клиентом и мастером напрямую через СБП / карта на карту, мы не интегрируем payments в v1. |
| **Subscription / lead-buying модель** | Мы full-free. Не нужно. |
| **Insurance $1M coverage** | Нет рынка для P2P-страхования услуг в РФ. Резервный фонд xtrud — заменитель. |
| **Annual contracts типа Angi $300/year** | Anti-РФ-pro. Не делать. |
| **License verification через state DBs** | В РФ профильные реестры распределены и не открыты для API. Только manual upload диплома + admin-review. |
| **«Top Pro» с lead-discounts** | Лидов мы не продаём → discount нечего давать. Перки Top Pro: featured-выдача, badge, marketing-поддержка. |
| **Pay-per-credit bidding (Bark / Upwork Connects)** | Не наша модель — мы free. Альтернатива anti-spam: daily response limits + reputation-based scaling. |

---

## Источники

### TaskRabbit
- [What's Required to Become a Tasker](https://support.taskrabbit.com/hc/en-us/articles/204411070-What-s-Required-to-Become-a-Tasker)
- [TaskRabbit Become a Tasker](https://www.taskrabbit.com/become-a-tasker)
- [Tasker Rates & Minimum Hours Policy](https://support.taskrabbit.com/hc/en-us/articles/35682300983181-Tasker-Rates-Minimum-Hours-Policy)
- [How Pricing Guidance Works](https://www.taskrabbit.com/blog/how-pricing-guidance-works-on-taskrabbit/)
- [How To Set Availability](https://support.taskrabbit.com/hc/en-us/articles/204409570-How-Do-I-Set-My-Availability)
- [Which Task Categories Should I Add](https://support.taskrabbit.com/hc/en-us/articles/360052736472-Which-Task-Categories-Should-I-Add-To-My-Profile)
- [Service Catalog API](https://developer.taskrabbit.com/docs/get-service-catalog)
- [Happiness Pledge Terms](https://support.taskrabbit.com/hc/en-us/articles/360035570011-The-Taskrabbit-Happiness-Pledge)
- [Elite Status Overview](https://support.taskrabbit.com/hc/en-us/articles/17958442241933-Elite-Status-Overview)
- [Stream Chat integration](https://getstream.io/blog/stream-chat-taskrabbit/)
- [Tasker Acceptance Rate](https://taskers.taskrabbit.com/2018/06/01/acceptance-rate-what-is-it/)
- [Stripe Payouts](https://support.taskrabbit.com/hc/en-us/articles/9726793176717-What-Is-Stripe-and-How-Does-It-Work)
- [IKEA Partnership](https://www.taskrabbit.com/ikea)
- [IKEA + TaskRabbit Retail Dive coverage](https://www.retaildive.com/news/ikea-streamlines-taskrabbit-furniture-assembly-service-checkout/740315/)
- [Checkr blog about TaskRabbit](https://checkr.com/blog/6-questions-with-taskrabbit)

### Thumbtack
- [Thumbtack Pro homepage](https://www.thumbtack.com/pro)
- [Thumbtack Pro Requirements (Everlance)](https://www.everlance.com/gig-guides/thumbtack-requirements)
- [Profile Guide](https://help.thumbtack.com/article/profile-guide)
- [Types of Leads](https://help.thumbtack.com/article/types-of-leads)
- [Pay for Leads](https://help.thumbtack.com/article/pay-for-leads)
- [Targeting Preferences](https://help.thumbtack.com/article/targeting-preferences)
- [How Thumbtack Works](https://help.thumbtack.com/article/how-thumbtack-works/)
- [Pro Rewards Program](https://help.thumbtack.com/article/thumbtack-pro-rewards-program)
- [Top Pro Terms & Conditions](https://help.thumbtack.com/article/top-pro-terms-and-conditions)
- [Insights / Performance Dashboard](https://help.thumbtack.com/article/insights)
- [Thumbtack Pricing 2026 (Procured)](https://procured.us/articles/thumbtack-pricing)
- [Thumbtack Pro Reviews (ServiceMag)](https://www.servicemag.org/software/thumbtack)
- [Instant Matching Marketplace (Thumbtack Engineering)](https://engineering.thumbtack.com/moved-thumbtack-instant-matching-marketplace/)

### Angi / HomeAdvisor
- [Angi Pro Signup](https://signup.angi.com/pro)
- [Angi Pro Support — What information do I need](https://support.servicepros.angi.com/angiprosupport/s/article/What-information-do-I-need-to-apply--New---Prospective-Pros)
- [Angi Leads Cost 2026 (LeadTruffle)](https://www.leadtruffle.co/blog/angi-leads-cost-pricing-contractors-2026/)
- [Complete Guide to Angi Leads 2026 (LeadTruffle)](https://www.leadtruffle.co/blog/complete-guide-angi-leads-home-service-contractors-2026/)
- [What is Angi's List for Contractors (Housecall Pro)](https://www.housecallpro.com/resources/what-is-angis-list-how-angi-works/)
- [Angi Key Launch (Angi IR)](https://ir.angi.com/news-releases/news-release-details/angi-launches-angi-key-membership-unlock-savings-all-home)
- [Angi for Contractors (OllyOlly)](https://www.ollyolly.com/reviews-reputation/angi-for-contractors-still-worth-it/)

### Handy
- [Handy Apply](https://www.handy.com/apply)
- [Handy Pricing & Job Rate](https://prohelp.handy.com/hc/en-us/articles/115015961167-Job-Rate-and-Processing-Fees)
- [Sidehusl Handy Guide](https://sidehusl.com/handy/)
- [How Handy Makes Money (VatorNews)](https://vator.tv/2016-06-03-how-does-handy-make-money/)

### Bark
- [Bark.com Pricing](https://www.bark.com/en/us/sellers/pricing/)
- [Bark Credit System](https://help.bark.com/hc/en-us/articles/13346288068892-What-is-a-credit-and-how-much-does-it-cost)
- [Lead Pricing Help](https://help.bark.com/hc/en-us/articles/18043745477788-Understanding-lead-pricing-on-Bark)
- [Bark Sellers Create Account](https://www.bark.com/en/gb/sellers/create/)
- [How Bark Works for Pros](https://www.bark.com/en/gb/how-it-works/sellers/)
- [Bark for Professionals (App Store)](https://apps.apple.com/us/app/bark-for-professionals/id1206370169)

### Houzz Pro
- [Houzz Pro Homepage](https://www.houzz.com/pro)
- [Houzz Pro Pricing (ITQlick)](https://www.itqlick.com/houzz-pro/pricing)
- [3D Floor Planner](https://pro.houzz.com/for-pros/feature-3d-floor-plan)
- [Mood Board Creator](https://pro.houzz.com/for-pros/feature-mood-board)
- [Client Dashboard](https://pro.houzz.com/for-pros/feature-client-dashboards)
- [Houzz Pro 2026 Review (Software Advice)](https://www.softwareadvice.com/construction/houzz-pro-profile/)

### Jobber
- [Jobber Homepage](https://www.getjobber.com/)
- [Jobber Features](https://www.getjobber.com/features/)
- [Jobber Client Hub](https://www.getjobber.com/features/client-hub/)
- [Jobber Pricing](https://www.getjobber.com/pricing/)

### Fiverr
- [Standardized Gig Packages](https://help.fiverr.com/hc/en-us/articles/4410009235601-Standardized-Gig-packages)
- [What are Packages](https://help.fiverr.com/hc/en-us/articles/360010559138-What-are-packages)
- [Creating a Gig](https://help.fiverr.com/hc/en-us/articles/360010451397-Creating-a-Gig)

### Upwork
- [How To Bid for Jobs](https://www.upwork.com/resources/how-to-bid)
- [Understanding Connects](https://support.upwork.com/hc/en-us/articles/211062898-Understanding-and-using-Connects)
- [Build Your Freelancer Profile](https://support.upwork.com/hc/en-us/articles/360016252373-How-to-build-your-freelancer-profile-the-essentials)
- [How to Boost a Proposal](https://support.upwork.com/hc/en-us/articles/4406395531795-How-to-boost-your-proposal)

---

## Финальные рекомендации для xtrud roadmap

**Sprint priority order** (если бы я планировал):

1. **Sprint 1 (must-have для master-profile):**
   - Per-category pricing (3 типа: hourly / visit / fixed) с placeholder-helper «в области берут X–Y».
   - Multi-select chips для категорий + per-category «стаж в этой услуге».
   - Service area: radius + населённый пункт (mass-import из ОКТМО).
   - Photo gallery (5–20 photos) в профиле.
   - Public profile preview в onboarding (Sample Profile).

2. **Sprint 2 (trust + retention):**
   - Verified Pro badge с manual ID-review (паспорт + selfie).
   - Response time stats на профиле.
   - Completion rate %.
   - In-chat photo + voice messages.
   - Phone-call masking через виртуальные номера (СберДевайсы / Тинькофф Бизнес VirtualNumber).

3. **Sprint 3 (lead UX + gamification):**
   - Daily response limits (5–10 для нового, 20+ для top).
   - Top Responder / Local Expert / 5-star Pro badges.
   - Pro Dashboard: position в выдаче, profile views, lead-to-hire conversion.
   - Quick reply templates.

4. **Sprint 4 (advanced):**
   - iCal sync.
   - Tiered packages (опц.) для категорий где релевантно.
   - Резервный фонд xtrud («Гарантия») — communications + ops.
   - FAQ section на профиле.
   - Госуслуги OAuth (когда станет доступно).

**Не делать сейчас:**

- Stripe / payment processing — не нужно, оставить out-of-platform.
- Background checks — нет инфраструктуры в РФ.
- Connects / lead-fee — против free-tier позиционирования.
- Annual subscriptions — против free-tier.
- Отдельное pro-app — single-app с role-switch правильнее для маленькой Ингушетии.

---

**Конец аудита.**
