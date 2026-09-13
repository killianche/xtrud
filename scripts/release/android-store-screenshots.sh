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

shot() {
  local name="$1" wait="${2:-10}"
  sleep "$wait"
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
