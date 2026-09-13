# react-native-rustore-push — копия в репозитории

Источник: https://gitflic.ru/project/rustore/react-native-rustore-push-sdk,
коммит `c23260a660f943d7f09a828a48e5b4d513b21a95` (16.04.2025), версия 6.9.1,
лицензия MIT (`MIT-LICENSE.txt`).

Почему копия, а не зависимость по git-ссылке:

1. Код SDK не компилируется с React Native 0.86: в RN 0.77+
   `ActivityEventListener.onNewIntent` принимает `Intent`, а SDK объявляет
   `Intent?`. Сборка 2026-09-13 упала на `:react-native-rustore-push:compileReleaseKotlin`
   ровно с двумя ошибками в `RustorePushModule.kt:41–42`. Более новой версии
   на gitflic нет.
2. `npm ci` каждой сборки — включая iPhone — не должен зависеть от gitflic.

Изменения относительно источника — два. Первое: из `package.json` убраны
поля сборки самого SDK (`devDependencies`, `scripts`, `packageManager` и
настройки инструментов) — для локальной копии npm ставит и dev-зависимости,
и без этой правки в проект приезжало 1426 лишних пакетов. Второе: сигнатура `onNewIntent` в
`android/src/main/java/com/rustorepush/RustorePushModule.kt` (строка помечена
комментарием `xtrud:`). Каталоги `ios/` и `example/` не скопированы: модуль
только для Android и исключён из автоподключения iOS (`package.json` →
`expo.autolinking`).

Обновление: взять новую версию из источника, перенести пометку `xtrud:`,
если она ещё нужна, и прогнать сборку Android.
