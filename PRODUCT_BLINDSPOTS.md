# PRODUCT_BLINDSPOTS.md — продуктовые, UX/UI и инженерные пробелы xtrud

> ⚠️ **Контекст устарел частично.** Документ написан под модель с чатом и
> lifecycle сделки. Сейчас продукт — упрощённая **classifieds-модель** (без чата,
> без выбора мастера/«в работе», без спора). Сценарии про чат/переписку/
> outbox-очередь сообщений — не актуальны (фича удалена). Актуальная модель —
> CLAUDE.md «🧭 Актуальная модель продукта» + `docs/SIMPLE_FLOW.md`. Остальные
> слепые зоны (empty-states, offline, edge-cases форм) по-прежнему полезны.

> **Жанр документа:** разбор слепых зон, которые не закрыты в `PROJECT_MAP.md`, `DESIGN_SYSTEM.md`, `CROSS_PLATFORM_RULES.md`, `CATEGORIES_AND_PROFILES.md`. Без дублирования `AUDIT.md` (риски/cold start) и `COMPETITOR_INSIGHTS.md` (бенчмарки). Только продукт + UX + код.
> **Аудитория:** владелец-соло + будущие AI-сессии.
> **Стек:** Expo SDK 52+, Expo Router v4, NativeWind 4, Zustand + TanStack Query v5, Supabase, Reanimated 3.

---

## Раздел 1. ПРОДУКТОВЫЕ flow которые мы упустили

В `PROJECT_MAP.md` есть карта экранов и набор фич, но почти нет описания **состояний между экранами** и **граничных пользовательских сценариев**. Ниже — 22 сценария, которые произойдут на первой сотне пользователей и которые нужно явно зафиксировать.

### 1.1. Смена телефона / восстановление доступа
Пользователь сменил SIM-карту, потерял доступ к старому номеру. В `PROJECT_MAP.md` есть «Авторизация — телефон + СМС», но нет flow `change_phone`. Нужен сценарий: подтверждение текущего номера (если есть доступ) + новый номер + ре-верификация. Если доступа к старому номеру нет — Telegram-бот поддержки + ручное восстановление модератором с проверкой по фото профиля. **Без этого мастер с 30 отзывами теряет всю репутацию при смене SIM-ки.**

### 1.2. Авторизация без СМС (fallback)
СМС-провайдер упал / у пользователя нет сети, но есть Wi-Fi. Нужен сценарий «Получить код в Telegram» как fallback и одна общая `auth_session` — не разводить отдельные user_id для Telegram и SMS-login. Это требует политики «один человек = одна запись пользователя» уже в схеме БД, а не «потом нормализуем».

### 1.3. Empty states для каждого экрана-списка
В карте экранов есть «Мои заказы», «Мои отклики», «Чаты», «Избранные» — но не указано, что показывать в первый день, когда ничего нет. Нужно для каждого:
- Иллюстрация / иконка (Lucide line-icon в muted-цвете, 64dp)
- Заголовок: «Пока пусто»
- Подсказка: «Так выглядит этот раздел, когда…» — 1 предложение
- Primary CTA: например, «Создать первый заказ» / «Найти мастера»
- Secondary link: «Как это работает?» → FAQ

Минимум 8 empty states: orders-active, orders-completed, orders-drafts, responses, chats, favorites, portfolio-empty (мастер), reviews-empty.

### 1.4. Empty states «отрицательного» вида
Не «у вас ничего нет», а **«мы ничего не нашли»**:
- Каталог мастеров с фильтрами → 0 результатов («В вашей категории и районе пока нет мастеров. Расширьте радиус или попробуйте другую подкатегорию.»)
- Поиск по имени → 0 результатов
- Заказ без откликов через 24 часа («Откликов пока нет. Это бывает в редкой категории — попробуйте уточнить описание или добавить фото»)

Каждый — отдельный компонент `<EmptyResult variant="filter|search|stale-order" />`.

### 1.5. «Заказ без откликов за 24/48/72 часа»
Активный сценарий: клиент опубликовал заявку, прошло сутки, никто не откликнулся. Push клиенту: «Мастеров пока не нашлось — посмотрите подсказки» + экран с подсказками («Добавьте фото», «Расширьте бюджет», «Поделитесь заказом по ссылке»). Через 72 часа — заказ помечается «остыл», предлагается перепостить.

### 1.6. Мастер начал отклик, но не закончил (черновик отклика)
Мастер открыл форму отклика, написал текст, выбрал фото из портфолио — отвлёкся, закрыл приложение. Сейчас в `PROJECT_MAP.md` нет логики черновиков. Нужно:
- Автосейв формы каждые 3 секунды в Zustand persisted storage (`AsyncStorage`)
- При повторном открытии заявки — баннер «У вас есть незавершённый отклик. Продолжить?»
- Сбрасывать черновик после отправки или явного «Отменить»

### 1.7. Клиент начал создание заказа, но не закончил
Та же логика для wizard создания заказа (5.4 в `PROJECT_MAP.md`):
- Шаги визарда хранятся в локальном Zustand store, persist
- В «Мои заказы» есть таб «Черновики» (упомянут в 4.2.6, но не детализирован)
- При возврате — точка возврата на нужный шаг, не с нуля
- Auto-expire черновика через 14 дней

### 1.8. State persistence при крэше / kill приложения
Если процесс убит OS (особенно типично для Android при экономии памяти):
- При повторном открытии — Restoration State: если был открыт чат, заказ или wizard — возврат туда
- `Expo Router` поддерживает state restoration через `initialRouteName` + сохранение последнего пути в `SecureStore`
- Глобальный store клавиш `ui.lastRoute`, `ui.lastChatId`, `ui.wizardProgress`

### 1.9. Дабл-публикация заказа
Клиент нажал «Опубликовать», получил спиннер, нажал ещё раз. Сейчас в концепции нет защиты — будет 2 одинаковых заказа. Нужно:
- Idempotency key на мутации: UUID v4 генерируется клиентом перед запросом, сервер хранит в `mutation_keys` 24 часа
- Блокировка кнопки на UI до получения ответа
- В Supabase RPC `create_order(p_idempotency_key uuid, ...)` — если ключ уже существует, возвращаем существующий `order_id`

### 1.10. Offline-сценарии (типично для региональных сетей)
В Ингушетии в горных районах и в дороге между сёлами интернет отваливается на 30-300 секунд. Что должно происходить:
- В чате: outbox-очередь сообщений (статус «отправляется», «не доставлено», «доставлено»). Хранится в SQLite через `expo-sqlite` или TanStack `MutationCache` с persist.
- Просмотр своих заказов и чатов — offline-first из кэша TanStack Query (`persistQueryClient`).
- Каталог категорий — preload в SecureStore на установке, обновление в фоне.
- Глобальный баннер «Нет сети» сверху с retry-индикатором.
- Push при возврате связи: «3 сообщения отправлены, 1 не доставлено».

### 1.11. Auto-close зависших заказов
Мастер взял заказ → выполнил → не закрыл сделку. Клиент тоже не закрыл. Сейчас в концепции нет процедуры. Нужно:
- Через 14 дней после последней активности в чате — система спрашивает обе стороны «Работа завершена?»
- Через 30 дней — auto-close с уведомлением
- Через 45 дней — заказ архивируется, отзыв всё ещё можно оставить в течение 90 дней

### 1.12. Push-уведомления — категории, группировка, deeplinks
В `PROJECT_MAP.md` push есть как пункт списка, но не описаны:
- **Категории нотификаций** (для iOS Notification Categories и Android Notification Channels): `new_order` (для мастеров), `new_response` (для клиента), `chat_message`, `system`, `reminder`, `verification_update`. Каждая — со своим звуком, важностью, возможностью отключения по отдельности.
- **Группировка**: 5 сообщений от одного мастера в чате → одно уведомление «Магомед: 5 новых сообщений», а не 5 push. Реализуется через `thread-id` (iOS) и `setGroup` (Android).
- **Deeplinks**: каждое уведомление имеет `data.deeplink` поле вида `xtrud://orders/123/chat`. Обработка в `expo-notifications` listener'е + `Linking.openURL`.
- **Rich notifications**: фото первой плитки в push (мастер прикрепил фото портфолио) — Notification Service Extension для iOS.
- **Snooze**: «напомнить через час» для пуша «у вас новые отклики».

