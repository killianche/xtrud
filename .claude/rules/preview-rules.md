# Preview / dev-серверы (приоритет 1, инфра)

## TL;DR

**Никогда не запускай dev-сервер через `Bash` (даже с `run_in_background`).** Только через MCP-инструмент `mcp__Claude_Preview__preview_start` с именем из `.claude/launch.json`. Иначе сервер запускается в браузере вне моей видимости, у пользователя оказывается **два сервера** в Claude Preview UI, и я начинаю снимать скриншоты не с того.

## Почему это критично

В Claude Preview UI пользователя видны только серверы, запущенные через `preview_start`. Если я запускаю `expo start --web --port 8082` через `Bash run_in_background`:

1. Сервер реально стартует и слушает порт.
2. Но в `preview_list` он **не появляется**, либо появляется с задержкой и без управления через UI.
3. Если в `.claude/launch.json` уже есть конфиг `xtrud-web` — он живёт «отдельно», и пользователь видит **два сервера** в панели.
4. Возникает каша: я могу подключиться к prod-bundle (`xtrud-web-prod`), а пользователь смотрит на dev (`xtrud-web`) — и наоборот. Скриншоты, что я снимаю, не совпадают с тем, что видит пользователь.

## Контракт

### Запуск сервера

```ts
// ✅ Правильно
mcp__Claude_Preview__preview_start({ name: "xtrud-web" })

// ❌ Неправильно
Bash({ command: "npx expo start --web --port 8082", run_in_background: true })
Bash({ command: "npm run web", run_in_background: true })
```

Если нужного конфига нет в `.claude/launch.json` — **сначала добавляю конфиг**, потом запускаю через `preview_start`. Не запускать через Bash «временно».

### Если сервер уже работает

`preview_start` идемпотентен — переиспользует уже запущенный сервер. Не нужно сначала проверять `preview_list`, потом запускать. Просто вызвать `preview_start({ name: "..." })`.

### Один проект — один активный сервер

В `.claude/launch.json` для xtrud две конфигурации:
- **`xtrud-web`** — `node scripts/dev-web-local.mjs`. Это watch-режим: `expo export` + sed-патч на `import.meta` + `serve dist`. Пересобирает на изменение исходников. **Используется по умолчанию для разработки.** F5 в браузере для актуализации (HMR нет — `expo start --web` сломан в SDK 54).
- **`xtrud-web-prod`** — однократный `build-web-local.mjs && serve dist`. Без watch'а. **Только для проверки production-сборки.**

Если у пользователя в UI висят оба и я не уверен — запрашиваю остановку лишнего перед screenshot'ом. Не снимаю скриншоты «вслепую» — сначала через `preview_eval` проверяю, что DOM содержит ожидаемый текст из последних правок.

### ⚠️ КРИТИЧНО: не запускать `expo start --web` напрямую

Expo SDK 54 web dev-server отдаёт bundle с `import.meta` ссылками, который грузится в HTML как classic `<script>` (без `type="module"`) → **SyntaxError при parse, весь bundle тихо отказывает, чёрный экран, ноль ошибок в console**. Симптомы:
- HTML отдаётся (200), `<div id="root"></div>` пустой.
- `__BUNDLE_START_TIME__` undefined в `preview_eval`.
- Console пустой.
- Bundle URL содержит `transform.engine=hermes&unstable_transformProfile=hermes-stable`.

Диагностика: `await fetch(bundleUrl).then(r=>r.text()).then(t=>new Function(t)())` ловит `SyntaxError: Cannot use 'import.meta' outside a module`.

**Решение:** только через `node scripts/dev-web-local.mjs` (или `npm run web:dev`). Скрипт `expo export` + sed заменой `<script>` → `<script type="module">`. Это единственный надёжный путь сейчас. Не пытаться поправить `expo start --web` через флаги — известная проблема SDK 54, фикса не было.

### Диагностика «изменений не видно»

Чек-лист, прежде чем сваливать на «Metro кэш»:

1. **Какой serverId я дёргаю?** — `preview_list` → matched ли name dev-конфигу?
2. **Что в DOM?** — `preview_eval` → `document.body.innerText.includes("ключевая фраза из правки")` → `true`?
3. **Если в DOM старый текст и serverId == prod-конфиг** — переключиться на dev (`preview_start xtrud-web`) и снять скриншот оттуда. Не пытаться чистить SW / cache в prod-bundle.
4. **Если в DOM старый текст на dev-сервере** — это реально Metro кэш. `preview_start` с `--clear` в args (или попросить пользователя нажать `r` / `shift+r` в терминале).

### Никаких параллельных запусков через Bash

Если случайно запустил dev-сервер через Bash — немедленно убить через TaskStop и перезапустить через `preview_start`. Иначе будет два процесса на одном порту → конфликты, либо два сервера в UI пользователя.

### ⚠️ Симптом «Index of dist/» / белый экран / bundle 404 после rebuild (ИСПРАВЛЕНО 2026-05-22)

