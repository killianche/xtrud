# Lifecycle — заказы, отклики, чаты, отзывы

**TL;DR.** Полная аналитика жизненного цикла заявки на xtrud. Объединяет state-machine `orders` + `order_responses` + связанные сущности (chats, reviews, notifications). Документ — источник истины для backend (миграции, RPC, cron-задачи) и frontend (UI кнопки, badges, копирайт). Расширяет и **заменяет** [`order-states.md`](./order-states.md) (тот остаётся для исторической справки T1-T7).

Имя для запроса: «lifecycle», «жизненный цикл», «state-machine».

См. также: [`order-states.md`](./order-states.md), [`chat-states.md`](./chat-states.md), [`docs/order-states.md`](./order-states.md).

---

## §1. Цели документа и invariants

**Зачем расширяем.** Текущий state-machine (6 статусов + 7 переходов) описывает только «счастливый путь» и базовый auto-expire по `expires_at`. Не покрыты:

- Мастер отозвал отклик (только через side-effect cancel/expire)
- Мастер пометил «работа выполнена», клиент не реагирует
- Клиент пропал после выбора (in_progress висит вечно)
- Спор (мастер говорит «сделал», клиент говорит «не сделал»)
- Reopen после случайной отмены
- Накопительные warning-нотификации до auto-expire
- Audit log переходов (для саппорта и аналитики)

**Invariants после расширения.**

1. **Терминальные состояния.** `completed`, `cancelled`, `expired` — без переходов. `disputed` НЕ терминальный (закрывается ручным решением саппорта в `completed`/`cancelled`).
2. **Один picked_master.** `picked_master_id` устанавливается только при переходе в `in_progress`. После `completed/cancelled` — остаётся (история сделки).
3. **Один accepted response per order.** `response.status='accepted'` существует **только если** `order.status IN ('in_progress', 'awaiting_confirmation', 'completed', 'disputed')`. На `cancelled/expired` — accepted остаётся (история), но новых принять нельзя.
4. **Атомарность.** Любой переход с side effects (push, withdraw откликов, создание чата) — внутри одной транзакции через RPC. Прямой UPDATE через PostgREST разрешён только для самых простых переходов.
5. **Невозвратность отзыва.** После `completed` отзыв доступен 14 дней, потом окно закрывается. После `disputed → resolved_*` отзыв НЕ переоткрывается.
6. **Reopen ограничен.** Только client-инициированная отмена и expired по таймеру допускают reopen в окне 7 дней. После `completed/disputed` reopen невозможен — создавай новый заказ.

---

## §2. Все статусы

### 2.1 `orders.status` (enum `public.order_status`)

| Статус | Описание | TTL до auto-transition | Терминальный? |
|---|---|---|---|
| `draft` | Черновик (заполнено, не опубликовано). На 2026-05 НЕ используется в UI — резерв на «сохранить как черновик». | — | нет |
| `open` | Опубликован, принимает отклики. | **14 дней** без выбора → `expired` | нет |
| `in_progress` | Мастер выбран, работа идёт. | **30 дней** без активности (mark_done / message / dispute) → `cancelled` с reason='stale' | нет |
| `awaiting_confirmation` ⭐ **NEW** | Мастер нажал «выполнено», клиент ещё не подтвердил. | **72 часа** без подтверждения/спора → `completed` (auto) | нет |
| `completed` | Работа подтверждена. Окно отзыва открыто 14 дней. | окно отзыва **14 дней** | **да** |
| `disputed` ⭐ **NEW** | Открыт спор (мастер vs клиент). Ожидает решения саппорта. | SLA саппорта **5 рабочих дней** | нет (саппорт закрывает) |
| `cancelled` | Клиент отменил (из `open` или `in_progress`). | reopen возможен в течение **7 дней** | **да** (с reopen-окном) |
| `expired` | Истёк TTL без активности. | reopen возможен в течение **7 дней** | **да** (с reopen-окном) |

⭐ — новые статусы, добавляемые этой миграцией.

### 2.2 `order_responses.status` (enum `public.response_status`)

Без структурных изменений, но уточняем семантику.

