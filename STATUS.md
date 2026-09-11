# STATUS

Точка входа «где мы сейчас». Обновляется в каждом коммите, где была осмысленная единица работы.

> ℹ️ Этот файл разросся (история длинная). **Где мы сейчас — снимок ниже.**
> Как устроен продукт сейчас (модель, что есть / чего нет) — `AGENTS.md` →
> `docs/SIMPLE_FLOW.md` и `PRODUCT_CONTEXT.md`. Историю ниже листать только за контекстом.

---

## Отзывы видны специалисту, задание можно отправить другу — 2026-09-11

- FACT отзывы: раньше отзыв записывался молча. Теперь триггер на `reviews`
  (0184) шлёт специалисту уведомление и push «Новый отзыв»; три старых
  отзыва добавлены в «Уведомления» без push. В приложении — бейдж на
  «Специалистах», счётчик на «Я специалист», «Новый отзыв» в строке
  «Отзывы»; гаснет при открытии своего профиля.
- FACT push: нажатие на уведомление теперь открывает задание или свой
  профиль (`use-notification-tap.ts`); обработчика раньше не было.
- FACT бейдж «Мои задания» с 2026-09-07 не считал событий по заданиям:
  условие «kind ≠ new_order» отбрасывало строки без `kind`. Исправлено.
- FACT «Поделиться» в задании: системное меню iOS, ссылка
  `https://xtrud.pro/orders/<id>`. AASA объявляет приложению только
  `/orders/?*`; без приложения — страница сайта с App Store.
  UNKNOWN: переход из WhatsApp в приложение на устройстве не проверен.

## Свой сервер вместо Supabase, админ в приложении — 2026-09-08

**Где мы сейчас.** Приложение и админка работают через собственный сервер
`xtrud-api` на Beget. Supabase как продукт из цепочки убран; на машине
остаются его открытые компоненты — PostgreSQL 17 (вся схема, RLS, функции) и
PostgREST как движок запросов к таблицам. Библиотеки `@supabase/supabase-js`
в приложении и в панели больше нет.

- FACT архитектура: `server/` (Node 22 + Fastify) → `api.xtrud.pro/v2`:
  вход и регистрация (JWT HS256 тем же секретом, что у GoTrue),
  мост `/v2/rpc/<функция>` (явный список), прокси `/v2/rest/<таблица>`
  (белый список из 21 таблицы), файлы `/v2/files` с правилами прежних
  политик хранилища. Клиент — `src/lib/xtrud-client`, модуль
  `@/lib/supabase` сохранил имя ради 46 файлов. План и этапы —
  `docs/BACKEND_REWRITE_PLAN.md`.
- FACT файлы: `/opt/xtrud/files/<бакет>/<uid>/…`, публичные отдаёт nginx с
  `nosniff`, превью — свой `xtrud-imgproxy` через `/render/<ширина>/<качество>/…`
  с кэшем 7 дней. Старые ссылки `/storage/v1/object|render/public` → 302 на
  новые; загрузки старых сборок копирует cron `sync-storage-files.sh`.
- FACT безопасность (разбор двух агентов 2026-09-08, 34 находки): порты
  5432/6543/8000 больше не смотрят в интернет; лимит попыток входа
  20/мин; бан в админке отзывает токены; телефон специалиста — только
  вошедшим; загрузка файлов проверяется по расширению, типу и сигнатуре;
  `resolve_login_email` закрыт. Подробности — TASKS «Этап 5.1».
- FACT продукт: подтверждение паспорта (0174) и значок проверенного;
  решения Р1–Р7 (0175): «кто сделал» при закрытии, отзыв раз в неделю,
  экран блокировки, лимиты публикации, скрытие задания админом,
  напоминание без откликов; счётчик откликов пересчитывается на любое
  изменение (0178); публикация чинена (0179 — advisory-lock).
- FACT админ внутри приложения: раздел в аккаунте, экран паспортов,
  блокировка людей и скрытие заданий из меню «⋯». Права проверяет база.
- FACT релизы: в App Store 1.0.2; 1.0.3 живёт в TestFlight, ledger 62,
  собираются 63 и 64.
- UNKNOWN: ключи Beget S3 и APNs у владельца; проверка на устройстве —
  тёмная тема, крупный шрифт, VoiceOver.
- ⏸ Ждут владельца: подача 1.0.3 в App Store, ключ APNs, ключи S3,
  выключение контейнеров Supabase после контрольного периода.

---

## iOS 26 везде, профиль специалиста, способ связи — 2026-09-07

- FACT: сборка 41 (1.0.3) в TestFlight; ledger 41, следующий номер 42.
  Сборки 39/40 не собрались — номер не попадал в коммит (урок в памяти:
  release-commit-checklist).
- DECISION владельца: фильтры/поиск/пилюли — iOS 26 Liquid Glass (таблица
  соответствий — `docs/IOS_FOUNDATION.md` §0); «Специалисты» — сначала
  категории; аккаунт с именем на главной; плавающий «+»; профиль
  специалиста (категории, о себе, фото работ, контакты, отзывы); способ
  связи по заданию (отклики / напрямую). План — TASKS этапы 4.17–4.20.
- FACT сервер: 0167 (триггер рассылки DEFINER — публикация 403), 0168
  (contact_mode + политика откликов), 0169 (специалист виден с первой
  категории).
- UNKNOWN: устройство — владелец проверяет на сборке 41.

---

## Конструктор задания с нуля — 2026-09-06 (ночь)

- DECISION владельца: форма создания задания заново, по образцу Apple и
  TaskRabbit, в стиле Liquid Glass. Исследование и правила —
  `docs/TASK_COMPOSER.md`; код — `src/features/task-composer/`, маршруты
  `app/(details)/orders/new*`. Старая форма удалена (−4 156 строк).
- FACT: сборки 35 и 36 (1.0.3) в TestFlight; 36 включает правки QA (гвард
  правок при редактировании, устаревшая категория, тач-цели, системный push).
  Ledger `latestUploadedBuildNumber` = 36, следующий номер 37.
- UNKNOWN: устройство — стекло кнопки, клавиатура на шаге суммы, шторка
  категории, возврат гостя после входа. Проверяет владелец на сборке 36.

---

## Как у Apple: шторка, плавающий «+», заголовок первым, сплэш — 2026-09-06 (вечер)

- FACT: сборки 33 и 34 (1.0.3) в TestFlight «Друзья и знакомые»; ledger
  `latestUploadedBuildNumber` = 34, следующий номер 35.
- DECISION владельца: служебные иконки — SF Symbols (`SystemIcon`), шкала
  текста Apple (`text-ios-*`), плавающая кнопка главного действия, шторка
  выбора inset grouped, крупный заголовок первым на всех вкладках, логотип на
  сплэше. Подробно — DESIGN.md (решение 2026-09-06 вечер), TASKS этап 4.15.
- UNKNOWN: вид на устройстве — проверяет владелец на сборке 34.

---

## Только Beget: облако выведено, копии заведены — 2026-09-06

- DECISION владельца: Supabase Cloud не используем, всё на российских
  серверах. FACT: стек и так на Beget с 2026-08-31; последняя ссылка на
  облако (`notify_user`) убрана миграцией 0165.
- FACT: копий базы xtrud на сервере не было — заведён `/opt/xtrud/backup.sh`
  (pg_dump + роли + Storage, cron 04:40, 14 дней), первая копия проверена
  `pg_restore --list`.
- FACT: в live-базе 4 пользователя, 0 специалистов, 6 заданий. Удаление 63
  пользователей и 26 профилей 2026-09-02…03 — плановая очистка тестовых
  данных (DECISION владельца 2026-09-06).
- FACT: миграция 0166 сняла с API-ролей табличные привилегии, которые RLS не
  ограничивает, и закрыла `notify_user` и ночные функции от вызова через
  /rpc. Проверено снаружи: anon → `rpc/notify_user` 42501, публичные чтения
  и `search_masters` — 200.
- План — `TASKS.md`, этап 4.14.

---

## Сборка 31 — скорость на 1000+ заданий, фильтры как в iOS — 2026-09-06

- FACT: сборка 31 (1.0.3) собрана на GitHub Actions (`macos-26`, ~14 мин),
  VALID в App Store Connect, в группе TestFlight «Друзья и знакомые» вместе с
  30, 29, 28, 27, 26, 24. Ledger: `latestUploadedBuildNumber` = 31.
- FACT: миграции 0161–0164 применены на живой базе Beget (индексы, лимит
  откликов по диапазону, очередь рассылки с pg_cron, `notifications` в
  публикации realtime, RPC счётчика непрочитанных).
- FACT: до 0164 публикация `supabase_realtime` не содержала ни одной таблицы —
  все прежние realtime-подписки клиента молчали.
- UNKNOWN: `notify_user()` вызывает URL старого облачного проекта Supabase;
  доставка пушей с Beget не проверена.
- План — `TASKS.md`, этап 4.13.

---

## Live-инвентаризация Supabase и доступы к релизу — 2026-08-30

- Получены доступы: EAS, ключ публикации App Store и строка подключения к
  Supabase. Впервые за сессию появилась возможность проверять внешнее состояние,
  а не помечать его `UNKNOWN`.
- **FACT: ключ публикации не тот, что записан в конфиге.** `eas.json` указывает
  `ascApiKeyId: MFXS9GDD4X`, но присланный `.p8` принадлежит `DVXRD7HJFY` —
  определено запросом к App Store Connect, а не по названию файла: под первым
  ключом API отвечает `401`, под вторым возвращает `xtrud (com.xtrud.app)`.
- **FACT: сборка 12 уже занята.** В App Store Connect build 12 / v1.0.2 имеет
  статус VALID с 2026-08-29 и лежит в TestFlight, тогда как
  `release/production.json` знал только про опубликованную 11. Гейт версий
  сравнивал именно с ней и пропустил бы повторную загрузку, которую ASC
  отвергает. Добавлено поле `latestUploadedBuildNumber`, правило вынесено в
  `version-utils.mjs` и покрыто тестами, номер поднят до 13.
- **FACT, критично: любой зарегистрированный может выдать себе права
  администратора.** Read-only запрос к
  `information_schema.column_privileges` показывает `UPDATE` на
  `users.is_admin` у ролей `anon` и `authenticated`. Ранее это было
  структурным предположением по тексту политики; теперь это подтверждённое
  состояние production.
- **FACT: единственный администратор в базе — demo-аккаунт.**
  `SELECT count(*) FROM users WHERE is_admin` даёт 1, и у этой записи
  `is_demo = true`. Настоящего администратора не существует. Утверждение о том,
  что пароль этого аккаунта лежит в истории Git, проверить не удалось —
  остаётся `UNKNOWN`.
- **FACT: `get_master_phone` в live закрыта от `anon` и открыта
  `authenticated`.** Это подтверждает расхождение с Git, где выдан грант обеим
  ролям. Функция по-прежнему возвращает `COALESCE(contact_phone,
  users_private.phone)`, то есть любой авторизованный получает личный номер
  входа мастера, не указавшего рабочий.
- **FACT: Git и база разошлись на десять миграций** — применено 138 против 128
  файлов. Среди применённых напрямую: `freeform_master_reviews`,
  `revoke_anon_access_user_rpcs`, `admin_demo_account_v2`,
  `owner_account_ruslan_ingush_repurpose`. До сверки ни один из двух источников
  не является полным, как и предупреждает `docs/AGENT_WORKFLOW.md` §1.
- Проверено и подтвердилось хорошее: RLS включён на `orders`,
  `order_responses`, `users` и `reviews`, поэтому guard миграции блокировки
  пройдёт; `submit_master_review` действительно существует и объявлена
  `SECURITY DEFINER`, как выводила backend-роль по форме вызова.
- Живая база **не изменялась**: все запросы выполнены в транзакции
  `default_transaction_read_only = on`. Миграции не применялись.

---

## Веб сведён к статике, iOS-only и релизный гейт бандла — 2026-08-30

- Expo web build удалён: продукт стал iOS-only. Убраны `app/+html.tsx`,
  `src/components/PhoneFrame.tsx` (обёртка развёрнута в `app/_layout.tsx`, на
  нативе она была no-op), `scripts/build-web-local.mjs`,
  `scripts/dev-web-local.mjs`, блок `web` из `app.json`, шесть npm-скриптов
  `web*` и зависимости `react-dom`, `react-native-web`, `@supabase/ssr`,
  `@types/react-dom` — ни одного импорта в коде, только упоминания в
  комментариях.
