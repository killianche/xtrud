# Функциональный аудит запуска xtrud — 2026-05-19

Продолжение инфра-аудита [`LAUNCH_READINESS_2026-05-18.md`](LAUNCH_READINESS_2026-05-18.md). Фокус: **что не доделано или забыли в функционале клиента и мастера** для запуска в App Store / Google Play. Инфра (auth, push, store-аккаунты) — упомянута одной строкой, детали в инфра-аудите.

**Метод:** 3 параллельных Explore-агента — клиент, мастер, App Store/Play guidelines.

---

## TL;DR

| Роль | Готовность функционала | Главный gap |
|---|---|---|
| **Клиент** | ~70% | Нет написания отзыва, нет жалобы на мастера, нет избранного, нет удаления аккаунта |
| **Мастер** | ~55–60% | Onboarding обрезан (нет зон + прайса), нет UI верификации, нет статистики, нет ответа на отзыв |
| **App Store ready** | 0% | Нет legal, нет account deletion, нет скриншотов/описания/keywords |

**Главный вывод:** код-база зрелая (happy path 90%), но **на финишной прямой 8+ функциональных дыр**, которые увидит первый реальный пользователь. App Store **гарантированно отклонит** на legal + account deletion.

---

## 👤 Клиент — что не доделано

### 🔴 Блокеры запуска (must fix)

1. **Нет формы написания отзыва после `completed`** — `ReviewsSection` показывает чужие отзывы, формы submit для клиента нет. RPC `submit_review` существует, hook есть, UI отсутствует. → социальные доказательства не накапливаются.
2. **Нет удаления аккаунта** — Apple/Google **гарантированно reject** (требование с 2022). [`app/(tabs)/profile/settings.tsx`](app/(tabs)/profile/settings.tsx) — только sign-out. RPC `delete_my_account()` не существует.
3. **Нет жалобы на мастера** (Report user) — таблица `reports` + `ReportModal` есть для **админа**, кнопки на [`app/(tabs)/master/[id].tsx`](app/(tabs)/master/[id].tsx) **нет**. UGC-policy violation для stores.
4. **Privacy Policy / Terms** — стабы `Alert.alert("Скоро")` в settings.

### 🟡 Первая неделя жалоб

5. **Нет избранного** (favorites/wishlist) — таблица `user_favorites` не создана, сердечка на карточке нет.
6. **`/orders` без разделения активные / завершённые / черновики** — PROJECT_MAP обещал 3 таба, в UI один длинный список.
7. **Спор / dispute UI** — `useOpenDispute` hook есть, статус `disputed` в БД lifecycle есть, кнопки в UI нет.
8. **Черновик заказа** — Zustand persist пишет, но «вернуться к черновику» из `/orders` нет, экрана списка черновиков нет, авто-expire нет.
9. **Native-геолокация no-op** — [`src/lib/use-user-city.ts:140`](src/lib/use-user-city.ts), permission запрашивается, заглушка.

### 🟢 Phase 2 (конкуренты делают)

10. История просмотренных мастеров; цена в каталоге без открытия карточки; «время первого ответа» бейдж; map view; share-button профиля мастера; offline-outbox для чатов.

---

## 🔧 Мастер — что не доделано

### 🔴 Блокеры запуска

1. **Зоны работы (`master_service_areas`) вне онбординга** — мастер регистрируется и **невидим** в location-фильтрах. Hook `useSetMasterServiceAreas` живёт только в `/profile/edit-master`. Нужен шаг `(onboarding)/master-areas.tsx`.
2. **Прайс-лист вне онбординга** — мастер выходит с **пустой карточкой**. [`app/(tabs)/profile/services-suggest.tsx`](app/(tabs)/profile/services-suggest.tsx) готов, не интегрирован в визард.
3. **UI верификации паспорта отсутствует** — backend готов полностью (миграция 0070, `master_verifications`, private bucket, RLS, trigger). Фронт: 0. Нет `/profile/verification` экрана, нет хука `useMyVerification`, нет badge. Для ингушского рынка `паспорт подтверждён` — критичный trust-фактор.
4. **Push при INSERT `orders`** — мастера не получают уведомление о новом заказе (P0-07 из инфра-аудита, **функциональный** блокер: success-экран клиента «придут отклики за 15-60 мин» — обман).
5. **Удаление аккаунта мастера** — то же что у клиента + cascade на reviews/services/portfolio.

### 🟡 Первая неделя

6. **Нет статистики мастера** — RPC `get_master_stats` в БД (но не в миграциях!), hook `useMyMasterStats` написан, компонент `MasterStatsBlock` удалён с главной 2026-05-15. Мастер не понимает работает ли его карточка.
7. **Нет ответа на отзыв** — UI и RPC отсутствуют. Влияет на trust в выдаче.
8. **Double-blind reviews не реализован** — `lifecycle.md` §6, `visible_to_other_side` фильтр в RLS отсутствует. Риск «ответок» на малом рынке.
9. **Окно отзыва 14d не enforced** — cron `nightly_close_review_windows` нет.
10. **Календарь работы / занятость** — поле `work_schedule` (JSON) есть, UI нет. Клиент не видит «доступен сегодня».
11. **Onboarding-прогресс не показывает service_areas/services/verification** — `OnboardingProgress` считает только 4 шага.