### 1.13. In-app inbox для системных сообщений
Push можно пропустить. В приложении должен быть отдельный экран «Уведомления» (упомянут в 4.1.8) с историей всех системных сообщений:
- «Ваш паспорт верифицирован»
- «Новый отзыв от клиента»
- «Заказ #123 архивирован»
- «Поддержка ответила на ваш запрос»

С пагинацией, mark-as-read, swipe-to-delete. Без этого пожилой мастер пропускает «вас верифицировали» и не понимает почему получил новый бейдж.

### 1.14. Reaction мастера на отзыв
В `PROJECT_MAP.md` есть «ответ мастера на отзыв» (5.7), но не описано как мастер узнаёт о новом отзыве и какой flow:
- Push «У вас новый отзыв 5★» / «У вас новый отзыв 2★» — разные звуки/важность
- Bottom sheet «Ответить публично» с лимитом 500 символов
- Опция «Пожаловаться на отзыв» с выбором причины + текстом — отдельная очередь модерации
- Видимость: ответ виден всем сразу, без модерации; жалоба — только модератору

### 1.15. Шеринг профиля мастера и шеринг заказа
В концепции упомянут «мини-сайт» `xtrud.ru/m/имя`, но не описан UX внутри приложения:
- Кнопка «Поделиться профилем» → `Share API` (Expo `Sharing`) → форматированный текст для WhatsApp/Telegram: `«Магомед — плиточник в Магасе. ⭐ 4.8 (35 отзывов). Посмотрите портфолио: https://xtrud.ru/m/magomed-akhmadov»`
- Кнопка «Поделиться заказом» (для клиента): `«Ищу плиточника на 25 м² в Магасе. Откликнитесь в xtrud: https://xtrud.ru/o/abc123»` — на случай если клиент хочет добавить заявку в свою WhatsApp-группу
- В Open Graph для web версии: og:image — фото первой плитки портфолио + лого xtrud

### 1.16. Preview-режим «как меня видит клиент»
Мастер заполняет профиль и не понимает, как он выглядит снаружи. Нужен переключатель «Предпросмотр» в /профиль/редактор — открывает копию своего профиля в режиме клиента (no edit-кнопок). В `PROJECT_MAP.md` 4.3.5 это указано как «Мой профиль (просмотр глазами клиента + редактор)», но не описан переход — должна быть видимая кнопка-toggle сверху профиля и подсветка «Вы в режиме предпросмотра» баннером.

### 1.17. Deeplinks из внешних источников
Сценарии:
- Друг прислал в WhatsApp `https://xtrud.ru/m/akhmed`. У пользователя iOS, нет приложения → fallback на web-версию профиля, кнопка «Открыть в приложении» с App Store badge.
- Есть приложение → Universal Links (`apple-app-site-association` + `assetlinks.json`) автоматически открывают приложение на нужном экране.
- На Android: App Links + intent-filter в `app.json`.
- Тестовая ссылка `xtrud://` для dev.
- Если пользователь не залогинен → запоминаем пункт назначения, после login — редирект.

### 1.18. Сценарий «забыл сделать селфи на верификацию»
Мастер начал верификацию ⭐⭐, выбрал «Сделать селфи», в браузере камеры передумал, закрыл. При следующем входе — баннер «Незавершённая верификация» + кнопка «Продолжить». Хранить флаг `verification_attempts[].status = 'started'` с timestamp.

### 1.19. Дубль-аккаунт мастера и слияние
Пользователь забыл, что зарегистрировался полгода назад, регистрируется заново с тем же номером (или другим). Сейчас в концепции unique constraint по телефону, но что делать когда тот же человек прошёл с другим номером? Нужно:
- При паспортной верификации — детект пересечения ФИО + ДР → ручная очередь «возможный дубль»
- UI «Это вы? У нас уже есть аккаунт с таким именем» с опцией «Это я, объедините» — отправляет запрос модератору
- Без этого репутация мастера разорвана между двумя профилями

### 1.20. История логинов и активные сессии
Экран «Настройки → Безопасность → Где я залогинен» — список устройств с датой/городом/моделью. Кнопки «Выйти из этой сессии» и «Выйти из всех других». В `AUDIT.md` упомянуто как 🔴 missing, но не детализировано — это связка таблицы `auth_sessions` в Supabase (расширение `auth.users` + триггер на login).

### 1.21. Multi-role flow (клиент + мастер одновременно)
В `AUDIT.md` упомянуто. Конкретный UX:
- В профиле — переключатель «Я как клиент / Я как мастер» (как Cian)
- Один `user_id` → N `profiles` с разными `role`
- Главный экран меняется в зависимости от активной роли
- Уведомления приходят только для активной роли по умолчанию (опционально — для всех)
- При первом входе в режим мастера — короткий onboarding «Стать мастером»

### 1.22. Sharing / save заказа клиентом
Клиент опубликовал заказ, потом захотел его временно скрыть (нашёл мастера офлайн): кнопка «Снять с публикации» / «Опубликовать снова». Сейчас в `PROJECT_MAP.md` есть только «удалить» — это слишком грубо. Нужны статусы: `draft | published | paused | closed | archived | cancelled`.

---

## Раздел 2. UI/UX паттерны которых не хватает

В `DESIGN_SYSTEM.md` описана палитра, типографика, базовые компоненты, но почти не описаны **состояния** компонентов и **универсальные паттерны взаимодействия**.

### 2.1. Skeleton screens, не spinners
Для всех списков (мастера, заказы, отклики, чаты, отзывы, портфолио) — skeleton screens, а не центральный спиннер. Skeleton воспринимается как «приложение работает», спиннер — как «приложение завис». Конкретно:
- Использовать `react-native-skeleton-placeholder` или собственную обёртку через Reanimated + `LinearGradient`.
- Каждому списку — свой skeleton-компонент: `<MasterCardSkeleton />`, `<OrderRowSkeleton />`.
- Не показывать skeleton, если `staleTime` TanStack Query — данные есть в кэше, показываем их сразу.

### 2.2. Spinner — только для blocking actions
Spinner допустим только когда:
- Кнопка нажата и идёт мутация (внутри кнопки, не центром экрана)
- Pull-to-refresh
- Full-screen загрузка при первом cold start (с лого)

Никогда: при навигации между экранами, при reload списка, при возврате с другого экрана.

### 2.3. Error states (детальная классификация)
Сейчас в концепции «Ошибка» — общая. Нужно различать:
- **No network** (`fetch failed` / `NetworkError`): иконка `WifiOff`, заголовок «Нет интернета», кнопка «Повторить». Внизу — последнее обновление: «Показаны данные на 15:30».
- **Server 5xx**: «Что-то пошло не так. Мы уже знаем.» (Sentry автоматически отправляется). Кнопка «Повторить» с экспоненциальной задержкой.
- **Auth 401** (session expired): silent refresh попытка → если не получается → отправить на /login, при этом сохранить `redirect_to` в SecureStore.
- **Forbidden 403** (нет прав): «Доступ закрыт» + кнопка «Назад».
- **Not found 404**: «Этот мастер/заказ больше не доступен» + варианты «Поиск по похожим».
- **Validation 422**: inline-ошибки в форме под полями, верхний баннер «Проверьте поля».
- **Rate limit 429**: «Слишком много запросов. Попробуйте через минуту.» + countdown.

Реализовать через `<ErrorView variant={...} onRetry={...} />`.

### 2.4. Optimistic UI — конкретные места
Где применять optimistic update через TanStack Query (`onMutate` + rollback в `onError`):
- **Добавить в избранное / убрать** — мгновенно меняем иконку сердца, отправляем мутацию в фон
- **Лайк отзыва / реакция** — то же
- **Отклик на заявку** — кнопка «Откликнуться» сразу становится «Отправлено», но в карточке отклика статус «отправляется» (серый), пока не подтвердится сервером
- **Прочитано в чате** — клиент видит «прочитано» сразу при открытии чата
- **Удаление черновика** — карточка исчезает из списка с возможностью «Отменить» в snackbar 5 сек

НЕ делать optimistic на: создание заказа, верификация, отправка отзыва — там нужен явный ответ сервера.

### 2.5. Pull-to-refresh
Обязательно на: главная клиента, главная мастера, мои заказы, мои отклики, чаты, профиль (для обновления статуса верификации). Реализация через `RefreshControl` в `FlashList`. Для пожилых пользователей — visual hint: первая загрузка показывает легкое смещение списка с подсказкой «Потяните для обновления».

