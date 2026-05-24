# Launch Checklist — App Store + Google Play

Готовые ответы для анкет, спецификации скриншотов, чек-лист submit. Скопировать в Console при первой подаче.

Связанные файлы:
- [`STORE_METADATA.md`](STORE_METADATA.md) — тексты (name / description / keywords).
- [`LAUNCH_READINESS_2026-05-18.md`](LAUNCH_READINESS_2026-05-18.md) — инфра-готовность (auth, push, EAS).
- [`AUDIT_LAUNCH_FUNCTIONAL_2026-05-19.md`](AUDIT_LAUNCH_FUNCTIONAL_2026-05-19.md) — функциональный аудит.

---

## 1. Apple Privacy Nutrition Labels (App Store Connect → App Privacy)

Apple группирует данные по категориям. Ответы для xtrud:

### Data Linked to User
| Type | Collected? | Used for | Linked to identity |
|---|---|---|---|
| **Phone Number** | Yes | App Functionality (auth, OTP) | Yes |
| **Name** | Yes (optional) | App Functionality (отображение в профиле, чатах) | Yes |
| **Photos** | Yes (optional) | App Functionality (аватар, портфолио мастера) | Yes |
| **Coarse Location** | Yes (optional) | App Functionality (предзаполнение города) | Yes |
| **User Content (text)** | Yes | App Functionality (заявки, чаты, отзывы) | Yes |
| **Other User Content (passport scan)** | Yes (мастера, optional) | App Functionality (верификация для trust-badge) | Yes |
| **Device ID** | Yes | App Functionality (push token FCM/APNs) | Yes |
| **Crash data** | No | n/a | n/a |
| **Diagnostic data** | No | n/a | n/a |

### Data NOT Collected
- Health & Fitness, Financial Info, Sensitive Info, Contacts, Browsing/Search History, Audio Data, Gameplay Content, Other Diagnostic Data.

### Tracking (App Tracking Transparency)
- **«Does your app use data for tracking?»** → **No**. У нас нет аналитики с user-tracking. Если добавится PostHog/Sentry с user-id — пересмотреть и добавить `NSUserTrackingUsageDescription` + ATT-prompt.

### Privacy Policy URL (обязателен)
- `https://xtrud.ru/privacy` (после deploy landing).

---

## 2. Google Play Data Safety (Play Console → App content → Data safety)

### Data Collection
| Category | Collected | Shared | Required for app | Why |
|---|---|---|---|---|
| **Personal info → Name** | Yes | No | No (optional) | App functionality |
| **Personal info → Phone number** | Yes | No | Yes | Account management + Auth |
| **Personal info → User IDs** | Yes | No | Yes | App functionality |
| **Photos and videos → Photos** | Yes | No | No (optional) | App functionality (аватар, портфолио, чат) |
| **Photos and videos → Videos** | No | — | — | — |
| **Location → Approximate** | Yes | No | No (optional) | App functionality (предзаполнение города) |
| **Location → Precise** | No | — | — | — |
| **Messages → Other in-app messages** | Yes | No | No (optional) | App functionality (чат) |
| **Files → Other files** | Yes (passport scan) | No | No (optional) | App functionality (верификация) |
| **Device or other IDs** | Yes | No | Yes | App functionality (push token) |

### Encryption in transit
- **Yes** — все запросы через HTTPS (Supabase REST + Storage + Realtime).

### Data deletion
- **Yes, users can request deletion in app** → ссылка на `/profile/settings` → «Удалить аккаунт».
- **URL для off-app deletion request:** `https://xtrud.ru/support` (после deploy).

---

## 3. IARC Age Rating Questionnaire

Обе платформы используют общую IARC-анкету. Ответы для xtrud:

| Категория | Ответ | Объяснение |
|---|---|---|
| Violence | None | Нет насилия в контенте. UGC проходит через ReportModal. |
| Sexuality / Nudity | None | Нет. |
| Profanity / Crude Humor | None | UGC — но модерируется. Если reviewer спросит — указать ReportModal. |
| Controlled Substance | None | Нет. |
| Gambling / Contests | None | Нет. |
| Horror / Fear | None | Нет. |
| Mature / Suggestive | None | Нет. |
| User Generated Content | **Yes — moderated** | Заявки, отзывы, чаты, портфолио. Модерация: `ReportModal` (8 типов жалоб), backend очередь `reports`, RLS на reviews. |
| User Interaction (chat) | **Yes** | Чат между клиентом и мастером. Передача фото и геолокации. |
| Personal Info Sharing | **Yes — optional** | Имя, фото, контакт WhatsApp (мастера-сторона opt-in). |
| Location Sharing | **Yes — optional** | Геолокация в чате (мастер шлёт «приеду сюда»). |
| Digital Purchases | None | На текущей редакции — нет встроенных платежей. |
| Mini-games / Mini-apps | None | Нет. |

**Ожидаемый рейтинг:**
- App Store: **17+** (User-generated content + Unrestricted Web Access если будет linking) или **12+** если no chat. Для xtrud → **17+** конформно.
- Google Play / IARC: **PEGI 12 / ESRB Teen** — присутствие чата и UGC.

Можно попробовать **13+ / Teen** при первом submit (мы умоляем content moderation). Если Apple возразит — перейдём на **17+**.

---

## 4. Screenshots — спецификация

### App Store (iOS)
**Обязательно:** 6.5" iPhone (1284 × 2778) ×3-10. **Желательно:** 5.5" iPhone (1242 × 2208), 12.9" iPad Pro (2048 × 2732).