- Найден блокер, которого не было в плане: восстановление доступа шло через
  web build. Письмо ведёт на `xtrud.pro/reset-password`
  (`supabase/functions/send-reset-email/index.ts:30`), а страницу отдавала
  только веб-сборка; статической версии не существовало. Без замены сброс
  пароля сломался бы у всех, кто открывает письмо на десктопе, на Android или
  на iPhone без установленного приложения. На iOS с приложением ссылку
  перехватывает AASA (`"/": "*"`) и открывает `app/reset-password.tsx` — этот
  экран сохранён без изменений.
- `public/reset-password/index.html` — обычный HTML с ванильным JS, без сборки
  и без внешних зависимостей; один `PUT /auth/v1/user`, контракт сверен с кодом
  `@supabase/auth-js` и официальным OpenAPI. CSP `default-src 'none'`,
  recovery-токен стирается из адресной строки сразу после разбора hash и
  повторно после успеха, затем вызывается `logout scope=local` — утёкшая ссылка
  становится бесполезной. Токен не логируется, не рендерится и не попадает в
  localStorage/cookie/sessionStorage; ответ сервера не отображается, чтобы не
  раскрывать существование аккаунта.
- `check-public-legal-pages.mjs` расширен: `reset-password` обязателен,
  `SUPABASE_URL` сверяется с `release/production.json` → `backend.url`, ключ —
  по sha256 с `backend.clientKeySha256`, любой внешний origin в файле
  отвергается. Тестов в гейте 3 → 16.
- `deploy/web.sh` (190 строк) заменён на `deploy/static.sh`. Сохранены все
  защиты оригинала: host только из `release/production.json`, `CONFIRM_DEPLOY`,
  ветка `main`, чистый worktree, совпадение с `origin/main`, атомарная подмена
  с сохранением предыдущего релиза, live smoke-check и автоматический откат.
  Добавлено: список страниц выводится из `public/`, поэтому новая страница
  автоматически попадает в smoke; AASA проверяется на `Content-Type:
  application/json` и на валидность JSON — иначе universal links молча ломаются.
- Последний шаг `release:check` (`web:build:production`) заменён на новый
  `ios:bundle:check`: production-экспорт iOS с очисткой кэша Metro. Он ловит
  сломанные импорты, потерянные ассеты и битую конфигурацию Expo — класс
  ошибок, невидимый для typecheck и unit-тестов.
- **FACT: локальная сборка iOS не помещалась в память VDS.** `expo export`
  доходил до 99.9% и убивался OOM-killer (3.8 GiB RAM, swap отсутствовал,
  `oom-kill` подтверждён в журнале ядра). Добавлено 4 GiB swap-файла, экспорт
  проходит, бандл 16.0 MB. `/etc/fstab` намеренно не менялся, поэтому **после
  перезагрузки сервера swap исчезнет и сборки снова начнут падать** — решение о
  постоянном swap за владельцем.
- **FACT: перенести web-проверку «demo не просочился» на iOS невозможно.**
  Прежний web-гейт искал в собранном JS домен `xtrud-demo.local`. Замер на
  реальных бандлах: `xtrud-demo.local` и `signInWithDemoPhone` присутствуют в
  Hermes-бандле одинаково при `EXPO_PUBLIC_ENABLE_DEMO=false` и `=true`;
  осмысленных строковых различий между сборками нет вообще, кроме временного
  пути бандлера. Любой маркерный детектор здесь либо всегда молчит, либо всегда
  падает, поэтому вакуумная проверка намеренно не добавлена, а причина записана
  в `scripts/release/check-ios-bundle.mjs`.
- Отсюда поправка к коду: комментарий в `src/lib/auth.ts` о том, что
  production-сборка предотвращает попадание demo-входа в публичный bundle, для
  iOS неточен. Код в бандле остаётся, недостижимым его делает инлайненный флаг.
  Учётные данные (`DEMO_PHONE_PREFIX`, номера demo-телефонов) в бандле
  отсутствуют, а `check-mobile-config.mjs` требует `EXPO_PUBLIC_ENABLE_DEMO ===
  "false"` в production-профиле — практического риска нет, но защита слабее
  описанной.
- Воспроизведена ловушка кэша Metro: две подряд сборки с разным
  `EXPO_PUBLIC_ENABLE_DEMO` без `--clear` дают побайтно одинаковый бандл. Новый
  гейт всегда чистит кэш.
- 60 веток `Platform.OS === "web"` в 22 файлах намеренно оставлены: 12 из них в
  `TabBar` и 6 в `BottomSheet`, а эти компоненты переписываются на нативные в
  следующем этапе. Удаление сейчас — двойная работа с риском.
- Финальный `quality:check` PASS: 37 test files / 229 tests, legal gate 6
  файлов. `ios:bundle:check` PASS, 16.0 MB. Deploy, миграции, EAS build/submit
  и обращения к живому Supabase не выполнялись.
- `UNKNOWN`: сквозной прогон сброса пароля с живым recovery-письмом; реальный
  рендер страницы в браузере в обеих темах; защита от кликджекинга отсутствует
  — `frame-ancestors` в `meta` браузеры игнорируют, нужен заголовок Caddy.

---

## Сокращение проекта: мёртвый код, ассеты и архив истории — 2026-08-30

- Проект уменьшен с 1.1 GB до 11 MB. Основной вес — каталог `ios/` (1.1 GB, из
  них `Pods` 1.1 GB): он генерируется EAS из `app.json` и добавлен в
  `.gitignore` вместе с `android/`. **FACT: локальный `ios/` устарел на два
  бампа версии** — `Info.plist` содержал 1.0.0/build 10 против 1.0.2/build 12 в
  `app.json`, а `associatedDomains` из конфига не попал в entitlements, то есть
  universal links в нём настроены не были.
- Удалено 38 недостижимых модулей, 4411 строк. Достижимость проверена полным
  графом импортов по 330 файлам `src/` и `app/` с резолвом алиаса `@/`, обходом
  от точек входа expo-router и тестов; повторный анализ после удаления дал 0
  недостижимых файлов. В основном это остатки удалённой lifecycle-модели
  заказа, master-дашборд, `WebShell` (убран 2026-05-21), `MasterServicesSection`
  и `src/lib/tokens.ts` (генератор токенов читает `colors.ts`, а не его).
- Проверка отменила три предложения аудита: `feed-page.ts` импортируется живым
  `use-all-open-orders.ts`; `assets/icons/category/*.svg` — исходники для
  `scripts/gen-category-icons.mjs`, встраивающего их как data-URI;
  `docs/ORDER_LIFECYCLE_CLIENT_PLAN.md` вопреки названию описывает текущую
  classifieds-модель и согласован со `SIMPLE_FLOW.md`. Все три сохранены.
- Ассеты: 4.2 MB → 2.3 MB, 48 → 23 файла. Удалены 3 Lottie-анимации, шрифт
  `CalSans-SemiBold.ttf` и 21 иллюстрация без единой ссылки. Из корня убраны
  девять изображений, из них `222/444/555/666.jpg` — побайтные дубликаты
  `assets/illustrations/hero-photo-1..4.jpg` (сверено по md5).
- Удалён `landing/` — заброшенный дубликат публичных страниц. **Это устранение
  юридического риска, а не экономия места:** в `landing/privacy.html`
  отсутствовали 4 из 5 обязательных маркеров актуальной политики, включая
  ссылку на `/account-deletion/`, которую требует App Store Review 5.1.1(v);
  каталог целился в домен `xtrud.ru`, которого нет в `release/production.json`,
  и не покрывался legal-гейтом.
- Активная документация сокращена с 34 335 до 14 255 строк. В `archive/`
  вынесены 11 отчётов сессий, 3 аудита, 3 launch-документа, `research/`, `rpi/`,
  `legacy/` и сырой `vercel/DESIGN.md`; добавлен `archive/README.md` с явным
  запретом читать каталог ради контекста задачи. Ничего не удалено, только
  перемещено, все ссылки обновлены — в том числе 4 комментария в живом коде,
  которые стали бы висячими.
- `STATUS.md`: 3953 → 801 строка. Сохранены восемь актуальных блоков за
  2026-08-24..26, `Backlog`, `Блокеры` и `История ключевых решений`; 96
  исторических блоков вынесены в `archive/STATUS_HISTORY_2026-05..08.md`.
- В `archive/legacy-docs/` перенесены `chat-states.md`, `lifecycle.md` и
  `order-states.md`: каждый сам помечен `LEGACY`, описывает удалённую при
  переходе на classifieds-модель функциональность и оставался активным
  источником дезинформации рядом с каноническим `docs/SIMPLE_FLOW.md`. Чата в
  клиенте нет вообще — 0 запросов к `chats`/`messages`.
- Android заморожен (DECISION владельца). Из `package.json` убраны только
  скрипты `android` и `store:check:android`. Конфигурация сохранена намеренно:
  её удаление потребовало бы переписать `check-mobile-config.mjs`,
  `check-version-consistency.mjs`, `check-production-contract.mjs` и два
  тестовых файла ради ~30 строк — больше правок, чем экономии, и риск в
  release-контракте перед iOS-релизом. Прежнее правило
  `docs/MOBILE_RELEASE_STRATEGY.md` об обязательном Android preview/device smoke
  до заморозки iOS RC отменено, добавлен раздел 8 с условиями снятия заморозки.
- Итог этапа: 330 → 290 файлов кода, 48 400 → 43 916 строк. `quality:check`
  PASS после последней правки.

---

## Восстановление рабочей копии на VDS и governance — 2026-08-30

- DECISION владельца: работа ведётся только на VDS, Beget становится целевой
  площадкой, реальных пользователей кроме владельца и тестовых нет.
- **FACT: `npm run quality:check` не запускался вообще.** Копия на VDS не
  содержала `.claude/rules/` и `.claude/agents/`, хотя `AGENTS.md`, `CLAUDE.md`
  и `scripts/governance/check-agent-config.mjs` их требуют; гейт падал на первом
  же шаге. Восстановлены `working-rules.md`, `design-quality.md`,
  `design-enforcement.md`, восемь ролей `.claude/agents/*.md` и парные тонкие
  адаптеры `.codex/agents/*.toml`. Правило совета ролей зафиксировано в
  `.claude/rules/agent-delegation.md` как DECISION владельца.
- **FACT: копирование на VDS не сохранило права.** 29 файлов с shebang имели
  режим 644, из-за чего `execFileSync` не мог запустить shell-обёртки и
  `supabase:backup-safety:test` падал 10 тестами из 11 с `status=null`. После
  восстановления режима 755 — 11/11 PASS.
- **FACT: проект был непортируем на Linux.** `prepare-exact-stack.sh` требовал,
  чтобы родитель назначения резолвился ровно в macOS-путь `/private/tmp`; на
  Linux `/tmp` — реальный каталог, поэтому rehearsal-contract тесты 14 и 15
  всегда падали. Разрешённый родитель теперь вычисляется как реальный путь
  системного `/tmp`; защитное свойство сохранено полностью — сравнение
  по-прежнему после `pwd -P`, traversal и symlink-родитель отклоняются до
  `git clone`.
- **FACT: `npm ci` был сломан** конфликтом peer-зависимостей между
  `lottie-react-native@7.3.8` и `@lottiefiles/dotlottie-react@0.19.2`. Оба
  пакета оказались неиспользуемыми и удалены вместе с
  `@expo-google-fonts/inter`, `cal-sans` и `@react-navigation/elements` — ноль
  импортов у всех пяти. Плагины `expo-font`, `expo-localization` и
  `expo-secure-store` сохранены: они объявлены в `app.json` и добавляют нативный
  код при prebuild.
- Создан Git-репозиторий: в копии не было ни `.git`, ни `.gitignore`, поэтому
  любое удаление было необратимым. Baseline-коммит зафиксировал исходное
  состояние как точку отката; staged diff проверен на секреты.
- После этапа `quality:check` проходит впервые: 37 test files / 229 tests,
  governance PASS.

---

## Каталог услуг, честная приоритизация и iOS picker — 2026-08-26

- YouDo, Яндекс Исполнители, присланные владельцем экраны и текущий код
  повторно проверены независимыми product, design, technical, QA и review
  ролями. Каноническая матрица добавлена в `docs/SERVICE_PRIORITY.md`: отдельно
  зафиксированы FACT, исторические сигналы, Core, Core gap, кандидаты,
  experiment/long-tail, restricted и OUT. Реальный рейтинг спроса
  Магаса/Назрани остаётся `UNKNOWN`; место в меню и число исполнителей не
  выдаются за популярность.
- CURRENT release bundle по-прежнему содержит 37 L2, 285 L3 и 288 terms, и все
  37 L2 фактически относятся к `construction`. Канонический seed содержит семь
  веток `home-services`, но их отсутствие в authoritative release snapshot —
  backend/catalog gap. Generated JSON вручную не дополнялся.
