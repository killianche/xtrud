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

### ⚠️ Симптом «превью не открывается / белый экран» — bundle 404 после rebuild

**Симптом:** браузер открывает `http://localhost:8082/`, получает HTML (200), но JS-bundle отдаётся 404 → React не гидратирует → пустой `#root` → пользователь видит белый экран или зависший «загружается».

**Подтверждение:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/                    # 200
ls dist/_expo/static/js/web/                                                       # entry-XYZ.js существует
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8082/_expo/static/js/web/entry-XYZ.js  # 404 ← БАГ
```

И в логах сервера видно `shell-init: error retrieving current directory: getcwd: cannot access parent directories: Operation not permitted`.

**Причина.** `scripts/dev-web-local.mjs` запускает `npx serve dist -s` как долгоживущий процесс. Watcher на каждое изменение делает `Cleaning dist/...` (rm-rf) + `expo export` (создаёт `dist/` заново). Inode папки меняется. Старый `serve`-процесс держит ссылку на удалённую inode, теряет cwd и перестаёт отдавать файлы с новыми хешевыми именами. `index.html` ещё успевает кэшироваться в памяти serve, но новый bundle URL — 404.

**Фикс.** Рестарт serve-процесса:

```ts
mcp__Claude_Preview__preview_stop({ serverId: "..." })
mcp__Claude_Preview__preview_start({ name: "xtrud-web" })
```

`preview_start` сделает чистый initial build + новый serve, и bundle снова отдаётся 200.

**НЕ делать:**
- Не пытаться «починить» через F5 / shift+F5 / cache clear — бандл реально 404, никакой clear не поможет.
- Не запускать второй serve через Bash «параллельно» — будет порт-конфликт.
- Не редактировать `scripts/dev-web-local.mjs` чтобы перезапускать serve на каждом rebuild без необходимости — это редкий race-кейс, и постоянный рестарт сломает HMR-experience и добавит ~1s к каждому save'у. Лучше рестарт по факту проблемы.

**Чек перед тем как сказать «превью сломано»:** 30 секунд curl-проверки `index` vs `bundle` сразу показывает где именно собака зарыта. Не гадать.

## Чек-лист перед каждым screenshot'ом

- [ ] `preview_list` — какой сервер активен и его serverId?
- [ ] Это dev-сервер (HMR), а не production-bundle?
- [ ] `preview_eval` подтверждает, что в DOM есть текст из последних правок?
- [ ] Только теперь — `preview_screenshot`.