| Статус | Описание | Кто/что выставляет |
|---|---|---|
| `sent` | Отклик отправлен, клиент не открыл. | `useCreateResponse` (INSERT) |
| `viewed` | Клиент открыл `/orders/[id]`. | RPC `mark_responses_viewed` (sprint 22) |
| `accepted` | Клиент выбрал именно этого мастера. | RPC `accept_response` |
| `rejected` | Клиент явно отклонил отклик, ИЛИ остальные после accept. | RPC `accept_response` (others) или RPC `reject_response` |
| `withdrawn` | Отклик не активен. Причины:<br>• мастер отозвал сам (`withdraw_response` RPC) ⭐ **NEW**<br>• клиент отменил заказ или заказ expired (trigger 0026) | RPC `withdraw_response` или trigger `trg_notify_order_cancelled_or_expired` |

### 2.3 Связанные сущности

- **`chats`** — без status-enum. Производный от `order.status` (см. [`chat-states.md`](./chat-states.md)). При `awaiting_confirmation/disputed` — продолжает работать; при `completed/cancelled/expired` — read-only через frontend (RLS не блокирует, но input спрятан).
- **`reviews`** — отдельный flow, открывается на `completed`. Окно 14 дней (см. §6).

---

## §3. Полный граф переходов

```
                       ┌──────────┐
                       │  draft   │   (не используется в UI)
                       └────┬─────┘
                            │ owner publish (TODO)
                            ▼
            ┌────────────────────────┐ ◀───────── reopen (T9)
            │         open           │            (cancelled/expired
            │  (TTL 14d → expired)   │             → open в окне 7d)
            └─┬──────┬─────────┬─────┘
              │      │         │
       cancel │      │ accept  │ expire (cron)
       (T2)   │      │ (T3,    │ (T7, after 14d)
              │      │  RPC)   │
              ▼      ▼         ▼
       ┌─────────┐  ┌──────────────┐    ┌──────────┐
       │cancelled│  │ in_progress  │    │ expired  │
       └─────────┘  └──┬───┬───┬───┘    └──────────┘
                       │   │   │
              cancel  │   │   │ master mark done
              (T6)    │   │   │ (T8, RPC mark_order_done)
                      │   │   ▼
                      │   │  ┌──────────────────────┐
                      │   │  │ awaiting_confirmation│
                      │   │  └──┬────┬────┬─────────┘
                      │   │     │    │    │
                      │   │     │    │    │
              cancel  │   │     │    │    │ auto-confirm (T11, cron 72h)
              (T6)    │   │     │    │    │ или client confirm (T10, RPC)
                      │   │     │    │    ▼
                      │   │     │    │  ┌──────────┐
                      │   │     │    │  │completed │ ✓
                      │   │     │    │  └──────────┘
                      │   │     │    │
                      │   │     │    │ dispute
                      │   │     │    │ (T12, RPC open_dispute)
                      │   │     │    ▼
                      │   │     │  ┌─────────┐
                      │   │     │  │disputed │ ─── support resolves ──▶ completed / cancelled
                      │   │     │  └─────────┘
                      │   │     │
                      │   │     │ stale auto-cancel
                      │   │     │ (T13, cron 30d no activity)
                      │   │     ▼
                      │   │   ┌─────────┐
                      ▼   ▼   │cancelled│ (reason: 'stale')
                   ┌─────────┘
                   │cancelled│
                   └─────────┘
```

Двойные стрелки → reopen (T9): `cancelled/expired` → `open` в окне 7 дней без потери id и истории.

---

## §4. Матрица переходов (расширенная)