- TARGET-модель сопоставляет поддерживаемые группы YouDo/Яндекс с 10 L1 и
  feature-off draft `0120`, включая виртуального помощника, digital repair,
  event staff/audio и курьерские подвиды; аренда без услуги остаётся OUT, а
  охрана требует отдельного mapping/legal решения. Найден и закрыт риск старого
  клиента: draft больше не вставляет
  aliases выключенных категорий, потому что текущий public synonym RPC не
  фильтрует inactive/hidden targets. Их добавление заблокировано до отдельного
  search hardening; fixture закрепляет fail-closed контракт.
- Видимые неподтверждённые заявления «Популярные задачи»/«из популярных»
  заменены на доказательные «Примеры заданий» и нейтральный empty state. Сырой
  search text и публичные query chips отключены до versioned PII-safe SQL и
  правил агрегации. Dormant analytics helper проверяет `{ error }` Supabase RPC
  и покрыт success/error тестами.
- iOS intent/picker доведён без скрытого назначения категории: Search на
  клавиатуре только закрывает её и показывает live-results, исходный task text
  передаётся и остаётся в owner-bound draft, оба input соблюдают Dynamic Type.
  Исправлены реальные prompt IDs `windows`, `doors`, `landscape`; picker получил
  skeleton loading, icon+heading error/empty states и Retry.
- Финальный локальный `quality:check` PASS: 37 test files / 229 tests,
  TypeScript, Biome по 391 файлу, governance, Supabase/catalog/release/assets
  contracts. Production-mode iOS Hermes export PASS. QA дал локальному срезу
  GO; реальный iPhone/Simulator light/dark, VoiceOver, keyboard и half-swipe
  остаются ручным device gate.
- Supabase/Beget, production migrations, commit, push, deploy и EAS build/submit
  не выполнялись. Universal activation остаётся NO-GO до search hardening,
  exact restore/security gates и отдельной forward-only activation migration.

---

## Свежий Cloud snapshot/backup и security gate — 2026-08-26

- Read-only инвентаризация live Supabase `wgeimsajvjkzrrnfrnkb` снята через
  IPv4 session pooler и сразу зашифрована. Проверенный ciphertext хранится вне
  Git в `~/.config/xtrud/inventory/`; SHA-256:
  `af3f74643a9d67519c4addabc56f022a38e9d1e9224af5bfa27d5c2fb09728e7`.
  Подтверждены PostgreSQL 17.6, фактические policies/grants/functions/triggers и
  реальные P0: broad owner-update для `users`, `master_profiles` и
  `master_categories`, активный demo-admin и публичный pre-login
  `resolve_login_email`. `get_master_phone` в live уже закрыт от `anon`.
- Создан и независимо проверен свежий age-encrypted logical DB bundle вне Git:
  `supabase-cloud-logical-20260826T133139Z.tar.age`, SHA-256
  `2eff20b5dfbc1784d048c6c08406edd0f9d451a69ce53345e9b5911fba575bb0`.
  Добавлен versioned Storage creator/verifier; свежий ciphertext
  `supabase-storage-20260826T135436Z.tar.age`, SHA-256
  `44a712720f6bac4111075058e722c3c0fa808bf235254cdce56a6e351024bb49`,
  содержит 6 buckets, 7 objects и 808 230 bytes. Каждый object проверен по
  размеру и SHA-256, plaintext staging и временный service key удалены.
- Подготовлен только unnumbered draft
  `supabase/migration-drafts/security_hardening_live_verified.sql` и отдельный
  fail-closed contract-test. Он ограничивает owner writes, trust/ranking/admin
  поля, снимает demo-admin и сужает RPC ACL, но намеренно не включён в runnable
  migration chain и не применялся к Cloud.
- Fresh exact-stack restore всё ещё **NO-GO**: Docker Compose отсутствует,
  локально меньше требуемых 30 GiB, а forensic raw PostgreSQL restore доказал
  несовместимость простого наложения provider schema поверх инициализированного
  Supabase image. Нужны source-derived unified DB+Storage boundary, versioned
  Storage restore, isolated official Compose target, два чистых restore и
  PostgREST/Auth/Storage/Realtime/RLS smoke. Новый Beget VPS/S3 пока отсутствует.
- Fresh ciphertext хранится только локально: копирование на текущий web VPS не
  выполнялось. Supabase, VPS, DNS, Git commit/push и deploy не менялись.
  Использованные текущие Cloud credentials до final cutover нужно ротировать;
  в этом цикле их намеренно не меняли, чтобы не ломать работающий production.

---

## iOS native navigation и быстрый intent-flow задания — 2026-08-26

- Detail/edit/picker-маршруты вынесены из скрытых Tabs в настоящий native
  Stack `app/(details)`. Кнопка Back и iOS edge-swipe используют одну policy:
  обычный native pop, безопасный fallback для cold deep link, защита dirty-форм,
  блокировка перехода во время сохранения/публикации и явный выход после success.
  Приватные settings/edit/history routes больше не показываются анонимному
  пользователю даже на один кадр; публичный allowlist задан явно и fail-closed.
- Создание задания разделено на два коротких native-шага: намерение и детали.
  Детерминированное точное совпадение показывает известное название вместе с
  категорией и переходит дальше только после тапа пользователя. Неоднозначный
  или необычный текст показывает не более трёх подтверждаемых L2-подсказок и
  путь «Все категории»; слабый trigram не назначает категорию. Любое изменение
  текста атомарно очищает ранее выбранную L2.
- Wrong-layout correction проверяется по фактически исправленному запросу.
  Каноническое решение «кондиционеры/сплит-системы → Ремонт техники» защищено
  client-contract; подготовлен, но не применён, forward-only draft `0123` для
  исправления четырёх legacy exact terms после live snapshot/backup Beget.
- Профиль исполнителя восстанавливает сохранённые поля онбординга после ухода и
  возврата. В форме задания исправлены контраст выбранных вариантов, radio
  accessibility, disabled-состояния Back/«Отмена» и реальная 44×44 зона удаления
  фото. Design, QA и code-review прошли независимыми агентами.
- Финальный локальный gate после последней правки: `quality:check` — 35 test
  files / 218 tests, TypeScript/Biome по 385 файлам, governance, Supabase,
  catalog, assets и version contracts PASS; iOS Hermes export — PASS. Главная
  визуально открыта в iPhone 17 Pro Simulator. Реальный half-swipe/VoiceOver и
  полный device flow остаются отдельным ручным device gate; Android отложен.
- Production backend/Beget, Supabase migrations, commit, push, EAS build/submit
  и deploy не выполнялись. Рабочая копия остаётся смешанной и незакоммиченной.

---

## Task-first главная, поиск намерения и Beget-ready каталог — 2026-08-26

- Главная мобильного приложения перестроена вокруг одного основного действия:
  hero «Создайте задание» с CTA «Создать бесплатно». Ниже остаются короткие
  task-intent плитки; дублирующие рекламные CTA удалены. Публичная терминология
  главной переведена с «мастеров» на «исполнителей».
- Исправлен deterministic autocomplete создания задания. Первый вариант
  сохраняет формулировку пользователя и явно показывает подтверждаемую L2;
  небезопасные L3-sibling варианты отбрасываются. Реальная форма
  «поклеить обои» больше не превращается в «удаление старых обоев».
  Исправленная русская раскладка показывается явно и используется как
  подтверждаемое публичное название, а не сохраняет латинскую абракадабру.
- Для недоступной сети добавлен generated bundled-каталог текущего публичного
  scope: 37 L2, 285 активных L3 и 288 terms. Он строится read-only генератором,
  имеет SHA-256, локальный shape/reference/duplicate gate и не содержит URL,
  ключей, PII или цен. Backend остаётся первым источником; корректный пустой
  ответ не подменяется, а fallback включается только для классифицированного
  transport/DNS/timeout-сбоя. Auth/RLS/API-contract ошибки остаются видимыми.
  UI явно сообщает о сохранённом каталоге.
- Bundled-каталог и существующий UI-список городов разрешают заполнить локальный
  черновик, но не являются authority публикации. Непосредственно до проверки
  лимита, загрузки фото и insert клиент свежим backend-read повторно проверяет
  active/visible/in-scope L2 и реальный active city; «Вся Ингушетия», районы и
  сёла проверяются по каноническому location-контракту. При недоступном backend
  нет upload, insert или ложного success; поля остаются в owner-bound draft. Cold-process
  guest snapshot по прежнему privacy-контракту карантинируется и автоматически
  не показывается, а авторизованный owner-draft имеет TTL 14 дней.
- По публичным каталогам YouDo и Яндекс Исполнителей проведён source-backed
  обзор. Недостающие группы (виртуальный помощник, ремонт цифровой техники,
  персонал/промо, аудио, курьерские подвиды) добавлены только в feature-off
  `migration-drafts/0120`. Search aliases для них намеренно не вставляются до
  hardening публичного synonym RPC: иначе выключенные ветки протекут старым
  клиентам. Неподтверждённые цены не выдумываются и оставлены `NULL`.
- Целевой backend не менялся: это официальный self-hosted Supabase-compatible
  stack на новом отдельном Beget VPS + Beget S3. Изменённый mobile-код не
  содержит Cloud URL/project ID и переключается через env. Supabase Cloud
  использовался только read-only как текущий эталон; deploy/migration туда не
  выполнялись. Beget cutover остаётся NO-GO до отдельного VPS/S3/DNS и
  обязательных snapshot/backup/restore/security gates.
- Обновлённый локальный `quality:check` PASS: 28 test files / 174 tests,
  TypeScript/Biome по 367 файлам, assets/governance/release/catalog contracts
  PASS; production-mode iOS JS/Hermes export PASS. На iPhone 17 Simulator при
  фактической недоступности старого Cloud DNS проверены task-first cold start,
  «Поклеить обои» → «Обои», details, bundled city list, accessibility tree и
  light/dark preview. iOS store-gate теперь fail-closed связывает источник с
  EAS production и release ledger по URL/hash client key, затем сверяет snapshot
  с production-каталогом. Android по новому явному решению владельца отложен и не
  является текущим iOS-slice gate; запущенные Android build/emulator остановлены,
  воспроизводимая ignored `android/` удалена. Production deploy/migration,
  commit/push и Beget cutover не выполнялись.

---

## Search-first создание задания — 2026-08-26

- Локально реализован новый mobile-first вход: крупный CTA «Создать задание»
  под hero на главной ведёт в `/orders/new`; пользователь сначала вводит задачу
  своими словами, затем явно выбирает вариант названия вместе с категорией или
  сохраняет свой текст и выбирает категорию вручную.
- Категория не назначается скрыто. Подсказки строятся детерминированно через
  существующий category search и пересекаются с видимым runtime-каталогом;
  legacy L3 используется только как сигнал поиска, а не как публичное название.
  Категория из URL/старого draft не допускается в details/insert без текущего
  visible allowlist. Генеративный AI и изменение пользовательского текста не
  добавлялись.
- После intent остаётся компактная фаза деталей в том же маршруте. Для
  проверенных категорий есть контекстная подсказка описания, для остальных —
  универсальное ручное поле. Публикация обозначена как бесплатная.
- Введён временный продуктовый лимит 3 открытых задания на аккаунт: клиент
  показывает capacity-state, проверяет exact-count до загрузки фото и повторяет
  проверку перед insert. При batch/insert error загруженные paths удаляются
  best-effort. Async result привязан к исходному аккаунту: он не очищает draft
  и не показывает success в новой сессии; после insert сверяются и React-owner,
  и фактическая текущая Supabase session. Post-commit session error сохраняет
  терминальный success без чужого order ID и уже не удаляет привязанные фото.
  Синхронный single-flight gate блокирует повторный тап до первого network
  await. Это всё ещё только UX-precheck; гонка двух устройств остаётся возможной.
- Локальный gate на Node `20.19.4`: `quality:check` PASS, 21 файл / 139 тестов,
  TypeScript/Biome/assets/governance/release contracts PASS; production-mode
  iOS и Android JS/Hermes exports PASS. Web preview bundle собран, но
  интерактивный визуальный проход не засчитан: встроенный Browser после раннего
  `connection refused` заблокировал повторный localhost-переход своей URL
  policy. Нативный simulator/device preview остаётся обязательным.
- **Release NO-GO:** production Supabase не менялся. До production нужен
  атомарный серверный quota/RPC с idempotency key, forward-only migration после
  live snapshot/backup, E2E двух аккаунтов и iOS/Android device/accessibility
  smoke. Число 3 остаётся продуктовым решением MVP и может быть пересмотрено
  владельцем без изменения архитектуры.

---

## Mobile task marketplace slice — 2026-08-25

