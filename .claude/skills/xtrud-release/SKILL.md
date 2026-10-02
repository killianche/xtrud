---
name: xtrud-release
description: Выложить сборку iOS в TestFlight (и при необходимости Android) после изменений в приложении. Использовать, когда правки готовы и надо «собрать», «выложить», «в тестфлайт», «новая сборка», а также когда сборка упала или не появилась у владельца.
---

# Выкладка сборки xtrud

Сборка и выкладка в TestFlight после зелёного гейта — обычная работа, разрешения не нужно (DECISION 2026-09-04). Подача версии в App Store — только по слову владельца.

## Порядок

1. `npm run quality:check` после последней правки. Падает только на «buildNumber N уже загружен» — подними `ios.buildNumber` в `app.json`.
2. Коммит явными путями, обязательно `app.json`. Пуш: `git push origin master master:main` (сборка идёт с `main`).
3. Список прогонов: `GET /repos/killianche/xtrud/actions/runs?per_page=3` (токен — `/root/.config/xtrud/github-token`). Если сборка в очереди — жди.
4. Запуск: `POST .../actions/workflows/ios.yml/dispatches` с `{"ref":"main","inputs":{"notes":"<что нового>","group":"e7311a74-0939-4f53-aca3-fe8e71bde95b"}}`. Android: `android.yml`, `{"profile":"android-test"}`.
5. Ждать завершения прогона (~20 мин), затем `node scripts/release/asc-build-status.mjs <номер>` → выход 0 = VALID.
6. Только после VALID: `release/production.json` → `latestUploadedBuildNumber`, коммит «chore(release): сборка N выложена (ledger N)».

## Ловушки

- **Очередь отменяет ожидающую сборку.** У группы `ios-testflight` одна ожидающая; новый запуск молча отменяет прежний ожидающий (потеряли сборку 47). Проверяй список прогонов перед запуском.
- **`app.json` не попал в коммит** — CI собирает со старым номером и падает на гейте (сборки 39–40).
- **Версия одобрена Apple — поезд закрыт.** Ошибки 90186/90062 «train version is closed». Подними `version` в `app.json`, `package.json` и двух корневых записях `package-lock.json`, обнови `latestPublishedVersion` в ledger, `npx biome format --write release/production.json`.
- **npm 404 на только что вышедшем пакете** внутри `eas build --local` (служебный модуль EAS берёт latest; сборка 112). Это не наш код: дождись, пока `curl -o /dev/null -w %{http_code} <tarball>` вернёт 200, и перезапусти.
- **Сборка «прошла», а группы нет.** Чтение `betaGroups` сразу после загрузки бывает устаревшим. Сверяй через `GET /v1/betaGroups/<id>/builds`, а не повторным добавлением.
- **Упавший номер пропускается**, не переиспользуется: следующая сборка — номер +1 от последнего в ASC.
- **Скрипты во временной папке пропадают между сессиями.** Пользуйся `scripts/release/*.mjs` из репозитория.
- Владелец не видит обновление — сначала `asc-build-status.mjs` (VALID, IN_BETA_TESTING), потом подсказать: обновить список в TestFlight, App Store мог заменить бету магазинной версией.