| # | Из → В | Триггер | Защита | Side effects |
|---|---|---|---|---|
| **T1** | (none) → `open` | `useCreateOrder` (INSERT) | RLS `orders_insert_own` | — |
| **T2** | `open` → `cancelled` | `useCancelOrder` (UPDATE) | RLS `orders_owner_edit_open` + WITH CHECK включает 'cancelled' | trigger 0026: withdraw all active responses + push masters; пишет `cancelled_by`, `cancel_reason`. |
| **T3** | `open` → `in_progress` | RPC `accept_response` | внутри: `client_id=auth.uid()` + `status='open'` | other responses → `rejected`; пишет `picked_master_id`, `picked_at`, `last_activity_at`. Создаёт chat (idempotent). Push picked master. |
| **T4** | `in_progress` → `completed` (клиентом) | RPC `confirm_completion(skip_review?)` ⭐ **NEW** (заменяет прямой UPDATE) | RLS `orders_owner_change_status_in_progress` + RPC проверяет `status='in_progress'` или `awaiting_confirmation` + `client_id=auth.uid()` | пишет `completed_at`, `completion_kind='client_direct'`. Открывает review window. Push мастеру «клиент подтвердил завершение». |
| **T5** | `awaiting_confirmation` → `completed` (клиентом) | RPC `confirm_completion` | то же | пишет `completed_at`, `completion_kind='client_confirmed'`. Push мастеру. |
| **T6** | `in_progress`/`awaiting_confirmation` → `cancelled` | `useCancelOrder` (UPDATE) | RLS `orders_owner_change_status_in_progress` | trigger 0026: push picked master; пишет `cancelled_by=client_id`, `cancel_reason`. |
| **T7** | `open` → `expired` | cron `nightly_expire_open_orders` 03:00 UTC | SECURITY DEFINER, postgres user | trigger 0026: withdraw responses + push masters. |
| **T8** ⭐ | `in_progress` → `awaiting_confirmation` | RPC `mark_order_done` ⭐ **NEW** | RPC проверяет `picked_master_id=auth.uid()` + `status='in_progress'` | пишет `master_marked_done_at`, `awaiting_confirmation_until = now() + 72h`. Push клиенту «мастер сообщил, что работа выполнена. Подтвердите или оспорьте». |
| **T9** ⭐ | `cancelled`/`expired` → `open` | RPC `reopen_order` ⭐ **NEW** | RPC проверяет `client_id=auth.uid()` + `status IN ('cancelled', 'expired')` + `updated_at > now() - interval '7 days'` | сбрасывает `cancelled_by`, `cancel_reason`, обновляет `expires_at = now() + interval '14 days'`. Push мастерам, которые были withdrawn (sent → withdrawn в T2/T7): «клиент возобновил заказ, можно откликнуться заново». |
| **T10** ⭐ | `awaiting_confirmation` → `disputed` | RPC `open_dispute(p_reason)` ⭐ **NEW** | RPC проверяет `client_id=auth.uid()` OR `picked_master_id=auth.uid()` + `status IN ('in_progress','awaiting_confirmation')` | пишет `dispute_opened_by`, `dispute_reason`, `disputed_at`. Push обеим сторонам + саппорту (TODO: webhook). |
| **T11** ⭐ | `awaiting_confirmation` → `completed` (auto) | cron `nightly_auto_confirm_completions` 04:00 UTC | SECURITY DEFINER, postgres user. Условие: `awaiting_confirmation_until < now()` | пишет `completed_at`, `completion_kind='auto_confirmed'`. Push клиенту: «заказ автоматически закрыт. Если работа не была выполнена — оставьте отзыв или обратитесь в саппорт». |
| **T12** ⭐ | `in_progress` → `disputed` | RPC `open_dispute(p_reason)` | то же что T10 | то же |
| **T13** ⭐ | `in_progress` → `cancelled` (stale) | cron `nightly_cancel_stale_in_progress` 05:00 UTC | SECURITY DEFINER. Условие: `last_activity_at < now() - interval '30 days'` | пишет `cancelled_by=NULL`, `cancel_reason='stale_no_activity'`. Push обеим сторонам: «заказ закрыт автоматически из-за неактивности. Если работа продолжается — создайте новый заказ или обратитесь в саппорт». |
| **T14** ⭐ | `disputed` → `completed`/`cancelled` | manual support intervention (SQL или admin UI TBD) | service_role only | пишет `resolved_at`, `resolved_by` (admin uid), `resolution_kind`. Push обеим сторонам. |
| **T15** ⭐ | `open`/`in_progress` → (master withdraws own response) | RPC `withdraw_response(p_response_id)` ⭐ **NEW** | RPC проверяет `master_id=auth.uid()` + `status IN ('sent','viewed')` (можно отозвать только до accept) | response → `withdrawn`. Если order ещё `open` и picked_master_id IS NULL — НЕ меняем order.status (другие отклики могут прийти). Push клиенту: «мастер X отозвал свой отклик». |

### Запрещённые переходы

