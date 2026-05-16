# Order state-machine

> ⚠️ **LEGACY DOC (2026-05-13 → 2026-05-16).** Описывает базовый state-machine из 6 статусов и 7 переходов (T1–T7). Расширен sprint 0071–0076 до **8 статусов + 15 переходов** (добавлены `awaiting_confirmation`, `disputed`, T8–T15). **Источник истины:** [`lifecycle.md`](./lifecycle.md). Этот файл оставлен для исторической справки. Если правишь state-machine — правь `lifecycle.md`, а не этот файл.

**TL;DR.** Заказ (`orders` row) живёт в шести статусах из enum `public.order_status`. Между ними возможны 7 переходов, каждый защищён конкретной RLS-policy или RPC. Любая будущая фича (отмена / реактивация / админ-вмешательство) должна сначала появиться в этой матрице, иначе ломает инварианты.

Имя для запроса: «order-states», «state-machine заказа», «жизненный цикл заказа».

---

## Состояния

| Status | Описание | Кто его выставляет | Видим клиентом? | Видим мастером? |
|---|---|---|---|---|
| `draft` | Черновик (создан, не опубликован). **Не используется в UI на 2026-05** — все вновь создаваемые заказы сразу `open`. Зарезервирован под будущий «сохранить как черновик». | client (insert) | да (свой) | нет |
| `open` | Опубликован, принимает отклики мастеров. | client (`useCreateOrder` пишет `status: "open"` напрямую) | да | да (если l2 в моих категориях) |
| `in_progress` | Клиент принял отклик одного из мастеров. Заказ заморожен — другие отклики автоматически переходят в `rejected`. | RPC `accept_response` | да (свой) | да (если picked) |
| `completed` | Работа выполнена. Открывается окно отзыва (`reviews_insert_participant` policy требует `status='completed'`). | picked_master ИЛИ client | да (свой) | да (если picked) |
| `cancelled` | Клиент отменил заказ (из `open` или из `in_progress`). | client | да (свой) | да (если picked) |
| `expired` | Истёк `expires_at` без активности. | `pg_cron` job `nightly_expire_orders` (03:00 UTC) → `public.expire_old_orders()` | да (свой, как старый archive) | нет (выпадает из feed) |

---

## Граф переходов

```
            ┌──────────┐
            │  draft   │   (не используется в UI 2026-05)
            └────┬─────┘
                 │ owner publish (TODO)
                 ▼
            ┌──────────┐  ←─────────────────────────┐
   create ─→│  open    │                            │
            └────┬─────┘                            │ (expire job, TBD)
                 │                                  │
                 │ RPC accept_response              │
                 │ (атомарно: response→accepted,    │
                 │  остальные→rejected,             │
                 │  order→in_progress)              │
                 ▼                                  │
            ┌──────────────┐                        │
            │ in_progress  │                        │
            └──┬─────────┬─┘                        │
               │         │                          │
       client  │         │ picked_master ИЛИ client │
       cancel  │         │   complete               │
               ▼         ▼                          │
        ┌─────────┐  ┌──────────┐                   │
        │cancelled│  │completed │                   │
        └─────────┘  └──────────┘                   │
                                                    │
                                            ┌──────────┐
                                            │ expired  │  (cron, TBD)
                                            └──────────┘
```

Терминальные состояния: `completed`, `cancelled`, `expired`. Из них переходов нет.

---

## Матрица переходов