### 2.6. Infinite scroll vs пагинация
- **Каталог мастеров, лента заказов мастеров, чаты, отзывы** — infinite scroll (`useInfiniteQuery` от TanStack). Page size 20.
- **Поиск с фильтрами** — infinite scroll + sticky-кнопка «Сбросить фильтры» внизу.
- **История заказов / откликов** — пагинация в виде «Загрузить ещё» (большая кнопка), не infinite — пожилые путаются в скролле истории.
- **Admin lists (модерация)** — настоящая пагинация со страницами, для модератора важно «вернись к странице 5».

### 2.7. Tab restoration
Когда пользователь возвращается в приложение через час:
- Если был на главной — обновляем данные
- Если был в конкретном чате — открываем тот же чат, scroll-position восстановлен
- Если приложение было закрыто >24 ч — перезагружаем стек на главную
- Реализация: `Expo Router` + сохранение route + scroll position в `AsyncStorage` через `useScrollToTop` hook.

### 2.8. Haptic feedback (mobile only)
Где уместно (через `expo-haptics`):
- `ImpactFeedbackStyle.Light` на нажатие primary-кнопки
- `NotificationFeedbackType.Success` на успешное создание заказа, отправку отклика, верификацию пройдена
- `NotificationFeedbackType.Error` на валидационные ошибки в форме
- `SelectionAsync` на тогглах, переключателях, чекбоксах

Никогда: на скролле, на ввод текста, на каждое движение — будет раздражать.

### 2.9. Sound feedback
Только для:
- Входящее сообщение в чате при открытом приложении (короткий «pop» 200ms)
- Push при выключенном приложении — стандартный sound из NotificationCategory
Не делать звуков на действия (нажатие кнопок), это раздражает русскоязычную аудиторию 30+.

### 2.10. Onboarding tooltips для первых пользователей
После первого входа — coachmarks (полупрозрачные overlays с подсветкой) для трёх главных действий:
- Главный экран клиента: подсветка «Создать заказ»
- Главный экран мастера: подсветка «Заявки», «Прокачать профиль»
- Чат: подсветка кнопок «Открыть номер», «Закрыть сделку»

Хранить флаг `coachmarks_completed_v1` в SecureStore. Реализация — `react-native-copilot` или собственная через Modal + Reanimated.

### 2.11. Bottom sheets vs full-screen modals
**Bottom sheet (`@gorhom/bottom-sheet`)** для:
- Выбор категории (один уровень)
- Фильтры в каталоге
- Действия с заказом / откликом (контекстное меню)
- Подтверждения мелких действий
- Делитель «Поделиться»

**Full-screen modal** для:
- Создание заказа (визард)
- Регистрация мастера (визард)
- Просмотр фото / видео в полноэкранном режиме
- Редактор профиля
- Камера / выбор фото

**Inline screen** (push новый экран в стек) для:
- Чат с конкретным мастером (НЕ модал — должен быть отдельный screen с back-button)
- Карточка мастера
- Карточка заказа
- Список откликов

### 2.12. Confirmation dialogs
Только для разрушительных действий с реальными последствиями:
- Удалить заказ (если есть отклики)
- Удалить аккаунт
- Выйти из аккаунта (если есть несохранённые черновики)
- Отказаться от заказа после принятия
- Отменить верификацию

Реализация — собственный `<ConfirmDialog />` поверх `Modal`, с двумя кнопками: secondary («Отменить») слева, destructive («Удалить») справа. Никогда — `Alert.alert`, он выглядит по-разному на iOS/Android и не поддерживает custom styling.

### 2.13. Toast / Snackbar
Использовать `react-native-toast-message` или `sonner-native`.
- **Позиция:** на mobile сверху (top, под notch), на web — bottom-right.
- **Длительность:** 3 сек для info/success, 5 сек для warning, 6 сек для error.
- **С действием:** «Отменить» (для удаления), «Повторить» (для упавшего fetch).
- **Стек:** максимум 1 toast одновременно. Новый — заменяет старый.

### 2.14. Keyboard handling
В `CROSS_PLATFORM_RULES.md` есть `KeyboardAvoidingView`, но недостаточно:
- Использовать `react-native-keyboard-controller` глобально (он лучше)
- В формах с множеством полей — `KeyboardToolbar` с кнопками «← →» и «Готово»
- При закрытии клавиатуры — не сбрасывать scroll-позицию
- На кнопке «Опубликовать» — `keyboardShouldPersistTaps="handled"` чтобы не было двойного нажатия

### 2.15. Pull-to-dismiss модалок
На iOS — нативное поведение `presentationStyle="pageSheet"` (bottom sheet с возможностью свайпа вниз). На Android — `BackHandler` для аппаратной кнопки «назад» закрывает модал. На web — клавиша `Escape` и клик по backdrop.

### 2.16. Safe area и Home Indicator
В `CROSS_PLATFORM_RULES.md` правило 9 описано, но не сказано про fixed bottom bars:
- Bottom Tab Bar — `paddingBottom: insets.bottom` (НЕ `insets.bottom + 20` — выйдет высокий бар)
- Fixed CTA внизу формы — обязательно `paddingBottom: insets.bottom`
- В iOS с Home Indicator есть фоновое "затенение" жестом — учитывать в overlay-карточках

### 2.17. Landscape / rotation policy
Решение нужно зафиксировать **до кодинга**:
- **Mobile (iOS/Android):** lock в portrait для всего приложения, кроме просмотра фото/видео (там allow landscape + autorotate).
- **Tablet:** разрешить landscape и portrait, адаптировать сетку (1 → 2 → 3 колонки).
- **Web:** responsive через брейкпойнты `sm/md/lg/xl` из `DESIGN_SYSTEM.md`.

В `app.json` → `expo.orientation: "portrait"` для приложения целиком + локальный override через `react-native-orientation-locker` на фото-экране.

### 2.18. Dark mode переключение без перезагрузки
В `DESIGN_SYSTEM.md` сказано «переключается». Не описано, что ломается:
- Status bar — нужно `StatusBar.setBarStyle('light-content' | 'dark-content')` синхронно с темой
- Splash screen — не меняется (статичный), решение: иметь две splash и подменять через `expo-splash-screen` config
- Карты — провайдер (Yandex/MapLibre) тоже должен переключать стиль карты
- WebView (если будут — для статичных страниц) — `<meta name="color-scheme" content="dark light">` в HTML

### 2.19. RTL (right-to-left) — на будущее
В концепции упоминается английский и ингушский. Арабский (для Корана-репетиторов и арабоязычной диаспоры) — потенциально. Закладывать сейчас:
- Не использовать `marginLeft/marginRight` — только `marginStart/marginEnd`
- Не использовать абсолютный `left`/`right` — `start`/`end`
- Иконки направления (стрелки) — должны mirror'иться. `lucide-react-native` поддерживает через `style={{ transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }}`

Это занимает 5% времени сейчас и блокирует 100% позже.

### 2.20. iOS Lock Screen Live Activities — не сейчас
Live Activities (отслеживание заказа в реальном времени на Dynamic Island) — мощно, но требует Swift, отдельный target, провижининг профили. Соло-разработчику — нет. Зафиксировать как «не делаем в первый год». Notification Service Extension (для rich push с фото) — тоже на потом, обычных push достаточно.

### 2.21. Глобальный Network Indicator
Узкая полоса (3dp) сверху экрана при отсутствии сети: «Нет интернета — данные могут быть устаревшими». Реализация через `@react-native-community/netinfo` + Zustand store `network.isOnline`. Возможность скрыть на 5 минут (пользователь раздражён).

### 2.22. Контентные state'ы списков
Каждый список должен поддерживать минимум 4 состояния, реализованных через discriminated union:
```ts
type ListState<T> =
  | { status: 'loading' }       // skeleton
  | { status: 'error'; error: Error; retry: () => void }
  | { status: 'empty'; cta: () => void }
  | { status: 'data'; items: T[]; isRefreshing: boolean }
```
Обёртка `<ListContainer state={...} render={...} />` — DRY на 8+ экранов.

---

## Раздел 3. ИНЖЕНЕРНЫЕ грабли Expo + Supabase

