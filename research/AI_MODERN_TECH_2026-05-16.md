# AI / Modern Tech аудит для xtrud — 2026-05-16

> Свежие AI- и tech-фичи 2024-2026 в production-приложениях marketplace и adjacent. Цены, провайдеры, российский контекст. Часть параллельного аудита 16 мая 2026.

## TL;DR — 5 главных тейков

1. **Operator-эра наступила.** Октябрь 2025 — **Thumbtack** и **Angi** встроились в **ChatGPT через OpenAI Apps SDK**. Сделка закрывается без выхода из чата. Аналог для xtrud — **`@xtrudbot` Telegram + GigaChat function calling** реализуем за 1-2 недели, и это даёт discovery-моат, которого нет ни у одного RU-конкурента.
2. **Google AI Mode бронирует слоты у Booksy** (август 2025) — бесплатный канал, мастер не платит комиссии. Аналог — Яндекс.Карты Business API + schema.org разметка.
3. **AI-листинг от фото — стандарт 2024-25.** Mercari запустила в сентябре 2024 на GPT-4o-mini (listing в 3 тапа), Airbnb — Vision Transformer. Для xtrud: **мастер сфоткал работу → AI заполнил портфолио** через Claude Haiku 4.5 vision ($1/$5 per M tokens).
4. **Face Check / liveness — новый baseline trust-anchor** после Tinder (окт 2025, обязателен для US/CA). −60% bad actors, −40% suspicious reports. Через Sumsub Face Auth ($1/верификация). У нас уже `master_verifications` таблица — добавляем уровень `liveness`.
5. **Klarna откатилась с full-AI обратно к human-hybrid** (май 2025). Урок: AI-assist + human handoff, начинать с confidence-score → эскалация модератору.

## Tech-stack рекомендации (финал)

### AI LLM
| Use case | Primary | Fallback | Why |
|---|---|---|---|
| Текстовый AI | **Claude Haiku 4.5** ($1/$5 per M) via CF Workers proxy | **GigaChat 2 Lite** (₽190/M вход) | Best price-quality. GigaChat fallback при блоке. |
| Vision | **Claude Haiku 4.5 vision** | GigaChat vision | ~$3/1000 фото |
| Embeddings | `text-embedding-3-small` ($0.02/M) | self-hosted `bge-m3` | Multilingual cheap |
| Moderation | **OpenAI Moderation** (free!) | Yandex SpeechKit guards | Free + multimodal |
| Batch async | **OpenAI Batch API** (50% off) | — | Резюме отзывов, weekly digests |

### Voice
- **STT:** Whisper ($0.006/min) / Yandex SpeechKit (~₽0.06/min)
- **TTS:** ElevenLabs ($5-99/мес) / Yandex SpeechKit TTS
- **End-to-end agents:** **Retell** ($0.07/min, лучший value) / Vapi ($0.05 base но $0.15-0.50 итого)

### Image gen
- **Room redesign:** **Replicate flux-depth-pro** ($0.005-0.02/render) — сохраняет геометрию

### KYC
- **Sumsub** ($1.35/верификация, $149/мес min) — RU-friendly, кириллица, ID-карты KZ/AZ/UZ
- Face liveness: **Sumsub Face Authentication** ($1/check)

### Payments (future)
- **Т-Банк** (best DX) — СБП 0.4-0.7%, REST API, marketplace split-payment
- Альтернатива: ЮКасса (СберПей)

### Phone masking (РФ)
- **МТС Exolve** — единственная серьёзная RU-нативная (~₽150/мес/номер + ₽0.5-1/min)
- Используется Wildberries, СберМегаМаркет
- Кейс: «-55% жалоб и потерь, 100% звонков под контролем»

### Maps
- **Yandex MapKit SDK** через native modules
- 2GIS API — для Ингушетии более релевантен (бесплатно)

### Notifications
- Mobile push: Expo Notifications (built-in) / OneSignal free (10K MAU)
- Web Push: VAPID self-hosted (iOS 16.4+ работает через PWA)
- WhatsApp Business: с июля 2025 service messages **бесплатны**
- Telegram Bot API: free + 0% commission Bot Payments

## Топ-30 свежих фич для xtrud