**Какие экраны снимать (рекомендуется 6 штук):**
1. **Hero главной** (`/`) — «Найдутся мастера» + поиск + примеры категорий.
2. **Поиск по категории** (`/category/[id]`) — карточки мастеров с рейтингом и ценой.
3. **Профиль мастера** (`/master/[id]`) — hero-фото + услуги + портфолио + отзывы.
4. **Создание заявки** (`/orders/new`) — форма с категорией / городом / описанием.
5. **Чат с мастером** (`/chats/[id]`) — несколько сообщений + кнопка фото.
6. **Профиль клиента** (`/profile`) — карточка + «Избранное» row + статистика.

**Технические требования Apple:**
- Формат: PNG или JPG, RGB.
- Без прозрачности.
- Без device frames (Apple добавит их сам), либо использовать device-frame mockup-ы из Apple Design Resources.
- Текст-overlay (опц.) — короткие headlines (≤6 слов) поверх скриншота.

**Как сделать:**
1. `npm run web` с DevTools resize до 414 × 896 (iPhone 11/12 viewport). Screenshot → upsample до 1284 × 2778.
2. Либо запуск на iOS Simulator (iPhone 14 Pro Max), `Cmd+S` сохраняет в требуемом разрешении.
3. Дизайн-overlay (текст + рамка телефона) — в Figma, шаблон из Apple Design Resources.

### Google Play (Android)
**Обязательно:** Phone (1080 × 1920 минимум, до 4320 × 1920 max) ×2-8.
**Желательно:** 7" tablet (1080 × 1920), 10" tablet (1080 × 1920).

Тот же набор 6 экранов, что и для Apple.

### Feature Graphic (Play)
- **1024 × 500 px**, PNG/JPG, без прозрачности.
- Композиция: логотип xtrud + один tagline («Найдутся мастера») + лёгкий visual (например, абстрактный colorscape из дизайн-системы).
- Текст должен быть читаем при mini-version 96 × 47px (preview на телефоне).
- Делается в Figma. **TODO для дизайнера.**

### App Preview Video (опционально, Apple)
- 15-30 сек, .mov / .mp4, H.264.
- Демонстрация happy path: открыл → создал заявку → получил отклики → выбрал → чат → отзыв.
- **Не P0**, добавить позже.

---

## 5. Submit — финальный чек-лист

### Перед App Store submit
- [ ] Apple Developer account активирован (KYC прошёл).
- [ ] EAS `extra.eas.projectId` в `app.json` (`eas init`).
- [ ] App Store Connect → App создано (xtrud, com.xtrud.app).
- [ ] ASC API key создан, добавлен в `eas.json → submit.production.ios`.
- [ ] [`STORE_METADATA.md`](STORE_METADATA.md) → ввод name / subtitle / promo / keywords / description.
- [ ] Privacy Policy URL = `https://xtrud.ru/privacy` (после deploy landing).
- [ ] Support URL = `https://xtrud.ru/support`.
- [ ] Marketing URL = `https://xtrud.ru`.
- [ ] App Privacy Labels — заполнено по §1 этого файла.
- [ ] Age Rating — анкета по §3.
- [ ] Screenshots × ≥3 для 6.5" iPhone (§4).
- [ ] Test account (Demo Account): `+7 900 000-00-99` с инструкцией в Build Notes (для review team).
- [ ] Build Notes (что нужно сказать reviewer):
  ```
  Demo account: +7 900 000-00-99, any 6-digit OTP code.
  
  Key flows to test:
  1. Browse masters catalog (no login).
  2. Tap "Создать заявку", complete form, login via OTP (any 6 digits).
  3. As a master account: login with +7 900 000-00-21, see incoming order, send response.
  
  Notes: app is Russian-only at launch (target market: Republic of Ingushetia, Russia).
  Marketplace business model — no in-app purchases yet.
  ```
- [ ] `eas build --platform ios --profile production` → upload to ASC.

### Перед Google Play submit
- [ ] Google Play Developer account активирован.
- [ ] Play Console → App создано, package `com.xtrud.app`.
- [ ] Service account JSON для EAS submit (в `eas.json → submit.production.android`).
- [ ] Title / Short / Full description (§§ `STORE_METADATA.md`).
- [ ] Privacy Policy URL.
- [ ] Data Safety form — по §2 этого файла.
- [ ] Content Rating (IARC) — по §3.
- [ ] Phone screenshots × ≥2 (§4).
- [ ] Tablet screenshots × ≥1 (§4).
- [ ] Feature Graphic 1024 × 500 (§4).
- [ ] App icon 512 × 512 (PNG, без прозрачности) — из `assets/images/icon.png`.
- [ ] Target audience: 18+ (matches IARC).
- [ ] `eas build --platform android --profile production` → upload AAB.

### После submit
- [ ] Apple review: 1-3 дня обычно. Если reject — читать причину, фиксить в коде, re-submit.
- [ ] Google Play: 1-7 дней для первой submit, потом обычно <24ч.
- [ ] При published — обновить `landing/index.html` (заменить `href="#"` на реальные store-URL).

---

## 6. Что НЕ блокирует первый submit (можно делать после)

- **Russian-only локализация** — Apple/Google допускают.
- **Sign in with Apple** — нужен только если есть сторонний логин (Google / VK). У нас phone-only.
- **In-app purchases** — нет на текущей редакции, не нужны.
- **iPad-specific layout** — `supportsTablet: true` уже стоит, layout responsive.
- **English version** — отдельным релизом после первого review.