### 3.1. Supabase RLS — конкретные политики для нашего случая

RLS обязательно с первого дня. Иначе любой клиент с `anon key` может прочитать всю базу.

**Базовые политики (псевдо-SQL):**
```sql
-- profiles: каждый видит свой профиль полностью, чужой — публичные поля
create policy "profiles_self_full" on profiles
  for all using (auth.uid() = user_id);
create policy "profiles_public_read" on profiles
  for select using (true);  -- но в SELECT только публичные колонки через view

-- orders: клиент видит свои, мастер видит публичные опубликованные
create policy "orders_owner" on orders
  for all using (auth.uid() = client_id);
create policy "orders_public_read" on orders
  for select using (status = 'published' and not is_hidden);

-- responses: мастер видит свои + клиент видит отклики на свои заказы
create policy "responses_master_own" on responses
  for all using (auth.uid() = master_id);
create policy "responses_client_visible" on responses
  for select using (
    auth.uid() in (select client_id from orders where id = order_id)
  );

-- messages: только участники чата
create policy "messages_participants" on messages
  for all using (
    auth.uid() in (select user_id from chat_participants where chat_id = messages.chat_id)
  );
```

**Грабли:**
- RLS работает только если запрос через `anon` или `authenticated` role. Если случайно использовали `service_role` ключ на клиенте — RLS обходится. **Никогда** не класть `service_role` в клиентский код, только в Edge Functions.
- При создании политики `for all` Supabase создаёт 4 политики (`select/insert/update/delete`) — проверять явно.
- RLS дёргается на каждой строке — `with check` отличается от `using`, легко забыть → пользователь может insert'ить чужой `client_id`.

### 3.2. Realtime для чата — вердикт
Supabase Realtime через `postgres_changes`:
- **Подходит** для нашего масштаба до 5-10k MAU. Один long-lived WebSocket, минимальная latency.
- **Грабли:** Realtime тоже подчиняется RLS, но фильтрация выполняется на клиенте (broadcast all → filter by RLS). На больших таблицах — нагрузка.
- **Альтернатива** для масштаба — Broadcast/Presence (Supabase), не `postgres_changes`. Сообщения отправляются через Edge Function → broadcast в канал чата → клиенты слушают канал.
- **Push polling fallback**: если WebSocket не подключился через 5 сек — переключаемся на polling раз в 10 сек. Реализация через TanStack Query `refetchInterval`.
- **Не выбирать XMPP / Matrix** — over-engineering для соло.

### 3.3. Optimistic updates + cache invalidation
Паттерн для TanStack v5:
```ts
const { mutate } = useMutation({
  mutationFn: toggleFavorite,
  onMutate: async (masterId) => {
    await queryClient.cancelQueries({ queryKey: ['favorites'] });
    const previous = queryClient.getQueryData(['favorites']);
    queryClient.setQueryData(['favorites'], old => /* mutated */);
    return { previous };
  },
  onError: (err, vars, ctx) => {
    queryClient.setQueryData(['favorites'], ctx.previous);
    toast.error('Не получилось. Попробуйте ещё раз.');
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['favorites'] });
  },
});
```

**Где инвалидировать после создания отклика:**
- `responses` (текущего мастера)
- `orders/[id]/responses` (текущей заявки)
- `orders/feed/master` (лента — отклик-флаг)

Хук-обёртка `useInvalidateRelated(entity, id)` сокращает повторение.

### 3.4. Авторизация в Expo Router — protected routes
Expo Router v4 не имеет встроенного guard. Паттерн через `Stack.Protected` (новинка SDK 52) или ручной:
```tsx
// app/_layout.tsx
export default function RootLayout() {
  const { session, isLoading } = useAuth();
  if (isLoading) return <SplashScreen />;
  return (
    <Stack>
      <Stack.Screen name="(auth)" redirect={!!session} />
      <Stack.Screen name="(tabs)" redirect={!session} />
    </Stack>
  );
}
```
Группировка маршрутов: `app/(auth)/*` — login/onboarding, `app/(tabs)/*` — основное приложение, `app/(public)/m/[slug].tsx` — публичный профиль мастера (без auth).

**redirect после login**: сохранять `redirect_to` в SecureStore при попадании на `(auth)`, после успешного login — `router.replace(savedRedirect ?? '/')`.

### 3.5. State persistence — Zustand + AsyncStorage
Что хранить локально:
- **Persist в AsyncStorage**: ui-настройки (тема, активная роль, последний таб), черновики (orders, responses), фильтры каталога, прочитанные системные уведомления, флаги онбординга.
- **SecureStore** (через `expo-secure-store`): JWT refresh token (Supabase кладёт сам), `device_id` (uuid v4 generated once), биометрические настройки.
- **Никогда не persist'ить**: сам JWT access token (Supabase управляет), server-state TanStack Query (только через `persistQueryClient`, и только для offline-критичных запросов вроде «мои заказы»).

Конфиг:
```ts
const useStore = create(persist((set) => ({ ... }), {
  name: 'xtrud-ui',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({ theme: state.theme, draftOrder: state.draftOrder }),  // выбрать что persist
}));
```

### 3.6. Token refresh без ломки UX
Supabase JS клиент сам рефрешит access token, но:
- При возвращении из background после >1 ч — токен мог протухнуть
- `supabase.auth.onAuthStateChange(...)` → `'TOKEN_REFRESHED'` event — инвалидируем TanStack queries для security
- Если refresh упал (`'SIGNED_OUT'`) → редирект на login + сохранение текущего экрана в `redirect_to`
- В Expo: `expo-secure-store` для хранения refresh token (Supabase позволяет custom storage adapter)

### 3.7. Загрузка фото в Storage
Не загружать через JSON / base64 — память сожрёт. Паттерн:
1. Клиент сжимает: `expo-image-manipulator` → JPEG 1280px, quality 0.8 (~150KB на фото)
2. Запрос Edge Function `get_upload_url(path)` → возвращает signed upload URL Supabase Storage
3. Клиент шлёт PUT прямо в Storage с `FormData`
4. Параллельно: progress bar через `XMLHttpRequest.upload.onprogress` (fetch API не поддерживает progress)
5. После загрузки — Edge Function `confirm_upload(path)` → создаёт запись в `photos` таблице
6. Несколько фото — Promise.all с лимитом 3 одновременно (через `p-limit`)

Если используем R2/Backblaze вместо Supabase Storage (см. `AUDIT.md` рекомендацию) — паттерн тот же, но pre-signed URL генерируется в Edge Function.

### 3.8. Видео — отдельный путь
Не пытаться загружать видео через тот же flow:
- Запись через `expo-camera` максимум 30 сек, 720p
- Загрузка через `tus-js-client` (chunked, resumable) на Cloudflare Stream или Mux
- Транскодинг — на стороне провайдера (Cloudflare Stream возвращает HLS automatic)
- В UI плеер `expo-av` `<Video />`

Не хранить видео в Supabase Storage никогда.

### 3.9. Push end-to-end — конкретный pipeline
- **Старт**: Expo Push Service. Бесплатно, минимальная конфигурация. `expo-notifications` SDK.
- **APNs/FCM credentials** загружаются в EAS, Expo шлёт через свой relay.
- **Сервер**: Edge Function `send_push(user_id, payload)` → fetch на `exp.host/--/api/v2/push/send`
- **Triggers** в Postgres: `after insert on responses` → `select net.http_post(...)` через `pg_net` extension → Edge Function → Expo Push.
- **Receipts**: Expo возвращает `ticket_id`. Через 24 ч надо запросить `getPushNotificationReceiptsAsync` чтобы понять доставлено ли. Реализовать cron-job (Edge Function на расписании Supabase).
- **Миграция на прямой FCM** — когда упрёмся в rate limit Expo (~600/5s). Это много, на старте не упрёмся.

**iOS detail**: Notification Categories регистрируются в `expo-notifications` через `Notifications.setNotificationCategoryAsync`. Это позволяет actions «Ответить» / «Принять» прямо из push без открытия приложения.

### 3.10. Аналитика
- **PostHog Cloud free tier** — рекомендация на старте: 1M events/mo бесплатно, web + mobile SDK, есть session replay.
- **Альтернатива:** Mixpanel free tier 100k events/mo, или Amplitude free tier 10M.
- **Yandex Metrica для web** — бесплатна, есть RN SDK Yandex Mobile Metrica.
- **Что трекать на старте**: app_open, sign_up, role_selected, order_created, order_published, response_sent, chat_opened, profile_viewed. Не более 10 событий — больше не успеваешь анализировать.