| # | Из → В | Триггер | Защита | Side effects |
|---|---|---|---|---|
| T1 | (none) → `open` | `useCreateOrder` (INSERT в `orders`) | RLS `orders_insert_own` (client_id=auth.uid) | — |
| T2 | `open` → `cancelled` | `useCancelOrder` (UPDATE status='cancelled') | RLS `orders_owner_edit_open` (owner, USING status IN ('open','draft'), WITH CHECK включает 'cancelled') | — |
| T3 | `open` → `in_progress` | RPC `accept_response(p_response_id)` | SECURITY INVOKER; внутри проверяет `client_id=auth.uid()` + `status='open'`. Также атомарно: выбранный response → `accepted`, остальные `sent/viewed` → `rejected`; пишет `picked_master_id`. | Push мастеру (выбранному) — sprint 8.6 trigger; push другим — rejected (TODO?) |
| T4 | `in_progress` → `completed` (мастером) | `useCompleteOrder` (UPDATE status='completed') | RLS `orders_picked_master_can_complete` (USING picked_master=auth.uid + status='in_progress'; WITH CHECK status='completed') | Открывает review window (`reviews_insert_participant`) |
| T5 | `in_progress` → `completed` (клиентом) | `useCompleteOrder` от owner (тот же mutation, разные RLS-paths) | RLS `orders_owner_change_status_in_progress` (USING client_id=auth.uid + status='in_progress'; WITH CHECK status IN ('cancelled','completed')) | Открывает review window |
| T6 | `in_progress` → `cancelled` | `useCancelOrder` (UPDATE status='cancelled') | RLS `orders_owner_change_status_in_progress` (та же policy, статус cancelled ∈ WITH CHECK) | Заказ закрыт без отзыва |
| T7 | `open` → `expired` | `pg_cron` job `nightly_expire_orders` (03:00 UTC ежедневно) → `SELECT public.expire_old_orders();` (миграция 0024) | SECURITY DEFINER функция, дёргается postgres-юзером в обход RLS; внутри `UPDATE WHERE status='open' AND expires_at < now()` | Заказ исчезает из master feed (`use-master-feed.ts` фильтрует `status='open'`); владелец видит как архив |

**Важно:** мастер **не может** отменить или вернуть заказ обратно в `open` — это намеренно. Если мастер передумал, он только не выставляет `complete`. Возврат `in_progress → open` исключён архитектурно: T-переходов туда нет, и RLS их бы заблокировала (USING ставит status='in_progress', WITH CHECK ограничивает выход в cancelled/completed).

---

## Ответственность RLS-policy (orders)

| Policy | FOR | USING | WITH CHECK | Покрывает переходы |
|---|---|---|---|---|
| `orders_read_open_or_own` | SELECT | status IN (open, in_progress, completed) OR auth.uid IN (client, picked_master) | — | чтение |
| `orders_insert_own` | INSERT | — | auth.uid = client_id | T1 |
| `orders_owner_edit_open` (sprint 10.2) | UPDATE | client_id=auth.uid + status IN (open, draft) | client_id=auth.uid + status IN (open, draft, in_progress, cancelled) | T2 (open→cancelled), редактирование полей пока open |
| `orders_owner_change_status_in_progress` (sprint 10.2) | UPDATE | client_id=auth.uid + status='in_progress' | client_id=auth.uid + status IN (cancelled, completed) | T5, T6 |
| `orders_picked_master_can_complete` | UPDATE | picked_master=auth.uid + status='in_progress' | picked_master=auth.uid + status='completed' | T4 |
| `orders_delete_own_drafts` | DELETE | client_id=auth.uid + status='draft' | — | удаление черновика |

Покрытие RLS симметрично переходам — кроме T3 (через RPC) и T7 (TBD). Это **намеренно**: T3 атомарный (3 UPDATE + проверки), его нельзя выразить одной policy.

---

## Side effects по переходам

Тригеры/функции, запускающиеся на смене статуса:

1. **T3 (open→in_progress)**: 
   - PostgreSQL trigger из миграции 0018 (`push triggers`) посылает Expo Push выбранному мастеру через `notify_user`.
   - RLS на новых сообщениях в `chats` теперь доступна (chat создаётся отдельной mutation).
   - Все остальные `order_responses` этого заказа становятся `rejected` через тот же RPC.

2. **T4/T5 (in_progress→completed)**:
   - `reviews_insert_participant` policy теперь пропускает INSERT в `reviews` от client (с direction='client_to_master') и от master (direction='master_to_client').
   - Когда review status='visible', срабатывает trigger `recalc_master_rating` → пересчёт `master_profiles.rating_overall_avg/count`.
   - На master_view вкладка «Меня выбрали» отрисовывает заказ с CTA «Отметить выполненным» или «Оставить отзыв».
   - OutcomeTrackingModal (sprint 15.1) перестаёт показывать prompt — он смотрит `pickedMasterId !== null && status === 'in_progress'`, completed его не триггерит.