| # | Название | Стек | Цена/мес | Слож | Прио |
|---|---|---|---|---|---|
| 1 | **AI-листинг заявки от фото** | Haiku vision via CF proxy | $5-15 | M | 🔴 |
| 2 | **AI auto-теги портфолио** | Haiku vision / GigaChat vision | $10-30 | M | 🔴 |
| 3 | **Telegram Mini App xtrud** | TON SDK + Vercel | $0 | M | 🔴 |
| 4 | **`@xtrudbot` AI-агент** | GigaChat Lite + Bot API | ₽300 | M | 🔴 |
| 5 | **Face Check / Liveness** | Sumsub Face Auth | $1/вериф | M | 🔴 |
| 6 | **AI suggested replies в чате** | Haiku via proxy | $15-40 | S | 🔴 |
| 7 | **OpenAI Moderation на UGC** | Free hate/violence/sexual filter | $0 | S | 🔴 |
| 8 | **Schema.org на `/m/{id}`** | Plain HTML SSR | $0 | S | 🔴 |
| 9 | **Embedding personalisation главной** | text-embedding-3-small + pgvector | $1-5 | M | 🔴 |
| 10 | **Vector-cluster spam-откликов** | embedding-3-small | $1-3 | S | 🔴 |
| 11 | **МТС Exolve phone masking** | Exolve API | ₽30/чат | M | 🔴 |
| 12 | **«Спроси xtrud» Q&A для мастеров** | Haiku + schema-aware prompt | $5-15 | M | 🟡 |
| 13 | iOS/Android Live Activities | expo-live-activity | $0 | L | 🟡 |
| 14 | **Mood board для ремонт-заявок** | Native UI + Storage | $0 | M | 🟡 |
| 15 | **AI-визуализация «как у меня»** | Replicate SDXL+ControlNet | $5-15 | M | 🟡 |
| 16 | **xtrud Wrapped (дек + июн)** | Native Skia + GIF export | $0 | M | 🟡 |
| 17 | **Slot-booking без чата** | Cal.com OSS | $0 self-host | M | 🟡 |
| 18 | Voice receptionist для мастеров | Retell / Yandex SpeechKit | $50-200 | L | 🟡 |
| 19 | Passkey login поверх phone | Supabase Auth + WebAuthn | $0 | M | 🟡 |
| 20 | **Яндекс.Карты Business + AI Mode** | Yandex Business API | $0 | M | 🟡 |
| 21 | AI-резюме отзывов мастера | Haiku weekly batch | $5 | S | 🟡 |
| 22 | Whisper voice→text в чате | Whisper или Yandex SpeechKit | $5-15 | S | 🟡 |
| 23 | PWA Web Push для iOS | VAPID + SW | $0 | S | 🟡 |
| 24 | AI-улучшенный профиль | GigaChat Pro | ₽50-100 | S | 🟡 |
| 25 | WhatsApp deep-link | wa.me | $0 | S | 🟡 |
| 26 | iOS 18 widget «xtrud мастер» | Expo + WidgetKit | $0 | L | 🟢 |
| 27 | AI-перевод ингушский↔русский | GigaChat few-shot | ₽20-50 | M | 🟢 |
| 28 | `Cmd+K` shortcuts (web) | kbar / cmdk lib | $0 | S | 🟢 |
| 29 | Sensitive content filter фото | OpenAI Moderation multimodal | $0 | S | 🟢 |
| 30 | Booking embed на сайт мастера | Cal.com-style embed JS | $0 | M | 🟢 |

**Итого:** 11 🔴 must Phase 1, 13 🟡 Phase 2 (6 мес), 6 🟢 longer.

## Чего НЕ делать (хайп без value)

| Хайп-фича | Почему НЕ |
|---|---|
| Full-AI customer support без human handoff | Klarna откат май 2025. Аудитория старше |
| TON / Web3 платежи в Telegram MA | Наши мастера crypto не their world. Делаем СБП |
| Видео-аватары AI для профилей | Выглядит как «фейк». Реальные фото + AI enhancement |
| AI Chat-assistant заменяющий весь UI | Старшие не любят говорить с роботом |
| Deepfake detection (Reality Defender) | На 1K-10K DAU экономически невыгодно атакующим |
| Full-stack KYB для юр-лиц | 0% юр-лиц у нас на 0080. Complexity |
| AI-генерация банеров | Vercel design минималистичный |
| Operator через ChatGPT из РФ | Telegram Bot + Алиса = аналог |
| Passkeys как ЕДИНСТВЕННЫЙ метод | 31% юзеров без passkey. Phone-OTP fallback нужен |
| Spotify-Wrapped с AI personality | Spotify сами признали flop. Делаем data-driven |
| E2E Signal Protocol для бизнес-чата | Не оправдано major work + key mgmt |

## Финансовый snapshot (DAU 1K-10K)

| Категория | $/мес |
|---|---|
| AI LLM (текст + vision) | $30-80 |
| Embeddings + Moderation | $5-10 |
| Image gen Replicate | $10-30 |
| KYC Sumsub | $50-200 |
| Phone masking Exolve | $30-100 |
| SMS Twilio/Exolve | $20-100 |
| Voice receptionist (если вкл) | $50-200 |
| Hosting (Supabase + Vercel) | $25-50 |
| Карты Yandex free tier | $0 |
| Telegram Bot | $0 |
| **ИТОГО полный стек активный** | **$200-800/мес** |
| **MVP Phase 1 must-do** | **$50-150/мес** |

Покрывается одним sponsored deal/мес (стройбаза, страховая, банк-партнёр).

## Ключевые источники

- Thumbtack × OpenAI: [BusinessWire oct 2025](https://www.businesswire.com/news/home/20251006760229/en/)
- Booksy × Google AI Mode: [biz.booksy.com](https://biz.booksy.com/en-us/blog/booksy-google-ai-mode-integration)
- Klarna AI backlash: [Pragmatic Engineer](https://blog.pragmaticengineer.com/klarnas-ai-chatbot/)
- Mercari AI Listing: [press release sep 2024](https://about.mercari.com/en/press/news/articles/20240910_aisupport/)
- Tinder Face Check: [press oct 2025](https://www.tinderpressroom.com/2025-10-22)
- Sumsub pricing: [sumsub.com/pricing](https://sumsub.com/pricing/)
- Replicate pricing: [replicate.com/pricing](https://replicate.com/pricing)
- МТС Exolve: [exolve.ru/solutions/number-protection](https://exolve.ru/solutions/number-protection/)
- Cal.com v5.5: [cal.com/blog/calcom-v5-5](https://cal.com/blog/calcom-v5-5)
- WhatsApp pricing July 2025: [developers.facebook.com](https://developers.facebook.com/docs/whatsapp/pricing/updates-to-pricing/)
- Claude Haiku 4.5: [anthropic.com/news](https://www.anthropic.com/news/claude-haiku-4-5)
- Retell pricing: [retellai.com](https://www.retellai.com/blog/ai-voice-agent-pricing-full-cost-breakdown-platform-comparison-roi-analysis)