### 3.11. Sentry / error reporting
- **Sentry React Native** — есть бесплатный план (5k errors/mo). Достаточно на старте.
- В production режиме `sourcemaps` загружаются через EAS hooks.
- Глобальный `ErrorBoundary` в `app/_layout.tsx` + `Sentry.captureException` в catch'ах мутаций TanStack Query.
- **Альтернатива**: Bugsnag (платный), self-host GlitchTip (бесплатно, open-source Sentry-compatible).

### 3.12. Feature flags
- **На старте**: НЕ нужны. Используем `Constants.expoConfig.extra.featureFlags` через `app.config.ts` + OTA-обновление флагов через EAS Update.
- **Когда DAU > 1000**: PostHog feature flags (бесплатно, есть SDK для RN), либо `growthbook` self-hosted.
- **A/B тесты с дня 1** — нет. Соло не успеваешь анализировать. С DAU 5000+ — да.

### 3.13. Кэширование изображений
`expo-image` имеет встроенный disk cache на нативе. Параметры:
- `cachePolicy="memory-disk"` (дефолт)
- `recyclingKey` — для FlashList с переиспользованием
- `placeholder={blurhash}` — генерируется при upload: `expo-image-blurhash` или server-side `blurhash` npm

На web `expo-image` использует браузерный кэш + `<picture>` тег. Дополнительная либа не нужна.

### 3.14. WhatsApp / Telegram deeplinks
Универсальные ссылки:
- **WhatsApp**: `https://wa.me/79280000000?text=...` — открывает приложение, работает везде. Web fallback на `web.whatsapp.com`.
- **Telegram**: `https://t.me/username` или `tg://resolve?domain=username`. У бота — `https://t.me/share/url?url=...&text=...`.
- **SMS**: `sms:+79280000000?body=...` — на iOS работает, на Android — частично.

В Expo делается через `Linking.openURL(url)`. Перед открытием — `Linking.canOpenURL` чтобы понять есть ли приложение. Если нет — fallback на web-ссылку.

### 3.15. Маскированные звонки — решение
Хотя `AUDIT.md` советует отложить, если решим делать:
- **Voximplant / Exolve / Zadarma** — все через SIP-trunk или REST API
- В мобильном приложении звонок инициируется через `Linking.openURL('tel:+78001234567')` — где 8001234567 — виртуальный номер сервиса
- Сервер маршрутизирует звонок на реальный номер мастера по сессии
- **Грабли**: PSTN звонки на iOS требуют `tel:` schemes, никакие WebRTC в фоне.
- На старте — НЕ делаем. См. `AUDIT.md` §6.3.

### 3.16. SMS-провайдер
- Telegram Login Widget — primary. См. `AUDIT.md`.
- SMS как fallback: SMS.ru (1.8 ₽), SMSAero, MTT, Beeline Business. Все через REST.
- Supabase Auth → SMS OTP: вшит, но провайдеры заточены под Twilio/MessageBird (зарубежные). Для РФ — кастомный provider через Edge Function `auth/v1/otp`.

### 3.17. Карта мастеров
- **iOS/Android**: `react-native-maps` с provider `google` или `default` (Apple Maps на iOS). Яндекс — нет официального SDK для RN, есть community-обёртки сомнительного качества.
- **Web**: MapLibre GL или Leaflet (бесплатно), не Google Maps (платно). Если нужны Яндекс.Карты на web — Yandex Maps JS API v3 (бесплатно для < 25k запросов/день).
- **Кросс-платформенный примитив**: создать `<MapView />` через `.native.tsx` + `.web.tsx` (Правило 16 из `CROSS_PLATFORM_RULES.md`).
- Маркеры кластеризовать через `supercluster` (npm) — иначе на 500 мастерах карта тормозит.

### 3.18. Геокодирование
- **Free**: Nominatim (OpenStreetMap) — лимит 1 req/sec на бесплатном API, можно self-host. Качество в Ингушетии — посредственное.
- **Платное в РФ**: Yandex Geocoder API (бесплатно до 25k запросов/день для зарегистрированных). Качество лучшее в регионе.
- **Решение**: Yandex Geocoder для адресов, OpenStreetMap для карты-тайлов (бесплатно).

### 3.19. Локализация — стек
- **`expo-localization`** (для определения локали устройства)
- **`i18next` + `react-i18next`** — самый зрелый. Плюрализация русского из коробки (4 формы: 1, 2-4, 5+, дробные).
- Не использовать `lingui` (сложнее настройка) или ручные switch — плюрализация русского сложная.
- Хранить переводы в `locales/ru.json` (на старте). Когда добавим ингушский — `locales/inh.json`.
- Не использовать AI-перевод на лету — переводы только статика.

### 3.20. Кастомные шрифты
Inter через `@expo-google-fonts/inter`:
```tsx
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
const [loaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
if (!loaded) return null;  // или splash screen
```
**Грабли:**
- Splash screen — оставить активным до загрузки шрифтов через `expo-splash-screen`. Иначе будет «прыжок шрифта».
- На web — fonts грузятся через `<link>` в `app/+html.tsx`. Иначе FOUT (flash of unstyled text).
- Лучше зафиксировать `font-display: swap` для CSS на web (есть в Inter).

### 3.21. App icon и splash
- **iOS adaptive icon** не нужен (iOS использует один PNG 1024×1024 sRGB без альфа-канала).
- **Android adaptive icon** — foreground PNG 432×432 + monochrome для Android 13+. Бэкграунд цвет HEX через `app.json`.
- **Splash**: один PNG 1284×2778 (iPhone 14 Pro Max), `resizeMode: "contain"`, фон тот же что и app icon background. Через `expo-splash-screen` API можно показать дольше пока грузятся данные.
- **Dark mode splash**: через `app.json` `expo.splash.dark` (другая картинка для dark scheme).

### 3.22. Attribution / install tracking
- **Бесплатно — Branch.io free tier** (10k events/mo), но настройка сложная и не оптимально работает в РФ.
- **AppMetrica от Яндекса** — бесплатно, есть SDK для RN, поддерживает install attribution + deep links + Yandex.Direct attribution.
- **Рекомендация для xtrud**: AppMetrica для install attribution + наш PostHog для in-app events.

### 3.23. Линтинг / форматирование
- **Biome** — рекомендую вместо ESLint + Prettier. Один бинарник, скорость 10-30× быстрее, zero-config. Поддерживает TypeScript, JSX, JSON. Не хватает только TS-specific rules — но для соло хватает.
- **Альтернатива**: ESLint (typescript-eslint plugin) + Prettier. Зрелее, больше плагинов, но медленнее.
- В `pre-commit` через `husky` + `lint-staged` (или `simple-git-hooks`).

### 3.24. Тесты — реалистичная стратегия для соло
- **Юнит-тесты**: `vitest` (быстрее чем Jest). Покрывать только `lib/`, `utils/`, business logic (формулы цен, валидация). НЕ покрывать UI-компоненты юнит-тестами.
- **Smoke E2E**: `maestro` (YAML-based, проще Detox). 5-10 happy path flows: регистрация мастера, создание заказа, отклик, чат. Запускаются на каждый PR.
- **Не делать**: Detox (сложная настройка), Playwright для mobile (нет), полное покрытие компонент-тестами (RN Testing Library — для критичных компонентов).
- На старте: 0 тестов до первого workflow в production, потом — 1 maestro flow в неделю.

### 3.25. CI/CD pipeline
- **GitHub Actions** + **EAS** (Expo Application Services).
- **Workflow на main push**: lint (Biome) → typecheck (`tsc --noEmit`) → unit tests (Vitest) → EAS build (preview channel).
- **Workflow на tag (v1.0.0)**: EAS submit (production) → store submission iOS/Android.
- **OTA через EAS Update** на каждый merge в `main` — production update моментально.
- Secrets: Supabase URL/anon-key в `EXPO_PUBLIC_SUPABASE_*`, service-role-key только в EAS Build secrets.

### 3.26. OTA-обновления — что можно и нельзя
EAS Update обновляет JS-bundle и assets, но НЕ:
- Нативный код (если меняли config plugin)
- Permissions в Info.plist / AndroidManifest.xml
- App icon
- Splash screen (на native side)
- SDK Expo (мажорное обновление)