- Локально собран первый mobile-first вертикальный срез доски заданий по
  [`docs/MOBILE_TASK_MARKETPLACE_UX.md`](docs/MOBILE_TASK_MARKETPLACE_UX.md):
  виртуализированная лента «Задания», стабильная tuple-пагинация
  `created_at + id`, фильтры категорий/локации, detail, форма отклика и плоский
  список предложений исполнителей. Референсы YouDo использованы только для
  продуктовой архитектуры; визуальный язык остаётся xtrud.
- Один аккаунт остаётся заказчиком и исполнителем. Гостевой CTA сохраняет
  безопасный intent, новый исполнитель проходит единый путь
  `профиль → категории → фото`, существующий исполнитель возвращается к
  заданию без повторного onboarding. Intent имеет одного владельца навигации.
- Устранены найденные советом P1: ложная client-side urgent-сортировка удалена;
  demo фильтруется server-side до `limit`; composite cursor не теряет строки с
  одинаковым timestamp; незавершённая публикация профиля восстанавливается по
  durable `master_profiles.status`; повторный profile submit не демотирует
  active-исполнителя.
- Отклик валидирует trimmed сообщение и положительную сумму в пределах
  PostgreSQL `int`; контакты исполнителя загружаются только по явному тапу;
  ключевые поля и ошибки формы получили accessibility labels/live-region, а
  price controls — минимальную высоту 44 pt.
- Локальный gate на Node `20.19.4`: `quality:check` PASS, 16 файлов / 123 теста,
  TypeScript/Biome/assets/governance/release contracts PASS. Production-mode
  iOS и Android JS/Hermes exports проходят. Это не заменяет native build и
  проверку на устройствах.
- **Release NO-GO:** production Supabase не менялся. Перед релизом обязательны
  live read-only snapshot + backup, forward-only security/data migration,
  атомарная серверная финализация профиля, DB constraint `price_value > 0`,
  устранение baseline self-admin/anonymous phone P0, двухаккаунтный live E2E и
  iOS/Android device + VoiceOver/TalkBack/Dynamic Type/offline smoke.

---

## Mobile-first и подготовка отдельного Beget — 2026-08-25

- Продуктовый контур закреплён как мобильное приложение: одна Expo/React Native
  кодовая база для iOS и Android, iOS — первый production/device-контур,
  Android проверяется на каждом вертикальном срезе и выходит следующей волной.
  Web остаётся только для legal/support/account deletion, recovery, AASA и
  лёгких публичных маршрутов. Решение и границы описаны в
  [`docs/MOBILE_RELEASE_STRATEGY.md`](docs/MOBILE_RELEASE_STRATEGY.md) и
  [`docs/adr/0001-mobile-first-expo-and-beget-supabase.md`](docs/adr/0001-mobile-first-expo-and-beget-supabase.md).
- MVP остаётся простым classifieds-flow: заказчик публикует задание, исполнитель
  откликается, дальше стороны связываются напрямую. Чат, lifecycle заказа,
  выбор победителя, escrow и платформенные платежи в текущий MVP не добавляются.
- Для всех агентов введён fail-closed контракт доказательности: факт,
  подтверждённый кодом/read-only состоянием/первичным источником, отделяется от
  решения и `UNKNOWN`; неизвестные реквизиты, нагрузка, SLO или live-состояние
  не подменяются догадкой. Значимые продуктовые, архитектурные, UI, data,
  security и release-задачи проходят совет ролей и независимые QA/review.
- Mobile config усилен: `RECORD_AUDIO` удаляется из Android manifest, iOS больше
  не получает `NSMicrophoneUsageDescription`; отдельный fail-closed Expo
  introspection gate и 4 contract tests проходят. Полный `quality:check` и
  реальные production-mode iOS/Android JS/Hermes exports повторно проходят на
  каноническом Node `20.19.4`. Это не доказывает native IPA/APK/AAB,
  TestFlight/store или работу на устройствах.
- Expo SDK 54 / React Native / Expo Router / TypeScript признаны подходящим
  shared-mobile стеком для MVP. Self-hosted Supabase остаётся подходящим
  модульным backend-монолитом; микросервисы и Kubernetes не добавляются без
  измеренной необходимости.
- Подготовлен secret-free production Adapter точного Supabase snapshot
  `self-hosted/v0.8.0`: exact commit/docker tree, 11 digest-pinned images для
  amd64/arm64, loopback-only Envoy, закрытые DB/Studio/Supavisor и внешний
  Beget S3. 8 production и 15 rehearsal contract tests проходят; отдельный
  sparse snapshot успешно сверён с upstream. Фактические Beget endpoint,
  region, credentials и DNS остаются `UNKNOWN` до создания ресурсов.
- Реализован только fail-closed validation-only restore preflight: он связывает
  DB и Storage ciphertext с одним внешним approved backup-set manifest,
  проверяет SHA/bytes, exact pins, entry allowlist/размеры и свободное место.
  Preflight физически не вызывает `age`, `tar`, Docker или `psql`, не расшифровывает
  данные, не меняет target и не выпускает restore receipt; 11 adversarial tests
  проходят. Destructive orchestration, resource ownership/isolation, реальные
  DB/Storage restore и два чистых full-stack restore остаются **NO-GO**.
- Текущий Supabase Cloud остаётся единственным production backend. Новый Beget
  VPS/S3/DNS отсутствует, поэтому deploy/cutover не выполнялся и
  `release/production.json` не переключался. Runtime exact-stack, два clean
  restore, full DB+Storage smoke, WAL/PITR, monitoring, native builds и device
  QA остаются обязательными **NO-GO** gates.

---

## Универсальная доска и совет качества — 2026-08-24

- По прямому решению владельца закреплён совет из шести независимых ролей:
  бизнес-директор, директор по разработке, дизайнер, разработчик, QA и
  code-reviewer. Порядок волн и двусторонний go/no-go описаны в
  [`.claude/rules/agent-delegation.md`](.claude/rules/agent-delegation.md),
  добавлены отдельные adapters `qa-engineer`, governance gate проходит для 10
  adapters.
- Утверждён единый продуктовый контракт универсальных заданий без второй
  сущности: источниками остаются `orders` и `order_responses`. Полная граница
  CURRENT/TARGET, UX, matching, безопасность и rollout —
  [`docs/UNIVERSAL_TASK_BOARD.md`](docs/UNIVERSAL_TASK_BOARD.md).
- Подготовлены **только локальные feature-off drafts** `0120`–`0122`: 10
  пользовательских L1, скрытый fallback `xtrud-internal / other-services /
  other-service`, расширенный order contract и взаимная блокировка. Они лежат в
  `supabase/migration-drafts/`, не входят в runnable migration chain и не
  применялись к production. Static fixture проверяет 10 контрактов, а отдельный
  promotion gate намеренно остаётся закрыт на 6 live-блокерах.
- Гостевой anonymous JIT-signup удалён. Публикация ведёт в обычный
  login/register; черновик изолирован по owner/session, имеет TTL 14 дней,
  восстанавливается без auto-publish, а временные URI фотографий не пишутся в
  persistent storage. Claim/revoke journey одноразовый и fail-closed; Back,
  logout/account switch и ошибки storage не оставляют чужой draft или stale
  return intent.
- Universal payload mapper, location scope и стабильный tuple cursor
  реализованы и протестированы, но намеренно не подключены к live hooks до
  проверки production schema и генерации типов. Это фундамент, не включённая
  пользовательская функция.
- Финальный локальный gate на Node `20.19.4`: `npm ci`,
  `npm run quality:check`, online security audit и cold production export PASS;
  13 test files / 107 tests, TypeScript/Biome/assets/release/legal/migration
  gates PASS, demo-login/demo-data выключены. Независимые QA и code-review дали
  **Local foundation: GO**, P0/P1 не осталось.
- Старый runtime-контракт Node `20.18.x` оказался несовместим с текущими
  React Native/Metro/Vite/Rolldown: `npm ci` пропускает platform binding и
  Vitest не стартует. Канон local/CI/EAS исправлен на Node `20.19.4`; полный
  quality/release gate на нём успешно повторён.
- **Production/function rollout: NO-GO.** Сначала нужны live read-only Supabase
  inventory, encrypted backup, rehearsal restore, forward-only security
  migration, прохождение promotion gate, generated types, подключение UI/hooks,
  E2E и device/legacy-iOS проверка. Supabase production, VPS, GitHub remote и
  опубликованные версии в этой работе пока не менялись; локальные изменения
  разложены на логические commits в release-ветке.
- После успешного cold export удалены только воспроизводимые ignored-артефакты:
  `ios/Pods` (410 МБ), `dist` (14 МБ) и `.expo` (32 КБ). Проект занимает около
  756 МБ; `node_modules` (685 МБ) сохранён, чтобы JS-разработка и проверки
  оставались готовы. Pods восстанавливаются `cd ios && pod install`, web export
  — `npm run web:build:production`/`web:build:preview`.
- Полный отчёт: [`archive/sessions/SESSION_SUMMARY_2026-08-24.md`](archive/sessions/SESSION_SUMMARY_2026-08-24.md).

### Gate A Supabase Cloud — live read-only inventory 2026-08-24

- Через открытую владельцем Dashboard-сессию выполнен новый
  [`scripts/supabase/db-inventory-dashboard.sql`](scripts/supabase/db-inventory-dashboard.sql):
  один read-only JSON result без PII, row payloads, object paths, function
  bodies, policy expressions и secret values. Результат сразу зашифрован `age`,
  проверен decrypt→JSON roundtrip и хранится вне Git в mode-0600 каталоге
  `~/.config/xtrud/inventory/`; plaintext-файл не создавался.
- Live: PostgreSQL 17.6, 31 public tables, 95 public functions (42
  `SECURITY DEFINER`), 104 RLS policies, 724 API table grants, 138 migration
  ledger rows и 54 Auth users. Это первая подтверждённая live-карта, а не вывод
  из локальных миграций.
- Storage live содержит 6 buckets и всего 7 объектов: public `avatars` (1),
  `portfolio` (5), `category-covers` (0), `order-photos` (0); private
  `chat-images` (1), `master-verifications` (0). Пути/имена объектов не читались.
- Realtime publication live содержит только `notifications`; ожидаемые в старом
  runbook `orders`/`order_responses` не включены. Пять cron jobs активны, включая
  legacy lifecycle `nightly_auto_confirm` и `nightly_cancel_stale`, хотя текущая
  продуктовая модель lifecycle не использует. Ничего не отключалось.
- Dashboard подтверждает 4 deployed Edge Functions: `notify`, `register-user`,
  `send-reset-email`, dormant `send-sms`. Фактический deployed source `notify`
  восстановлен без изменений в
  [`supabase/functions/notify/index.ts`](supabase/functions/notify/index.ts);
  локальный SHA-256 совпал с source из Dashboard. Baseline migration debt
  уменьшен с 22 до 21.
- Установлен `age 1.3.1`; локальный private backup key создан вне Git с правами
  0600. До первого полноценного backup обязательна отдельная офлайн-копия этого
  ключа: потеря ключа означает потерю всех зашифрованных архивов.
- Runbook усилен после независимого security-review: привилегированный DB URL
  считается break-glass credential, запрещён вывод полного `docker compose
  config`, расширен список secrets и least-privilege/rotation contract.
- Владелец 2026-08-25 явно закрепил выбранный им Cloud DB password и запретил
  дальнейшую автоматическую ротацию. Session pooler дважды подтвердил read-only
  доступ через основную запись macOS Keychain; временная запись и plaintext
  удалены, в Git секрет не попадал.
- Локальный официальный backup toolchain готов: Supabase CLI закреплён на
  `2.115.0`, Colima `0.10.3` работает через macOS Virtualization Framework,
  Docker client/server проверены контейнером. Wrapper fail-closed сверяет CLI
  version, шифрует поток age и исключает внутренние Storage vector tables;
  safety-тесты и полный quality gate проходят.

### Gate B Supabase Cloud — encrypted logical clone 2026-08-24

- Создан и независимо проверен age-encrypted DB bundle вне Git: format включает
  official roles/schema/data, project migration ledger и forensic-only
  Auth/Storage schemas + provider ledgers. Ciphertext mode 0600, SHA-256
  `a830a586f9bffce98b3efe3b10bd954acb559bccc61bdb538bf612e825c79909`.
- Clean PostgreSQL 17.6 raw-clone rehearsal прошёл: 54 Auth users, 31 public
  tables, 95 public functions, 104 policies, 138 project migrations, 77 Auth
  migrations, 65 Storage migrations, 6 buckets и 7 object metadata совпали;
  row-count parity по 63 таблицам и DDL inventory parity подтверждены.
