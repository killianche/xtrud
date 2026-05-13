# Supabase advisors audit — 2026-05-12 (Sprint A)

**TL;DR.** Прогнаны Security + Performance advisors на проде. Реально критичные находки — 2 unindexed FK — закрыты миграцией 0025. Остальные 50+ предупреждений — false positives или приемлемые trade-offs, задокументированы здесь как «known + игнорируем».

---

## Security (после фикса)

| Линт | Count | Решение |
|---|---|---|
| `auth_allow_anonymous_sign_ins` | 22 | **Игнорируем — false positive.** В проекте phone-OTP, Anonymous Sign-ins в Auth Settings выключены. Lint срабатывает на policy без явного `TO authenticated` ограничителя, но `auth.uid()` для анонима возвращает NULL → доступа всё равно нет. Чтобы убрать — пришлось бы переписать 22 policy с добавлением `TO authenticated`, риск > выгода. |
| `auth_leaked_password_protection` | 1 | **N/A.** Нет паролей в phone-OTP flow. Можно включить позже если добавим email/password логин. |

---

## Performance (после фикса)

### Закрыто

| Линт | Действие |
|---|---|
| `unindexed_foreign_keys: messages.sender_id` | Миграция 0025 → `messages_sender_id_idx` |
| `unindexed_foreign_keys: order_responses.l2_id` | Миграция 0025 → `order_responses_l2_id_idx` |

### Намеренно игнорируем

| Линт | Count | Причина |
|---|---|---|
| `unused_index` | 25 | Индексы созданы превентивно под планируемые запросы (filter by city, by master_id и т.д.). На текущей нагрузке (десятки строк) ни один запрос ещё не покрылся ими — отсюда «unused». Удалять = premature reverse-optimization: при росте трафика придётся создавать заново. Пересматриваем при ≥10k активных юзеров. |
| `multiple_permissive_policies` на `orders` UPDATE | 4 (по ролям) | 3 policy на UPDATE (`orders_owner_edit_open` + `orders_owner_change_status_in_progress` + `orders_picked_master_can_complete`). Объединение в одну OR-policy сэкономит ~2 policy evaluation на UPDATE, но **сильно усложнит логику** (3 разных USING + 3 разных WITH CHECK) и легко даст regression в RLS. Пользы на free-tier с малым трафиком — копейки, риск — высокий. Оставляем как есть до момента, когда EXPLAIN покажет реальный bottleneck. |

---

## Контракт для следующего advisor-run

Следующий прогон делается **перед каждым крупным релизом** или **после каждой миграции, добавляющей RLS-policy / FK / тригер**. Команда:

```
mcp get_advisors(type=security)
mcp get_advisors(type=performance)
```

Что ожидать:

- ✅ `unindexed_foreign_keys` — должен быть **0**. Если новый FK добавлен — сразу создаём индекс.
- ⚠️ Новый `multiple_permissive_policies` — звоночек: добавили лишнюю policy, можно ли её слить с существующей?
- ℹ️ `unused_index` — растёт, это нормально пока трафик низкий.
- 🚨 Любые WARN/ERROR на security — реальный риск, разбираем сразу.

---

## Ссылки

- `supabase/migrations/0025_advisor_fk_indexes.sql` — миграция этого спринта
- [Supabase database advisors docs](https://supabase.com/docs/guides/database/database-advisors)