Эти изменения требуют пересборки и submission в стор.

**Правило**: после каждого `expo install` зависимости с native кодом — full rebuild. Иначе runtime ошибки или crash.

### 3.27. Версионирование
- **JS bundle version**: semver (`1.2.3`).
- **iOS `buildNumber`**: monotonic integer, EAS инкрементирует автоматически с `cli.appVersionSource: 'remote'`.
- **Android `versionCode`**: то же.
- **Runtime Version** (для OTA): `appVersion` — обновления приходят только тем, у кого та же major+minor. Менять при breaking changes.

### 3.28. Beta-testing
- **iOS**: TestFlight — до 10k тестировщиков бесплатно. Сабмиты через EAS Submit, ревью внутреннего теста проходит за ~1 час.
- **Android**: Google Play Internal Testing — до 100 тестировщиков, обновление за минуты. Closed/Open testing для большего числа.
- **RuStore**: есть beta-канал. Канал для РФ.

---

## Раздел 4. КАЧЕСТВО (что отделяет «работает» от «приятно»)

### 4.1. Performance budget
- **Cold start** на mid-tier Android (Xiaomi Redmi 9): ≤ 2.5 сек до интерактивной главной.
- **FPS на скролле**: 58+ FPS (FlashList — обязательно).
- **Bundle size mobile** (после Metro tree-shaking): < 6 MB JS bundle (контролировать через `npx expo export --analyze`).
- **Image budget**: каждое фото в каталоге ≤ 80KB после сжатия.
- **Memory**: < 250 MB peak (FlashList помогает).

Мониторинг через Sentry Performance + own metric `time_to_interactive` (от splash до первого render главной).

### 4.2. Микро-анимации (Reanimated 3)
Конкретные места и длительность:
- **Бейдж нового сообщения** в чате: scale 1.0 → 1.15 → 1.0, 400 ms, `withSequence`
- **Появление числа на счётчике** заявок: `withSpring` с damping 12
- **Slide-in toast/snackbar**: `translateY: 80 → 0`, 220 ms, `withTiming` easing `Easing.bezier(0.16, 1, 0.3, 1)`
- **Pressed state кнопки**: `scale: 1 → 0.97`, 100 ms (`withTiming`)
- **Pull-to-refresh**: spinner ротация, спин 800ms loop
- **Skeleton screens**: gradient shimmer 1200 ms loop
- **Раскрытие фильтра** (chevron rotate): 200 ms

Все длительности — из tokens.animation (`fast 150, normal 220, slow 320`).

### 4.3. Progressive loading
- **Карточка мастера**: сначала имя + аватар (текст и blurhash), потом фото портфолио, потом отзывы (lazy).
- **Список чатов**: метаданные чата (имя, превью) — сразу, аватары — отдельным запросом.
- **Профиль мастера**: hero-блок (имя, фото, рейтинг) → услуги → портфолио → отзывы. Каждая секция — отдельный TanStack query, рендер по мере готовности.

### 4.4. Skeleton screens — почему лучше spinner
Spinner = «приложение думает». Skeleton = «приложение готово, контент сейчас будет». Психологически воспринимается на ~20% быстрее (Nielsen Norman Group). На пожилой аудитории — критично: spinner вызывает «у меня сломалось».

### 4.5. First Contentful Paint на web
Expo Router static rendering генерирует HTML на build. Для SEO-страниц мастеров (`/m/[slug]`):
- Включить `output: 'static'` в `app.json` web config
- Server-side fetch профиля через `generateStaticParams` (если SDK 52+)
- Для динамических — fallback на client render с loading state
- FCP цель: < 1.5 сек на 4G

### 4.6. Image lazy loading
`expo-image` поддерживает `priority="low" | "normal" | "high"`. На главной с bento-сеткой — первые 4 плитки priority high, остальные low. Не загружать ниже viewport до скролла.

### 4.7. Network monitoring
Кроме Sentry — внутренняя метрика «время отклика API» по эндпоинтам. Хук-обёртка `useTimedQuery` логирует в PostHog `query_duration_ms`. На еженедельной основе — топ-5 самых медленных запросов → оптимизация (индексы, RLS, batching).

### 4.8. Crash-free sessions
Цель: >99.5% crash-free sessions (Sentry метрика). Если падает ниже — приоритет 0 в спринте.

### 4.9. App size on disk
После установки приложение на Android Xiaomi занимает ~120 MB? Это слишком много. Цель — ≤ 60 MB. Контроль:
- Не включать неиспользуемые шрифты (грузить только regular/medium/semibold/bold для Inter — 4 файла вместо 18)
- Lottie-анимации заменять на Reanimated там, где возможно
- Векторные иконки lucide (SVG) vs шрифтовые — SVG легче

### 4.10. Time-to-interactive в чате
Открыл чат с 200 сообщениями — он должен быть кликабельным за 500ms. FlashList с `estimatedItemSize` + `initialScrollIndex` к последнему сообщению. Не рендерить аватары сразу для всех — только в viewport.

### 4.11. Тёплый restart (warm start)
Когда пользователь свернул приложение и вернулся через минуту:
- Не показывать splash
- Если был активный таб — обновить только видимый список
- Background fetch на новые сообщения через `expo-background-fetch` (раз в 15+ мин, минимум разрешённый iOS)

### 4.12. Перетекание тем
При смене темы через настройки — не перезагружать стек. NativeWind поддерживает динамическое переключение через `useColorScheme()`. Анимировать `backgroundColor` через `withTiming` — выглядит мягко.

### 4.13. Graceful degradation web на старых браузерах
Поддерживать последние 2 версии Chrome, Safari, Firefox + Yandex Browser (важно для РФ). Старее — баннер «Обновите браузер» + базовая статичная версия профиля мастера. Не использовать bleeding-edge CSS (container queries сейчас ОК).

### 4.14. RAM-aware рендеринг на Android
На Xiaomi Redmi 9 (4GB RAM) — приложение может быть убито OS, если жрёт > 300MB. Контроль:
- Не держать FlashList с 1000+ элементов без виртуализации
- Не загружать оригиналы фото (только thumbnails в feed)
- `expo-image` `cachePolicy="disk"` (не memory) на больших списках

### 4.15. Touch responsiveness
Цель: tap → visual feedback ≤ 50ms. Это `active:opacity-80` + Reanimated tap response. Никогда не делать `setState` в обработчике press, который вызовет ре-рендер всего экрана — это лагает на mid-tier Android.

---

## Раздел 5. ACCESSIBILITY (a11y)

### 5.1. VoiceOver / TalkBack — атрибуты
Каждый Pressable должен иметь:
```tsx
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Откликнуться на заказ"
  accessibilityHint="Открывает форму отклика мастера"
>
```
- Иконки-кнопки без видимого текста — обязательно `accessibilityLabel`.
- Декоративные иконки — `accessibilityElementsHidden`.

### 5.2. Dynamic Type специфика для xtrud
- Карточка мастера: при 1.3x font scale — переходить с горизонтального layout (аватар + текст) на вертикальный (аватар сверху).
- Категория-плитки: текст белым на тёмном фоне — при scale 1.3x не вылазит за края, бордер `radius-xl` обрезает.
- Бейджи (рейтинг ★4.8) — не масштабировать font (только число), иначе ломается padding pill.

### 5.3. Контраст WCAG AA — проверка наших токенов
По `DESIGN_SYSTEM.md`:
- `ink #0a0a0a` на `canvas #ffffff` — 20.4:1 ✅ (AA минимум 4.5:1)
- `body #374151` на `canvas` — 9.2:1 ✅
- `muted #6b7280` на `canvas` — 4.7:1 ✅ (на границе)
- `muted-soft #9ca3af` на `canvas` — 2.7:1 ❌ ниже AA для body, OK только для крупного текста (18+px)
- `accent #3b82f6` на `canvas` — 4.0:1 ❌ ниже AA, только декорация / large text
- `accent #3b82f6` text на `accent-soft #dbeafe` фон — 3.1:1 ❌ — селектед-чипы не пройдут

**Решение**: для selected-state — использовать `#1d4ed8` вместо `#3b82f6` (контраст 6.4:1). Или фон `#bfdbfe` вместо `#dbeafe`.

