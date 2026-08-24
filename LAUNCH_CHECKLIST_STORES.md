# Store launch checklist — web/iOS и future Android

> Актуально на 2026-08-23. Checklist не содержит заранее выбранных privacy,
> content-rating или export-compliance ответов. Их необходимо заново получить из
> фактического бинарника, SDK inventory и текущих формулировок store console.

## 0. Release boundary

- Текущая эксплуатация: web + iOS.
- Android: future; его проверки и публикация выполняются отдельным release
  ticket и не считаются готовыми по результатам iOS/web проверки.
- Production-домен: `https://xtrud.pro`.
- Product flow: объявление → отклики → клиент звонит или пишет мастеру в
  WhatsApp.
- Auth: email или телефон + пароль; recovery по email; SMS/OTP нет.
- Scope: строительство, ремонт и услуги для дома.

## 1. Локальный release gate

- [ ] Рабочая ветка и commit явно зафиксированы в release ticket.
- [ ] `npm ci` выполнен на чистом checkout.
- [ ] `npm run release:check` проходит без исключений.
- [ ] `npx expo-doctor` проходит.
- [ ] Версия, iOS build number и EAS version source проверены release gate.
- [ ] Production configuration не включает demo bypass.
- [ ] Guest device smoke проходит: `maestro test .maestro/smoke.yaml`.
- [ ] Authenticated read-only smoke проходит с credentials из password manager.

## 2. Фактический data/SDK inventory

Для релизного commit составить датированный inventory. Источники: production
конфигурация, dependency lockfile, native manifests/entitlements, сетевые
запросы на реальном устройстве, Supabase schema/storage, Sentry configuration и
пользовательские формы.

Для каждого поля или события записать:

- что именно собирается или передаётся;
- обязательное оно или опциональное;
- к какому аккаунту/устройству привязано;
- цель обработки;
- получатель/процессор и страна обработки;
- хранение, удаление и доступ пользователя;
- используется ли для tracking по актуальному определению платформы.

Минимально перепроверить, но не считать этот список готовым ответом для console:

- email, телефон, имя, username и парольную авторизацию;
- тексты заказов/откликов, бюджет, сроки и категории;
- фотографии заказа, аватар и портфолио;
- рейтинги/отзывы мастера и жалобы;
- документы верификации мастера, если путь доступен в релизной сборке;
- client error telemetry и Sentry при реально заданном DSN;
- внешние переходы в телефон и WhatsApp;
- device identifiers, diagnostics и данные, добавляемые SDK автоматически.

- [ ] Inventory проверен инженером.
- [ ] Privacy/legal owner подтвердил цели и сроки хранения.
- [ ] Датированный артефакт сохранён в закрытом release ticket.

## 3. Store privacy questionnaires

- [ ] Открыта текущая, а не сохранённая старая версия questionnaire.
- [ ] Каждый ответ сопоставлен со строкой фактического inventory.
- [ ] Проверены определения linked data, tracking, collection и processing on
  device в текущей документации Apple/Google.
- [ ] Ответы сторонних SDK сверены с их актуальной privacy-документацией и
  фактической конфигурацией xtrud.
- [ ] Privacy manifest/labels проверены по итоговому архиву, а не только по JS.
- [ ] Политика на `xtrud.pro/privacy` соответствует фактическим ответам.
- [ ] Экспорт или скриншоты финальных ответов сохранены в закрытом release
  ticket.

Запрещено переносить старые ответы «данные не собираются», конкретные категории
данных или tracking-флаги без нового inventory.

## 4. Content rating и compliance

- [ ] Пройти актуальную rating questionnaire в консоли по реально доступному
  пользовательскому контенту и функциям.
- [ ] Проверить UGC: публикация заказов, отклики, портфолио, отзывы и жалобы.
- [ ] Проверить, что описанные в console механизмы moderation/report/block/filter
  действительно доступны в submitted build; отсутствие оформить blocker, а не
  отмечать как готовое.
