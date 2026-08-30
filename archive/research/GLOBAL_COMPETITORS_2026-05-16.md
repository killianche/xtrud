# US/Global-аудит конкурентов сервисных маркетплейсов — 2026

> **Дата:** 2026-05-16. **Аудитор:** AI-агент (research-mode), фокус на свежие запуски 2024-2026.
> **Цель:** найти, что нового появилось у западных и индийских конкурентов за последние 18-24 месяца, и предложить, что взять в xtrud (бесплатный маркетплейс услуг для Республики Ингушетия, фокус ремонт+стройка).
> **Не дублирует:** `COMPETITOR_INSIGHTS.md` (май 2026, ~70 идей с 20 платформ), `research/US_MASTER_AUDIT.md` (механика pro-аккаунтов 9 платформ). Этот документ строится **поверх** них — добавляет 2024-2026 launches, deep-dive в AI и pro tools.
> **Тон:** "что украсть конкретно". Без академического тона. Привязка к нашему стеку Expo + Supabase + Vercel + соло-команда.
> **Примечание о пути:** изначально планировалось сохранить в `.claude/audit-2026-05-16/global-competitors.md`, но `mkdir` для этой папки оказался заблокирован санбоксом — отчёт сохранён рядом с `US_MASTER_AUDIT.md` в `research/` (та же тематика).

---

## TL;DR (5 главных тейков)

1. **2025 = год AI-агентов в home-services.** За один октябрь 2025 в ChatGPT-Apps SDK интегрировались Thumbtack, Angi, Booksy. Houzz Pro выкатил AutoMate (AI-эстиматы за 20 секунд). Jobber запустил Copilot + AI-receptionist + Jobber Voice. **Стандарт сместился:** voice/chat-агент — больше не nice-to-have, а ключевая точка входа клиента. Для нас это значит — приоритет AI-визарда оформления заявки (через GPT-4o-mini или Claude Haiku) поднимается с 🟡 до 🔴.

2. **«Instant Match / Instant Book» — мейнстрим, но он жёстко конфликтует с интересами мастеров.** Thumbtack Instant Match массово ненавидим про-сообществом ($30+ за лид, до 15 про на одну заявку, refund-кошмар). TaskRabbit Partner Pages пошли в обратную сторону — fixed-price, automated matching без quote-войны. **Победитель 2025:** quote-once, no-bidding, customer выбирает (Airtasker offer-ranking, MyBuilder Quote Tool). Pure auction-биддинг — токсичная модель.

3. **Houzz Pro и Booksy показывают, что killer-feature теперь — не «больше лидов», а «инструмент, который реально экономит время мастеру».** Houzz AutoMate генерит estimate за 20 секунд против часа вручную. Booksy AI заполняет gaps в календаре. Jobber Copilot пишет blog-posts из истории работ. **Сдвиг:** маркетплейс стал SaaS для pro. Бесплатный маркетплейс без pro-tools проигрывает платному с tools.

4. **Quick-commerce home help — новый отдельный сегмент.** Snabbit (Bengaluru, $30M Series C), Pronto (8x valuation jump), Urban Company Insta Help — все обещают **10-15 минут до мастера дома**. Сегмент массивный (Snabbit 10K orders/day), но требует пула «дежурных» мастеров и radius dispatching. **Для Ингушетии нерелевантно** в Phase 1 (534K население), но как long-tail killer-feature для срочной сантехники/электрики — стоит держать в roadmap.

5. **Жалобы на конкурентов — наши главные конкурентные преимущества.** Thumbtack: hidden fees, expensive fake leads, robotic AI-support. TaskRabbit: $9.95 «Trust & Safety» fee + 15% service fee + $25 IKEA-fee = drip pricing lawsuit. Houzz Pro: подписка $40-500/мес, плохие лиды, locked contracts. Bark: £5-50 за лид без гарантии. **Все четыре главные платные платформы массово ненавидимы pro за непрозрачные fees.** xtrud-бесплатно + честность — это уже половина дифференциации.

---

## По платформам

### 1. Thumbtack (US)

**Стек 2025-2026 — что новое:**