| Из → В | Почему запрещено |
|---|---|
| `in_progress` → `open` | Нет business case — отмена и пересоздание/reopen. |
| `awaiting_confirmation` → `in_progress` | Мастер не может «передумать» что работа выполнена. Можно только открыть dispute. |
| `completed` → `*` | Терминальное. Спор открывается через `disputed`, но это запрещено после `completed` — только в `awaiting_confirmation`. |
| `disputed` → `disputed` (повторный) | Один dispute per order. |
| `expired` → `*` (кроме reopen T9) | Auto-expired не вернёшь работой — только reopen или новый заказ. |
| Master cancel | Мастер вообще не может отменять/завершать без действия со своей стороны (только `withdraw_response` до accept, `mark_done` после). |

---

## §5. Time-based триггеры (cron + countdown)

### 5.1 Cron jobs (PostgreSQL pg_cron)

| Job | Расписание | Что делает | Миграция |
|---|---|---|---|
| `nightly_expire_open_orders` | 03:00 UTC ежедневно | `open` с `expires_at < now()` → `expired` (T7). | 0024 (есть) |
| `nightly_auto_confirm_completions` ⭐ | 04:00 UTC ежедневно | `awaiting_confirmation` с `awaiting_confirmation_until < now()` → `completed` (T11). | NEW |
| `nightly_cancel_stale_in_progress` ⭐ | 05:00 UTC ежедневно | `in_progress` с `last_activity_at < now() - 30d` → `cancelled` (T13). | NEW |
| `nightly_close_review_windows` ⭐ | 06:00 UTC ежедневно | `completed` с `completed_at < now() - 14d` → отметка `reviews_closed_at = now()` (для UI «окно отзыва закрыто»). | NEW |
| `nightly_send_reminder_notifications` ⭐ | 10:00 МСК (07:00 UTC) ежедневно | Push'ит warnings: T-7d / T-1d до expire, T+24h / T+48h в awaiting_confirmation, T-1d / day-of в review window. | NEW |

### 5.2 Notifications cascade

| Событие | Когда | Кому | Текст |
|---|---|---|---|
| **Open T-7d** | Прошло 7 дней с создания, `responses_count = 0` | Клиент | «Прошло 7 дней — ни одного отклика. Может, увеличить бюджет или уточнить описание?» + CTA «Редактировать заявку». |
| **Open T-1d** | За 24 часа до `expires_at` | Клиент | «Заявка закроется через 24 часа. Продлить или закрыть?» + CTA «Продлить на 14 дней» / «Закрыть». |
| **In_progress no activity 14d** | `last_activity_at < now() - 14d` И `status='in_progress'` | Обе стороны | «Работа всё ещё идёт?» + CTA «Да, продолжаем» / «Закрыть как выполнено» / «Открыть спор». |
| **Awaiting_confirmation T+24h** | Прошло 24 часа после `mark_done` | Клиент | «Мастер сообщил, что работа выполнена. Подтвердите или оспорьте — иначе через 48 часов заказ закроется автоматически». |
| **Awaiting_confirmation T+48h** | Прошло 48 часов | Клиент | «Остались сутки на подтверждение». |
| **After completion T+1d** | Прошёл 1 день с `completed_at`, отзыв не оставлен | Обе стороны | «Как прошло? Оставьте отзыв — это поможет другим». |
| **After completion T+7d** | Прошло 7 дней с `completed_at`, отзыв не оставлен | Обе стороны | «Окно отзыва закроется через 7 дней». |
| **After completion T+13d** | Прошло 13 дней | Обе стороны | «Последний день оставить отзыв». |
| **Disputed opened** | T10/T12 | Обе стороны + саппорт | «Открыт спор. Саппорт рассмотрит в течение 5 рабочих дней». |

Notifications collisions: если у юзера за одно окно (1 час) накопилось 3+ push'а — объединяем в один: «По заказу X есть несколько обновлений».

---

## §6. Reviews window