3. **T2/T6/T7 (→cancelled / →expired)** — миграция 0026, `trg_notify_order_cancelled_or_expired`:
   - Все активные `order_responses` этого заказа (status IN ('sent','viewed')) → push мастеру «Клиент отменил заказ» / «Заказ истёк» + перевод их status в `withdrawn` (одной транзакцией).
   - При T6 (in_progress→cancelled) дополнительно push идёт `picked_master_id`.
   - `accepted` и `rejected` отклики не трогаются — это история сделки.
   - Чат остаётся доступен (история).

---

## Известные пробелы / TODO

| Проблема | Влияние | План |
|---|---|---|
| ~~`expired` нигде не выставляется~~ | ~~Старые `open` заказы засоряют ленту мастера бесконечно~~ | **Закрыто Sprint 23 (миграция 0024)** — pg_cron `nightly_expire_orders` 03:00 UTC. |
| `draft` не используется в UI | Юзер не может сохранить заполненную форму на потом | Низкий приоритет, sprint TBD |
| Re-open отменённого заказа | Если клиент случайно отменил — нужно создавать заново | По дизайну: cancelled — терминальный. Если станет частой жалобой — обсудить. |
| Отказ от выбранного мастера до completion | Клиент принял, потом передумал. Сейчас единственный путь — отменить (T6), но это вместо «вернуть в open». | Sprint TBD: либо T8 (in_progress→open с side effect «reject picked response»), либо клиенту явно пишем «Отменить и опубликовать заново». |
| ~~Side effect на T2/T6/T7 (cancel/expire) с отправленными откликами~~ | ~~Мастера, отправившие отклики, не получают уведомления что заказ снят. Их отклики висят как `sent`.~~ | **Закрыто Sprint 26 (миграция 0026)** — `trg_notify_order_cancelled_or_expired` push'ит мастеров + withdraw'ит их отклики. |

---

## Ссылки в коде

- **Enum**: `supabase/migrations/0009_orders_and_responses.sql:16-22`
- **RLS**: `supabase/migrations/0009_orders_and_responses.sql:215-260` + `supabase/migrations/0020_orders_edit_rls_guards.sql` + `supabase/migrations/0012_reviews_and_order_completion.sql:84-93`
- **RPC accept_response**: `supabase/migrations/0010_accept_response_rpc.sql`
- **pg_cron expire job (T7)**: `supabase/migrations/0024_expire_orders_cron.sql` + функция `public.expire_old_orders()`
- **Push при cancel/expire**: `supabase/migrations/0026_notify_order_cancelled_expired.sql` (триггер) + `0027_fix_notify_user_pgnet_api.sql` (починка pg_net API)
- **Client mutations**:
  - T1: `src/features/orders/use-create-order.ts`
  - T2/T6: `src/features/orders/use-cancel-order.ts`
  - T3: `src/features/orders/use-accept-response.ts` (RPC wrapper)
  - T4/T5: `src/features/orders/use-complete-order.ts`
- **UI**: `app/(tabs)/orders/[id].tsx` (показ CTA в зависимости от status + role)
- **Outcome prompt** (sprint 15.1): `src/features/orders/outcome-store.ts` — pure-логика «спросить через 3 дня после accept»

---

## Контракт для будущих изменений

Когда добавляешь новый статус или переход:

1. **Сначала** обновляешь этот файл — добавляешь строку в матрицу + рисуешь стрелку в графе.
2. **Потом** меняешь enum (новая миграция) + RLS policy + (если нужно) RPC.
3. **Затем** мутацию в `src/features/orders/use-*.ts` и UI.
4. **Тест**: добавить кейс в `outcome-store.test.ts` если переход меняет prompt-поведение; в Maestro flow если меняется UX.

Менять enum без обновления RLS — гарантированный production bug: PostgREST просто отдаст 403 без понятной причины.
