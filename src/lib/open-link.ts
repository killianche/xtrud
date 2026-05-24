/**
 * openExternalUrl — кросс-платформенное открытие внешних ссылок (tel:, https://wa.me,
 * https://t.me, обычные http(s)).
 *
 * Why. На web `Linking.openURL` из react-native-web меняет `window.location`, что
 * для SPA = перезагрузка приложения → пользователя выбрасывает на главную (баг
 * 2026-05-22: «нажал Позвонить на мастере — перекинуло на главную»). Для tel:/
 * wa.me/t.me это особенно заметно. На web используем клик по `<a target="_blank">`
 * — браузер сам обрабатывает протокол (открывает звонилку / WhatsApp / новую
 * вкладку), НЕ трогая текущий SPA-роут. На native — обычный Linking.openURL.
 */

import { Linking, Platform } from "react-native";

export function openExternalUrl(url: string): void {
  if (!url) return;
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  Linking.openURL(url).catch(() => {
    // Нет приложения для обработки схемы (например, tel: на планшете без SIM) —
    // тихо игнорируем, чтобы не падать.
  });
}