> **TL;DR для агента:** этот баг **исправлен в `scripts/dev-web-local.mjs`** — staged-сборка в `dist_next` + атомарный своп + рестарт serve. Если ты всё же видишь «Index of dist/» или белый экран — почти наверняка запущен СТАРЫЙ watcher-процесс (поднятый до фикса). Просто **перезапусти preview-сервер** (`preview_stop` + `preview_start`), чтобы загрузился исправленный скрипт. НЕ возвращай `rm -rf dist` в watcher.

**Симптом:** браузер открывает `http://localhost:8082/` и получает **листинг каталога «Index of dist/»** (пустой `<ul id="files">`), либо HTML 200 но JS-bundle 404 → React не гидратирует → белый экран / зависший «загружается».

**Подтверждение:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/                    # 200
ls dist/_expo/static/js/web/                                                       # entry-XYZ.js существует
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/_expo/static/js/web/entry-XYZ.js  # 404 ← БАГ
```

И в логах сервера видно `shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted`.

**Причина (корневая).** `npx serve` делает **chdir ВНУТРЬ** обслуживаемой папки. Старая версия watcher'а на каждое изменение делала `rm -rf dist` + `expo export` (пересоздаёт `dist/`) **под живым serve** → рабочая директория serve исчезала → он терял cwd (в логах `getcwd: ... Operation not permitted`) и начинал отдавать **листинг каталога «Index of dist/»** или 404 на bundle вместо приложения.

**Как исправлено (2026-05-22).** `scripts/dev-web-local.mjs` теперь:
1. Собирает в **staging-папку `dist_next`** (через `WEB_OUTPUT_DIR=dist_next` для `build-web-local.mjs`) — живой serve всё это время продолжает отдавать СТАРЫЙ `dist`, **без простоя во время сборки**.
2. После сборки — гасит serve, делает атомарный своп `rm -rf dist && mv dist_next dist`, поднимает **свежий serve** на новый `dist`.

serve больше **никогда не живёт в момент удаления своей папки** → «Index of dist/» не возникает. Окно недоступности — только ~1с на своп+рестарт, а не на всю (долгую) сборку. Проверено: 60с опроса через полную пересборку → 0 листингов, сервер отдаёт приложение.

**Если всё-таки увидел «Index of dist/» / белый экран / bundle 404** (например, запущен СТАРЫЙ watcher-процесс, поднятый до фикса) — перезапусти preview-сервер, чтобы загрузился исправленный скрипт:

```ts
mcp__Claude_Preview__preview_stop({ serverId: "..." })
mcp__Claude_Preview__preview_start({ name: "xtrud-web" })
```

**НЕ делать:**
- Не пытаться «починить» через F5 / shift+F5 / cache clear — бандл реально 404/листинг, никакой clear не поможет.
- Не запускать второй serve через Bash «параллельно» — будет порт-конфликт.
- **Не возвращать прямой `rm -rf dist` в watcher-пересборку** — именно он ронял serve. Пересборка watcher'а ОБЯЗАНА идти в `dist_next` + своп (см. `runBuild()` в `scripts/dev-web-local.mjs`).

**Чек перед тем как сказать «превью сломано»:** 30 секунд curl-проверки `index` vs `bundle` сразу показывает где именно собака зарыта. Не гадать.

### ⚡ Скорость пересборок: `--clear` только на первой сборке (НЕ на каждой)

**Симптом:** «превью долго загружается» — каждое изменение кода = ~33с ожидания.

**Причина:** `--clear` сбрасывает Metro transform-кэш. Если он стоит на КАЖДОЙ пересборке — каждый раз cold-build всех ~6500 модулей (~27–33с).

**Как сделано (2026-05-23):** `--clear` нужен только на ПЕРВОЙ сборке сессии (иначе `EXPO_PUBLIC_ENABLE_DEMO` может заинлайниться из чужого кэша как false → demo-вход сломан). Поэтому:
- Initial build watcher'а и prod-сборка (`build-web-local.mjs` напрямую) → `--clear` (cold, ~27с, один раз).
- Пересборки watcher'а → `WEB_SKIP_CLEAR=1` → тёплый кэш → **~3с** (×10 быстрее).

Замер: первая сборка 27390ms, пересборки 3188/2736/3028ms.

**НЕ делать:** не добавлять `--clear` в watcher-пересборку (`runBuild` в `dev-web-local.mjs`) — вернёшь 33с на каждое сохранение. Первая сборка сессии и так с `--clear` — этого достаточно для корректного demo-флага.

## Чек-лист перед каждым screenshot'ом

- [ ] `preview_list` — какой сервер активен и его serverId?
- [ ] Это dev-сервер (HMR), а не production-bundle?
- [ ] `preview_eval` подтверждает, что в DOM есть текст из последних правок?
- [ ] Только теперь — `preview_screenshot`.