### 5.4. Reduced motion
`AccessibilityInfo.isReduceMotionEnabled()` → отключать декоративные Reanimated анимации (skeleton shimmer, pulse). Оставлять функциональные (fade при переходах). На web — `@media (prefers-reduced-motion: reduce)`.

### 5.5. Touch target ≥ 48dp — где нарушено в текущем дизайне
В `DESIGN_SYSTEM.md` 9.4 `button-ghost` — не указана высота. Иконные кнопки навигации — могут быть 32dp. Проверить:
- Иконки в карточке мастера (рейтинг, сердце) — нужен `hitSlop` 12dp вокруг
- Чипы фильтров высотой 24dp (`badge-pill`) — превратить в кнопки → высота 36dp + 8dp tap padding или hitSlop
- Закрыть-кнопка модалки — 44×44dp минимум

### 5.6. Подписи к иконкам везде
Иконка «огонь» рядом с заказом «срочно» — `accessibilityLabel="Срочный заказ"`. Иконка верификации — `accessibilityLabel="Верифицирован паспортом"`. Без этого VoiceOver читает «изображение» и слепой пользователь не понимает что это.

### 5.7. Focus management
Особенно на web:
- При открытии модалки — focus на первое поле / закрыть-кнопку
- При закрытии модалки — focus возвращается на триггерный элемент
- Trap focus внутри модалки (Tab не уходит на backdrop)
- Использовать `focusable` атрибут на нативных view

Реализация — `react-native-focus-trap` или собственная через `findNodeHandle` + `AccessibilityInfo.setAccessibilityFocus`.

### 5.8. Subtitle для видео
Если будут видео-визитки мастеров — captions / subtitles. Это специфика приёмки в App Store для accessibility audit. WebVTT файлы рядом с .mp4.

### 5.9. Screen orientation a11y
Для пользователей с моторными ограничениями — landscape не должен ломать UX. Минимум — landscape allowed на чтении (карточка мастера, отзывы), но не обязателен.

### 5.10. Тестирование a11y
- **iOS Simulator**: Accessibility Inspector (built-in)
- **Android Emulator**: Accessibility Scanner (бесплатно от Google)
- **Web**: axe DevTools или Lighthouse a11y audit
- Тестируем минимум раз в спринт.

---

## Раздел 6. ОНБОРДИНГ

### 6.1. Первые 30 секунд
Пользователь скачал приложение из RuStore. Цикл:
0-3s: Splash screen с лого (грузим шрифты)
3-8s: 3 свайп-слайда: «Найдите мастера в Ингушетии», «Бесплатно, без скрытых платежей», «Ваш номер скрыт». Каждый слайд — фоновое атмосферное фото (sigil тёмные фотографии из `DESIGN_SYSTEM.md` category-tile стиль) + один заголовок.
8-15s: Выбор роли «Я ищу мастера» / «Я мастер» — две большие кнопки.
15-30s: Первая ценность — клиент видит ленту мастеров (без логина!), мастер видит ленту заявок (без логина, но мутно с CTA «Зарегистрируйтесь чтобы откликнуться»).

### 6.2. Эмпатический онбординг — где роль выбирать
Спорный вопрос: ставим выбор роли до auth или после?
- **Перед auth**: проще UX, лента видна сразу. Минус — пользователь логинится и аккаунт привязан к роли, ломается смена.
- **После auth**: универсальный аккаунт, роль выбирается потом. Минус — лишний шаг.

**Решение**: роль до auth (быстрая ценность), но в БД один `user_id` поддерживает обе роли через `profiles` таблицу. Выбор «Я хочу быть и тем и тем» в настройках после первого захода.

### 6.3. Прогресс-бар в визарде регистрации мастера
9 шагов в `PROJECT_MAP.md` 5.1 — это много. Нужен прогресс-бар сверху (заполненные сегменты). По дизайну — простая линия `hairline-soft` с накатывающимся `accent`. Текст «Шаг 3 из 9».

### 6.4. Сохранение прогресса визарда
Реализовано на уровне Раздела 1.7 (черновики). Дополнительно — exit-intent dialog «Сохранить и выйти?» с тремя кнопками: «Сохранить», «Не сохранять», «Отмена».

### 6.5. Дефолтные значения из геолокации
При выборе города — спрашиваем разрешение на геолокацию (но не блокируем — есть «Пропустить»). Если согласие → автозаполнение «Магас», иначе → пользователь сам выбирает из списка с поиском.

### 6.6. Пропускаемые шаги
В `PROJECT_MAP.md` 5.1 жёсткая последовательность. Реальность: мастер на ходу не загрузит 10 фото. Решение:
- Обязательные шаги: 1-7 (телефон, имя, фото, город, категории, цены, радиус)
- Опциональные: 8-16 — кнопка «Заполнить позже» на каждом
- После публикации профиля — на главной мастера баннер «Прокачайте профиль на N% → получайте больше заявок»

### 6.7. «Расскажи о себе» — текст или голос
Поле «о себе» 100-500 символов — для аудитории 30-60 лет сложно. Альтернативы:
- Чек-бокс «Я закончил курсы по сварке» / «Работаю с 2010 года» — структурированные tags
- Опционально — голосовая запись 30 сек (через `expo-av`), сохраняется как mp3 и проигрывается в карточке мастера

Не делать «обязательное эссе».

### 6.8. Permission prompts — late, не на старте
Не запрашивать геолокацию / push / камеру / контакты при первом запуске. Запрос ровно в момент когда юзер пытается использовать фичу:
- Push: запрос ПОСЛЕ публикации первой заявки клиентом или ПОСЛЕ первого отклика мастером
- Камера / галерея: при нажатии «Добавить фото портфолио»
- Геолокация: при нажатии «Найти мастеров рядом» или при выборе адреса
- Контакты: НЕ запрашивать — App Store смотрит косо, лучше «пригласить друга по реферал-ссылке»

Перед нативным prompt — собственный modal с объяснением «Зачем нам это?» и кнопкой «Разрешить» (она и триггерит нативный prompt). После одного отказа — больше не спрашивать в этой сессии.

### 6.9. First success moment
Цель — первый «эффект» в течение 60 секунд после регистрации:
- Клиент: после регистрации сразу — фид «Топ-мастера в вашем городе» (5-10 карточек, заполнены админом руками для cold start)
- Мастер: после регистрации сразу — фид «Свежие заявки в вашей категории» (даже если их 3 — это уже ценность)

### 6.10. Pulled-down dropdown city
Город пользователь выбирает много раз (профиль, заказ, фильтры). Один компонент `<CityPicker />` с поиском, sorted by популярность, recent cities. Не bottom-sheet каждый раз — слишком тяжело.

---

## Раздел 7. ЧТО ДЛЯ КОДА ВАЖНО ПРОДУМАТЬ ДО ПЕРВОЙ СТРОЧКИ

### 7.1. Структура папок
```
app/                          # Expo Router (только route-файлы)
  _layout.tsx
  index.tsx                   # роутинг в зависимости от auth
  (auth)/
    login.tsx
    onboarding.tsx
  (tabs)/
    _layout.tsx
    index.tsx                 # главная (по роли)
    orders/
    chats/
    profile/
  (public)/
    m/[slug].tsx              # публичный профиль мастера
  +html.tsx                   # web-only
  +not-found.tsx

src/
  components/                 # переиспользуемые компоненты
    ui/                       # primitives (Button, Input, ...)
    common/                   # общие (EmptyState, ErrorView, ...)
    domain/                   # бизнес-компоненты (MasterCard, OrderRow, ...)
  features/                   # feature-folders
    auth/
      hooks/
      api/
      components/
    orders/
    responses/
    chat/
  lib/
    supabase.ts
    tokens.ts
    i18n.ts
    queryClient.ts
  hooks/                      # universal hooks
  stores/                     # Zustand stores
  types/                      # generated types + custom
  utils/

assets/
  fonts/
  images/
  lottie/
```

**Принцип**: `app/` тонкий — только роутинг и `screen` обёртки, бизнес-логика в `src/features/`.

