---
name: xtrud-db-migration
description: Изменить рабочую базу xtrud (PostgreSQL на Beget): новая таблица, функция, RLS, триггер, правка данных, расширение каталога категорий. Использовать для любого SQL, который пишет в production, и перед правкой функций admin_*, pick/complete, уведомлений, каталога.
---

# Изменение рабочей базы

База — источник правды; цепочка `supabase/migrations/` обрывается на 0133, новые миграции живут в `supabase/migration-drafts/NNNN_*.sql`. Доступ: `ssh -o BatchMode=yes root@217.114.8.196 "docker exec -i supabase-db psql -U postgres ..."`.

## Порядок

1. **Снять живое состояние, не вспоминать.** `pg_get_functiondef`, `pg_get_constraintdef`, `information_schema.columns`, `enum_range(null::<тип>)`. Новую функцию писать от живого тела.
2. Черновик `migration-drafts/NNNN_*.sql`: шапка с решением владельца, «было/стало», откат; `BEGIN … COMMIT`; если меняются таблицы/функции для API — в конце `NOTIFY pgrst, 'reload schema';`.
3. Резервная копия: `pg_dump -n public -n xtrud_api -Fc > /opt/xtrud/backups/pre-NNNN-<ts>.dump`.
4. Пробный прогон с откатом: тело без BEGIN/COMMIT внутри `BEGIN; … ROLLBACK;`, проверки под ролью пользователя:
   `select set_config('request.jwt.claims', json_build_object('sub','<uuid>','role','authenticated')::text, true); SET LOCAL ROLE authenticated;`
   ожидаемые отказы — через `SAVEPOINT x; … ROLLBACK TO x;`. Проверить: админ/не админ/гость, RLS, гранты.
5. Применить: `psql -v ON_ERROR_STOP=1 -q < file`, проверить SELECT-ом и через API (`https://api.xtrud.pro/v2/rest/...`).
6. Изменения доступа — сначала ревью роли xtrud-security. Новые таблицы/функции для приложения — в белые списки `server/src/rest/routes.ts` / `server/src/rpc/routes.ts` и в `src/types/database.ts` (ведётся вручную).

## Ловушки

- **Угаданные имена роняли прод:** `blocked`/`banned`, `open`/`pending`, `rating_overall`/`rating`, `responses`/`order_responses`, `categories`/`categories_l2`, `photos`/`photo_urls`, `l3_id`/`l3_ids`. Сначала посмотри.
- **CHECK-ограничения:** `orders.completion_kind` — только `client_direct|client_confirmed|auto_confirmed|support_resolved`; `admin_actions.action`/`target_type` — переписывать полным живым списком плюс новые значения.
- **Гость видит все колонки**, если дать `GRANT SELECT` на таблицу. Давай `GRANT SELECT (кол1, кол2…)`.
- **Каталог:** после миграции `EXPO_PUBLIC_API_URL=https://api.xtrud.pro npm run catalog:generate`, затем `npm run catalog:check`. В каталоге запрещены строки `price`, `http`, `supabase` (id `va-prices` уронил проверку). Иконки разделов/категорий — только из `src/lib/category-icons.ts`, имя должно существовать в phosphor-react-native.
- `ON CONFLICT DO NOTHING` молча пропускает совпавшие id — проверь новые id на занятость до применения.
- Триггер `guard_order_lifecycle_direct_update` запрещает менять статус в обход RPC; переходы делать внутри SECURITY DEFINER-функций.