- Новый format-v1 ciphertext отдельно восстановлен с нуля: aggregate parity
  совпал — Auth users 54, public tables 31, public functions 95, all policies
  106, project/Auth/Storage migrations 138/77/65, buckets/objects 6/7. DDL
  inventory четырёх целевых схем также совпал: constraints 286, functions 116,
  indexes 232, policies 104, tables 63, triggers 36, materialized views 1. Все
  76 FK проверены — orphan rows нет.
  Четыре прежних архива перенесены в private `superseded/`; активным оставлен
  только verifier-compatible format-v1 artifact.
- Это доказательство логического clone backup, но не совместимости полного
  self-hosted stack. Provider schemas/ledgers помечены forensic-only; до cutover
  обязательны exact-stack Auth/Storage/Realtime smoke и FK/orphan validation.
- Backup wrapper теперь не передаёт DB URL значением в Docker argv, использует
  immutable image digest, публикует ciphertext только после валидного SHA и
  имеет fail-closed verifier. Safety tests включены в `quality:check` и CI.
- Отдельный Storage bundle завершён: 6 buckets, все 7 objects, 808 230 байт и
  per-object SHA-256 сохранены в age-encrypted artifact mode 0600. Ciphertext
  SHA-256: `87decc0d48b3fc2c2a514acd11958f83555ddd76e2b60555f14c45df99b2348b`.
  Decrypt→exact entries→size/checksum verification прошёл; plaintext staging и
  временный service-role файл удалены.
- Backup toolchain commit `c61b40f` отправлен в GitHub `main`. Обе активные
  ciphertext-копии 2026-08-25 вынесены с Mac на текущий Beget VPS в закрытый
  `/var/backups/xtrud/supabase-cloud/`: размеры и SHA-256 совпали, права `0600`.
  Это off-machine copy, но не immutable/S3 и тот же failure domain, что web.
  Backend cutover остаётся NO-GO до отдельного Beget VPS/S3 и exact-stack smoke;
  Cloud удалять нельзя.
- Static exact-stack gate 2026-08-25 усилен после независимого CTO/QA/security
  review: upstream закреплён не только tag, но exact commit + `docker/` tree;
  все 11 runtime images имеют registry digest lock для amd64/arm64. Rehearsal
  overlay оставляет единственный host-port Envoy на `127.0.0.1:18000`, полностью
  удаляет Supavisor ports и подключает JWT/JWKS без мутации upstream compose.
  Private env validator fail-closed проверяет mode `0600`, placeholders/defaults,
  legacy JWT signatures, modern key consistency, `.test` URLs и image locks;
  rendered-compose gate проверяет итоговые ports/images без печати secrets.
  Compose 2.24.4 render для обеих архитектур и 15 contract tests прошли.
  Контрольный sparse bootstrap повторно прошёл оба source/snapshot validator;
  временный каталог после проверки удалён.
- Контейнеры намеренно не запускались: после точечной очистки безопасно
  восстанавливаемых npm/Gradle/Xcode caches на Mac доступно около 14 GiB;
  Compose plugin
  локально отсутствует, а versioned exact-stack restore orchestration ещё не
  доказан. Для runtime rehearsal нужно довести свободное место минимум до
  30–40 GiB, установить
  Compose, затем выполнить два clean restore и полный QA checklist.
- Обязательная restore state machine зафиксирована в
  `docs/RESTORE_ORCHESTRATION_CONTRACT.md`: один immutable DB ciphertext на run,
  отдельный Storage artifact, exact disposable target, outbound isolation и два
  разных clean restore. Это спецификация, не реализация; validation-only
  preflight не закрывает runtime gate.

### GitHub и Beget release gate — 2026-08-24

- Read-only `git ls-remote` подтвердил реальный GitHub `main` на `f5cff28`;
  локальный base не расходился с remote. Dirty worktree не был перетёрт:
  изменения разложены на governance, toolchain, release/backend, application и
  E2E commits в `codex/project-hardening-20260823`.
- Live read-only audit `62.113.106.30` подтвердил 2 CPU, 2.9 GiB RAM, 38 GiB
  диск (около 78% занято), активный swap, Caddy и пять Docker-контейнеров с
  другими production-сервисами. На этот VPS безопасно выкладывать только web
  static `/var/www/xtrud`; self-hosted Supabase требует отдельного Beget VPS.
- Web production export на Node 20.19.4 продолжает использовать Supabase Cloud
  до отдельного backend cutover. Перед выкладкой подтверждены push, clean
  `main == origin/main`, полный локальный release gate и серверный backup;
  GitHub Actions API не читался из-за устаревшего `gh` token, поэтому live
  manifest и HTTP smoke проверены отдельно после атомарного swap.
- GitHub `main` и live web обновлены до проверенного release. Перед swap создан
  отдельный проверенный backup web-root/Caddy. Оба домена, legal/support/account
  deletion/AASA routes и production manifest возвращают HTTP 200; demo login и
  demo data выключены. Первый запуск выявил ложный exit=1 в cleanup trap уже
  после успешного swap; trap и упаковка macOS xattrs исправлены forward-only.

## История

96 исторических блоков за май–август 2026 вынесены в
[`archive/STATUS_HISTORY_2026-05..08.md`](archive/STATUS_HISTORY_2026-05..08.md).
Это история, а не источник истины: приоритет 5 по `docs/AGENT_WORKFLOW.md` §1.

---

## Backlog (Sprint 9+)

- **Real phone OTP / Telegram Login** — заблокировано выбором SMS-провайдера (Twilio/MessageBird/Smsc.ru) либо Telegram Login Widget (бесплатно). Уберёт advisor warnings про anonymous policies.
- **Outcome tracking modal** — «Беру заказ / Не договорились» через 7/14/30 дней (Яндекс паттерн).
- **E2E-тесты** — Maestro. Vitest уже работает: 37 файлов / 229 тестов.
- **Дашборд клиента** — публичная карточка клиента с рейтингом и историей отзывов (зависит от 8.4).

---

## Блокеры

> Актуализировано 2026-08-30. Прежние два пункта (Anonymous Sign-Ins для
> sprint 1.6 и выбор SMS-провайдера) сняты как устаревшие: вход по номеру и
> паролю заменил SMS 2026-06-05, `sendOtpToPhone`/`verifyOtpCode` и экран
> `verify` оставлены дормантом (`src/lib/auth.ts:151,159`), а
> `ENABLE_ANONYMOUS_USERS=false` зафиксирован в контракте self-hosted окружения.

### Требуют решения владельца

- ⏳ **Expo SDK 54 → 56.** Нужно решить до переписывания шторок и таб-бара на
  нативные: иначе работа делается дважды. SDK 55+ убирает Legacy Architecture,
  `expo-glass-effect` и Expo UI на SwiftUI — путь к актуальному дизайн-языку iOS.
- ⏳ **Dormant-контракты, 4 файла / 476 строк.**
  `universal-publish-contract.ts`, `universal-feed-cursor.ts`,
  `use-search-analytics.ts`, `outcome-store.ts` достижимы только из своих
  тестов. Верх STATUS называет их намеренно замороженными fail-closed фикстурами
  под universal-активацию. Заморозка или отменённая ветка — решение владельца,
  автоматически не удаляются.
- ⏳ **Постоянный swap на VDS.** 4 GiB swap-файл добавлен вручную и делает
  локальную сборку iOS возможной, но `/etc/fstab` не менялся: после перезагрузки
  сервера `ios:bundle:check` снова начнёт падать по OOM.

### Технические, до релиза iOS

- 🔴 **Нет блокировки пользователей.** App Store Review 1.2 требует для UGC и
  жалобы, и возможность заблокировать обидчика. Жалобы есть
  (`src/features/reports/`), блокировки нет ни в коде, ни в применённых
  миграциях. Черновик `supabase/migration-drafts/0122_user_blocking_contract.sql`
  существует и сам назван «Apple UGC safety contract», но не применён. Прямой
  риск отказа.
- 🔴 **`maxFontSizeMultiplier={1.3}` захардкожен** в `src/components/AppText.tsx:61`
  — то есть на всём тексте приложения — и продублирован ещё в 28 местах в 16 файлах.
  Dynamic Type обрезан на 130% там, где iOS даёт пользователю 200% и выше.
  Правка не сводится к одной строке: `src/features/orders/task-intent-navigation-contract.test.ts:23-24`
  прямо утверждает наличие этого капа, поэтому контракт теста придётся менять
  осознанно вместе с ним.
- 🔴 **Тач-цели меньше 44 pt:** `Button` `size="md"` = 40 pt, `sm` = 32 pt, плюс
  19 иконок 36×36 и 32×32 без `hitSlop`.
- 🔴 **`NSPrivacyCollectedDataTypes` пуст** в privacy manifest, хотя приложение
  собирает email, телефон, имя и фото. Манифест должен задаваться через
  `app.json` → `ios.privacyManifests`, потому что `ios/` теперь генерируется.

### Инфраструктурные

- ⏳ **Нет защиты от кликджекинга** у `public/reset-password/`: `frame-ancestors`
  в `<meta>` браузеры игнорируют, нужен заголовок Caddy
  (`X-Frame-Options: DENY`).
- ⏳ **Caddy настроен под удалённую web-сборку.** `deploy/Caddyfile.xtrud-pro.snippet`
  содержит SPA-fallback `try_files … /index.html`, которого больше не существует.
  Правка reference-файла и live `/etc/caddy/Caddyfile` — отдельная задача.
- ⏳ **Публикация в App Store из VDS сломается:** `eas.json` →
  `submit.production.ios.ascApiKeyPath` указывает на путь Mac
  (`/Users/ruslancherbizhev/.expo-asc-keys/AuthKey_MFXS9GDD4X.p8`).
- ⏳ **Beget VPS, S3 и DNS не созданы.** Перенос backend остаётся NO-GO;
  подробности и гейты — `docs/SUPABASE_BEGET_MIGRATION.md`.

---

## История ключевых решений

### 2026-08-30 — Продукт становится iOS-only, web сводится к статике

**Выбрано:** довести приложение на iOS до конца; Android заморозить; Expo web
build удалить, оставив в `public/` только страницы, обязательные для App Store.

**Почему не «убрать веб целиком»:** Privacy Policy и Support URL — обязательные
поля App Store Connect; `/account-deletion/` требует Review 5.1.1(v);
`apple-app-site-association` нужен для universal links, объявленных в
`app.json` → `associatedDomains`. Плюс на веб-сборке висело восстановление
доступа — заменено статической страницей.

**Почему Android заморожен, а не удалён:** удаление экономит ~30 строк
конфигурации (0,06% кодовой базы), но ломает три release-гейта и два теста.
Цена возврата асимметрична: связь build number ↔ Git SHA восстанавливать
дороже, чем 13 строк `app.json`.

### 2026-08-30 — Сокращать документацию и артефакты, а не работающий код

**Выбрано:** удалить генерируемое и мёртвое, историю перенести в `archive/`,
живой код не трогать.

**Обоснование:** 48 400 строк кода для маркетплейса с заказами, откликами,
профилями, портфолио, поиском и админкой — нормальный объём. «Огромность» на
99% состояла из генерируемого `ios/Pods` (1.1 GB) и 34 335 строк markdown, из
которых больше половины — история. Сокращение кода ради метрики ломало бы
работающее.

### 2026-08-30 — Не добавлять проверку, которая не может сработать

**Выбрано:** не переносить web-гейт «demo не просочился в bundle» на iOS.

**Обоснование:** замер показал, что demo-строки присутствуют в Hermes-бандле
одинаково при включённом и выключенном флаге, а осмысленных различий между
сборками нет. Гейт, который не способен отличить одно от другого, даёт ложную
уверенность вместо защиты. Причина записана в самом
`scripts/release/check-ios-bundle.mjs`, чтобы её не пришлось выяснять заново.


### 2026-06-06 — Редизайн «Редактировать профиль» клиента (Telegram/Bluesky-стиль)

**Что:** довёл экран редактирования профиля клиента до уровня больших приложений + закрыл остаток жалобы «юзернейм не меняется». Lazyweb-референсы: Telegram / Bluesky / Waze (edit-profile), Citibike / Sweatcoin (change-phone).

