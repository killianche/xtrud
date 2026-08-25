# xtrud — источники истины и эксплуатация

## TL;DR

xtrud разрабатывается **только** в `/Users/ruslancherbizhev/Desktop/xtrud` и
хранится в GitHub `killianche/xtrud`. Главный продукт — mobile: iOS выпускается
первым, Android сохраняет общий контракт и проходит ранние preview/device gates.
Web на VPS — supporting surface и производная статика; store binaries,
локальные `ios/`, `android/`, `dist/` и `node_modules/` — производные или
пересоздаваемые каталоги. Backend живёт в Supabase, но текущая папка миграций не
является полным снимком production: до любых изменений БД нужен read-only export
реальной схемы и backup.

Актуальность фактов в этом документе проверена 2026-08-25. История продуктовых
решений остаётся в `STATUS.md`; фактическая модель продукта — в `AGENTS.md` /
`CLAUDE.md` и `docs/SIMPLE_FLOW.md`.

## 1. Карта поставки

```text
/Users/ruslancherbizhev/Desktop/xtrud
  │
  ├─ Git main -> git@github.com:killianche/xtrud.git
  │    └─ GitHub Actions: npm ci, typecheck, tokens, Biome, tests, web export
  │
  ├─ app/ + src/ + assets/ + public/
  │    ├─ EAS Build
  │    │    ├─ iOS -> App Store (1.0.1, build 11; primary release)
  │    │    └─ Android -> shared code; preview/device gate ещё не подтверждён
  │    └─ supporting web export -> dist/
  │         └─ deploy/web.sh -> 62.113.106.30:/var/www/xtrud
  │              ├─ https://xtrud.pro
  │              └─ https://xtrud.alanbani.ru
  │
  └─ Backend
       ├─ сейчас: Supabase Cloud project wgeimsajvjkzrrnfrnkb
       └─ цель: api.xtrud.pro -> отдельный Beget VPS + Beget S3
```

VPS `85.198.86.41` **не относится к xtrud**: там размещены другие проекты.
Никакие xtrud-команды и удаления на нём выполнять нельзя.

## 2. Что является источником истины

| Область | Источник истины | Производное / можно пересоздать |
|---|---|---|
| Expo-клиент | `app/`, `src/`, `assets/`, `public/` | `dist/`, `.expo/` |
| Зависимости | `package.json`, `package-lock.json` | `node_modules/` |
| Expo native config | `app.json`, config plugins, зависимости | локальные `ios/`, `android/` после prebuild |
| iOS/Android release | чистый Git SHA + `app.json` + `eas.json` | EAS artifacts, store binaries |
| Web build | `scripts/build-web-local.mjs` | `dist/` |
| Web deploy | `deploy/web.sh` | `/var/www/xtrud` на VPS |
| Production endpoints/store ledger | `release/production.json` | env override и устные значения |
| Caddy production | `/etc/caddy/Caddyfile` на `62.113.106.30` | `deploy/Caddyfile*` — reference, не live config |
| AASA/privacy | `public/.well-known/apple-app-site-association`, `public/privacy/index.html` | одноимённые deploy-копии; хэши сейчас совпадают |
| Backend-код | `supabase/migrations/`, `supabase/functions/` | задеплоенные объекты Supabase, но см. ограничение ниже |
| Product scope | `src/lib/product-scope.ts` + реальная БД | текстовые упоминания в документах |
| Статус работ | верх `STATUS.md` | старые секции ниже — история |

### Критическое ограничение backend

В репозитории 128 migration-файлов, есть повторяющиеся номера и comment-only
миграции. Типы клиента и production содержат объекты, для которых нет полного
SQL-источника в Git. Поэтому `supabase/migrations/` сейчас **не гарантирует
восстановление production с нуля**.

До первой следующей миграции:

1. сделать backup / подтвердить PITR в Supabase;
2. снять read-only schema dump, policies, grants, functions, buckets и migration ledger;
3. сравнить dump с Git;
4. исправлять только новыми forward-only migration-файлами;
5. не редактировать уже применённые исторические миграции.

## 3. Платформы на 2026-08-23

### Backend

- До cutover source of truth — Supabase Cloud project
  `wgeimsajvjkzrrnfrnkb`.
- Принято целевое решение: официальный self-hosted Supabase Docker на новом
  отдельном Beget VPS; Storage и backups — в разных Beget S3 buckets.
