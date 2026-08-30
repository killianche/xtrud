# Session summary — 2026-08-23

## TL;DR

Проведён полный read-only аудит клиентского кода, Supabase, Git/GitHub, VPS,
web, EAS, App Store и Android. Настроены воспроизводимые зависимости, разделены
preview/production web-сборки и укреплён deploy. Затем восстановлены production
export и зелёный quality gate, введены agent/version/migration/security guards.
Production, Supabase Cloud, GitHub и App Store не менялись.

## Закрытые задачи

1. Карта проекта — проверены `app/`, `src/`, data/state/auth flows, web/native
   различия и реальные функции продукта.
2. Backend — разобраны 128 миграций, Edge Functions, RLS/ACL patterns, Storage,
   типы и расхождения между Git и live-объектами.
3. Git — local `main` и `origin/main` были на `f5cff28`; обнаружен и сохранён
   pre-existing dirty-state, автоматических commit/push не выполнялось.
4. VPS — подтверждён настоящий хост `62.113.106.30`, Caddy и `/var/www/xtrud`;
   `85.198.86.41` исключён как чужой сервер.
5. Web — подтверждены одинаковые bundles на `xtrud.pro` и
   `xtrud.alanbani.ru`, последний deploy 2026-06-11 и demo-маркер в production.
6. iOS — EAS build 11 и опубликованная App Store 1.0.1 подтверждены; старое
   сомнение в `STATUS.md` закрыто новым верхним snapshot.
7. Android — подтверждено отсутствие EAS builds и Google Play listing.
8. Локальная среда — `node_modules` пересоздан через `npm ci`; Expo SDK 54
   зависимости подняты до рекомендованных patch-версий.
9. Проверки — Expo Doctor 18/18, TypeScript, 56 Vitest и design tokens проходят.
10. Build modes — `web:build:preview` вшивает demo, `web:build:production`
    гарантированно выключает demo; каждый export пишет `release.json`.
11. Deploy — добавлены clean-main/origin gates, фиксированный remote path,
    staging extraction, manifest validation, previous release и rollback.
12. CI — Node синхронизирован с EAS (20.18.0), добавлены tokens-check и
    production web export, чтобы ловить отсутствующие ассеты.
13. Product scope docs — исправлено противоречие: активны `construction` и
    `home-services`, как в коде и migration 0068.
14. Эксплуатационная документация — создан `PROJECT_OPERATIONS.md`.
15. Beget backend architecture — выбран отдельный VPS + отдельный S3 вместо
    установки Supabase на перегруженный web VPS.
16. Migration runbook — создан `docs/SUPABASE_BEGET_MIGRATION.md` с gates,
    acceptance criteria, iOS transition, cutover и rollback.
17. Infrastructure contract — добавлен `infra/supabase/` с pinned upstream
    release, env contract и Caddy template без production secrets.
18. Cross-platform rules — старый SDK52/Android-first документ полностью
    заменён актуальным контрактом SDK54 для web+iOS.
19. Production asset — `teplodom-banner.png` восстановлен из Git; cold export
    проходит, баннер реально запрашивается локальной production-сборкой.
20. Release gates — static assets и app/package/lock/iOS/EAS versions
    проверяются отдельными скриптами и в CI.
21. Biome — конфиг мигрирован на 2.5.10, dependency закреплена, весь проект
    приведён к 0 errors / 0 warnings; TypeScript и 56 тестов зелёные.
22. Agent governance — `AGENTS.md` превращён в короткую карту, добавлен
    `docs/AGENT_WORKFLOW.md`, девять Codex role adapters и автоматический gate.
23. Migration integrity — добавлены scanner, тесты, точный baseline 22 legacy
    проблем и PII-safe SQL/shell inventory для будущего live read-only экспорта.
24. Dependency security — безопасный `npm audit fix` убрал critical; оставшиеся
    20 SDK54/Metro advisories зафиксированы reviewable baseline до 2026-10-01.
25. Единые команды — `quality:check` для локальной передачи и `release:check`
    для полного web release gate без deploy.
26. Независимое release-review — закрыты обход host через env, deploy без полного
    gate, несовпадение полного backend URL, повтор store build numbers, изменяемая
    migration history и слишком широкий npm advisory baseline.
27. Инструментарий — Biome теперь проверяет `.mjs`; `@expo/env@2.0.12` объявлен
    прямой точной dependency production-builder. Полный `release:check` прошёл.
28. Финальные release-блокеры — backend проверяется как полный HTTPS root URL;
    оба canonical домена участвуют в rollback; iOS marketing version нельзя
    откатить при новом build number; эти сценарии закреплены gates/tests.
29. Agent entrypoints — `CLAUDE.md` сокращён до adapter к `AGENTS.md`, README
    ведёт туда же, а governance ограничивает размер и обязательные ссылки.

## Новые правила и решения

- Git `main` — единственный источник deploy; dirty worktree и непубличный SHA
  не выкладываются — `deploy/web.sh` — защита от случайных копий.
