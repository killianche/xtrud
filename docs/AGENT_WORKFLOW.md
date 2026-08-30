# Agent workflow — источники, Git и версии

## TL;DR

Исходники xtrud живут в одном локальном Git-репозитории и в `origin/main`.
Production web, EAS/App Store и Supabase — производные состояния. Агент сначала
устанавливает источник истины и границы задачи, затем делает одну логическую
правку, проверяет её и только по явной команде выполняет внешнее действие.

## 1. Приоритет источников

При конфликте используй первый применимый источник сверху:

1. Текущий явный запрос владельца и системные ограничения среды.
2. Фактический исполняемый код/config и read-only состояние нужного внешнего
   сервиса на момент проверки.
3. Профильный канонический документ, указанный в `AGENTS.md`.
4. Верхний актуальный блок `STATUS.md`.
5. `SESSION_SUMMARY_*.md`, старые разделы `STATUS.md`, legacy-документы и
   комментарии — только история, пока не подтверждены кодом.

Специальные tie-breaker'ы:

- текущая модель заказов — `docs/SIMPLE_FLOW.md`, а не lifecycle/chat legacy;
- product scope — `src/lib/product-scope.ts` плюс фактическая БД;
- дизайн — актуальные override'ы `DESIGN.md` и design-rules; основной шрифт
  системный;
- аватар — `src/lib/avatar.ts`: настоящее фото или инициалы, не DiceBear;
- Caddy production — live `/etc/caddy/Caddyfile`, а файлы `deploy/Caddyfile*`
  являются reference;
- production backend — live schema/ACL/RLS плюс Git migrations. Пока они не
  сверены, ни один из этих двух источников по отдельности не считается полным.

Если конфликт влияет на поведение, безопасность, релиз или удаление данных — не
угадывай. Останови опасное действие, покажи обе версии и запроси решение.

### Контракт доказательности: никаких догадок

Каждое утверждение, от которого зависит продукт, архитектура, безопасность,
данные, стоимость или релиз, должно иметь один из трёх статусов:

1. **FACT** — подтверждено исполняемым кодом, автоматической проверкой,
   read-only состоянием внешнего сервиса или актуальным первичным источником;
2. **DECISION** — явно принято владельцем и записано в каноническом документе;
3. **UNKNOWN** — пока не подтверждено; указывается вместе со способом проверки
   и блокирует только зависящее от него опасное действие.

Правдоподобное предположение не становится FACT. Нельзя угадывать IP, DNS,
S3 endpoint/region, секреты, тариф, нагрузку, SLO, store state, live schema,
юридический допуск категории или поддержку платформы. Шаблон может содержать
явный placeholder, но runtime validator обязан его отвергать. Если read-only
проверка доступна — сначала выполни её; если недоступна — сохрани `UNKNOWN`, не
маскируй его дефолтом.

## 2. Начало любой задачи

1. Убедись, что cwd — `/Users/ruslancherbizhev/Desktop/xtrud`.
2. Прочитай `AGENTS.md`, верх `STATUS.md` и профильные документы.
3. Выполни `git status --short --branch`, `git remote -v` и определи, какие
   изменения существовали до задачи.
4. Назови свою зону владения. Не форматируй и не «улучшай» соседние файлы.
5. Для крупной задачи раздели непересекающиеся зоны по
   `.claude/rules/agent-delegation.md`; каждый агент сохраняет чужие изменения.
6. Для изменяемого внешнего состояния сначала сделай разрешённую read-only
   проверку и определи rollback/backup.

## 3. Git без неправильных копий

- `origin/main` — единственная долговременная линия поставки. Dirty local —
  рабочее состояние, а не релиз.
- Ветка агента по умолчанию — `codex/<короткая-тема>`. Создание ветки, commit и
  push выполняются только в пределах разрешения владельца.
- Не используй `git add .` при смешанном worktree. Используй явные пути и
  `git add -p`, затем обязательно `git diff --cached`.
- Не применяй `git reset --hard`, `git clean`, `git checkout --`, непросмотренный
  `stash -u` или `pull` поверх dirty worktree.
- Если `origin/main` ушёл вперёд: сначала сохрани свою работу, получи свежий
  remote ref, затем rebase/merge в чистом состоянии и повтори проверки.
