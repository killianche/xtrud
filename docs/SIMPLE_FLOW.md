# Переход на «классифайд» модель — 2026-05-20

## Что изменилось

xtrud перестал быть «маркетплейс с in-app чатом и lifecycle сделки», стал **доской объявлений**:

- Клиент создаёт заказ → получает отклики мастеров (одно сообщение + цена) → **звонит** или пишет в **WhatsApp** напрямую.
- **Внутри приложения** клиент с мастером **не переписываются**, клиент **не выбирает** мастера, заказ **не переходит** в «в работе».

## Зачем

User-решение (2026-05-20): упростить продукт для теста и публичной демонстрации. С чатом и lifecycle вернёмся когда будет понимание реального запроса от рынка.

## БАЗА ДАННЫХ — НЕ ТРОГАЛИ

Все таблицы и RPC остались как были:

- `chats`, `messages`, `notifications` — таблицы на месте, демо-данные (12 чатов, 56 сообщений) не потеряны.
- `accept_response`, `mark_order_complete`, `terminate_cooperation`, `reopen_order` — RPC живы.
- Enum `order_status` с 8 значениями — нетронут.
- Триггеры `notify_masters_on_new_order`, `sync_master_verification_level`, `auto_publish_master` — работают.

**Если завтра захочется вернуть** — БД не требует никакой миграции назад. Только код.

## Что удалено из кода (UI)

### Полностью удалены папки/файлы
- `app/(tabs)/chats/` (3 файла) — экраны переписки.
- `src/features/chat/` (10 файлов) — хуки/helpers чата.
- `app/(tabs)/notifications/` — Notification Center.
- `src/features/master-view/MasterRecentEvents.tsx` — dead-code после удаления notifications.

### Изменены экраны
| Файл | Что было | Что стало |
|---|---|---|
| `app/(tabs)/orders/[id].tsx` | 2069 строк, кнопки «Выбрать мастера», «Открыть чат», «Подтвердить выполнение», «Возобновить», «Оставить отзыв», OutcomeTrackingModal, форма дисьюта | 1220 строк. Карточка отклика = имя + рейтинг + цена + текст + 3 кнопки: «Позвонить» (`tel:`), «WhatsApp» (`wa.me/`), «Профиль» |
| `app/(tabs)/master/[id].tsx` | Кнопки Позвонить + WhatsApp + «Написать в xtrud», action-меню с «Этот мастер выполнил мне работу» | Только Позвонить + WhatsApp. Action-меню: только «Пожаловаться» |
| `src/components/TabBar.tsx` | 5 вкладок (Главная, Заказы, Создать, **Чаты**, Профиль) | 4 вкладки без Чатов |
| `app/(tabs)/_layout.tsx` | `<Tabs.Screen name="chats" />` | Удалено |
| `src/components/WebShell.tsx` | nav-link «Чаты» + chatsBadge prop | Удалено |
| `app/(tabs)/cases.tsx` | 2 таба «Кейсы» + «Отзывы», title «Мои работы» | 1 таб, title «Кейсы» |
| `src/features/master-view/MasterDashboardOrders.tsx` | 3 таба «Новые» / «Я откликнулся» / **«Меня выбрали»** | 1 список «Ваши отклики» |
| `src/components/OrderStatusBadge.tsx` | 8 статусов | open/cancelled/expired показывают свои бейджи, остальное → «Закрыт» |
| `app/(tabs)/orders/index.tsx` | Табы Активные / Завершены / Черновики | Открытые (только `open`) / Архив (cancelled+expired) / Черновики |
| `app/(tabs)/profile/index.tsx` | Плитка «Чаты» среди client-stats | Удалена |

## Как восстановить (если захочется вернуть чаты и lifecycle)

### Способ 1 — git revert (самый простой)

Найти коммит этого перехода (~2026-05-20 вечер) и сделать:
```bash
git log --oneline --grep="classified\|simple.flow\|удалить чаты"
git revert <hash>
```
Тогда все удалённые файлы + изменения вернутся. БД даже не требует обновления — данные на месте.

### Способ 2 — восстановить из git history вручную

```bash
# Например — восстановить app/(tabs)/chats/
git checkout HEAD~10 -- app/\(tabs\)/chats/
git checkout HEAD~10 -- src/features/chat/
git checkout HEAD~10 -- app/\(tabs\)/notifications/
git checkout HEAD~10 -- src/features/master-view/MasterRecentEvents.tsx
# и так далее
```

Где `~10` — относительно сколько коммитов назад делалось упрощение.

### Способ 3 — частичный возврат

Если хочется вернуть **только чаты** но без lifecycle:
- Восстановить `app/(tabs)/chats/`, `src/features/chat/`.
- В `app/(tabs)/_layout.tsx` вернуть `<Tabs.Screen name="chats" />`.
- В `src/components/TabBar.tsx` добавить `"chats"` в `TAB_ORDER` и в `rightRoutes`.
- В `app/(tabs)/orders/[id].tsx` — оставить новые кнопки «Позвонить/WhatsApp», добавить рядом «Написать в xtrud» с переходом в чат.

Каждая часть восстановления — независима. Можно вернуть только то что нужно.

## Что НЕ потеряно при удалении

- Все демо-чаты и сообщения в БД (12 чатов, 56 сообщений).
- Все демо-отзывы (11 reviews) — таблица `reviews` тоже жива.
- Все push-токены клиентов — `notification_tokens` таблица жива.
- История status-переходов заказов (если кто-то завершал demo-заказы) — `order_audit_log` таблица жива.

## Что вернуть **нужно вручную** при восстановлении

- **Realtime подписки** на messages/chats — хуки `useRealtimeMyChats`, `useRealtimeChatMessages` удалены, придётся восстанавливать вместе с feature/chat/ папкой.
- **Push-уведомления о новых сообщениях** — `use-notifications.ts` хук остался, но не вызывается нигде. После восстановления `MasterRecentEvents.tsx` всё заработает.

## Контекст решения

См. `SESSION_SUMMARY_2026-05-20.md` блок «Дополнение (вечер)» и `STATUS.md` раздел «2026-05-20 — переход на classifieds-модель».

Принято в одну рабочую сессию по запросу владельца продукта: «хочу потестить с возможностью отката. Функционал немножко изменённый. Более простой».