- **Фото профиля на самом экране правки.** Раньше фото менялось только на главной /profile. Теперь `app/(tabs)/profile/edit-client.tsx` имеет avatar-hero сверху (тап → сменить/удалить, камера-бейдж) через `useUpdateMyAvatar`/`useRemoveMyAvatar` + `confirmAsync` (web-safe).
- **Имя + юзернейм в одной карточке «Профиль»** (публичная личность), разделены hairline'ом — Telegram-паттерн. Чтобы не было «карточки в карточке», у `UsernameField` добавлен `variant="row"` (плоская строка без своей рамки); регистрация/онбординг используют прежний `variant="boxed"` по умолчанию — их вид не изменился.
- **Подсказка ПОЧЕМУ «Сохранить» серая.** Корень жалобы «юзернейм не меняется»: на пустом тест-аккаунте (без имени) кнопка серела молча. Теперь под формой — явная строка: «Впишите имя — минимум 2 символа.» / «Выберите свободный юзернейм, чтобы сохранить.». Логика username-сохранения (set-or-update, RPC `set_username`, проверено в БД) была корректна — не хватало объяснения disabled-состояния.
- **Телефон со скелетоном.** Раньше при загрузке мелькало «Не указан / Указать» даже у тех, у кого номер есть. Теперь — скелетон до загрузки `users_private`. Номер right-aligned, не обрезается.
- **Смена номера — helper-строка** «По этому номеру вы входите в приложение» (Citibike-паттерн); ошибка занятого номера остаётся «Этот номер уже зарегистрирован на другом аккаунте» (проверено вживую: чужой номер отклонён, свой не перезаписан).
- **Проверено вживую** на @ingush (79289204029): смена только юзернейма / занятый / свой / короткий — все ветки; реальное сохранение → запись в БД → откат. Обе темы. TS clean, 8 grep-чеков чисто.

### 2026-06-06 — Баги экранов редактирования профиля и смены номера

**Что:** разбор «очень большого количества багов» на профиль-редактировании.

- **Смена номера без SMS.** `src/features/profile/ChangePhoneSheet.tsx` переписан с двухшагового (номер → SMS-код → update) на **одношаговый** (номер → «Сохранить» → прямой UPDATE). Причина: SMS-вход удалён (платный), старый шаг дёргал мёртвый `useSendOtp` → `supabase.auth.signInWithOtp` → ошибка «Invalid payload sent to hook» на реальном номере. Проверки: 10 цифр, не demo `+79000…`, не текущий, не занят другим. UNIQUE-конфликт ловится в `useUpdateMyPhone` (`src/features/profile/use-user-private.ts`, код 23505) → «Этот номер уже зарегистрирован на другом аккаунте».
- **Невидимая кнопка.** Кнопка смены номера была `bg-ink` + inline `style={{color}}` (тёмный на тёмном). Теперь `bg-primary` + `text-on-primary` классом (disabled: `bg-surface-3` + `text-muted`). design-quality §A.
- **«Отмена» на вебе.** `edit-client.tsx` / `edit-master.tsx`: `onCancel` через 3-кнопочный `Alert.alert` (no-op на RNW) → заменён на `confirmAsync` (web-safe). Ошибки сохранения (`onSave` catch) тоже больше не теряются на вебе — показываются строкой на экране.
- **«Сохранить» не активировалась.** В `edit-client.tsx` / `edit-master.tsx` `canSave` требовал `usernameValid` всегда, поэтому пустое/недопечатанное поле юзернейма (особенно у аккаунтов без юзернейма) блокировало сохранение имени. Теперь `usernameOkForSave = !usernameChanged || usernameValid` — юзернейм блокирует только когда его реально меняли.
- **Сменить фото профиля на вебе.** `app/(tabs)/profile/index.tsx`: меню аватара открывалось через `Alert.alert` с кнопками (no-op на RNW) — на сайте смена фото не работала. Теперь web-ветка: нет фото → сразу выбор файла; есть фото → `confirmAsync`.
- **Тест-аккаунт.** `+79288234994` / pmrhhm@gmail.com — пустой аккаунт от отладки сброса пароля, рекомендован к удалению владельцу.

### 2026-06-04 — Большая UX-сессия: 38 задач (бренд + загрузка + отзывы + xtrud.pro)

**Что:** одна длинная сессия (37 закрытых задач + 1 отложенная) — пред-релизный полировочный заход перед подачей в App Store. Главные блоки:

- **Фирменный розовый акцент `#fe5574`** (бренд). Перекрашены: токены `accent`/`accent-soft` в `src/lib/colors.ts` + `global.css` (через `generate-css-tokens.mjs`); активный таб TabBar; кнопка «Позвонить» на профиле мастера; favicon (брендовая иконка `ddd.jpeg` встроенная base64 в SVG + clip-path round corners).
- **Равномерная загрузка** (фидбэк «не хочу проверять каждый экран»): единый паттерн «открыл → цельный скелет всей структуры → контент разом» применён к profile, master/[id], client/[id], category/[id], orders/[id]. Голые `<ActivityIndicator>` на пустых экранах заменены на структурные skeleton'ы.
- **Freeform-отзывы клиент→мастер.** Миграция БД `freeform_master_reviews`: `reviews.order_id`/`l2_id` nullable + RPC `submit_master_review(target, rating, text)` с защитой 1 отзыв / 30 дней. UI: `src/features/reviews/MasterReviewSheet.tsx` (звёзды + textarea), кнопка «Оставить отзыв» на `/master/[id]` (анон → на вход, клиент → форма). Лимит проверяется на бэке через `useMyRecentReviewForMaster`.
- **Реструктуризация категорий.** Миграция `split_climate_category`: `climate` → «Отопление» (без кондиционеров и водоснабжения); `water-sewer` → «Водоснабжение и канализация» (была скрыта, активирована); кондиционеры (ac-install, ac-service, ac-uninstall) → перенесены в `appliance-repair`. Иконки L2: «Отопление» → термометр; «Водоснабжение» → кастомный SVG-смеситель `assets/icons/water-sewer.svg` + data-URI в `src/lib/local-category-icons.ts` (Iconify не имеет водных иконок в fluent-color наборе).
- **Поиск мастеров — релевантность.** `useMastersByL2`: добавлен hard-фильтр по пустому bio + completeness-score primary sort key (мастера с ≤1 баллом — в конец ленты). Анти-spam против фейковых seed-аккаунтов.
- **Главная клиента:** «Популярные категории» с моно-иконок Phosphor переведены на цветные через `getCategoryColorIconUrl()` (3 категории; «Все мастера» оставлено моно как special).
- **Главная мастера:** убран подзаголовок «N в ожидании ответа» в карточке «Мои отклики» (в xtrud нет статуса «ожидания» — клиент сам звонит/пишет).
- **Профиль мастера:** добавлена кнопка-закладка `BookmarkSimple` рядом с «Позвонить» (compact квадрат); кнопка «В закладки» / форма отзыва — единая логика для авторизованных и анонов (анон → на вход, потом форма).
- **Бейдж доступности:** «На этой неделе» / «На следующей неделе» → «Готов на этой/следующей неделе» (фидбэк «непонятно про что бейдж»).
- **Палитра аватаров-инициалов:** с кричащих tailwind-200 (amber/pink/orange) на приглушённые -100 (Notion/Linear стиль).
- **Mini-thumb фото портфолио** в ленте мастеров: адаптивный размер по ширине экрана (44–80px, cap), качество `q=40` без 2× retina для fast first paint.
- **Множество точечных дизайн-фиксов:** trust-callout сокращён в форме заказа, эмодзи 🇷🇺 → SVG-флаг, mutex город/район, кнопки «Позвонить»/«WhatsApp» в ленте категории удалены (privacy-модель), preselect «Не срочно/Договорная» убран, синий accent чипов → bg-ink + text-on-primary, иконка лупы favorites → tc on-primary, inline hex → токены в OutcomeTrackingModal, `text-caption-xs` → `text-caption` в 8 файлах, заголовок «Кейс — Имя» → «Работа мастера» + onScroll вместо onMomentumScrollEnd для dots на web, точки слайдера, эмпти state /cases, бесконечный спиннер /profile/edit-master.

**Инфра:**
- Домен `xtrud.pro` куплен (Reg.ru, Individual Apple Developer). DNS A-записи на `62.113.106.30` поставлены пользователем. Caddyfile-блок + AASA + Privacy Policy подготовлены в `deploy/` для активации после распространения DNS.
- Favicon обновлён: брендовая картинка `ddd.jpeg` встроена через base64 в `public/favicon.svg` с rounded clip-path (rx=22%), залит на VPS.
- Новое правило `CLAUDE.md` №3: **после каждой осмысленной правки — сразу коммит+push+deploy** (раньше деплой был только по явной команде; решение владельца 2026-06-04 отменяет это, теперь по умолчанию выкатываем).

**Lazyweb / эталоны:** часть задач опиралась на готовые паттерны Linear / Vercel / Airbnb (унификация hero, скелеты загрузки), для критичных UX-задач (формы отзывов, сортировка) — без Lazyweb (типичный flow, нет неоднозначности).

**TS clean** по всему проекту. Открытая задача: **#33** — полный выбор локации (Вся Ингушетия / города / районы / сёла) в фильтре поиска мастеров (отложена пользователем для следующей сессии).

### 2026-05-27 — Унифицирован hero-блок `/profile` (guest/client/master)
**Что:** в `app/(tabs)/profile/index.tsx` было **два разных** hero-блока: для клиента — карточка с декоративным фиолетовым band'ом + декоративными кругами и квадратом, аватар с `border-4` накладывается через `-mt-12`, имя `display-md` left-aligned. Для мастера — открытый блок без карточки, аватар без border'а по центру, имя `display-sm` (мельче), бейдж `rounded-pill bg-surface-2` (другой shape, другой токен), edit-pencil `bg-primary` (вместо `bg-ink`). При переключении ролей через RoleSwitcher всё прыгало.

Сейчас — **один** layout для всех трёх состояний (guest/client/master): `items-center px-6 pt-4`, аватар `xl` без border, edit-pencil `bg-ink` 9×9 через `-bottom-1 -right-1`, имя `display-md` center-aligned, бейдж `rounded-full bg-canvas-soft-2 px-2.5 py-0.5` единый для обеих ролей (содержимое — «Клиент» / «Мастер»), рейтинг моно-цифрами одинаково. Кнопка под hero (`mt-5 w-full max-w-xs`) — RoleSwitcher / BecomeMasterButton / «Войти». Гостю показываем нейтральный кружок с иконкой `User` 32pt вместо аватара, без бейджа.

**Заодно закрыта задача #6** «Убрать фиолетовый header в /profile» — `bg-badge-violet` band и декоративные круги/квадрат удалены из обоих hero (client и guest).

**Lazyweb:** eBay profile (аватар+имя+бейдж+Edit без декора), Airbnb settings (Switch to hosting CTA отдельно от hero), Replit profile (плоский hero без вложенных карточек), GitHub mobile (центровое имя + meta-row моно). Эталон Vercel — никаких tinted band, типографика + воздух.

**Проверено:** 8 grep-чеков enforcement pass, TS clean. Скриншоты `preview_screenshot` сделать не удалось — MCP preview-инструменты были заблокированы в сессии; визуальная проверка отложена для следующей сессии с доступом.

### 2026-05-23 — `/orders/search` → Airbnb-style фото-карточки заявок
**Что:** лента поиска заказов для мастера (`app/(tabs)/orders/search/index.tsx`) переведена с плоских строк `<OrderRow>` на новые фото-карточки `<OrderSearchCard>` в стиле Airbnb-листинга. Крупное фото-герой сверху (aspect 4:3, `rounded-xl`), под ним title + время (mono) → категория → описание (2 строки) → цена (mono) → мета (срочность · локация). Бейдж поверх фото слева-сверху: «Вы откликнулись» (accent, белый текст) или «Срочно» (warning + Lightning). «+N фото» pill справа-снизу. Уже-отвеченная карточка приглушается `bg-canvas-soft` (как «прочитанная» строка).

**Новые файлы:** `src/components/OrderSearchCard.tsx` (карточка), `src/components/OrderSearchCardsSkeleton.tsx` (скелетон по форме карточки). Изменён только `app/(tabs)/orders/search/index.tsx` (импорты + 2 места рендера). **`OrderRow.tsx` / `OrderRowsSkeleton.tsx` НЕ тронуты** — используются на других экранах. Откат = вернуть `<OrderRow>`/`<OrderRowsSkeleton>` на странице поиска.

**Фолбэк без фото:** многие заявки без фото → `PlaceholderHero`: категорийный tinted-фон (badge-*, цикл по хэшу l2Id) + крупная цветная иконка категории (Iconify) + декоративные canvas-фигуры (UI_PATTERNS §3.5). Карточка выглядит дорого и с фото, и без.

**Сознательное отступление от паттерна:** UI_PATTERNS §0 фиксирует «full-bleed rows без карточек» как основу. Здесь — карточки с side-padding + rounded-xl, по прямому запросу владельца именно для этой страницы (Airbnb-листинг). Локальное исключение, общий паттерн не меняется.

**Lazyweb:** запросы «Airbnb listing search results card photo hero…» + «marketplace service request job feed card…». Взято у Airbnb: фото-герой 4:3 rounded, бейдж поверх фото слева-сверху, «+N» галерея-pill, title+метрика справа, цена жирным. Иначе конкурентов: фолбэк-плейсхолдер для заявок без фото (Airbnb всегда с фото), вместо heart/wishlist — бейдж срочности (в classified-модели избранного нет).