- **OpenAI Operator + Apps SDK (окт 2025).** Thumbtack стал первым home-services партнёром в [OpenAI Operator (янв 2025)](https://press.thumbtack.com/announcements/thumbtack-launches-as-home-services-collaborator-for-openais-new-operator/) — ChatGPT-агент может находить, писать и нанимать pro от имени пользователя. В [октябре 2025 расширили до ChatGPT Apps SDK](https://press.thumbtack.com/announcements/thumbtack-partners-with-openai-to-power-home-services-in-chatgpt/) — теперь все 800M weekly users ChatGPT могут запросить «find me a top-rated house cleaner this weekend on Thumbtack» прямо в чате, не открывая Thumbtack-приложение.
- **AI Project Guide (фев-апр 2026).** Multimodal: клиент шлёт фото проблемы (например, треснутую плитку) → AI описывает scope → подбирает категории → выдаёт диапазон цены → матчит с pro. Запущено TV/digital-кампанией начиная с февраля 2026.
- **Spotlight Placement gamification.** Top Pro (Platinum) tier: 75% response rate within 1 hour, 2400 points/period → featured placement, lead discounts. Серебро/Золото/Платина из старого Pro Rewards теперь критерий ranking algoritm.
- **Subscription bundles (2025).** Pro может купить bundle credits + featured placement + marketing tools со скидкой — попытка уйти от чистого pay-per-lead к hybrid-модели.
- **Thumbtack for Real Estate (авг 2024).** B2B-канал для риелторов: они приводят клиентов перед сдачей/покупкой жилья. Мастера получают мульти-job контракты.

**Pro tools:**

- **Cost Estimates dashboard** ([thumbtack.com/prices](https://www.thumbtack.com/prices)) — aggregate pricing по 500+ категориям из real bookings. Pro используют для калибровки quotes.
- **Targeting preferences** — granular: project value, customer type, urgency, weekly budget cap, calendar.
- **Auto-decline rules** — если customer-request не проходит targeting filter, pro вообще не платит за лид.
- **Insights dashboard** — lead-to-hire ratio, profile views, response rate/time, spend, Pro Rewards progress.

**Client tools:**

- **Instant Book** для фикс-сервисов (cleaning, lawn) — клиент бронит за tap.
- **FAQ section** в pro-профиле — SEO-полезно, выглядит как Booking.com.
- **«Prices Page»** — клиент видит «обычно это стоит $X-Y».

**AI:**
- OpenAI Operator agent поиска и найма (запуск 2025).
- ChatGPT Apps SDK интеграция (окт 2025).
- AI Project Guide с computer vision на фото (фев 2026).
- AI matching algorithm — анализирует preferences, project details, historical success rates.

**Trust:**
- Background check через Checkr (opt-in, бесплатно).
- License # verification badge.
- **Top Pro badge** (Platinum tier).

**Monetization:** Pay-per-lead, $1.50/credit baseline, 1-80 credits per lead → $1.50-$120+, peak $200. Dynamic weekly pricing.

**Жалобы 2025 (Reddit/Trustpilot/Community):**
- Лиды $30+, **9 из 10 не отвечают**.
- **До 15 pro на одной заявке** платят за один контакт.
- Disconnected numbers, computer-generated leads, price-shoppers.
- Refunds **только credits**, никаких cash refunds, требуют screenshot как доказательство.
- Instant Book ненавидим pro — фикс-цена ниже их обычной ставки.
- AI-support чувствуется как «робот, не помог».

**Killer-features:** OpenAI Operator integration, Pro Rewards 1-час-response gamification, FAQ section.

**Что украсть для xtrud:** AI-агент оформления заявки через computer vision на фото (🔴), 1-час response gamification (🟡), FAQ-секция в pro-профиле (🟡), Cost Estimates по категориям из агрегата (🔴 — у нас уже частично через master_price_list).

---

### 2. TaskRabbit (US/EU)

**Стек 2025-2026 — что новое:**

- **IKEA Integration Expansion (фев 2025).** Partner-API встроен в ikea.com checkout в US/Canada/Spain/UK. **+50% больше клиентов добавляют assembly**, AOV **×4.7**, returns **-40%** на сложной мебели. Tasker подтверждает время в app.
- **Partner Pages (июнь 2025).** Customizable landing pages для retailers — fixed-price services, automated Tasker-matching, no negotiation, no added fees. **Initial data: 3x больше клиентов берут assembly через Partner Pages vs стандартное добавление при покупке.**
- **Acquisition of Dolly (ноябрь 2024).** Перевозки добавились как первоклассный вертикал.
- **Class action lawsuit (2025) на drip pricing.** Скрытые $9.95 «Trust & Safety» + 15% service fee + $25 IKEA-fee = TaskRabbit маскировал лишние ~36% от advertised rate. Suit подан в 2025.

**Pro tools:**
- **Pricing Guidance per metro+category+experience** — Tasker видит «pros в области берут $X-Y».
- **Tasker Analytics** — peer-comparison в metro.
- **Real-time location** во время задачи (client отслеживает).
- **Same Day toggle** — daily reset в 00:00.
- **Elite Status** — top-35% by performance score в metro+skill.

**Client tools:**
- Instant booking через клиентское приложение.
- Stream Chat-powered чат с phone masking.
- Photo attachments в чате.
- Backup-tasker при cancellation.

**AI:** TaskRabbit пока не выпустил консьюмерского AI-агента 2025 уровня Thumbtack/Angi. Background, scoring algorithm — да, но user-visible AI слабо.

**Mobile:** Tasker app (отдельное) + клиентский app. Web-портал pro минимален.

**Trust:** Happiness Pledge до $10K/task (не страховка юр-смысле). Checkr background check + re-check каждые 2 года.

**Monetization:** 15% service fee + $9.95 Trust & Safety fee + $25 IKEA-fee — class action в 2025 за непрозрачность.

**Community:** Tasker community forum, peer-comparison Analytics.

**Killer-features:** **Partner Pages** (B2B retailer integration), IKEA-deep partnership (50% conversion lift, $4.7x AOV), Pricing Guidance per metro+category+experience.

**Жалобы 2025:** $99.77 fees на $279 task, hidden fees lawsuit, AI-support, frequent no-shows.

**Что украсть для xtrud:** **Partner Pages** для стройбаз/мебельных салонов Ингушетии (🔴 — основной канал монетизации через рекламу), Pricing Guidance per category+geo (🔴), Same Day toggle с daily reset (🟡 — sport на «выйти на работу сегодня»).

---

### 3. Angi (US, бывший Angie's List + HomeAdvisor)

**Стек 2025-2026 — что новое:**

- **AI Helper (июнь 2025).** При создании заявки клиент описывает «своими словами», LLM рефайнит в clean brief для pro. Match accuracy **+30%**. Homeowners using AI Helper **+25% project completion success**, **3x чаще запрашивают quote**.
- **Angi app в ChatGPT (март 2026).** End-to-end AI-guided hiring journey — homeowner в ChatGPT задаёт вопрос → переходит в Angi → нанимает pro.
- **Angi Services (Handy-merged).** Instant-book для fixed-price categories (cleaning, lawn) — Angi выступает merchant-of-record, субподряжает pro по fixed-rate. By 2025 ограничено high-velocity low-complexity tasks для protect margins.
- **Angi Key subscription** ($30/year) — discounts + premium support для homeowners.

**Pro tools:**
- Lead management dashboard.
- License + insurance verification mandatory (для большинства категорий).
- Annual subscription для contractors (не просто lead-buy).

**AI:**
- AI Helper для brief refinement (2025).
- ChatGPT Apps SDK integration (2026).
- AI matching через LLM.

**Trust:** Checkr background check business owner, license verification, insurance verification — **mandatory**.

**Monetization:** Lead-buy + annual subscription для contractors + Angi Services merchant-of-record fees.

**Killer-features:** AI Helper для нативной речи клиента → структурированный brief (30% match accuracy lift), Angi Key consumer subscription.

**Что украсть для xtrud:** **AI Helper** = AI-визард для оформления заявки клиентом (🔴 — у нас GPT-4o-mini раундтрип, $0.50/1K). Метрика +30% match accuracy и +25% completion — приоритет 1. Plus consumer subscription за «AI-помощника по home maintenance» (🟢 — слишком рано для нас).

---

### 4. Houzz Pro (US)

**Стек 2025-2026 — что новое (это технологический лидер сегмента):**

- **AutoMate AI (2025-2026).** Suite of AI tools powered by Houzz Vision AI:
  - **AI Estimator:** voice/text input → professionally formatted estimate за **20 секунд** vs **час вручную**. Auto-line-items, labor + local material pricing.
  - **AI Invoice + Change Order generation.**
  - **AI Project Schedule generator** — auto phases + durations.
  - **AI Product Clipper** — собирает product images, pricing, specs с любого сайта в Mood Board.
- **3D Room Scanner with LiDAR (iPhone 12 Pro+).** Использует Apple RoomPlan API. Сканирование комнаты → 3D floor plan + measurements + furniture placement в реальном времени.
- **Life-Sized Walkthrough.** AR-предпросмотр будущего ремонта в реальном размере.
- **Mood Boards с background removal AI.** Загрузить фото продукта → AI убирает фон одним кликом → добавить в mood board.
- **Benjamin Moore paint color integration** — реальные цвета красок в 3D-моделях и mood boards.

**Pro tools:**
- Selection Boards для клиентов.
- CRM, инвойсы, change orders, schedule, time tracking.
- Lead-generation от Houzz-маркетплейса (отдельный поток).

**Client tools:** Mood Boards (клиент собирает желания), 3D walkthrough.

**AI:** AutoMate (estimating, invoicing, scheduling), Houzz Vision AI (vision), Product Clipper, background removal.

**Mobile:** Houzz Pro mobile (full feature parity для LiDAR scan + mood boards).

**Trust:** Premium Profile = paid listing, не verification как у Thumbtack/Angi.

**Monetization:** SaaS subscription для pro: **$40-500/month** в зависимости от plan + lead-generation extra.

**Жалобы 2025:** Высокие costs, locked contracts, **очень плохие лиды** ($5K spend без единого звонка), плохая поддержка, баги.

**Killer-features:** **AutoMate AI estimating (20 секунд)**, **3D Room Scanner LiDAR**, **Mood Boards с AI Product Clipper**, Houzz-маркетплейс как мощный канал inbound.

**Что украсть для xtrud:**

- **Mood Boards** (🔴) — клиент собирает визуальную доску ремонта из фото портфолио мастеров + материалы → шлёт мастеру. Резко повышает clarity бриф'а. (M по сложности — новый экран + storage для боард-карточек.)
- **AI Estimator** для мастера (🟡) — мастер голосом/текстом описывает scope → AI генерит estimate с labor + материалами. У нас нет SaaS-подписки — этот фичер делать через GPT-4o-mini ($0.50-1/estimate) и встраивать в чат с клиентом. (L по сложности — нужна база данных среднецен по материалам в РИ.)
- **3D Room Scanner через LiDAR** (🟢) — это для **дизайнеров интерьера + ремонтных бригад high-end**, требует iOS-only + iPhone 12 Pro+. Для Ингушетии преждевременно. На потом.
- **Background-removal AI для портфолио** (🟢) — мастер загружает фото работы → AI убирает фон → чистая карточка. Дешёво через Replicate ($0.005/image).
- **Product Library с партнёрскими ценами** (🟡) — каталог плитки/обоев/материалов от стройбаз с реальными ценами → клиент в mood board → отправляет мастеру со сметой.

---

### 5. Bark.com (UK)

**Стек 2025-2026 — что новое:**

- **AI-driven lead matching (2025).** Обновили UX, streamlined navigation, **AI-сопоставление** клиента и pro.
- **Elite Pro package** — featured placement + дополнительные tools для top-rated pro.
- **«Get Hired Guarantee»** на первый credit pack — если pro не нанимают, credits возвращают (psychological commitment).

**Monetization:** Pay-per-lead, **£5-50 за лид** в зависимости от категории. Базовая credit-цена **£1.20+VAT**. В solar/electrical/window installation — выше.

**Жалобы:** Mixed reviews — frustration over lead quality, fake listings, unresponsive contacts.

**Killer-features:** Get Hired Guarantee (повышает trust на первой покупке).

**Что украсть для xtrud:** **Lead Quality Score** (🟡) — у нас бесплатно, поэтому используем как вес заявки в ленте: фото + точный адрес + бюджет = выше; «нужен мастер» одним словом = ниже. Plus идея «**Hire Guarantee первого месяца**» — psychological commitment без денег: «впервые публикуешь профиль и не получил ни одного отклика за 30 дней — мы помечаем тебя featured».

---

### 6. Airtasker (Australia)

**Стек 2025-2026 — что новое:**

- **Airtasker AI (2024).** AI-assisted task description tool — улучшил bid accuracy **+25%**, снизил time-to-hire.
- **Offer expiration timers (2025).** Pro ставит deadline на свой offer — **20% быстрее accept**.
- **Offer ranking system (2025).** Offers scored и ranked, top помечается «Top Offer» — клиенту проще выбрать.
- **Task Alerts.** Pro получает push о тасках с keyword-match.
- **Rebooking бонус.** Повторный клиент — pro платит только **1.9% transaction fee**, без service fees. Сильная retention-механика.
- **Chubb Insurance (AU) расширилась AI-engine (нояб 2025).** Chubb Studio AI-optimization для embedded insurance — personalized recommendations, click-to-engage с advisor.

**Pro tools:** Offer management (expiration timers), Task Alerts, profile improvements (2025).

**Trust:** Public Liability Insurance до AUD $20M на каждую закрытую задачу через Chubb.

**Monetization:** 15-20% service fee при первой задаче, **1.9%** при повторной с тем же клиентом — мощный pro-retention.

**Killer-features:** **Public Liability Insurance** ($20M через Chubb), Rebooking 1.9% fee для retention, Offer expiration timers.

**Что украсть для xtrud:**

- **Rebooking incentive** (🟡) — для нас нет fee, но можем дать **бейдж «Постоянный клиент»** мастеру и клиенту → повышение в выдаче, доп. push «у тебя N постоянных клиентов».
- **Offer expiration timers** (🟢) — pro ставит «отвечу до 18:00» — после этого клиент видит «offer expired». Создаёт urgency, дисциплинирует обе стороны.
- **Offer ranking + Top Offer** (🟡) — у нас в отклики ранжируются по чему-то базовому (timestamp). Внедрить **ranking score** (рейтинг × completion rate × match score) и помечать топ-1 в карточке как «xtrud Top Offer».
- **Public Liability Insurance** через локального партнёра (🔴) — Ингосстрах/Согаз/АльфаСтрахование микрополис ~10-30 ₽ на сделку. Огромный trust-anchor + повод для рекламной модели страховщиков.

---

### 7. Booksy (PL/Global)

**Стек 2025-2026 — что новое:**

- **Google AI Mode integration (авг 2025, расширено нояб 2025).** Booksy — первый beauty/wellness партнёр в Google Agentic AI. Клиент через Google Search говорит «Find me a hair salon for highlight this Saturday» → AI Mode матчит с availability → бронирует напрямую в provider calendar. **0% extra fees, 0% commission** для бизнеса на bookings через Google AI.
- **Booksy Biz AI (2026).** Optimize booking gaps + suggest marketing targets. AI заполняет dead time в календаре.
- **Zowie AI partnership для customer service.** Booksy использует Zowie для 24/7 support — handle бытовых вопросов клиентов автоматически.
- **Booksy Boost** — pro платит **только за нового клиента, пришедшего через приложение**, не за лид. Никаких холодных лидов.
- **Booksy Store (май 2024)** — закупка профматериалов через app.

**Pro tools:**
- Online booking + calendar management.
- Client management (history, preferences, no-show flags).
- Automated reminders (reduce no-shows).
- Built-in marketing tools + payment processing.

**Client tools:** Google Reserve, Instagram, Yelp, FB Appointments integration. Slot-picker без чата.

**AI:**
- Google AI Mode agentic booking (2025).
- Booksy Biz AI для gap-filling и marketing targets (2026).
- Zowie AI для customer service.

**Monetization:** SaaS subscription + Booksy Boost commission (only new customers through app).

**Killer-features:** **Booksy Boost** (pay only for net-new customers через app), Google AI Mode integration, Zowie AI 24/7 support.

**Что украсть для xtrud:**

- **Slot-booking flow** (🔴) — для beauty/репетиторов/СТО клиент видит календарь → бронит → без отклика, без чата. У нас сейчас всё через quote → response → выбор. Добавить параллельный flow для категорий с фикс-ценой.
- **Booksy Boost модель** для будущей монетизации (🟢) — если когда-то будем монетизировать, это самая «честная» модель — pro платит только когда реально получает нового клиента через нас. Запомнить.
- **AI gap-filler в календаре мастера** (🟡) — Booksy Biz AI смотрит на расписание мастера и предлагает: «Wed 14:00 свободен — пушни прошлым клиентам скидку 10%». Для нас — backend job в Supabase + push.
- **Google Reserve integration** (🟡) — клиент гуглит «маникюр Назрань» → Google показывает кнопку «Забронировать через xtrud». Free через Google Business API.

---

### 8. Urban Company (India/UAE)

**Стек 2025-2026 — что новое:**

- **IPO на NSE/BSE (сент 2025).** $230M raise. ₹1900 crore total. Issue oversubscribed 15x на Day 3.
- **Insta Help (март 2025, переименовано из Insta Maids).** Quick-commerce home help — на месте через **15 минут**. Cleaning, laundry, kitchen prep. Operates в Mumbai, Delhi NCR, Hyderabad, Bangalore. Adjusted EBITDA loss **₹44 Cr** на этом сегменте (агрессивная инвестиция).
- **Native brand expansion.** Smart-home products (water purifiers, smart door locks). Revenue **₹75 crore (+179% YoY)**, losses narrowed to 9% NTV vs 30% YoY.
- **Конкуренция:** Snabbit ($30M Series C 2025, valuation $180M, 10K orders/day), Pronto (8x valuation jump 2026).

**Pro tools:** Heavy training requirement, uniform, fixed prices, app-only work, performance-based promotions.

**Client tools:** Fixed-price каталог, 15-минутный quick-commerce, native products bundling.

**AI:** Не топ-агрессивный в AI как Houzz/Jobber — больше operational ML для dispatching.

**Trust:** Pro проходит obligatory training, носит униформу, fixed-price без торга.

**Monetization:** Commission (20-30%) + Native product margin.

**Killer-features:** **Insta Help** (15-min quick commerce), Native brand (vertical integration), employed-style pro standards.

**Что украсть для xtrud:**

- **Quick-help для срочных категорий** (🟢, на потом) — «срочная сантехника», «выбило пробки», «прорвало трубу» — отдельный flag-категория с **дежурными мастерами**. Нужен пул, SLA. Для Ингушетии в Phase 2-3.
- **«Униформа» через QR-code badge** (🟢) — мастер приходит на адрес, показывает QR «Я с xtrud, мой профиль» → клиент сканирует → проверяет identity. Снижает страх «впустить незнакомца». S по сложности.
- **Микро-курсы для мастеров** (🟡) — «как фотографировать работу для портфолио», «как написать профиль, который продаёт», «безопасность при работе». Content = SEO + retention.
- **Fixed-price каталог** для типовых задач (🟡) — параллельно с quote-flow для категорий «замена крана / установка стиралки / монтаж карниза». См. также Helpling.

---

### 9. Helpling (Germany)

**Стек 2025-2026:** **Серьёзных launches за 2024-2025 не нашлось** (компания зрелая, focus на margin не growth). AI-фичи минимальны.

**Что украсть для xtrud:** Только то, что уже было — **backup-мастер при неявке** (см. COMPETITOR_INSIGHTS 1.15).

---

### 10. Handy / Angi Services (US, merged)

**Стек 2025-2026:**

- **Handy → Angi Services rebrand.** Handy Pro App → Angi Services for Pros (без functional changes).
- **Instant Booking + integrated payments** — flat-rate fixed-price, Angi выступает merchant-of-record, субподряжает pro по fixed rate.
- **By 2025 Angi limited fixed-rate** к high-velocity, low-complexity tasks (cleaning, lawn) — protect margins.

**Killer-features:** Instant booking + transparent upfront pricing + Angi acts as merchant-of-record.

**Что украсть для xtrud:** Fixed-rate каталог для типовых низко-сложных задач (см. UC + Helpling). Не делать xtrud merchant-of-record — это требует лицензии платёжного агента.

---

### 11. HomeAdvisor (часть Angi)

Слилась с Angi в 2022. **Самостоятельных launches с 2024 нет.** См. Angi.

---

### 12. Hipages (Australia)

**Стек 2025-2026 — что новое:**

- **AI workflows (2025-2026):**
  - **AI job posting assistant** — homeowner описывает задачу, AI структурирует.
  - **Tradie location tracker** — клиент видит «tradie едет».
  - **Voice plugin для quoting** — pro диктует quote голосом.
  - **Workday route optimisation** — pro получает оптимальный маршрут по 4-5 задачам в день.
- **'Hipages for Business' rebrand** (бывший tradie app) — full SaaS позиционирование, не просто lead-gen.
- **Hipages Perks** — exclusive deals для tradies + households (партнёрские скидки).
- **Финансы Q1 FY2026:** revenue +11% → AUD $44.9M, EBITDA +29% → $11.2M, net profit ×27.

**Killer-features:** **Voice plugin для quoting** (мастер диктует estimate голосом → app форматирует), **route optimization** для multi-job day, AI job posting assistant.

**Что украсть для xtrud:**

- **Voice-to-quote для мастера** (🟡) — мастер в чате с клиентом диктует quote голосом → Whisper API ($0.006/min) + GPT-4o-mini форматирует → структурированный quote с line-items. Сильно ускоряет работу.
- **Route optimization для multi-job day** (🟢, на потом) — если мастер взял 3-4 заявки на день, app строит оптимальный маршрут. Через Google Directions API. Для Ингушетии практично — компактная гео.
- **Tradie location tracker** (🟡) — после accept'а заявки клиент видит «мастер в пути» на карте (Expo Location + Supabase realtime). Сильный trust signal.
- **AI job posting assistant** = AI-визард (🔴) — то же, что Angi AI Helper. Сделать на GPT-4o-mini.

---

### 13. MyBuilder (UK)

**Стек 2025-2026 — что новое:**

- **MyBuilder Quote Tool** ([mybuilder.com/intro-to-quote-tool](https://www.mybuilder.com/intro-to-quote-tool)) — fast/free professional quotes за минуты. Line items, breakdown, professional formatting → отправка клиенту с одной кнопкой.
- **MyBuilder for Trades app + MyBuilder for Homeowners app** — split apps (как TaskRabbit). Pro получает push на new leads + shortlists + messages + quote requests.

**Killer-features:** **Quote Tool** (free, professional, fast). Сильный паттерн для мастеров, которые без app пишут quotes в WhatsApp текстом.

**Что украсть для xtrud:** **Quote Tool в чате** (🔴) — мастер в чате с клиентом создаёт structured quote (line items: «материалы X — 5000₽, работа — 8000₽, выезд — 500₽, total — 13500₽, срок — 3 дня»). Клиент принимает в одно tap → создаётся «согласованная смета» как часть order. Это сильно профессионализирует общение и **резко поднимает trust**. Простой UI: builder-форма + preview + send. (M по сложности.)

---

### 14. Trustedhousesitters (UK/Global, узкая ниша)

**Стек 2025-2026 — что нового для общего UX:**

- **Blind reviews (14-day timeframe).** Обе стороны (homeowner и sitter) оставляют отзыв "вслепую" — не видят отзыв другой стороны, пока сами не оставят. Через 14 дней публикуется. **Резко снижает retaliation bias** (плохой отзыв в ответ на плохой отзыв).
- **5 verifications stack:** email + phone + ID document (cross-check databases на lost/stolen/compromised) + free background check (US) + optional external references.
- **Amenities tags** — Wi-Fi speed, pet care needs, accessibility flags на каждой listing.

**Killer-features:** **Blind reviews** (game-changer для двухсторонней оценки), **ID document cross-check** против database lost/stolen documents.

**Что украсть для xtrud:**

- **Blind reviews** (🔴) — у нас mutual review уже включена, но клиент видит отзыв мастера ДО того как пишет свой → retaliation bias. Внедрить blind: оба пишут не видя другую сторону, публикуется через **48-72 часа** обоим. Простая фича на уровне `published_at`+`reveal_at` колонок. (S по сложности — миграция + UI conditional rendering.)
- **ID document cross-check** (🟡, на потом) — против database украденных/просроченных паспортов РФ. Через сторонние сервисы (СберKey / Госуслуги). Делать в Phase 2 после real-SMS.

---

### Adjacent: SaaS-инструменты для мастеров (Jobber, ServiceTitan)

Не маркетплейсы, но **источник идей для pro-tools**, особенно в bare AI-фичах.

**Jobber (Canada, home services SaaS):**

- **Jobber Copilot (2024).** AI business coach + data analyst + marketing specialist в одном чате. Использует historical Jobber data → "Какой у меня cash flow в Q3?", "Напиши blog post про мои 5 самых сложных работ".
- **AI Receptionist 24/7 (сент 2025).** Voice agent отвечает на звонки, capture лиды, бронит задачи в календаре.
- **Jobber Voice (2025).** Hands-free voice actions для pro в полях (диктовать notes, обновлять статус).
- **Campaign Generator** — auto-generated branded email campaigns.
- **Auto-drafted quotes** — AI генерит quote из existing templates + past quotes → pro ревьюит и шлёт.

**ServiceTitan (US, home services SaaS):**

- **Atlas AI Sidekick (2025).** Titan Intelligence + 14+ AI features.
- **AI Voice Agents** — никогда не пропустить лид, AI бронит jobs по real-time capacity.
- **Adaptive Capacity** scheduling — AI считает technician скилы, locations, close history, upsell potential → dispatches по revenue, не proximity.
- **Atlas marketing AI** — auto-campaigns с real-time spend adjustment.

**Что украсть для xtrud:**

- **AI auto-draft quote** (🔴) — для каждого нового запроса pro видит «AI предлагает quote: X₽, базируясь на твоих прошлых 12 работах в этой категории». Pro может ревьюнуть/отредактировать → отправить за 1 tap. Это огромный time-saver. (M по сложности — нужны embeddings прошлых quotes для retrieval-based generation.)
- **AI Receptionist для упущенных лидов** (🟡) — если pro не ответил за 30 мин, AI-бот в чате задаёт клиенту 3 уточняющих вопроса («Когда?», «Где?», «Срочность?») → сохраняет ответы в thread → pro видит готовый quote-ready brief. Удерживает клиента, чтобы он не ушёл к конкуренту. (M по сложности.)
- **Voice notes для pro в поле** (🟡) — мастер диктует голосом обновление статуса, AI распознаёт + добавляет в timeline order'а. Whisper API.
- **AI Business Coach (мини)** (🟢) — каждый вторник мастер получает push «Твоя cash flow growth +15% YoY, реагируешь 1.5 час медленнее чем top-10% в категории — попробуй включить same-day push'и».

---

## Кросс-таблица фич 2024-2026

| Фича | Thumbtack | TaskRabbit | Angi | Houzz Pro | Booksy | UC | Hipages | MyBuilder | Airtasker | Jobber |
|---|---|---|---|---|---|---|---|---|---|---|
| ChatGPT Apps SDK / Operator | ✅ окт 2025 | — | ✅ мар 2026 | — | — | — | — | — | — | — |
| AI brief refinement (LLM) | ✅ 2026 | — | ✅ июнь 2025 | — | — | — | ✅ 2025 | — | ✅ 2024 | — |
| AI estimate generation | — | — | — | ✅ 2025 AutoMate | — | — | — | ✅ Quote Tool | — | ✅ auto-quote 2025 |
| Voice-to-quote | — | — | — | ✅ AutoMate | — | — | ✅ 2025 | — | — | ✅ Jobber Voice |
| Computer vision price estimate | ✅ 2026 | — | — | — | — | — | — | — | — | — |
| 3D Room Scan / LiDAR | — | — | — | ✅ | — | — | — | — | — | — |
| Mood Boards | — | — | — | ✅ | — | — | — | — | — | — |
| Slot booking без чата | ✅ Instant Book | ✅ | ✅ Angi Services | — | ✅ core | ✅ | — | — | — | — |
| 10-15 min quick commerce | — | — | — | — | — | ✅ Insta Help | — | — | — | — |
| Partner Pages (B2B retailer) | ✅ Real Estate | ✅ 2025 | — | — | — | — | — | — | — | — |
| Public Liability Insurance | — | Pledge $10K | — | — | — | — | — | — | ✅ Chubb $20M | — |
| Background check (Checkr) | ✅ opt-in | ✅ mandatory | ✅ mandatory | — | — | ✅ training | ✅ license | ✅ vetting | ✅ | — |
| Top Pro / Elite gamification | ✅ Platinum | ✅ Elite | ✅ | — | — | — | — | ✅ Top Trader | ✅ Top Offer | — |
| Pro Rewards points system | ✅ 2400 pts | ✅ Acceptance Rate | — | — | — | — | ✅ Perks | — | — | — |
| Rebooking fee discount | — | — | — | — | — | — | — | — | ✅ 1.9% | — |
| Pricing Guidance per geo+cat | ✅ | ✅ key feature | — | ✅ AutoMate | — | ✅ fixed | — | — | — | — |
| AI Receptionist / Voice agent | — | — | — | — | ✅ Zowie | — | — | — | — | ✅ 2025 |
| AI Business Coach | — | ✅ Analytics | — | — | ✅ Booksy Biz AI | — | — | — | — | ✅ Copilot |
| Blind reviews | — | — | — | — | — | — | — | — | — | — |
| QR-code identity badge | — | — | — | — | — | ✅ uniform | — | — | — | — |
| Home maintenance subscription | ✅ $49/year | — | ✅ Angi Key | — | — | — | — | — | — | — |

---

## Топ-30 идей для xtrud (с приоритетом и сложностью)

Все идеи проверены на отсутствие в COMPETITOR_INSIGHTS.md как уже учтённых (или явно обновляют 2024-2026 версию).

| # | Идея | Источник 2024-2026 | Приоритет | Сложность |
|---|---|---|---|---|
| 1 | **AI Helper при создании заявки** (LLM рефайнит native speech в clean brief) | Angi (июнь 2025, +30% match accuracy) | 🔴 | M |
| 2 | **AI auto-draft quote** для мастера на основе его прошлых работ | Jobber Copilot, ServiceTitan Atlas | 🔴 | M |
| 3 | **Computer vision на фото проблемы** → диапазон цены + категория | Thumbtack AI Project Guide (фев 2026) | 🔴 | M |
| 4 | **Mood Boards** — клиент собирает визуальную доску ремонта | Houzz Pro (ключевая фича) | 🔴 | M |
| 5 | **Structured Quote Tool в чате** (line items: материалы + работа + выезд) | MyBuilder Quote Tool | 🔴 | M |
| 6 | **Blind reviews** (24-72ч hidden, потом revealed обеим сторонам) | Trustedhousesitters | 🔴 | S |
| 7 | **Public Liability Insurance** через локального партнёра (10-30₽/сделка) | Airtasker × Chubb | 🔴 | M |
| 8 | **AI brief из голосового сообщения** (Whisper → GPT-4o-mini) | Hipages voice plugin, Jobber Voice | 🔴 | S |
| 9 | **Pricing Guidance per category × city × experience** | TaskRabbit (ключевая) | 🔴 | M |
| 10 | **AI gap-filler в календаре мастера** (push: «Wed 14:00 свободен — скидка 10% прошлым клиентам?») | Booksy Biz AI 2026 | 🟡 | M |
| 11 | **AI Business Coach** еженедельный push с метриками peer-comparison | Jobber Copilot | 🟡 | M |
| 12 | **AI Receptionist для упущенных лидов** (если pro не ответил за 30 мин, AI задаёт 3 уточняющих вопроса) | Jobber, ServiceTitan | 🟡 | M |
| 13 | **Background removal для портфолио** мастера (фон → чистая карточка) | Houzz Product Clipper | 🟡 | S |
| 14 | **Same Day toggle** с daily reset (мастер каждое утро решает «работаю сегодня?») | TaskRabbit | 🟡 | S |
| 15 | **Tradie location tracker** (клиент видит «мастер в пути» на карте) | Hipages | 🟡 | M |
| 16 | **Top Offer marker** в отклике (ranking by rating × completion × match) | Airtasker Top Offer | 🟡 | S |
| 17 | **Offer expiration timer** в quote мастера | Airtasker 2025 | 🟡 | S |
| 18 | **Rebooking бейдж + push** (постоянный клиент / постоянный мастер) | Airtasker 1.9% rebook | 🟡 | S |
| 19 | **Slot-booking без чата для бьюти/репетиторов/СТО** | Booksy core | 🔴 | M |
| 20 | **Fixed-price каталог для типовых задач** (параллельно с quote-flow) | UC, Handy/Angi Services | 🟡 | M |
| 21 | **QR-code identity badge при выезде** (мастер показывает QR, клиент проверяет identity в app) | UC uniform analog | 🟡 | S |
| 22 | **«AI ассистент по home maintenance» membership $X/год** (push планов сезонных работ + 10K₽ money-back) | Thumbtack $49/year membership | 🟢 | L |
| 23 | **Partner Pages для стройбаз/мебельных** (fixed-price + automated matching) | TaskRabbit Partner Pages 2025 | 🔴 | L |
| 24 | **Voice-агент интеграция через Алису/GigaChat** (русский аналог ChatGPT Apps SDK) | Thumbtack, Angi 2025-2026 | 🟢 | L |
| 25 | **Route optimization для multi-job day мастера** | Hipages 2025 | 🟢 | M |
| 26 | **AI tags из фото портфолио** (керамогранит, маяковая штукатурка) | Houzz Vision AI | 🟡 | M |
| 27 | **Voice notes мастера в timeline** (диктовать обновление статуса) | Jobber Voice | 🟡 | S |
| 28 | **AI-саммаризация отзывов** в карточке мастера («что говорят: пунктуален, дороговат») | новое для 2026 | 🟡 | S |
| 29 | **Микро-курсы для мастеров** («фотографирование портфолио», «как написать профиль») | UC, Workle | 🟢 | M |
| 30 | **«Hire Guarantee первого месяца»** — featured placement при 0 откликов за 30 дней | Bark Get Hired Guarantee | 🟢 | S |

---

## Чего НЕ копировать (обновлено для 2024-2026)

| Что | У кого | Почему НЕ нам |
|---|---|---|
| **OpenAI Operator / ChatGPT Apps SDK интеграция** | Thumbtack, Angi | В РФ ChatGPT недоступен официально. Для РФ нужен RU-аналог (Алиса, GigaChat) — но это совсем другая интеграция. **Phase 3, не Phase 1.** |
| **Quick-commerce 10-15 минут (Insta Help, Snabbit)** | Urban Company, Snabbit | Требует пула дежурных мастеров с GPS-tracking + SLA + 10x операционных costs. Снэббит сжигает капитал ради этого. Для РИ (534K население) экономически невозможно — нужны метры >2M. |
| **Drip pricing / hidden fees** | TaskRabbit | Class action 2025 за $9.95 + 15% + $25 IKEA-fee. **Худшая практика в индустрии.** Не делать NEVER. |
| **Pay-per-lead bidding-war (15 pro на 1 заявку)** | Thumbtack, Bark | Reddit-сообщество ненавидит. Pro массово уходят. 9 из 10 лидов не отвечают. Наш free-model — точно правильный путь. |
| **Annual subscription для pro $40-500/мес (SaaS-маркетплейс)** | Houzz Pro | Сложно сочетается с нашей бесплатностью. Houzz Pro массово ненавидим за locked contracts. Возможный путь — отдельные AI-features за маленький fee позже, но не main monetization. |
| **Employed-style pro (UC модель)** | Urban Company | Требует штат, ФОТ, страховку всех — соло-команда не вытянет. UC после IPO имеет ₹44 Cr EBITDA loss на этом сегменте. |
| **AI Receptionist обязательный 24/7 customer service** | Jobber, Booksy (Zowie) | Сейчас AI customer support массово ненавидимы. Reddit на TaskRabbit: «AI чувствуется как робот, не помог». Можем использовать AI для **дополнения** support, не замены. |
| **Computer vision на estimate без human review** | Houzz AutoMate | AI генерит estimate за 20 секунд — но **только pro** видит первый. Полностью авто-показ клиенту → ошибки + spam. Всегда intermediate review мастером. |
| **Auction-bidding (клиент ставит цену, мастера демпингуют)** | YouDo, Airtasker (старая модель) | Уже было в COMPETITOR_INSIGHTS. Усугубилось 2024-2026 — сообщества жалуются на демпинг. Лучше: pro ставит quote, клиент выбирает. |
| **Native-brand (свои продукты)** | Urban Company | Требует производства/склада/логистики. UC потратил 5 лет на это, и только в FY2026 вышел в +. Не наш слой. |

---

## Дикие/неочевидные идеи 2024-2026

### 1. **Mood Board → AI-генерация brief'а под Mood Board**

Клиент собирает визуальную доску (фото плитки/паркета/обоев/light fixtures). xtrud AI смотрит на доску → генерит **prompt для мастера**: «Клиент хочет минималистичный ремонт ванной с тёмной матовой плиткой 600×600, латунной фурнитурой, тёплым LED-светом. Бюджет средний (по референсам — 200-400К₽). Стиль: industrial-modern.» Сильнее текстового брифа — мастера понимают вижуально, не словами. Никто из RU/Кавказ-конкурентов не делает.

### 2. **«Свидетельство соседа» — verification через подъездного жителя**

В кавказской культуре «поручиться за соседа» — норма. Цифровая версия: мастер при онбординге может **попросить 2-3 соседей** дать ему testimonial (имя + фото + 1 предложение). Соседи подтверждают через одноразовый OTP. Это сильнее, чем DiceBear-аватары и пустые бейджи — **визуальное доказательство, что мастер живёт в этом районе** и его реально знают. Уникально для региональной аудитории.

### 3. **«Mahalla check-in» — групповая ответственность общины**

Когда мастер выезжает на заявку, в его карточку клиента приходит уведомление: «Магомед из такого-то рода, такого-то села выезжает к вам. Среди его поручителей — старейшина X из мечети Y». Цифровая надстройка над традиционным сообществом. **Сильнейший trust signal**, конкурентам недоступен.

### 4. **AI-визуализация «у меня в подъезде» для типового MKD**

В Ингушетии массовый pattern застройки — typical MKD-pattern (5-этажки, 9-этажки). Сделать AI-визуализацию **не «у тебя дома»**, а **на основе типового подъезда**: клиент выбирает «у нас МКД серии 7-1», AI показывает стандартную ванную/кухню → клиент выбирает плитку → визуализация для этого типового layout'а. Ничего не требует с клиента (фото etc), работает мгновенно. Conversion должен быть гигантским.

### 5. **«Тейп-сертификат соответствия»** (опционально, осторожно)

Для категорий, где культурный/религиозный fit важен (свадьба, помол, ритуальные услуги, женский маникюр у женского мастера на дому), мастер может опционально указать тейп/род. **Скрывается по умолчанию**, виден только если клиент явно фильтрует. **НЕ продвигать как фичу** — это политически чувствительно, может быть воспринято как сегрегация. Только как low-key option в settings privacy.

### 6. **«AI-mentor для junior мастера»** (Jobber Copilot, адаптированный)

Молодой мастер (<1 года на платформе, <10 заказов) получает push «AI ментор: твой профиль 60% complete, добавь 3 фото портфолио для +30% откликов. Топ-5 в твоей категории отвечают за 12 мин, ты — за 45 мин». Микро-coaching без human-руководителя. Сильнейший retention для junior.

### 7. **Telegram-канал «горячих заявок» только для верифицированных мастеров**

Бот публикует **на 30 минут раньше** заявки в закрытом канале для top-rated мастеров. Это **community moat** — мастер не уйдёт к конкуренту, потому что потеряет членство в эксклюзивном канале. Технически — Supabase webhook → Telegram Bot API.

---

## Источники

### Свежие пресс-релизы и блоги 2024-2026

- [Thumbtack × OpenAI ChatGPT Apps SDK (окт 2025)](https://press.thumbtack.com/announcements/thumbtack-partners-with-openai-to-power-home-services-in-chatgpt/)
- [Thumbtack × OpenAI Operator (янв 2025)](https://press.thumbtack.com/announcements/thumbtack-launches-as-home-services-collaborator-for-openais-new-operator/)
- [TaskRabbit Partner Pages launch (июнь 2025)](https://www.businesswire.com/news/home/20250618858061/en/Taskrabbit-Reimagines-the-Retail-Customer-Experience-Launching-New-Integrated-Solutions-for-Partners)
- [TaskRabbit × IKEA expansion (фев 2025)](https://www.businesswire.com/news/home/20250213865024/en/Taskrabbit-Scales-Partnership-with-IKEA-Across-North-America-and-Europe)
- [Angi AI Helper launch (июнь 2025)](https://ir.angi.com/news-releases/news-release-details/angi-launches-new-ai-helper-it-celebrates-30-years-innovation)
- [Angi app в ChatGPT (март 2026)](https://ir.angi.com/news-releases/news-release-details/angi-launches-angi-app-chatgpt)
- [Houzz Pro AutoMate AI](https://pro.houzz.com/pro-learn/blog/houzz-pro-puts-the-power-of-artificial-intelligence-to-work-for-you)
- [Houzz Pro AI Estimator how-to](https://pro.houzz.com/pro-help/r/how-to-use-ai-to-create-an-estimate-or-proposal)
- [Houzz Pro 3D Room Scan + LiDAR](https://pro.houzz.com/pro-help/r/how-to-scan-a-room-using-lidar-technology)
- [Booksy × Google AI Mode (нояб 2025)](https://biz.booksy.com/en-us/blog/booksy-google-ai-mode-integration)
- [Urban Company IPO + Insta Help](https://en.wikipedia.org/wiki/Urban_Company)
- [Snabbit $30M Series C (TechCrunch, окт 2025)](https://techcrunch.com/2025/10/29/indias-snabbit-valuation-doubled-to-180m-in-5-months-on-its-quick-house-help-bet/)
- [Airtasker Q3 2025 Feature Hub](https://www.airtasker.com/blog/the-feature-hub-july-2025/)
- [Hipages AI workflows (iTnews)](https://www.itnews.com.au/news/hipages-group-exploring-ai-agents-615302)
- [Jobber Copilot launch](https://www.prnewswire.com/news-releases/jobber-launches-copilot-the-first-of-several-ai-powered-products-aimed-at-making-home-service-business-ownership-simpler-than-ever-before-302264047.html)
- [Jobber AI Receptionist + Voice (сент 2025)](https://www.prnewswire.com/news-releases/industry-leader-jobber-unveils-exciting-new-ai-offerings-for-home-service-businesses-302567290.html)
- [ServiceTitan Pantheon 2025 AI announcements](https://www.servicetitan.com/blog/pantheon-2025-pro-products-automation)
- [Chubb AI-engine для embedded insurance (нояб 2025)](https://news.chubb.com/2025-11-12-Chubb-Launches-AI-Powered-Embedded-Insurance-Engine)
- [Lowe's HomeCare+ $99/year subscription (март 2026)](https://corporate.lowes.com/newsroom/press-releases/lowes-launches-associate-powered-home-maintenance-subscription-called-homecare-nationwide-03-17-26)
- [TaskRabbit class action drip pricing lawsuit 2025](https://www.classaction.org/blog/taskrabbit-lawsuit-claims-freelance-service-platform-charges-hidden-junk-fees-at-checkout)
- [Thumbtack Reddit complaints (Community)](https://community.thumbtack.com/discussion/1818/anyone-else-struggling-with-expensive-leads-but-no-bookings)
- [Trustedhousesitters verification stack](https://housesittingmagazine.com/trustedhousesitters-review/)
- [Bark.com lead pricing 2025 UK](https://www.homebuyerleads.co.uk/resources/is-bark-worth-the-price)
- [MyBuilder Quote Tool](https://www.mybuilder.com/intro-to-quote-tool)

### Industry trend reports

- [AI Voice Agents 2025: a16z landscape (Specter)](https://insights.tryspecter.com/ai-voice-agent-2025-a16z-landscape/)
- [Home Services AI Voice Agents 2026 (Leaping AI)](https://leapingai.com/blog/home-services-trends-why-voice-ai-is-no-longer-optional)
- [AI in Computer Vision Market $19.52B → $63.48B 2024-2030 (MarketsAndMarkets)](https://www.marketsandmarkets.com/Market-Reports/ai-in-computer-vision-market-141658064.html)

---

## Что точно делать ASAP (ранжированный top-10)

Из топ-30 идей — то, что **в первую очередь** должно попасть в TASKS.md / STATUS.md «next sprint» для xtrud:

1. **AI Helper для оформления заявки клиентом** (Angi-style, +30% match accuracy через LLM-рефайн native speech) — 🔴 M. **Самая high-impact фича 2025.**
2. **Structured Quote Tool в чате мастера** (MyBuilder line-items + send в одно tap, преобразовать «5к материалы 8к работа» в красивую согласованную смету) — 🔴 M. **Решает главный pain мастеров — quoting в WhatsApp текстом.**
3. **Blind reviews 48-72ч** — 🔴 S. **Самая cheap-and-impactful UX-фича.** Решает retaliation bias в mutual review.
4. **Pricing Guidance per category × city** (TaskRabbit) — 🔴 M. На основе data из master_price_list + seed.
5. **AI auto-draft quote для мастера** (Jobber/ServiceTitan) — 🔴 M. На основе истории его 12 последних работ в категории.
6. **Public Liability Insurance** через локального страховщика — 🔴 M. Trust-anchor + потенциал sponsorship deals.
7. **Slot-booking flow для бьюти/репетиторов/СТО** — 🔴 M. Расширяет сегмент за пределами ремонта.
8. **Mood Boards** — 🔴 M. Killer-feature для отделочной категории.
9. **Voice-to-text для бриф'а заявки (Whisper + GPT-4o-mini)** — 🔴 S. Для пожилой аудитории и occasional users.
10. **Computer vision price estimate с фото проблемы** — 🔴 M. Phase 2, после AI Helper.

Грубо: 10 фич × 3-7 дней каждая = **~3 месяца спринтов** для полной реализации. Stack: Expo + Supabase Edge Functions + OpenAI GPT-4o-mini ($0.50-2/1K calls) + Whisper ($0.006/min) + Replicate для background removal ($0.005/image). **Общая operating cost AI-stack при DAU 1000: ~$30-80/мес.** Покрывается одним спонсором.
