# Test fixtures для dev/local Supabase

⚠️ **Никогда не запускать на проде.** Все скрипты здесь инсертят фейковых
пользователей напрямую в `auth.users`, минуя phone-verification flow.

## chat-fixture.sql

Создаёт минимальный набор данных для Maestro chat smoke-test:

| Сущность | id | Детали |
|---|---|---|
| auth.users + public.users | `1111…` | client `+79991110001`, имя «Алина Клиентова», город Назрань |
| auth.users + public.users | `2222…` | master `+79992220002`, имя «Магомед Мастеров», is_master, plumbing |
| `master_profiles` | — | status=active, bio |
| `master_categories` | — | master ↔ plumbing |
| `orders` | `3333…` | «Замена смесителя», status=in_progress, picked=master |
| `order_responses` | `4444…` | status=accepted, 1500-2500₽ |
| `chats` | `5555…` | client ↔ master по order `3333…` |
| `messages` | — | 1 incoming от мастера |

### Запуск

```bash
# Через psql (нужен DATABASE_URL с service_role либо local supabase start).
psql "$DATABASE_URL" -f supabase/seed-test/chat-fixture.sql

# Или вставить целиком в SQL Editor локального Supabase Studio.
```

Скрипт **идемпотентный** — каждый запуск DELETE'ит предыдущих фейковых юзеров
по их id и пересоздаёт всё с теми же фиксированными UUIDs. Безопасно гонять
повторно.

### Очистка

```sql
delete from auth.users where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
-- CASCADE удалит public.users → master_profiles → orders → chats → messages.
```

### Зависимости

Скрипт ссылается на:
- `cities.id = 'nazran'` (из миграции 0001)
- `categories_l2.id = 'plumbing'` (из `supabase/seed/categories.sql`)

Если эти id отсутствуют — fixture упадёт на FK constraint. Прогон seed'ов
обязателен заранее.

### Используется в

- `.maestro/chat-smoke.yaml` → `.maestro/flows/06-chat.yaml`