**Проверено:** скриншоты обеих тем (light + dark, mobile 414px), TS clean, 8 grep-чеков enforcement pass. В dark «Вы откликнулись» pill — белый текст на синем (`text-on-dark`, не `text-on-primary`, чтобы не было near-black на синем).

### 2026-05-21 — Блок «Создайте заказ» → кинематографичный фото-hero (версия 4)
**Что:** второй CTA главной клиента переделан из bounded near-black карточки (v3) в полноширинный (edge-to-edge) фото-hero в стиле главного `CinematicHero` («Найдутся мастера»). Файл `src/features/home/DescribeTaskCallout.tsx`.

**Структура:** фото-фон `assets/illustrations/order-bg.jpg` (тёмное ущелье с мостом, 524×900) на всю ширину + 2 LinearGradient overlay (лёгкий верхний + сильный нижний под текст) + крупный белый H «Создайте заказ» (34px) + строка ценности приглушённым белым + privacy-chip с замком на полупрозрачной плашке + белая CTA-pill «Разместить заказ →». 3D-иллюстрация clipboard (v3) убрана — фото-фон её заменяет. Высота блока 380px, скругление `rounded-3xl` по всем углам. Divider `mx-5 h-px` перед блоком в `index.tsx` убран (мешал full-bleed виду).

**Lazyweb:** запросы «full bleed CTA section photo background headline button», «cinematic banner dark photo overlay». Взято: Waymo onboarding (контент прижат к низу фото + pill внизу), CapCut Pro (заголовок + 1 строка ценности + pill), AllTrails+ (pill с боковым воздухом). Свой эталон CinematicHero — 2 градиента + ON_PHOTO константа.

**Цвета:** текст/иконки поверх фото — белые named-константы (ON_PHOTO/ON_PHOTO_SOFT), легальный photo-overlay §B-исключение (как CinematicHero). Pill — фикс-белая + тёмный текст. Фото не зависит от темы → блок идентичен в light/dark, окружающий canvas меняется. Проверено скриншотами обеих тем, TS clean, 8 grep-чеков pass.

### 2026-05-21 — Редизайн блока «Или создайте заказ» → тёмная spotlight-карточка (версия 3, заменена)
**Что:** второй по важности CTA главной клиента («создайте заказ») переделан в брендовую near-black spotlight-карточку. Компонент вынесен из `app/(tabs)/index.tsx` в `src/features/home/DescribeTaskCallout.tsx`.

**Структура:** глиф-акцент (Phosphor NotePencil) в мягком круге + крупный белый H2 «Не нашли мастера? Создайте заказ» + строка ценности + privacy-chip с замком «Ваш номер никому не показываем» + белая CTA-pill «Разместить заказ →» (инверсия для контраста). Иллюстрация `DescribeTaskIllustration` убрана (текст-герой). Откат — git history (предыдущие версии v1 серая карточка с 3 шагами / v2 иллюстрация на canvas).

**Lazyweb:** запросы «create request CTA card / post a job callout / service marketplace CTA banner». Взято: TaskRabbit (язык намерения в заголовке), LinkedIn (bounded callout-card структура), X1 (типографика-герой без картинки).

