# Выкладка сборки в TestFlight — пошагово

> Для агента, который делает это впервые. Стратегия и устройство сборки —
> `docs/MOBILE_RELEASE_STRATEGY.md` §«Сборка на GitHub Actions». Здесь —
> порядок действий и грабли, на которых мы уже спотыкались.
>
> DECISION владельца (2026-09-04): после зелёного гейта собирать и выкладывать
> **без вопросов**. Разрешение нужно только на подачу версии в App Store и
> другие необратимые действия.

## 0. Что это вообще

Сборку делает GitHub Actions на macOS-раннере, загружает в App Store Connect
и публикует в группу TestFlight. Ни Mac владельца, ни EAS-облако не
участвуют. Всё запускается с VDS одним запросом к GitHub API.

## 1. Перед сборкой

1. Правки закончены, `npm run quality:check` в корне **после последней
   правки** — зелёный. Результат проверки до более позднего изменения
   недействителен.
2. Поднять номер сборки в `app.json` → `expo.ios.buildNumber` на +1 от
   последнего **загруженного** (`release/production.json` →
   `latestUploadedBuildNumber`). Номер должен быть больше всех, что уже есть
   в App Store Connect, иначе гейт версий в CI остановит прогон.
3. Коммит. **`app.json` ставится в индекс явно**: `git add app.json`.
   Проверить: `git show HEAD:app.json | grep buildNumber`.
4. Пуш в обе ветки: `git push origin master && git push origin master:main`.
   Сценарий запускается от `main`.

## 2. Проверить очередь и запустить

```sh
TOKEN=$(cat /root/.config/xtrud/github-token)
# 1) есть ли уже ожидающий прогон
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.github.com/repos/killianche/xtrud/actions/workflows/ios.yml/runs?per_page=3"
# 2) запуск
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/killianche/xtrud/actions/workflows/ios.yml/dispatches \
  -d '{"ref":"main","inputs":{"notes":"Что нового для тестировщиков","group":"e7311a74-0939-4f53-aca3-fe8e71bde95b"}}'
```

`notes` — текст «Что нового», его читает владелец в TestFlight: по-русски,
человеческим языком, что проверять. `group` — «Друзья и знакомые».

## 3. Дождаться и записать результат

Сборка идёт ~20 минут, обработка в App Store Connect ещё 5–15. Опрос запускать
фоновой командой, не блокируя работу:

```sh
# статус прогона
curl -s -H "Authorization: Bearer $TOKEN" \
  https://api.github.com/repos/killianche/xtrud/actions/runs/<RUN_ID>
# состояние сборок в App Store Connect (ключ — /root/.config/xtrud/asc.json)
node /tmp/.../scratchpad/asc48.mjs   # печатает «сборка: N | VALID»
```

Когда в App Store Connect появилось `VALID`:

1. `release/production.json` → `latestUploadedBuildNumber` = этот номер.
   **Только после VALID**, не заранее.
2. Коммит `chore(release): сборка N выложена (ledger N)` и пуш.
3. Сообщить владельцу: номер сборки, что в ней проверять, что не работает.

## 4. Грабли (все были на самом деле)

| Что случилось | Почему | Как не повторить |
|---|---|---|
| Сборки 39 и 40 не собрались | `git add -A src app` не захватывает корневой `app.json`, в коммит ушёл старый номер | всегда `git add app.json` и проверка `git show HEAD:app.json` |
| Сборка 47 исчезла | у сценария одна очередь (`concurrency: ios-testflight`); новый запуск **отменяет ожидающий** | перед запуском смотреть список прогонов; если один уже ждёт — дождаться или свернуть правки в одну сборку |
| Ledger обогнал реальность | номер записали до загрузки | писать `latestUploadedBuildNumber` только после `VALID` |
| Сборка собралась, но падала на устройстве | гейт прошёл до последней правки | `quality:check` строго после последней правки |
| p12 «hasn't been imported» | сертификат перепакован OpenSSL 3 | экспорт только с `openssl pkcs12 -export -legacy` |

## 5. Где что лежит

- Сценарий: `.github/workflows/ios.yml`; профиль `production-local` в `eas.json`.
- Токен GitHub: `/root/.config/xtrud/github-token` (0600, в Git не попадает).
- Ключ App Store Connect: `/root/.config/xtrud/asc.json`, подпись — `ios-signing/`.
- Журнал версий: `release/production.json`. План работ: `TASKS.md`.
- Группа TestFlight «Друзья и знакомые»: `e7311a74-0939-4f53-aca3-fe8e71bde95b`.

## 6. Чего делать нельзя без слова владельца

- Подавать версию в App Store на проверку и отзывать заявку.
- Менять DNS, удалять данные, менять модель продукта.
- Публиковать сборку в другие группы TestFlight.
