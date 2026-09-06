# Внешние зависимости xtrud

## TL;DR

**Имя для запроса:** «от чего зависит xtrud», «что оплачивать», «что останется
после Beget».

Перенос backend на Beget убирает Supabase Cloud как production hosting, но не
делает mobile-продукт полностью автономным. Этот реестр отделяет подтверждённые
зависимости от `UNKNOWN`; секреты и цены здесь не хранятся.

| Зависимость | Назначение | Сейчас подтверждено | После Beget | Fallback / gate |
|---|---|---|---|---|
| GitHub | канонический Git `killianche/xtrud`, CI | подключён `origin/main` | остаётся | локальный clone не заменяет offsite Git; access/CI проверяются перед release |
| Apple / App Store Connect | iOS signing, TestFlight, публикация | iOS 1.0.1 build 11 по ledger | остаётся обязательно | опубликованный binary не откатывается; feature-off или новый build |
| Expo EAS | текущая remote native build/submit orchestration | EAS project и profiles заданы | остаётся до отдельного решения | локальный iOS/Android production build fallback пока `UNKNOWN`, его нельзя обещать |
| Supabase Cloud | не используется с 2026-09-06 | сервер и БД шлют только в Beget (0165); облачный проект пока существует | удалить проект в кабинете Supabase — действие владельца | перед удалением: на Beget есть своя ночная копия (`/opt/xtrud/backup.sh`) |
| Beget VPS | production self-hosted Supabase | `api.xtrud.pro`, стек работает с 2026-08-31 | основной backend host | exact-stack preflight; существующий `62.113.106.30` для backend NO-GO |
| Beget S3 app | Storage object backend | bucket/endpoint/credentials отсутствуют | обязателен | reviewed S3 Adapter + empty-bucket upload/download/checksum smoke |
| Beget S3 backup | DB/Storage backup и PITR | bucket/credentials отсутствуют | обязателен и отдельный от app | versioning/retention + real point-in-time restore |
| DNS `xtrud.pro` | `api`, AASA, recovery/legal routes | зона/оператор live не перепроверялись в этой работе | остаётся | scoped DNS access и cutover/rollback evidence |
| Unisender Go API | password recovery email | function использует HTTPS API и protected key | остаётся, пока не принято другое решение | provider/account/payment/live delivery — проверить перед backend cutover |
| Expo Push / APNs / FCM | push transport | server function существует; mobile registration отключена в v1 | `UNKNOWN` до отдельного push decision | не заявлять push как working; provider credentials и device E2E обязательны |
| Sentry | optional crash reporting | SDK есть, без DSN no-op | optional | собственный `client_errors` не доказывает полноценный monitoring; data policy до включения |

## Правила

1. Актуальная цена, доступность оплаты из России, SLA и лимиты проверяются у
   provider перед покупкой; старые числа из docs не используются как FACT.
2. В Git можно хранить только identifiers, public endpoint и fingerprints,
   когда это требуется release-контрактом. Пароли, tokens, private keys, DSN с
   закрытым контекстом, dumps и PII запрещены.
3. Внешняя зависимость не считается working по наличию SDK или config. Нужны
   account/resource state и end-to-end smoke.
4. Новый provider проходит product, CTO, security, legal/data и QA review;
   решение фиксируется ADR до внедрения.