**Ключевое решение по обеим темам:** карточка — ФИКСИРОВАННАЯ брендовая панель `#161616` (named-константы, легальный §B overlay-case как PROMO BRAND_GRADIENTS), НЕ theme-токен. Причина: первая попытка на `bg-surface-dark` (#0a0a0a) в DARK-теме сливалась с canvas (#0a0a0a) — карточка исчезала. #161616 elevated и на белом (light), и на #0a0a0a (dark) + тонкая белая hairline border. Текст/CTA контрастны в обеих темах. Проверено скриншотами обеих тем.

### 2026-05-12 — Sprint 8.6: pg_net + edge function (а не Database Webhooks)
**Выбрано:** DB triggers → `extensions.http_post` (pg_net) → edge function `notify` → Expo Push API.

**Альтернатива (отброшена):** Supabase Database Webhooks (UI-driven). Это самый чистый паттерн, но конфигурация лежит вне миграций — невозможна через MCP, ломает версионирование инфраструктуры в git.

**Trade-off:** pg_net.http_post fire-and-forget, без retry. Если edge function недоступна — push потерян. Приемлемо для уведомлений (не сообщений). Sprint 9+ — можно добавить outbox-таблицу + cron для гарантированной доставки.

### 2026-05-12 — Sprint 8.6: shared secret в Vault, secret-value хардкод в миграции
**Выбрано:** `vault.create_secret('xtrud-notify-...', 'notify_secret', ...)` через миграцию 0018. Edge function читает через `vault.decrypted_secrets` service_role-запросом. Trigger function читает аналогично, передаёт в header `x-notify-secret`.

**Trade-off:** plain secret value сидит в файле миграции в git. Репозиторий private — допустимо для MVP. Перед публичным релизом — UPDATE vault.secrets WHERE name='notify_secret' через UI Dashboard.

**Альтернатива (отброшена):** Edge Functions secrets (env var). UI-only. Не управляется через MCP. Та же проблема версионирования.

### 2026-05-12 — Sprint 8.6: cancel push при signOut — best-effort
**Выбрано:** `signOut()` сначала вызывает `unregisterCurrentPushToken()` (DELETE token row), потом `auth.signOut()`. Если первая операция упала — продолжаем, не блокируем выход.

**Обоснование:** оставшийся token-row не критичен — при следующем login другого user'а UNIQUE-конфликт на `expo_token` обновит `user_id` через upsert. Просто гипотетический промежуток времени, когда чужие push идут на это устройство — минимизируется через сам процесс delete на signOut.

### 2026-05-12 — Sprint 8.4: один trigger function для обеих направлений рейтинга
**Выбрано:** одна функция `recalc_master_rating` с условием `IF v_direction = 'client_to_master' THEN UPDATE master_profiles ELSIF 'master_to_client' THEN UPDATE users`.

**Альтернатива (отброшена):** отдельный trigger function `recalc_client_rating` для другого направления. Тогда `reviews_recalc` стал бы парой триггеров с условиями. Это размывает ответственность — пересчёт идёт по одной таблице `reviews`, branch по direction логически живёт в одном месте.

**Trade-off:** имя `recalc_master_rating` теперь technically inaccurate (тоже clients), но переименование сломало бы immutable migration history. Comment обновили.

### 2026-05-12 — Sprint 8.4: рейтинг клиента в шапке заказа (не отдельный экран)
**Выбрано:** показывать `rating_as_client_avg/count` маленьким Star-чипом рядом с именем клиента в OrderInfoBlock.

**Альтернатива (отброшена):** отдельная публичная страница `/client/[id]`. Профиль клиента — это не «выставка работ», как у мастера. Клиенту нет смысла иметь портфолио / категории / bio. Полезный сигнал — рейтинг + число завершённых заказов. Это укладывается в один inline-чип.

**Trade-off:** мастер не может тапнуть имя клиента и посмотреть его историю заказов. Если соберём фидбэк что нужно — добавим в Sprint 9.

### 2026-05-12 — Sprint 8.2: единый `users.avatar_url` (а не `master_profiles.avatar_url`)
**Выбрано:** аватар хранится в `public.users.avatar_url` — общее поле для клиентов и мастеров.

**Альтернатива (отброшена):** разделить — клиент в `users_private.avatar_url`, мастер в `master_profiles.avatar_url`. Это даёт два пути загрузки, две зоны RLS, дублирование Avatar-логики во всех местах где показывается участник (OrderRow, chat, response, master public view).

**Бонус:** колонка уже существовала в 0001 (создана изначально как nullable для future-use), просто не использовалась — теперь добавили length-CHECK и подключили в UI.

### 2026-05-12 — Sprint 8.2: portfolio лимит 12 через DB trigger
**Выбрано:** trigger `check_portfolio_items_limit` BEFORE INSERT RAISE при COUNT≥12.

**Альтернатива (отброшена):** только клиентская проверка перед mutate. Это легко обходится прямым PostgREST-запросом или race-condition с двумя устройствами.

**Trade-off:** trigger делает дополнительный SELECT на каждый INSERT. На 12-row scope это микросекунды, для лимита целостности приемлемо.

### 2026-05-12 — Sprint 8.2: /profile экран один для клиента и мастера
**Выбрано:** единый `app/(tabs)/profile.tsx` (скрытый из таб-бара через `href:null`) с условным рендером portfolio-секции по `user.is_master`.

**Альтернатива (отброшена):** два отдельных экрана `/client-profile` и `/master-profile`. Дублирование top-bar, avatar-секции, sign-out — без выигрыша. Условные секции дёшево и легко читать.

**Trade-off:** при смене active_role через RoleSwitcher экран не реагирует — мастер всегда видит portfolio-секцию (показывается по `is_master=true`, а не по active_role). Это правильно: portfolio — это атрибут мастер-стороны, который существует пока is_master.

### 2026-05-12 — Sprint 8.2: storage cleanup при удалении portfolio_item — best-effort
**Выбрано:** `useDeletePortfolioItem` делает DELETE из БД, потом `try/catch` storage.remove. Storage-ошибка не пропагируется наружу.

**Обоснование:** UI важнее всего показать «удалено». Если файл осиротеет в bucket — это проблема стоимости хранения, а не данных. Periodic cleanup job (sprint 9+) подберёт осиротевшие файлы по diff `storage.list` vs `portfolio_items.storage_path`.

### 2026-05-12 — Sprint 8.1: public-buckets без broad SELECT policy
**Выбрано:** для `avatars` и `portfolio` SELECT policy узкая — только своя папка. Чтение объектов клиентами идёт через прямой public URL `/storage/v1/object/public/{bucket}/{path}`, который обслуживается storage-сервисом БЕЗ обращения к RLS (так устроены public buckets в Supabase).

**Альтернатива (отброшена):** broad `USING (bucket_id = '...')` SELECT. Advisor lint 0025 `public_bucket_allows_listing` — даёт анонимам право листать всю папку bucket и читать любой объект по пути, что раскрывает user_id всех мастеров. Public bucket уже даёт чтение по URL без RLS — broad SELECT избыточен и опасен.

**Trade-off:** `supabase.storage.list()` для bucket-листинга работает только в собственной папке пользователя. Для admin-сценариев в будущем понадобится service_role.

### 2026-05-12 — Sprint 8.1: upload через ArrayBuffer, не FormData/Blob
**Выбрано:** `fetch(localUri).then(r => r.arrayBuffer())` → передача ArrayBuffer в `supabase.storage.upload`.

**Альтернатива (отброшена):** FormData с `{ uri, type, name }` либо `fetch().blob()`. В React Native эти подходы исторически глючат — blob иногда возвращает 0 байт, FormData кривит multipart boundary. Supabase-docs прямо рекомендуют ArrayBuffer для RN.

### 2026-05-12 — Sprint 8.1: client-side resize обязателен, не отложен на edge function
**Выбрано:** resize на клиенте через expo-image-manipulator до upload (avatar 512px q0.82 / portfolio 1600px q0.85 jpeg).

**Альтернатива (отброшена):** грузить оригинал → Supabase Image Transformations (pro feature) или edge function ресайз. Это (1) платная фича, (2) каждый просмотр триггерит transformation = доп стоимость, (3) клиентский upload оригинала 5MB+ съедает мобильный трафик на ~10× больше.

**Trade-off:** теряем доступ к оригиналу для будущих ремастеров. Считаю это приемлемым — портфолио-фото не печатают в типографии.

### 2026-05-12 — Sprint 7.1: чат автоматически создаётся в accept_response RPC
**Выбрано:** при принятии отклика мастера RPC сразу создаёт chats row (INSERT ON CONFLICT DO NOTHING). Не нужен отдельный шаг «начать чат».

**Обоснование:** двусторонний акт принятия = старт коммуникации. UX-логично сразу показать чат обоим. Альтернатива (создавать чат лениво при первом сообщении) добавляла бы пустые состояния и race conditions.

### 2026-05-12 — Sprint 7.2: Realtime подписка только на INSERT, не SELECT
**Выбрано:** подписка через `postgres_changes` event=INSERT с фильтром `chat_id=eq.X`, новые сообщения добавляются в TanStack Query cache через setQueryData с dedup по id.

**Альтернатива (отброшена):** перезагружать messages через `invalidateQueries` при каждом Realtime событии. Это вызывает full refetch — лишний трафик.

**Trade-off:** UPDATE/DELETE сообщений не покрываются. Для sprint 7 это OK (нет редактирования). Sprint 8+ добавим UPDATE подписку если понадобится edit/delete.

### 2026-05-12 — Sprint 7.3: master rating через DB trigger вместо edge function
**Выбрано:** `recalc_master_rating` trigger в plpgsql AFTER INSERT/UPDATE/DELETE на reviews. Пересчёт AVG/COUNT, UPDATE master_profiles.

**Альтернатива (отброшена):** Edge Function с подпиской на изменения reviews. Дороже (network roundtrip), не атомарно, требует логики retry.

**Bonus:** trigger корректно обрабатывает DELETE/UPDATE отзывов — рейтинг автоматически пересчитывается.

### 2026-05-12 — Sprint 7.3: master→client review отложен в sprint 8
**Выбрано:** В sprint 7 только direction='client_to_master'. Master-to-client поле есть в enum, но UI и flow не реализованы.

**Обоснование:** двунаправленный рейтинг (мастер тоже оценивает клиента) — отдельная UX-проблема: где master её оставляет, как клиент видит свою репутацию, нужно ли скрывать от других мастеров и т.д. Лучше сделать качественно в sprint 8 чем поспешно сейчас.

### 2026-05-12 — Sprint 6.1: accept_response — атомарное reject остальных откликов
**Выбрано:** при accept одного отклика, остальные открытые (status IN sent/viewed) автоматически становятся rejected внутри одного RPC.

**Альтернатива (отброшена):** оставить остальные в status='sent', никого не отклонять явно. Master тогда не понимает что произошло — заказ просто пропал из ленты «Новые», но статус его отклика остался «sent» (ввдящее в заблуждение).

**Обоснование:** explicit rejection даёт masterу понятную ux-обратную связь — он видит status «rejected» с надписью «Клиент выбрал другого мастера». Это вежливо и понятно. Аналогичный паттерн используют Profi.ru, Thumbtack.

### 2026-05-12 — Sprint 6.3: master 3-tab вместо top-tabs navigator
**Выбрано:** простые pill-табы внутри single screen с conditional rendering. State хранится в useState.

**Альтернатива (отброшена):** установка `@react-navigation/material-top-tabs` библиотеки. Это даёт swipe gestures и nicer transitions, но добавляет дополнительную зависимость, layout shim, отдельный navigator.

**Trade-off:** pill-табы не дают swipe — меньше нативно для mobile. Но для 3 коротких списков заказов swipe не критичен; пользователь жмёт pills. Если в sprint 7+ окажется, что swipe заметно влияет на UX — перейдём на material-top-tabs.

### 2026-05-12 — Sprint 5: orders без PostGIS/address_exact/attributes JSONB на старте
**Выбрано:** минимальные orders + order_responses таблицы без geo_point, address_exact, gender_filter, requires_tags, is_anonymous, attributes JSONB.

**Обоснование:** PostGIS требует extension setup + конвертация address→coords (Geocoding API, платный). attributes JSONB требует metadata table category_fields с UI рендерингом форм. Эти усложнения добавим в sprint 6+ когда базовый E2E цикл orders подтвердит свою ценность.

**Sprint 6+ план:** добавить эти поля как ALTER TABLE, без миграций существующих строк (новые поля nullable).

### 2026-05-12 — Sprint 5.3: master feed без city/radius фильтрации в первой итерации
**Выбрано:** match только по l2_id (категории), не по city + service_radius.

**Обоснование:** В Ингушетии 5 городов на радиусе ~50 км — большинство мастеров логично работают по всему региону. City-фильтр на 5 городах добавит UI complexity без значимой пользы. Когда расширимся в другие регионы — добавим.

### 2026-05-11 — Sprint 4: применены 3 UX-паттерна из Яндекс Исполнители
**Что взято:**
1. **SafetyBanner** — «Без аванса и эскроу. Не переходите в сторонние мессенджеры». Защита от типового фрода. AUDIT.md риск №1.
2. **Profile completion CTA** — карточка «Добавьте категории» с правой accent-кнопкой Plus, если master_categories пуста.
3. **3-таб структура orders** — Новые / Я откликнулся / Меня пригласили. Заложено в backlog sprint 5, реализуется когда будет orders table.

**Что НЕ взято:**
- Промо-карточки с яркими градиентами (Cal.com стиль монохром).
- Платный «безлимит откликов» 199₽/неделя — наш проект «бесплатно для всех» (memory/project_xtrud.md).
- «Подключить продвижение» CTA — у Яндекса платная подписка за топ выдачи, у нас другая модель.

**В backlog sprint 5+:**
- Outcome tracking modal после контакта (обязательная разметка беру/не_договорились).
- Daily response limits (как опция монетизации, если реклама не пойдёт — AUDIT.md риск №2).

### 2026-05-11 — Sprint 4.2: master_categories optional после wizard, а не обязательный шаг онбординга
**Выбрано:** master_profiles создаётся в wizard (sprint 3.3, RPC complete_master_onboarding), `onboarding_completed_at` ставится сразу. master_categories — пустые в первый момент, master сам добавляет через CTA «Добавьте категории» в master view.

**Альтернатива (отброшена):** включить категории в wizard как обязательный шаг 2/2. Усложняет flow, не позволяет master'у быстро попасть в приложение и посмотреть UI «как клиент».

**Trade-off:** мастер может оказаться в приложении без категорий → не получать заявки. Решено через явный CTA-баннер в master view, который объясняет необходимость категорий.

### 2026-05-11 — Sprint 4.2: RPC set_master_categories для diff-sync
**Выбрано:** атомарный RPC `set_master_categories(p_l2_ids text[])` — `DELETE WHERE l2_id != ALL(p_l2_ids)` + `INSERT ON CONFLICT DO NOTHING`.

**Обоснование:** UI-операция «сохранить выбор» концептуально — установка состояния (список категорий), не множество разрозненных insert/delete. Atomic transaction в плpgsql функции гарантирует консистентность даже при race condition. SECURITY INVOKER + проверка auth.uid() внутри — без нужды в DEFINER (RLS уже даёт права).

**Альтернатива (отброшена):** клиент делает DELETE all + INSERT new подряд. Не атомарно — если INSERT упадёт, у мастера 0 категорий и нужно восстанавливать вручную.

### 2026-05-11 — Sprint 3.3: RPC complete_master_onboarding с SECURITY INVOKER
**Выбрано:** функция SECURITY INVOKER (не DEFINER), хотя оба варианта работают функционально.

**Обоснование:** Supabase advisor flag'ает SECURITY DEFINER функции callable authenticated через RPC как WARN (lint 0029). Поскольку RLS на public.users (auth.uid()=id) и public.master_profiles (auth.uid()=user_id) уже разрешает нужные операции, bypass через DEFINER не нужен. PL/pgSQL функция атомарна сама по себе — UPDATE + UPSERT в одной транзакции. Advisor = 0 lints.

**Migration history:** 0005 (изначально DEFINER) + 0006 (CREATE OR REPLACE на INVOKER) — оставлены оба чтобы сохранить immutable migration history.

### 2026-05-11 — Sprint 3.3: Master wizard на одном экране, не многошаговый
**Выбрано:** все поля master profile (имя, фамилия, город, район, bio, опыт, инструмент, транспорт, радиус) на одном экране через ScrollView + KeyboardAvoidingView.

**Альтернатива (отброшена):** 7-шаговый wizard из CATEGORIES_AND_PROFILES §2.1. Многошаговый flow добавляет step navigation, draft persistence, indicator UI — серьёзный overhead для sprint 3 scope. На одном экране пользователь видит всё, может скроллить и поправить — UX простой.

**Условие пересмотра:** sprint 4+ если масштаб полей вырастет (категории, портфолио, график) — разбить на 3-4 шага.

### 2026-05-11 — Sprint 2.3: bento-grid без фото в первой итерации
**Выбрано:** упрощённая сетка плиток с lucide-иконкой + surface-2 фоном вместо сигнатурного DESIGN_SYSTEM §9.1 паттерна (тёмное атмосферное фото + overlay-gradient + лейбл).

**Обоснование:** атмосферные фото для 26 категорий — это (а) 30-50 МБ assets, (б) подбор/curation/правовая чистка, (в) загрузка в Supabase Storage / R2 + клиентский resize через expo-image-manipulator. Это полноценная задача sprint 3+ с фото-инфрой. Сейчас лучше показать MVP-сетку, чем застрять.

**Условие пересмотра:** sprint 3 когда настроим R2 + источник фото.

### 2026-05-11 — Sprint 2.1: split-table подход к "приватный/публичный" профиль расширен на onboarding state
**Выбрано:** `users.onboarding_completed_at: timestamptz NULL` как маркер "выбрал ли пользователь роль" — публичная инфа.

**Альтернатива (отброшена):** хранить в `users_private` чтобы не было видно другим — overkill, статус онбординга семантически такой же публичный как `is_master`.

### 2026-05-11 — Sprint 1: anonymous-сессия как первичный auth механизм
**Выбрано:** anonymous sign-in под капотом + phone сохраняется в `users_private` без OTP-верификации.

**Обоснование:** реальный phone-OTP требует подключения SMS-провайдера через Supabase Dashboard (Twilio / MessageBird / Vonage / Smsc.ru). На старте sprint 1 это блокирует разработку и требует оплаты. Anonymous даёт реальную сессию + RLS работает + триггер создаёт `users` запись. UX phone-flow выглядит как настоящий OTP — пользователь вводит номер, "получает код" (симуляция 800ms), "вводит код" (любой 6-значный). В sprint 2 — 2-3 строки замены: `signInAnonymously` → `signInWithOtp`/`verifyOtp`.

**Условие пересмотра:** в sprint 2 — реальный OTP.

### 2026-05-11 — Sprint 1.4: split-table для приватных полей users
**Выбрано:** разделить `public.users` на 2 таблицы — `users` (публичный профиль) и `users_private` (phone, birth_year, gender, last_active_at) с RLS `auth.uid() = user_id`.

**Обоснование:** изначально пытался сделать SECURITY DEFINER view `users_public` для отдачи только публичных полей. Supabase advisor вернул ERROR `security_definer_view` (Lint 0010). Split-table — стандартный паттерн Supabase: чистый advisor, простой `SELECT *` для публичных читателей, RLS защищает приватные поля без хаков с views.

**Альтернатива (отброшена):** column-level GRANTs — невозможно совместить с row-level access "владелец видит всё, остальные — только публичные".

### 2026-05-11 — Sprint 1.5: 26 L2 visible (вместо 13 из PROJECT_MAP)
**Выбрано:** 13 главных категорий из PROJECT_MAP §5.12 + все 5 L2 в L1 Авто + все 7 L2 в L1 Бьюти + школа/языки/религиозное в Education = ~26 visible L2.

**Обоснование:** PROJECT_MAP §5.12 называет "Авто" и "Бьюти" как монолитные категории, но в фактической таксономии CATEGORIES_AND_PROFILES §1.3 эти L1 имеют 5 и 7 L2-подкатегорий. Логичнее показать «маникюр + парикмахер + массаж» как visible, чем выбрать один. Пользователь подтвердил это решение.

### 2026-05-11 — Стек: Expo universal (web + iOS + Android в одной кодовой базе)
**Выбрано:** Expo SDK 54+ с Expo Router v6, NativeWind 4, Zustand, TanStack Query, RHF + Zod, Supabase JS, Reanimated 4.

**Деплой:** EAS Build/Submit для mobile, Vercel или Cloudflare Pages для web.

**Альтернативы:** Monorepo Next.js + Expo раздельно (отброшено — слишком много дублирования), Flutter (другая экосистема), PWA-only (не дотягивает до нативных приложений).

### 2026-05-11 — Sprint 1.2: WCAG-фикс контраста palette
**Выбрано:** `muted-soft` light `#9ca3af → #71717a` (zinc-500, 4.61:1 на #fff ✅ AA), `accent` light `#3b82f6 → #2563eb` (blue-600, 5.6:1 на #fff ✅ AA body).

**Обоснование:** оригинальные значения из DESIGN_SYSTEM.md не проходят WCAG AA для body-текста (2.95:1 и 3.7:1). Подъём на 1-2 тона делает их accessible без потери визуального duxa Cal.com-стиля.

### 2026-05-11 — GitHub-репо: приватный
**Выбрано:** `killianche/xtrud` private. Переключение private→public — одна команда, обратный путь сложнее.

### 2026-05-11 — Supabase: регион eu-central-1, Free tier
**Выбрано:** Frankfurt, $0/мес. Регион нельзя сменить после создания.

### 2026-05-11 — Документация: разбита на короткий CLAUDE.md + детальные `.claude/rules/*.md`
**Выбрано:** CLAUDE.md ~120 строк + `.claude/rules/working-rules.md` с `paths: ["**/*"]` для автозагрузки. Рекомендация best-practice репо: «under 200 lines for reliable adherence».
