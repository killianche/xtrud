#!/usr/bin/env bash
# Скриншоты Android для карточки RuStore и первый запуск на Android.
#
# Запускается внутри эмулятора из .github/workflows/android-screenshots.yml:
# ставит APK (профиль android-test — окружение production), открывает экраны
# по ссылкам xtrud:// и снимает их в светлой и тёмной теме. Лог сбоев
# сохраняется рядом: это заодно проверка, что приложение вообще стартует.
set -euo pipefail

APK="$(find apk -name '*.apk' | head -1)"
OUT="screenshots"
PKG="com.xtrud.app"
mkdir -p "$OUT"

echo "APK: $APK"
adb install -r "$APK"

# Медленный эмулятор роняет системный лаунчер в «isn't responding», и диалог
# перекрывал все снимки первого прогона (2026-09-13). Приложению лаунчер не
# нужен: открываем его по ссылкам. Диалоги ошибок чужих процессов прячем.
adb shell settings put global hide_error_dialogs 1 || true
adb shell pm disable-user --user 0 com.google.android.apps.nexuslauncher || true

shot() {
  local name="$1" wait="${2:-10}"
  sleep "$wait"
  adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1 || true
  sleep 1
  adb exec-out screencap -p > "$OUT/$name.png"
  echo "снят $name"
}

open_link() {
  adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" > /dev/null
}

adb logcat -c
adb shell cmd uimode night no
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 > /dev/null
shot 00-launch 30

open_link "xtrud:///";            shot 01-home 12
open_link "xtrud:///find";        shot 02-find 15
open_link "xtrud:///specialists"; shot 03-specialists 15
open_link "xtrud:///orders/new";  shot 04-new-order 12
open_link "xtrud:///orders";      shot 07-orders 12

adb shell cmd uimode night yes
open_link "xtrud:///";            shot 05-home-dark 12
open_link "xtrud:///find";        shot 06-find-dark 15

# Жив ли процесс после всех переходов — это и есть смоук-проверка запуска.
if adb shell pidof "$PKG" > /dev/null; then
  echo "процесс жив" | tee "$OUT/process.txt"
else
  echo "ПРОЦЕСС НЕ НАЙДЕН — приложение упало" | tee "$OUT/process.txt"
fi
adb logcat -d -b crash > "$OUT/logcat-crash.txt" || true
adb logcat -d '*:E' > "$OUT/logcat-errors.txt" || true