### 7.2. Naming conventions
- **Файлы**: kebab-case (`master-card.tsx`, `use-auth.ts`)
- **Компоненты экспортируются PascalCase** (`export function MasterCard()`)
- **Хуки**: `use-` prefix kebab-case в файле, camelCase в коде (`useAuth`, `useOrderById`)
- **Утилиты**: kebab-case (`format-price.ts` → `export function formatPrice()`)
- **Типы**: PascalCase + `Type`-суффикс для объединений (`OrderStatusType`)
- **Zustand stores**: `useXStore` (`useAuthStore`, `useFilterStore`)
- **Tailwind classes**: только из `DESIGN_SYSTEM.md` шкалы. Запрещены произвольные `bg-[#abc]`, только `bg-canvas`, `bg-surface-2` и т.д.

### 7.3. TypeScript strict patterns
- `tsconfig.json` strict: `true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`
- Запретить `any` через ESLint/Biome
- Использовать `Result<T, E>` или `neverthrow` для разных типов ошибок
- Discriminated unions для состояний (см. Раздел 2.22)
- `as const` для литералов

### 7.4. Server-only vs client-only код
- `lib/supabase-server.ts` — для Edge Functions, использует `service_role_key`
- `lib/supabase.ts` — для клиента, использует `anon_key`
- Никаких `service_role_key` в `app/*` или `components/*` — ESLint правило-блокер (`no-restricted-imports`)
- Edge Functions в отдельной папке `supabase/functions/`

### 7.5. Env конфиг
- `app.config.ts` (НЕ `app.json` — нужны runtime значения через `Constants.expoConfig.extra`)
- Public env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` — попадают в bundle
- Secret env (только в EAS): `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_AUTH_TOKEN`
- `.env.local` для dev, `.env` НЕ коммитим
- `expo-constants` — на runtime
- `expo-secure-store` для user-secrets (refresh token, biometric prefs)

### 7.6. Архитектура запросов

> ⚠️ Устарело с 2026-09-08: клиента `@supabase/supabase-js` в проекте нет.
> Запросы идут через свой клиент `src/lib/xtrud-client` (модуль
> `@/lib/supabase` сохранил имя). Правило «запрос живёт в хуке фичи, а не в
> компоненте» остаётся в силе: см. `src/features/<фича>/use-*.ts`.

- **Не плодить `supabase.from('table').select()` в компонентах**. Все запросы — в хуках фичи.
- **Паттерн**: `getOrderById(id)` → `useOrderById(id)` (TanStack hook) → компонент.
- **Сложная логика**: Supabase RPC функции (`create rpc public.create_order(...)`) → один атомарный запрос вместо нескольких select-update.
- **Real-time** — отдельный модуль `src/features/chat/realtime.ts` с подпиской на канал.

### 7.7. Service layer vs прямые вызовы
- **Service layer** (`src/features/<feature>/api/`) обязателен — даже если внутри тонкая обёртка.
- **Зачем**: можно мокать в тестах, можно поменять Supabase на REST API без переписывания.
- **Шаблон файла**:
```ts
// src/features/orders/api/orders.api.ts
export async function getOrderById(id: string): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, responses(*)')
    .eq('id', id)
    .single();
  if (error) throw new ApiError(error);
  return OrderSchema.parse(data);  // zod validation
}
```

### 7.8. Контракты типов: Supabase → zod → TS
1. `supabase gen types typescript --project-id ...` → `src/types/database.types.ts` (auto-generated, не править)
2. zod схемы в `src/features/<feature>/schemas.ts` — для парсинга API responses (защита от runtime поломок при изменении БД)
3. Domain types в `src/types/domain.ts` — это `z.infer<typeof OrderSchema>` + бизнес-обогащения
4. UI props — отдельные интерфейсы в компонентах (`OrderCardProps`), maps от domain в props

### 7.9. Error boundaries
- Глобальный `<ErrorBoundary />` в `app/_layout.tsx` — ловит crash, отправляет в Sentry, показывает экран «Что-то пошло не так» + кнопку «Перезапустить».
- Feature-level `<ErrorBoundary />` на критичных экранах (чат, заказ) — изолируют падение от всего приложения.
- В Mutation `onError` — лог в Sentry + toast пользователю.

### 7.10. Logging
- На клиенте: `console.log` в dev, отключён в prod через babel-plugin-transform-remove-console
- В Edge Functions: `console.log` → Supabase Function Logs (есть в Studio)
- Sentry для errors + важных events (purchase, registration completed)
- Никогда не логировать PII (телефон, паспорт, точный адрес) — Sentry beforeSend hook чистит

### 7.11. Feature folder vs layer folder
**Feature folder** (выбрано выше) — лучше для соло-проекта:
- Открыл `src/features/orders/` → видишь всё что связано с заказами
- Меньше cognitive load
- Проще удалить целиком если фича не зашла
**Anti-pattern**: layer folder (`/components/`, `/hooks/`, `/api/` на верхнем уровне с тысячами файлов) — растягивает navigation, путает связи.

### 7.12. Code-gen и шаблоны (бонус)
- Plop / Hygen — генератор feature-папок (`hygen feature new orders` → создаёт api/, hooks/, components/, schemas.ts).
- Экономит 30 сек на каждом новом feature.
- Не критично, но полезно соло.

---

## Раздел 8. ТОП-15 ВЫВОДОВ (что добавить в PROJECT_MAP.md прямо сейчас)

🔴 **Критично — без этого нельзя начинать кодить:**

1. 🔴 **Idempotency keys + state persistence для всех мутаций** — заказы, отклики, регистрация. Дабл-публикация и потерянные черновики — на первой неделе пользователей.

2. 🔴 **Empty / Error / Loading states для каждого экрана-списка** — фиксировать как обязательный пункт DoD (definition of done) перед мерджем. Минимум 8 empty states + 7 error variants.

3. 🔴 **Deeplinks + redirect-after-login + Universal Links** — без этого приложение не находится извне, шеринг профиля мастера не работает.

4. 🔴 **Auto-close зависших заказов + статусы лайфцикла заказа** (draft/published/paused/closed/archived/cancelled) — без этого «Мои заказы» через 3 месяца — мусорка из 50 заказов.

5. 🔴 **Push категории + группировка + deeplink в payload** — пожилые мастера получают 30 нотификаций в день, путаются, отключают. Группировка + категории — это решение.

6. 🔴 **Supabase RLS политики прописаны до первой таблицы** — иначе утечка, переписывание всей схемы.

7. 🔴 **Структура папок и naming conventions зафиксированы** — соло-разработчик через 3 месяца не помнит, где что лежит. AI-сессии путаются.

8. 🔴 **Permission prompts late** — не запрашивать push/гео/камеру на старте. Перед каждым нативным prompt — собственный объясняющий modal.

🟡 **Важно — закрывает критичные UX-пробелы:**

9. 🟡 **Multi-role flow (клиент + мастер на одном user_id)** — нужно зафиксировать в схеме БД сейчас, иначе миграция.

10. 🟡 **In-app inbox для системных сообщений** — отдельный экран, не путать с чатами.

11. 🟡 **Offline-first для чата + outbox** — критично в горных районах Ингушетии.

12. 🟡 **Preview-режим «как меня видит клиент»** для мастера — повышает completeness профиля на 30-50%.

13. 🟡 **Skeleton screens вместо spinner'ов** — снижает воспринимаемое время загрузки на 20%.

🟢 **Опционально, но дёшево заложить сейчас:**

14. 🟢 **RTL-готовность (marginStart/marginEnd, не Left/Right)** — 5% времени сейчас, разблокирует арабский/ингушский в будущем.

15. 🟢 **a11y-аудит палитры + accessibility-labels на иконках** — `muted-soft` и `accent` не проходят WCAG AA, поправить токены сейчас (см. Раздел 5.3) дешевле чем потом.

---

## Связанные документы

- [PROJECT_MAP.md](PROJECT_MAP.md) — функциональная карта
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) — токены и компоненты
- [CROSS_PLATFORM_RULES.md](CROSS_PLATFORM_RULES.md) — Expo iOS/Android/web
- [AUDIT.md](AUDIT.md) — стратегические риски (cold start, монетизация, scope)
- [COMPETITOR_INSIGHTS.md](COMPETITOR_INSIGHTS.md) — паттерны конкурентов
- [CATEGORIES_AND_PROFILES.md](CATEGORIES_AND_PROFILES.md) — дерево категорий

---

*Документ написан как дополнение, не дублирующее AUDIT/COMPETITOR. Фокус — на конкретных flow, паттернах и инженерных решениях для Expo + Supabase стека.*