- Preview и production — разные явные build modes; production никогда не
  наследует demo-флаг локального preview — `scripts/build-web-local.mjs`.
- Web-артефакт обязан иметь provenance — `dist/release.json`.
- Production endpoints и store ledger имеют один machine-readable источник —
  `release/production.json`; deploy/env не могут молча его переопределить.
- Любой failed live manifest check на любом canonical web-домене возвращает
  предыдущий серверный каталог, а не оставляет частично принятый релиз.
- Применённая migration history immutable: baseline содержит SHA-256 каждого
  файла, а исправления делаются только новой forward-only migration.
- Node 20.18.0 одинаков для local/CI/EAS — `.nvmrc`, `package.json`, CI.
- Live Supabase нельзя восстанавливать/менять только по текущей migration-chain:
  сначала read-only schema export и backup — `PROJECT_OPERATIONS.md`.
- `AGENTS.md`/`CLAUDE.md` должны быть adapters к профильным источникам, а не
  независимыми ручными копиями бизнес-правил.
- Backend hostname после миграции — собственный `api.xtrud.pro`, чтобы следующая
  смена провайдера не требовала перепривязки каждого клиента.
- Web и iOS переключаются независимо; App Store binary с вшитым Cloud URL нельзя
  считать обновляемым вместе с web.
- Быстрый DNS rollback безопасен только до первой записи на новом backend; после
  неё нужен roll forward либо обратная синхронизация данных.

## Новые компоненты / паттерны

- `release.json` — автоматически создаваемый манифест web-export: Git SHA,
  dirty-state, build mode, demo flag и время.
- Staged directory swap — новый web deploy распаковывает релиз рядом, валидирует,
  сохраняет `.previous` и откатывает его при неуспешном smoke-check.
- `PROJECT_OPERATIONS.md` — runbook для вопросов «где оригинал», «что копия»,
  «что можно удалить» и «что реально находится на сервере».
- `infra/supabase/` — secret-free contract целевого self-hosted deployment;
  официальный compose берётся whole pinned snapshot, а не переписывается вручную.
- `CROSS_PLATFORM_RULES.md` — capability adapters, platform release contracts и
  обязательные web/iOS test matrices.

## Anti-patterns обнаруженные в сессии

- Собирать production тем же hardcoded demo-builder — публичный сайт получает
  тестовые/административные входы; правильно — отдельный production mode.
- Удалять remote root до проверки архива — нет rollback и появляется окно
  недоступности; правильно — staging + validation + previous release.
- Деплоить текущую папку без Git provenance — неизвестно, какой код на сервере;
  правильно — clean `main == origin/main` + `release.json`.
- Считать `ios/`, `dist/` или VPS исходниками — это производные артефакты.
- Удалять tracked asset без поиска static require — TypeScript проходит, Metro
  падает; CI обязан выполнять настоящий web export.
- Применять старые migration-файлы как полный backup production — live schema
  содержит отсутствующий в Git SQL.
- Оставлять formatter/linter красным надолго — реальные ошибки теряются в шуме;
  форматирование вынесено в отдельную осмысленную hardening-серию и теперь
  поддерживается обязательным CI gate.
- Ставить Supabase на текущий web VPS — ресурсов ниже production-порога и общий
  failure domain; нужен отдельный Beget VPS.
- Переключать web на новую базу до обновления iOS — две версии продукта начнут
  писать в разные источники истины.
- Считать DB dump переносом всего Supabase — Storage bytes, Functions, secrets,
  Auth settings, DNS и monitoring переносятся отдельными gates.

## Открытые вопросы / TODO

- Production всё ещё отдаёт demo-bundle; безопасный deploy подготовлен, но может
  выполняться только после clean commit и явной команды «выкатывай».
- Сделать live read-only Supabase audit/backup и закрыть P0-кандидаты:
  self-admin, demo-admin, master trust fields, anon RPC disclosure, account delete.
- Rotating legacy shared secret из migration history требует внешнего действия и
  проверки активного endpoint; секрет в этот документ не копировался.
- Пересмотреть 20 известных Expo SDK54/Metro advisories не позже 2026-10-01;
  Expo 57 обновлять отдельной совместимой задачей, без `npm audit --force`.
- Переавторизовать `gh`; текущий локальный token недействителен, поэтому history
  GitHub Actions не была прочитана через CLI.
- Создать отдельный Beget VPS и два S3 bucket, затем выполнить санкционированный
  Cloud inventory и rehearsal restore по migration runbook.
- Получить исходник deployed Edge Function `notify`, которого нет в Git.
- Уточнить, есть ли реальные iOS-пользователи кроме владельца/тестовых аккаунтов,
  и выбрать transition window перед backend cutover.
- Подготовить первую Android preview APK, убрать ненужный `RECORD_AUDIO`, пройти
  real-device smoke и только затем создавать Google Play release.
- Обновить legal texts и stale Maestro/store docs под текущую classifieds-модель.