### 🟢 Phase 2

12. Бригады / `team_size`; видео-визитка; рейтинг по dimensions (качество / срок / цена); шаблоны быстрых ответов; бейдж «быстрый ответ <30 мин».

### 💰 Монетизация

| Что | Готово |
|---|---|
| Лимит 5 откликов/день | ✅ trigger + UI |
| Платная разблокировка лимита | ❌ |
| Платный буст / топ выдачи | ❌ |
| Комиссия с заказа | ❌ payment flow вне scope |
| Рефералы | ❌ |

**Важно:** если монетизация для мастера = подписка/буст → на iOS **обязан** через Apple IAP. Своя платёжка для digital goods отклонит review.

---

## 🍎 App Store / Google Play — забыли совсем

### 🔴 P0 — гарантированный reject

1. Privacy Policy URL + `/legal/privacy` + чекбокс на регистрации
2. Terms of Service URL + `/legal/terms`
3. Account deletion in-app (RPC + double-confirm)
4. Data Safety form (Google) + Privacy Nutrition Labels (Apple)
5. Age Rating IARC анкета
6. Screenshots: 6.5" iPhone ×3, 12.9" iPad ×1 — **не сделаны**
7. Screenshots Play: 1080×1920 phone ×5, tablet ×2 — **не сделаны**
8. Feature Graphic (Play) 1024×500 — **не сделан**
9. App description (≤4000 симв.) + Short (≤30 симв.) + Keywords (≤100 симв.) — **не написаны**
10. Support URL — Telegram не подходит, нужен landing на xtrud.ru или web-форма

### 🟡 P1 — придёт письмо

11. `NSLocationWhenInUseUsageDescription` в `infoPlist.ios`
12. `NSUserTrackingUsageDescription` (когда добавится Sentry/PostHog)
13. Target API 34+ Android — проверить в `eas.json`

### 🟢 P2 — желательно

App Preview video; In-app rating prompt; Privacy Nutrition Labels детально.

---

## 📋 Приоритезированный план

### Спринт 1 (4–5 дней) — функциональные блокеры запуска

| # | Задача | Роль | Effort |
|---|---|---|---|
| 1 | Форма написания отзыва после `completed` | Клиент | 1д |
| 2 | RPC `delete_my_account()` + UI на settings | Обе | 1д |
| 3 | Жалоба на мастера (Report) на `/master/[id]` | Клиент | 1д |
| 4 | Шаг `master-areas` в онбординге | Мастер | 1д |
| 5 | Шаг `master-services` в онбординге (или nudge с deep-link) | Мастер | 1д |

### Спринт 2 (4–5 дней) — функциональные блокеры trust/UX

| # | Задача | Роль | Effort |
|---|---|---|---|
| 6 | UI верификации паспорта (`/profile/verification`) | Мастер | 2д |
| 7 | Избранные мастера | Клиент | 1д |
| 8 | Dispute UI | Обе | 1д |
| 9 | Статистика мастера | Мастер | 1д |
| 10 | Ответ на отзыв | Мастер | 0.5д |
| 11 | Native-геолокация | Клиент | 0.5д |

### Спринт 3 (3–4 дня) — App Store обвязка

| # | Задача | Effort |
|---|---|---|
| 12 | `/legal/privacy` + `/legal/terms` + чекбокс на регистрации | 0.5д |
| 13 | Privacy Policy + ToS текст (юрист) | внешний |
| 14 | 6 скриншотов iPhone + 4 Android + Feature Graphic | 1.5д |
| 15 | App description ru/en + keywords + short | 0.5д |
| 16 | Data Safety / Privacy Labels анкеты | 0.5д |
| 17 | Age Rating IARC анкета | 0.5д |
| 18 | purpose-strings в app.json (Location/Tracking) | 0.1д |
| 19 | Support URL — landing на xtrud.ru | 0.5д |

### Phase 2 (после первой беты)

Double-blind reviews + cron 14d; календарь занятости; шаблоны быстрых ответов; история просмотренных; share API; видео-визитка; бригады; рейтинг по dimensions; платный буст через Apple IAP.

---

## Связанные документы

- [`LAUNCH_READINESS_2026-05-18.md`](LAUNCH_READINESS_2026-05-18.md) — инфра-аудит (auth, push, demo, store-аккаунты)
- [`STATUS.md`](STATUS.md) — текущее состояние + история
- [`docs/lifecycle.md`](docs/lifecycle.md) — state-machine, double-blind reviews spec
- [`docs/VERIFICATION.md`](docs/VERIFICATION.md) — backend верификации мастера (UI TBD)
- [`PROJECT_MAP.md`](PROJECT_MAP.md) — полная карта продукта

---

## Bottom line

**Если фокус — App Store через 3 недели:** Спринт 1 (5 функциональных блокеров) → Спринт 2 (6 trust-блокеров) → Спринт 3 (8 App Store обвязок) **параллельно** с инфра-задачами из LAUNCH_READINESS (real OTP, push trigger, FCM/APNs, Sentry, demo-isolation, eas init, developer accounts с KYC).

**Календарно:** 3 недели dev + 1 неделя внешних ожиданий = публичная beta ~2026-06-15.
