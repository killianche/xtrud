# ADR-0001: mobile-first Expo и self-hosted Supabase на Beget

- Статус: accepted
- Дата: 2026-08-25
- Владельцы решения: владелец продукта + совет качества xtrud

## Контекст

xtrud должен стать простым российским marketplace услуг: заказчик публикует
задание, исполнители откликаются. iOS уже опубликован; Android configured, но
его build/device QA не подтверждены. Production backend работает в Supabase
Cloud, оплата которого из России создаёт операционный риск. Отдельный Beget VPS,
S3 и DNS пока не созданы.

## Решение

1. Главный продукт — mobile. Одна Expo/React Native/TypeScript кодовая база
   остаётся общим Module для iOS и Android.
2. iOS — первый production и основной device-контур. Android использует те же
   domain/data Interfaces, проходит ранние preview/device gates и выпускается
   отдельной волной после стабилизации iOS.
3. Web остаётся supporting Adapter для legal/support/account deletion,
   recovery, AASA/universal links и лёгких публичных маршрутов.
4. Backend Module остаётся Supabase-compatible: PostgreSQL/RLS, Auth,
   PostgREST, Storage, Realtime и Edge Functions. Production переносится на
   exact digest-pinned self-hosted Supabase Docker на отдельном Beget VPS.
5. Storage objects и encrypted backups используют разные Beget S3 buckets и
   credentials. Наружу публикуются только Caddy 80/443; Envoy слушает loopback;
   DB/Studio/Supavisor не публикуются.
6. Kubernetes, микросервисы и второй application backend не добавляются до
   измеренной нагрузки или подтверждённой функциональной необходимости.

## Почему это подходит

- Текущий код, маршруты, native config и release history уже используют Expo и
  Supabase; смена стека сейчас увеличит риск без доказанной пользы.
- Shared mobile Module даёт leverage: бизнес-правила и тесты живут за одним
  Interface, а platform differences остаются в Adapters на реальных Seams.
- PostgreSQL/RLS и существующие `orders`/`order_responses` покрывают MVP без
  распределённой архитектуры.
- В официальной документации Beget S3 описан как S3-compatible хранилище на
  Ceph, а Supabase Storage поддерживает внешний S3 backend. Совместимость
  конкретного endpoint всё равно требует runtime smoke на созданном bucket:
  [Beget S3](https://beget.com/ru/kb/manual/obektnoe-hranilishche-s3-v-beget),
  [Supabase external S3](https://supabase.com/docs/guides/self-hosting/self-hosted-s3).

## Отклонённые варианты

- **Два отдельных iOS/Android проекта:** дублируют бизнес-логику и тестовую
  поверхность, ухудшают locality.
- **Одновременный store launch:** удваивает release/device QA при меняющемся
  flow; Android пока не имеет baseline build.
- **Android только после нескольких iOS-релизов:** слишком поздно выявит
  platform-specific permissions/back/keyboard/storage проблемы.
- **Собственный compose из произвольных образов:** создаёт несовместимый
  Supabase stack. Используется exact upstream snapshot + reviewed Adapters.
- **Kubernetes/микросервисы:** нет измеренной нагрузки, оправдывающей эту
  interface/operations сложность.

## Последствия

- Любой vertical slice проектируется shared-first, проверяется на iOS и до
  freeze получает Android preview/device evidence либо честный `UNKNOWN`.
- Backend rollout остаётся additive и совместимым со старым iOS binary.
- Self-hosting переносит операционную ответственность за backup/PITR,
  monitoring, security updates и restore tests на xtrud.
- Supabase Cloud не удаляется до завершённого cutover и rollback window.
- Apple/App Store, EAS/локальная сборка, email и push остаются отдельными
  внешними зависимостями; перенос backend не устраняет их.

## GO / NO-GO

- Локальная mobile-разработка: **GO**.
- iOS-first с постоянной Android compatibility: **GO**.
- Android production: **NO-GO** до preview build и device QA.
- Beget production: **NO-GO** до VPS/S3/DNS, production validators, двух clean
  restore, negative-auth, WAL/PITR и monitoring evidence.

## UNKNOWN

Launch load, SLO, Beget endpoint/region, Android device matrix, providers
push/SMS/email и regulated-category rules не угадываются. Способ проверки и
влияние каждого UNKNOWN записаны в профильных runbooks.