- `dist/`, `.expo/`, `node_modules/`, сгенерированные `ios/`/`android/` и VPS-root
  не являются альтернативными копиями исходников.

Логический commit содержит одну причину изменения. Версии, toolchain, web build,
CI, deploy, product docs и agent governance не смешиваются в один commit.

## 4. Совместимость версий

### JavaScript и Expo

- Версия Node берётся из `.nvmrc`, ограничение — из `package.json`, точное дерево
  npm — из `package-lock.json`.
- Установка для проверки воспроизводимости — `npm ci`, не ручное редактирование
  `node_modules`.
- Expo SDK и совместимые Expo packages меняются одной логической единицей и
  проверяются Expo Doctor, typecheck и целевыми сборками.

### Web

- Источник — тот же Git SHA, что у mobile; отдельной web-копии кода нет.
- Канонические production host/path/domains/backend и опубликованные store
  numbers находятся в `release/production.json`; deploy/build не принимают
  расходящийся полный backend URL или VPS override.
- Preview и production имеют разные явные build modes. Production не должен
  содержать demo-вход.
- Web deploy допустим только из clean `main`, совпадающего с `origin/main`, по
  явной команде владельца. Push сам по себе deploy не запускает.
- Deployed `release.json`/хэши подтверждают происхождение артефакта, но не
  заменяют Git.

### iOS и Android

- Marketing version и локальные platform versions задаются Expo config
  (`app.json`); EAS-профили и стратегия build numbers — `eas.json`.
- Marketing version нельзя уменьшать относительно последней опубликованной,
  даже если build number увеличен.
- Каждый store submission получает новый build number/versionCode. Один номер
  должен однозначно сопоставляться с Git SHA и EAS build ID.
- Перед iOS/Android submission обязательно выполнить соответственно
  `npm run store:check:ios` или `npm run store:check:android`: повтор уже
  опубликованного номера блокируется.
- Игнорируемые native-каталоги генерируются из Expo config. Не переносить из них
  version/entitlement обратно без проверки config plugin/source.
- EAS build и store submission — два разных внешних действия; оба требуют явной
  команды. Опубликованный binary неизменяем и является производным релизом.

### Backend

- Schema change создаётся новой forward-only migration; уже применённые
  migration-файлы не переписываются.
- Перед первой следующей production migration: backup/PITR, live read-only dump
  schema/policies/grants/functions/buckets и сверка migration ledger.
- Edge Functions версионируются в Git и деплоятся отдельно. Успешный push не
  означает database/function deploy.
- Клиент, web и backend совместимы только если API/RPC/columns остаются
  backward-compatible на время раскатки. Breaking change требует порядка:
  additive backend -> совместимый client/web -> наблюдение -> удаление legacy.

## 5. Release gate

Базовая команда перед передачей любой осмысленной правки:

```bash
npm run quality:check
```

Перед предложением web release дополнительно:

```bash
npm run release:check
```

`release:check` читает актуальный npm advisory registry и требует сеть, но не
делает deploy, EAS build, store submit или миграцию БД.

Перед предложением release должно быть подтверждено:

1. worktree чист или точно перечислены осознанные исключения;
2. релизный SHA существует в `origin/main`;
3. typecheck, тесты, design-token check и применимые platform checks прошли;
4. нет missing tracked assets/static requires;
5. production web собран без demo;
6. version/build number не повторяет уже опубликованный store build;
7. backend change имеет backup, forward migration и проверенный rollback-план;
8. секреты и локальные ключи не попали в staged diff;
9. внешнее действие отдельно подтверждено владельцем.

Production web/backend contract и store ledger меняются только осознанной
release-задачей в `release/production.json`; нельзя обходить их переменными
окружения или ручной правкой артефакта.

## 6. Завершение задачи

- Непосредственно перед итоговым отчётом перечитай исходный запрос, итоговый
  diff и затронутые файлы, затем повтори все применимые проверки после
  последней правки. Результат проверки до более позднего изменения не считается
  актуальным.
- Покажи изменённые файлы и проверки с реальными результатами.
- Отдельно перечисли неподтверждённые факты и внешние действия, которые не
  выполнялись.
- Обновляй профильный канонический документ, а не копируй правило в AGENTS,
  README, STATUS и role adapters одновременно.
- Для agent governance запусти
  `node scripts/governance/check-agent-config.mjs`.
