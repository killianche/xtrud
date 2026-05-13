# Chat state-machine

**TL;DR.** В отличие от `orders`, у чатов **нет явного status-enum**. «Состояние» чата косвенно определяется состоянием связанного order + значениями `last_read_client_at` / `last_read_master_at`. Этот doc фиксирует все производные состояния, как они отображаются и как меняются.

Имя для запроса: «chat-states», «жизненный цикл чата», «когда чат закрывается».

См. также: [`order-states.md`](./order-states.md).

---

## Базовая модель

```
chats {
  id            uuid PK
  order_id      uuid UNIQUE (1 chat = 1 order)
  client_id     uuid
  master_id     uuid
  last_message_at         timestamptz
  last_read_client_at     timestamptz  (sprint 12.2)
  last_read_master_at     timestamptz  (sprint 12.2)
  created_at    timestamptz
}

messages {
  id           uuid PK
  chat_id      uuid → chats.id ON DELETE CASCADE
  sender_id    uuid → users.id ON DELETE CASCADE
  text         text (1-4000)
  read_at      timestamptz  (зарезервировано, sprint 7+ не использует)
  created_at   timestamptz
}
```

**Ключевые инварианты:**
- 1 order ↔ 1 chat (UNIQUE order_id). Создаётся RPC `accept_response`.
- Только участники (client OR master) читают/пишут — RLS `chats_read_participants`, `messages_*_chat_participants`.
- Сообщение, отправленное самим юзером, **не считается unread для него** — `trg_mark_sender_read` сразу проставляет `last_read_<role>_at = created_at` отправителя.

---

## Производные состояния чата

Чат не имеет своего status enum. Его «состояние» = функция от **(order.status, last_message_at, last_read_<my_role>_at)**:

| Сценарий | Условие | UI-поведение |
|---|---|---|
| **Активный — есть непрочитанные** | order.status IN ('open'¹, 'in_progress') AND last_message_at > last_read_<my_role>_at | В списке чатов — bold + бэйдж. В табе «Чаты» — счётчик. |
| **Активный — всё прочитано** | order.status IN ('in_progress') AND last_message_at ≤ last_read_<my_role>_at | Обычное отображение, без бэйджа. |
| **Завершённый — open история** | order.status = 'completed' | Доступен только на чтение (RLS не блокирует). Bot-сообщений нет, новых сообщений участники физически могут писать (`messages_insert_own_in_chat` не смотрит на order.status). |
| **Отменённый — open история** | order.status IN ('cancelled', 'expired') | Аналогично completed. На фронте UI скрывает input или показывает «Заказ закрыт». |
| **Пустой чат** | last_message_at IS NULL | Только что создан RPC `accept_response`, никто ещё не написал. UI показывает CTA «Напишите первым». |

¹ В реальности чат при `order.status='open'` существовать **не может** — он создаётся только RPC `accept_response`, которая ставит order в `in_progress`. Условие добавлено для полноты.

---

## Переходы состояний

В отличие от order-states, у чата **нет user-инициируемых state changes**. Все «переходы» — производные от:

| Триггер | Что меняется | Где задано |
|---|---|---|
| `INSERT messages` | `chats.last_message_at = NEW.created_at` (через `update_chat_last_message` trigger) + sender'у `last_read_<role>_at = NEW.created_at` (через `trg_mark_sender_read`). | миграции 0011 + 0021 |
| Открытие чата на клиенте | RPC `mark_chat_read(chat_id)` обновляет `last_read_<my_role>_at = now()` | миграция 0021 |
| `accept_response` RPC | INSERT chat (если ещё нет, ON CONFLICT DO NOTHING) | миграция 0011 |
| `orders` DELETE | CASCADE → DELETE chats → CASCADE → DELETE messages | FK constraint |
| `users` DELETE | CASCADE на chats.client_id / master_id и messages.sender_id → DELETE | FK constraint |
| Order → cancelled/expired (T2/T6/T7) | Чат остаётся живым (нет каскада). Доступен на чтение. Sprint 26 не трогает chats — только responses + push. | миграция 0026 |

---

## Поведение при transition'ах order