- Существующий Beget VPS `62.113.106.30` недостаточен для backend: 2 CPU,
  2.9 GiB RAM, 38 GiB disk с 78% занятости и несколько активных сервисов.
- Стабильный клиентский Interface после перехода — `https://api.xtrud.pro`.
- Полный runbook и gates: [`docs/SUPABASE_BEGET_MIGRATION.md`](docs/SUPABASE_BEGET_MIGRATION.md).
- До read-only dump, rehearsal restore, Storage checksum, iOS transition и
  backup restore-test production backend не переключать.

### Web

- Production VPS: `root@62.113.106.30`.
- Caddy root: `/var/www/xtrud`.
- `xtrud.pro` и `xtrud.alanbani.ru` отдают один bundle.
- Проверенный production deploy выполнен 2026-08-24 из clean Git release;
  live manifest и оба домена проверены после атомарного swap.
- Текущий публичный bundle собран с `demo=false`.
- GitHub Actions автоматически сайт не выкладывает.
- Следующий deploy должен идти только новым `deploy/web.sh` и только по явной
  команде владельца.

### iOS

- Bundle ID: `com.xtrud.app`.
- App Store: версия 1.0.1, build 11, опубликована 2026-06-18.
- EAS project: `cf7a107b-5d0b-417d-88f0-a5973971aeef`.
- Локальный игнорируемый `ios/` может отставать от `app.json`; его нельзя считать
  источником версии или entitlement-ов.
- `eas.json` содержит абсолютный локальный путь к ASC `.p8`; сам ключ правильно
  хранится вне Git, но submit с другой машины пока не воспроизводим.

### Android

- Package name уже задан: `com.xtrud.app`.
- EAS Android builds: 0.
- Google Play listing: нет.
- `android/` локально отсутствует и при необходимости генерируется из Expo config.
- В Expo config `RECORD_AUDIO` явно блокируется, а image-picker не объявляет
  microphone usage; `scripts/release/check-mobile-config.mjs` проверяет
  introspected native config. Реальный APK/AAB и device QA всё ещё не выполнены.
- Первый preview/device smoke обязателен до заморозки iOS release candidate
  после крупного vertical slice; production Google Play идёт отдельной волной.

## 4. Безопасное удаление и очистка

Можно удалять без потери исходников, когда процесс, который их использует,
остановлен:

- `dist/`, `dist_next/`, `.expo/`;
- `node_modules/` — затем обязательно `npm ci`;
- `ios/`, `android/` и их build/Pods — только если native-папки не содержат
  осознанных ручных правок; затем `npx expo prebuild --clean`;
- `.DS_Store`, `.tmp_*.png`, macOS AppleDouble `._*`;
- `/var/www/xtrud.previous` — только после подтверждения нового релиза.

Нельзя удалять без отдельной проверки:

- `app/`, `src/`, `assets/`, `public/`, `supabase/`, Git metadata;
- `.env.local` и внешние ключи;
- Supabase users/data/buckets/functions;
- `/var/www/xtrud` и Caddy config;
- любой файл с незакоммиченным изменением, даже если он похож на копию.

Перед удалением tracked-файла всегда: `git status --short`, затем `rg` по имени
или импорту. После инцидента с `teplodom-banner.png` CI отдельно проверяет все
локальные static require/import до запуска Metro.

## 5. Рабочий цикл без «неправильных копий»

1. Работать только в `/Users/ruslancherbizhev/Desktop/xtrud`.
2. Начать с `git status --short`, `AGENTS.md`, `STATUS.md` и этого документа.
3. Не использовать `dist/`, VPS или игнорируемый `ios/` как место редактирования.
4. Установить Node 20.19.4 (`.nvmrc`) и зависимости через `npm ci`.
5. Перед изменением backend снять live-состояние Supabase read-only.
6. Проверить `npm run quality:check`; перед web release —
   `npm run release:check`.
7. Коммитить только осознанные файлы, не `git add .` вслепую.
8. Push не означает deploy. Web deploy, EAS build/submit и миграции — отдельные
   внешние действия только по явной команде владельца.

## 6. Web build и deploy

Локальные режимы:

```bash
npm run web:build:preview     # demo=true, только preview
npm run web:build:production  # demo=false, deploy не выполняется
```

Каждый успешный export создаёт `dist/release.json` с Git SHA, dirty-state,
режимом, demo-флагом и полным backend URL. Секретов в манифесте нет. Builder
сверяет URL с `release/production.json` и запрещает path/query/hash, поэтому случайно собрать
production против другой базы нельзя.