| Параметр | Значение |
|---|---|
| **Длительность окна** | 14 дней после `completed_at` |
| **Кто может оставить** | Клиент → мастеру (direction `client_to_master`), мастер → клиенту (direction `master_to_client`) |
| **Double-blind?** | **Да.** Никто не видит чужой отзыв до момента: (a) сам отправил отзыв ИЛИ (b) окно 14d закрылось. Это защищает от ответок (важно в малом регионе). |
| **Изменение/удаление** | До закрытия окна — можно править свой. После — иммутабельно. Удаление только через саппорт. |
| **На `disputed → completed`** | Окно отзыва открывается заново 14 дней с момента resolution (`resolved_at`). |
| **На `disputed → cancelled`** | Отзыв НЕ доступен. Спор разрешён в пользу одной из сторон без обсуждения качества работы. |

Реализация double-blind (TODO sprint TBD): в `reviews_read` policy — `visible_to_other_side = (other_side_submitted OR review_window_closed)`. Подробности — отдельная миграция.

---

## §7. Audit log переходов

⭐ NEW. Новая таблица `order_status_log` для трекинга всех переходов — критично для саппорта (споры) и аналитики.

```sql
CREATE TABLE public.order_status_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status   public.order_status,   -- NULL для T1 (создание)
  to_status     public.order_status NOT NULL,
  transition    text NOT NULL,         -- 'T1', 'T3', 'T8' и т.д.
  triggered_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,  -- NULL для cron
  triggered_kind text NOT NULL CHECK (triggered_kind IN ('user', 'cron', 'support', 'trigger')),
  metadata      jsonb,                 -- произвольные данные (cancel_reason, dispute_reason и т.п.)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_status_log_order_id_idx ON public.order_status_log(order_id, created_at);
```

Заполняется триггером `trg_log_order_status_change` AFTER UPDATE OF status (а также вручную из RPC, чтобы прокинуть `metadata`).

**Запросы для саппорта:**
- «Покажи всю историю заказа X»: `SELECT * FROM order_status_log WHERE order_id = $1 ORDER BY created_at`.
- «Сколько раз клиент Y отменял заказы за месяц»: `JOIN с orders WHERE triggered_by = $1 AND to_status = 'cancelled' AND created_at > now() - interval '1 month'`.
- «Среднее время от open до completion»: `... WHERE to_status = 'completed' ... timestamp arithmetic`.

---

## §8. Карма (penalty-учёт)

⭐ NEW. Учитываем «надёжность» каждой стороны через производное поле.

| Действие | Эффект |
|---|---|
| Клиент отменил `in_progress` (T6) | +1 к `clients.cancel_count_30d`. >3/мес → soft-warn в форме создания. >5/мес → hide profile from masters' feed на 7 дней. |
| Мастер отозвал accepted-отклик через cancel (его нет, но через dispute → cancelled) | +1 к `masters.cancel_count_30d`. >2/мес → понижение в ranking. |
| Мастер `mark_done`, клиент `dispute` → support resolves в пользу клиента | +1 к `masters.dispute_lost_count_lifetime`. ≥3 → ручной review профиля. |
| Клиент `dispute`, support resolves в пользу мастера | +1 к `clients.dispute_lost_count_lifetime`. ≥3 → ручной review. |
| Стороны взаимно поставили <3 звёзд | без penalty (просто отражается в rating). |

Реализация — отдельная миграция (Sprint TBD), таблица `user_reputation` или поля в `users`/`master_profiles`. Сначала собираем данные в `order_status_log`, потом считаем агрегаты.

---

## §9. Edge cases — что делаем