| Order transition | Что с chat? | Заметки |
|---|---|---|
| (none) → open (T1) | Чата ещё нет. Не создаётся при INSERT order. | Чат появляется только когда клиент примет мастера. |
| open → in_progress (T3) | RPC `accept_response` делает `INSERT INTO chats ... ON CONFLICT (order_id) DO NOTHING`. | Один chat на order, повторно не создаётся. |
| in_progress → completed (T4/T5) | Чат не трогаем. | История переписки сохраняется навсегда. Review через отдельную секцию order detail. |
| open → cancelled (T2) | Чата нет (его не было), ничего не делаем. | На фронте на странице order видна история «отмена», без чата. |
| in_progress → cancelled (T6) | Чат остаётся (он уже был создан в T3). | History доступна. UI должен показать «Заказ отменён» и спрятать input — это TBD. |
| in_progress → expired (T7) | Невозможно — `expired` бывает только из `open` (см. constraint `orders_picked_only_if_in_progress`). Чата не было. | — |

---

## Известные пробелы / TODO

| Проблема | Влияние | План |
|---|---|---|
| После T6 (cancel из in_progress) чат остаётся «открытым» для записи | Клиент / мастер могут продолжать писать в закрытом заказе. Не критично (RLS даёт право), но UX-странно. | Sprint TBD: либо frontend disable input при `order.status` not in ('in_progress'), либо backend RLS `messages_insert_open_order_only`. Решение зависит от того, нужно ли финализировать чат как «обсудить детали отзыва» — может быть нужно держать input открытым 24 часа после completion. |
| Нет soft-delete / archive у chats | Список чатов растёт бесконечно. На завершённых чатах нет «архивации». | Sprint TBD: добавить `chats.archived_at` + UI «Архивные». Низкий приоритет до 1000+ чатов на юзера. |
| `messages.read_at` зарезервирован, не используется | На уровне отдельного сообщения нет «прочитано/не прочитано». Только thread-level через `last_read_<role>_at`. | Решение sprint 12: per-thread достаточно. Если будет нужен per-message read receipts — заполнить через `mark_chat_read` или новый trigger. |
| Нет typing-indicators / online-presence | Стандарт современных чатов. | Sprint TBD: Supabase Realtime presence — отдельный канал на chat_id. |
| Realtime подписка на messages включена, но не на chats | UI чата подписан на новые `messages`; список чатов не обновляется автоматически при изменении `last_message_at` в другом thread. | Sprint TBD: проверить, что `ALTER PUBLICATION supabase_realtime ADD TABLE public.chats` уже сделано (миграция 0011 включает) и фронт реально слушает chats-канал. |
| Нет защиты от спама / 4000-символьных стен текста | CHECK `length(text) BETWEEN 1 AND 4000` есть, но нет rate-limit. | Sprint TBD: edge function rate-limit per (sender, chat) или DB-уровень trigger «не более N сообщений / минуту». Не критично до публичного бета. |

---

## Ссылки в коде

- **Schema**: `supabase/migrations/0011_chats_and_messages.sql`
- **Unread tracking**: `supabase/migrations/0021_chat_unread_tracking.sql` (last_read_client_at / last_read_master_at + RPC + trigger)
- **Mark responses viewed** (cross-feature): `supabase/migrations/0022_mark_responses_viewed_rpc.sql`
- **Pure helpers**: `src/features/chat/unread-helpers.ts` (isChatUnread, unreadChatsCount) — покрыты unit-тестами в sprint 14
- **Send message mutation**: `src/features/chat/use-send-message.ts`
- **UI thread**: `app/(tabs)/chats/[id].tsx`
- **UI list (mobile + desktop sidebar)**: `src/features/chat/ChatsListContent.tsx`
- **Realtime подписка**: ищется в `use-chat-messages.ts` (sprint 7)
- **Maestro chat smoke**: `.maestro/flows/06-chat.yaml` + fixture `supabase/seed-test/chat-fixture.sql`

---

## Контракт для будущих изменений

Когда добавляешь новую фичу к чатам (typing, archive, voice, media):

1. **Сначала** обнови этот doc — особенно матрицу «производные состояния» и «известные пробелы».
2. Если фича меняет схему (новые колонки в `chats` / `messages` / новая таблица) — миграция + RLS.
3. Если фича добавляет новый source of state (например, `archived_at`) — пересмотри матрицу «производные состояния» — может, состояний становится больше.
4. Maestro flow: для пользовательских действий (typing indicator, archive button) добавь test cases в `.maestro/flows/06-chat.yaml` или создай отдельный flow.
