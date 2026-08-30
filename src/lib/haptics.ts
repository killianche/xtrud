/**
 * Единая точка вызова тактильного отклика (`expo-haptics`).
 *
 * Зачем обёртка. Haptics недоступны на части устройств, в Low Power Mode и на
 * симуляторе — вызов может throw/reject. До этого файла защита была скопирована
 * в 3 разных местах (блокировка мастера/клиента/заказчика — одинаковый
 * try/catch с одинаковым комментарием). Здесь она написана один раз.
 *
 * Канон типов — docs/IOS_FOUNDATION.md §5.5:
 *   - hapticSelection — смена выбора: чип, сегмент, шаг пикера, таб, категория/город.
 *   - hapticImpact — фиксация жеста: закрытие листа, swipe-action, drag-snap.
 *   - hapticSuccess/hapticWarning/hapticError — результат операции: заказ
 *     опубликован, отклик отправлен, ошибка формы, удаление.
 * Запрещено (там же): haptics на каждом скролле/рендере/пассивном событии, и
 * haptics как единственный сигнал результата — рядом всегда есть текст/UI.
 *
 * Системной настройки «выключить haptics» (аналог Reduce Motion) в публичном
 * API iOS/RN нет: `AccessibilityInfo` отдаёт `isReduceMotionEnabled` и
 * `prefersCrossFadeTransitions`, но ни одного haptics-флага (проверено по
 * исходникам react-native/Libraries/Components/AccessibilityInfo). Единственный
 * известный кейс отключения — Low Power Mode, который просто молча не вибрирует
 * (не бросает ошибку) — try/catch здесь обходит и его, и hardware-кейсы.
 */

import * as Haptics from "expo-haptics";

async function safeHaptic(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // haptics недоступны (Low Power Mode, симулятор, часть устройств) —
    // тихо игнорируем: haptics никогда не единственный сигнал результата.
  }
}

/** Смена выбора: чип, сегмент, шаг пикера, таб, категория/город, переключение роли. */
export function hapticSelection(): void {
  void safeHaptic(() => Haptics.selectionAsync());
}

/** Фиксация жеста: закрытие листа, swipe-action, drag-snap. */
export function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
): void {
  void safeHaptic(() => Haptics.impactAsync(style));
}

/** Результат значимого действия — успех (заказ опубликован, отклик отправлен и т.п.). */
export function hapticSuccess(): void {
  void safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Результат значимого действия — предупреждение (не блокирующая проблема). */
export function hapticWarning(): void {
  void safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Результат значимого действия — ошибка (форма, публикация, отправка). */
export function hapticError(): void {
  void safeHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