| Ситуация | Поведение |
|---|---|
| Клиент случайно отменил `open` | Reopen в 7-дневное окно (T9). |
| Клиент отменил `in_progress` (передумал) | T6, оба статуса возможны. Penalty см. §8. Reopen НЕ доступен — `in_progress → cancelled` означает разрыв сделки, нужна новая заявка. |
| Мастер пропал после accept | На 14-й день — warning push «работа продолжается?». На 30-й — auto-cancel (T13) с reason='stale'. Клиент может раньше открыть dispute или cancel. |
| Клиент пропал после accept | То же что выше — мастер может через 14 дней без активности нажать `mark_done`. Если клиент не реагирует 72 часа — auto-confirm (T11). |
| Мастер отметил done, потом передумал | Невозможно технически (`awaiting_confirmation → in_progress` запрещено). Может: попросить клиента в чате открыть dispute, в нём указать «продолжаем работу». Саппорт переведёт в `in_progress` через service_role. |
| Двойной dispute (обе стороны открыли) | Первый создаёт состояние, второй — игнорируется (идемпотентно). В `dispute_reason` склеиваем обе reason. |
| Заказ на 0₽ / без бюджета | Не блокируется. `budget_min/max IS NULL` допустимо (DEFAULT `budget_mode='negotiable'`). |
| Дубликат заказа (та же L2/title в течение 24h) | Soft-warn в форме создания: «У вас уже есть похожий открытый заказ. Создать новый?». Не блокируется hard. |
| Мастер удалил аккаунт между T3 и T4 | `picked_master_id ON DELETE SET NULL` уже есть. Order остаётся `in_progress`, но без picked_master. UI показывает «мастер удалил аккаунт». Клиент может cancel (T6) с reopen или открыть dispute → support. |
| Клиент удалил аккаунт | `client_id ON DELETE CASCADE` → удаляется весь заказ. История пропадает. **Возможно, изменить на SET NULL + переименовать в `[удалённый клиент]`** — открытый вопрос (см. §11). |
| Изменение L2 в `open` заказе | Допустимо через `useUpdateOrder` (sprint TBD). Все существующие отклики не теряются — они привязаны к order_id, не l2. |
| Reopen после T2 c активными мастерами | T9 push'ит мастеров, которые были `withdrawn` в T2 trigger 0026 — даём шанс откликнуться заново. Их статус остаётся `withdrawn` (история), они создают новый отклик. |
| Reopen после T7 | То же — мастера с `withdrawn` получают push, могут создать новый отклик. |

---

## §10. Защита (RLS + RPC permissions)

### RLS policies — нужно обновить

| Policy | Изменение | Зачем |
|---|---|---|
| `orders_owner_change_status_in_progress` | Расширить WITH CHECK: `status IN ('cancelled', 'completed', 'awaiting_confirmation', 'disputed')` | Чтобы клиент мог напрямую `confirm_completion` (хотя предпочтительно через RPC). |
| `orders_picked_master_can_complete` | **DROP**. Заменяем на RPC `mark_order_done`. | Прямой UPDATE мастером в `completed` теперь запрещён — только через RPC, чтобы пройти `in_progress → awaiting_confirmation`. |
| NEW `orders_read_with_history` | SELECT включает `awaiting_confirmation`, `disputed` для clients/picked_masters | Чтобы видеть свои dispute/awaiting в /orders. |

### RPC (все SECURITY INVOKER, кроме cron функций)

| RPC | Кто вызывает | Что делает |
|---|---|---|
| `accept_response(p_response_id)` | client | Existing (T3). Дополнить: пишет `picked_at`, `last_activity_at`. |
| `reject_response(p_response_id)` | client | Existing (sprint 26). Без изменений. |
| `withdraw_response(p_response_id)` ⭐ | master | NEW (T15). Только из `sent/viewed`. |
| `mark_order_done(p_order_id)` ⭐ | master (picked) | NEW (T8). `in_progress → awaiting_confirmation`. |
| `confirm_completion(p_order_id)` ⭐ | client | NEW (T4/T5). `in_progress | awaiting_confirmation → completed`. |
| `open_dispute(p_order_id, p_reason)` ⭐ | client OR picked_master | NEW (T10/T12). Любая сторона из `in_progress | awaiting_confirmation`. |
| `reopen_order(p_order_id)` ⭐ | client | NEW (T9). Из `cancelled | expired` в окне 7 дней. |
| `expire_old_orders()` | cron | Existing (T7). |
| `auto_confirm_completions()` ⭐ | cron | NEW (T11). |
| `cancel_stale_in_progress()` ⭐ | cron | NEW (T13). |
| `send_lifecycle_reminders()` ⭐ | cron | NEW (notifications cascade). |

---

## §11. Открытые вопросы (для product/design согласования)