Production deploy:

```bash
CONFIRM_DEPLOY=xtrud-production bash deploy/web.sh
```

Скрипт сам проверяет:

- ветка `main`;
- clean worktree;
- `HEAD == origin/main`;
- только `/var/www/xtrud`;
- только VPS/backend из `release/production.json`;
- `buildMode=production`, `demoEnabled=false`, `gitDirty=false`, ожидаемые SHA
  и полный backend URL;
- staging extraction и наличие `index.html`/`release.json`;
- live manifest smoke-check `xtrud.pro` с rollback на предыдущий каталог;
- совпадение manifest на обоих доменах после выкладки.

Перед store release:

```bash
npm run store:check:ios
npm run store:check:android
```

Проверка требует номер строго больше последнего опубликованного и запрещает
откат marketing version из `release/production.json`. После подтверждённой
публикации ledger обновляется в том же release commit.

Упаковка использует `COPYFILE_DISABLE=1`, чтобы не переносить `._*` с macOS.

## 7. Текущие стоп-факторы перед любой выкладкой

1. Рабочая копия dirty на время текущей локальной задачи; release возможен
   только после reviewed commit и `main == origin/main`.
2. Новый отдельный Beget VPS/S3/DNS отсутствует; backend deploy невозможен.
3. Live read-only inventory и encrypted DB/Storage backups готовы, но
   versioned full-stack restore, два clean restore, S3 smoke, WAL/PITR и
   monitoring ещё не доказаны.
4. iOS 1.0.1 содержит Cloud URL внутри binary; backend cutover без новой версии
   App Store создаст split-brain или отключит старое приложение.
5. Production-mode iOS и Android JS/Hermes exports 2026-08-25 повторно прошли
   на каноническом Node 20.19.4 командами `expo export --platform ios` и
   `expo export --platform android`. APK/AAB/IPA build, TestFlight/store и
   real-device QA ещё не выполнялись; mobile production остаётся NO-GO.
6. Канонический local/CI/EAS runtime — Node 20.19.4. Это минимальная версия,
   совместимая с текущими React Native 0.81.5, Metro 0.83.3, Vite 8 и Rolldown;
   Node 20.18.0 пропускает обязательный optional native binding при `npm ci`.

## 8. Подтверждённые риски безопасности backend

Это статические находки в migration-chain; эксплуатационные проверки против
production не выполнялись.

- owner-update policy для `users` не ограничивает `is_admin` после добавления
  колонки — возможен self-admin, если live grants/policies совпадают с Git;
- demo-admin был снова создан после миграции, которая снимала admin с demo;
- владельцы `master_profiles` / `master_categories` потенциально могут менять
  trust/ranking/verification-поля;
- `resolve_login_email` и `get_master_phone` выданы `anon` и раскрывают больше,
  чем нужно текущей модели;
- `delete_my_account()` отстаёт от текущей auth/data-модели;
- legacy push migration содержит общий секрет в истории Git — его нужно
  ротировать, не копировать в новую документацию;
- публичные Storage/telemetry endpoints требуют quota/MIME/rate-limit проверки.

Правильный порядок исправления: live read-only подтверждение -> backup -> одна
forward-only security migration -> проверка RLS/ACL/RPC -> обновление типов и
документации. Не тестировать уязвимости на реальных аккаунтах.

## 9. Что считать документацией, а что историей

- `AGENTS.md` — короткий вход для любого агента; подробный workflow —
  `docs/AGENT_WORKFLOW.md`. `.codex/agents/*.toml` — только thin adapters к
  tracked ролям `.claude/agents/*`, их соответствие проверяет governance gate.
- `.claude/rules/` — tracked правила. Новые `.codex/`, `AGENTS.md` и workflow на
  момент этой сессии ещё не закоммичены: новый clone их потеряет до разрешённого
  commit/push.
- Канонические продуктовые решения должны жить в одном профильном документе
  (`docs/SIMPLE_FLOW.md`, `CATEGORIES_AND_PROFILES.md`, `DESIGN.md`), а адаптеры
  должны ссылаться на них, а не вручную дублировать детали.
- Старые `PROJECT_MAP.md`, lifecycle/chat docs, store checklists и Maestro flows
  частично описывают удалённые функции. Они не являются спецификацией текущего
  поведения без явной пометки в актуальном документе.