- [ ] Ответить на encryption/export-compliance вопросы по итоговому iOS archive и
  фактическим криптографическим зависимостям.
- [ ] Подтвердить права на иконки, тексты, скриншоты и фотографии.

Никакой возрастной рейтинг, privacy answer или compliance answer не считается
истиной только потому, что он записан в старом документе.

## 5. Metadata и публичные URL

- [ ] Store copy полностью совпадает с `STORE_METADATA.md`.
- [ ] Нет чата, SMS/OTP, lifecycle сделки, платежей и категорий вне scope.
- [ ] Нет обещаний, которых нельзя подтвердить в submitted build.
- [ ] `https://xtrud.pro` открывается из целевой страны.
- [ ] `/support`, `/privacy` и `/terms` возвращают корректное production-содержимое
  без входа.
- [ ] Support contacts реально обслуживаются.
- [ ] Скриншоты сняты с того же UI и той же платформы, что отправляются на review.
- [ ] Скриншоты не содержат реальных персональных данных.

## 6. Review account

- [ ] Login и password взяты из password manager по ссылкам из
  `DEMO_ACCOUNTS.md`.
- [ ] Ранее раскрытые credentials ротированы во внешней системе и старый пароль
  не работает.
- [ ] Аккаунт существует в production, подтверждён и не требует SMS/OTP.
- [ ] Это отдельный клиентский review account с синтетическими данными.
- [ ] Вход проверен на чистом физическом устройстве через production build.
- [ ] Review Notes объясняют объявление → отклики → внешний контакт.
- [ ] Credentials внесены непосредственно в store console, не в Git/CI/log.

## 7. iOS submission

- [ ] App ID, bundle ID, signing team и capabilities проверены в Apple portals.
- [ ] Version/build number свободны и совпадают с отправляемым архивом.
- [ ] Production EAS build создан из зафиксированного чистого commit.
- [ ] Архив проверен на фактически включённые permissions, entitlements,
  URL schemes и privacy manifests.
- [ ] TestFlight install на чистом физическом устройстве проходит.
- [ ] Проверены: первый запуск, регистрация, вход email/phone+password, recovery,
  создание заказа, отклик мастера, внешний phone/WhatsApp, logout и удаление
  аккаунта.
- [ ] Отдельно запущен read-only Maestro smoke; мутационные сценарии проверены
  вручную на предназначенных тестовых данных.
- [ ] Crash/ANR и сетевые ошибки проверены после device smoke.
- [ ] Только после всех checks выполнен submit в App Store Connect.

## 8. Android — future, отдельный gate

Не считать Android готовым из-за общего Expo-кода или успешного web/iOS релиза.

- [ ] Создан отдельный Android release ticket и назначен владелец Play Console.
- [ ] Итоговый merged manifest проверен на permissions; каждый permission имеет
  работающий пользовательский сценарий и store disclosure, иначе удалён до
  сборки.
- [ ] Отдельно проверить отсутствие неиспользуемых microphone/`RECORD_AUDIO`
  permissions: в текущей модели продукта записи аудио нет.
- [ ] Deep links/app links проверены на production-домене `xtrud.pro`.
- [ ] Signing, package name, service account и Play App Signing проверены.
- [ ] Play Data Safety заполнен из отдельного Android inventory и текущей формы.
- [ ] Content rating пройден в текущей Play Console.
- [ ] Phone/tablet screenshots и feature graphic сняты с Android build.
- [ ] Internal testing install и physical-device smoke пройдены.
- [ ] Staged rollout и rollback owner согласованы до production.

## 9. Release record

Закрытый release ticket должен содержать commit SHA, номера сборок, ссылки на
EAS/store records, результаты gates, фактический inventory, exports текущих
questionnaires, дату credential rotation, device matrix, решение submit и
ответственного. Секреты и реальные персональные данные в ticket не копировать;
хранить только ссылки на password manager.