1. **TTL `open` без откликов:** 14 дней — соответствует benchmark Profi.ru/YouDo. Подтвердить?
2. **TTL `awaiting_confirmation`:** 72 часа — соответствует YouDo СБР. Альтернатива — 48 часов. Подтвердить?
3. **TTL stale `in_progress`:** 30 дней — на основе TaskRabbit/Airbnb. Альтернатива — 60 дней (более мягко). Подтвердить?
4. **Окно отзыва:** 14 дней (как Airbnb). Альтернатива — 30 дней. Подтвердить?
5. **Reopen окно:** 7 дней. Подтвердить?
6. **Кто может пометить «выполнено» первым:** только мастер (текущий план) ИЛИ обе стороны (клиент может «я подтверждаю выполнение» сразу из `in_progress`)? **Рекомендация: оба.** Мастер → `mark_order_done` (T8 в `awaiting_confirmation`), клиент → `confirm_completion` напрямую (T4) без промежуточного состояния. Это покрывает оба сценария (мастер не отметил, но клиент готов закрыть).
7. **Удаление клиента/мастера:** оставлять CASCADE (текущее) или SET NULL с пометкой «[удалённый юзер]»? **Рекомендация: SET NULL для clients, оставить CASCADE для masters.** Клиента-историю важно сохранить для дисциплины платформы; удалённого мастера в `picked_master_id` уже обрабатываем как SET NULL.
8. **Penalty thresholds (§8):** конкретные числа — 3, 5, 7 — на каком основании? Это эмпирические значения, нужно фиксировать в коде с возможностью править админу. Хранить в `app_settings` таблице. **TODO sprint TBD.**

---

## §12. План реализации (3 части)

### Часть 1 — Этот документ (выполнено)
- Аналитика + research + дизайн state-machine.
- Согласование TTL и политик с пользователем (открытые вопросы §11).

### Часть 2 — Backend
- Миграция 0071: ALTER `order_status` ENUM + новые колонки (`picked_at`, `master_marked_done_at`, `completed_at`, `awaiting_confirmation_until`, `last_activity_at`, `cancelled_by`, `cancel_reason`, `dispute_opened_by`, `dispute_reason`, `disputed_at`, `resolved_at`, `resolved_by`, `resolution_kind`, `completion_kind`).
- Миграция 0072: table `order_status_log` + trigger `trg_log_order_status_change`.
- Миграция 0073: RPC `withdraw_response`, `mark_order_done`, `confirm_completion`, `open_dispute`, `reopen_order`.
- Миграция 0074: новые cron jobs (`auto_confirm_completions`, `cancel_stale_in_progress`, `send_lifecycle_reminders`).
- Миграция 0075: RLS policies обновление + new policies для `awaiting_confirmation/disputed`.

### Часть 3 — Frontend
- Хуки: `use-withdraw-response`, `use-mark-order-done`, `use-confirm-completion`, `use-open-dispute`, `use-reopen-order`.
- UI: status pills/badges для новых статусов в `OrderRow`, `OrderHeader`, `OrderDetail`.
- CTA-кнопки в `/orders/[id]`: 
  - Master: «Отозвать отклик» (`sent/viewed`), «Работа выполнена» (`in_progress`).
  - Client: «Подтвердить выполнение» (`in_progress/awaiting_confirmation`), «Оспорить» (`awaiting_confirmation`), «Возобновить» (`cancelled/expired` в окне 7d).
- BottomSheet «Оспорить заказ» с reason-формой.
- Обновить `MasterDashboardOrders.isActiveResponse` и `useMyResponses` под новые статусы.
- Empty/loading/error states для всех новых сценариев.

### Часть 4 — Документация
- Обновить `docs/order-states.md` (или DEPRECATED-стаб, указывающий на `lifecycle.md`).
- Обновить `docs/chat-states.md` под `awaiting_confirmation`/`disputed`.
- Записи в `STATUS.md` + `SESSION_SUMMARY_2026-05-16.md`.
- Возможно, новый doc `docs/lifecycle-rpc-reference.md` со всеми signatures.

---

## §13. Ссылки

- [`order-states.md`](./order-states.md) — текущая (узкая) state-machine, T1–T7. Будет помечена DEPRECATED после миграций.
- [`chat-states.md`](./chat-states.md) — производные состояния чата.
- [`location-system.md`](./location-system.md) — гео-логика (не связана напрямую, но мастер-фид зависит от status='open').
- [`PRODUCT_CONTEXT.md`](../PRODUCT_CONTEXT.md) — продуктовый контекст.
- Research summary (research agent 2026-05-16) — справочно про Profi.ru, YouDo, TaskRabbit, Thumbtack, Airbnb.
