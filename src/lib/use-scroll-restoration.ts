/**
 * useScrollRestoration — запоминает позицию прокрутки ScrollView и
 * восстанавливает её, когда экран снова получает фокус.
 *
 * Зачем: при переходе на отдельную страницу выбора (категории
 * /orders/category-select или локации /orders/location-select) и возврате
 * назад форма прокручивалась в самый верх — пользователь терял место.
 *
 * ── Web-ловушки, которые обходим (2026-05-24) ──────────────────────────────
 *
 * 1. **Экран ПЕРЕсоздаётся при навигации.** На web возврат на /orders/new
 *    нередко не «показывает спрятанный экран», а unmount→mount заново (та же
 *    причина, по которой форму держим в Zustand-draft). Component-local
 *    `useRef(offset)` при этом обнулялся. Решение: храним offset в МОДУЛЬНОМ
 *    Map, keyed by route — он переживает remount.
 *
 * 2. **Сброс scrollTop при скрытии/показе шлёт onScroll(0).** Браузер при
 *    display:none/возврате ставит scrollTop=0 и шлёт scroll-событие. Без защиты
 *    наш onScroll ловил этот 0 и затирал сохранённое значение. Решения:
 *    `focusedRef` — пишем offset только пока экран в фокусе; `restoringRef` —
 *    во время самого восстановления offset не трогаем (иначе и наши scrollTo,
 *    и сбросы браузера затирали бы сохранённое).
 *
 * 3. **Восстановление затиралось поздним сбросом.** Сбросы приходят несколькими
 *    волнами в течение ~1s после возврата display. Поэтому переустанавливаем
 *    позицию каждый кадр, пока она не удержится 10 кадров подряд (минимум 30
 *    кадров, потолок 120 ≈ 2s). Это также покрывает случай, когда контент ещё
 *    не разложён и scrollTo клампится.
 *
 * На react-native-web `ref.scrollTo()` НЕ делегирует в DOM — поэтому на web
 * восстановление идёт через underlying DOM-элемент (`getScrollableNode().
 * scrollTop = y`). На native срабатывает нативный `scrollTo`.
 *
 * Применение:
 *   const { ref, onScroll } = useScrollRestoration();
 *   <ScrollView ref={ref} onScroll={onScroll} scrollEventThrottle={16} ... />
 *
 * Опциональный `key` — если на одном pathname несколько независимых скроллов;
 * по умолчанию ключ = pathname экрана (фиксируется один раз при первом mount'е,
 * чтобы фоновая смена pathname не путала ключ).
 */

import { useFocusEffect, usePathname } from "expo-router";
import { useCallback, useRef } from "react";
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from "react-native";

// Сохранённые offset'ы, keyed by route. Module-level → переживают remount экрана.
const savedOffsets = new Map<string, number>();

export function useScrollRestoration(key?: string) {
  const ref = useRef<ScrollView>(null);
  const pathname = usePathname();
  // Ключ фиксируем один раз при первом mount'е: usePathname глобален и при
  // уходе на под-экран вернёт чужой pathname, что сломало бы ключ.
  const keyRef = useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = key ?? pathname;
  const focusedRef = useRef(false);
  const restoringRef = useRef(false);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    // Пишем offset только от реальной прокрутки пользователя: не когда экран
    // скрыт (focusedRef=false) и не во время восстановления (restoringRef=true).
    if (!focusedRef.current || restoringRef.current) return;
    const k = keyRef.current;
    if (k) savedOffsets.set(k, e.nativeEvent.contentOffset.y);
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const k = keyRef.current;
      const y = k ? (savedOffsets.get(k) ?? 0) : 0;

      let cancelled = false;
      let raf = 0;

      if (y > 0) {
        restoringRef.current = true;
        let frame = 0;
        let stable = 0;
        const tick = () => {
          if (cancelled) return;
          const node = ref.current as unknown as {
            scrollTo?: (opts: { y?: number; animated?: boolean }) => void;
            getScrollableNode?: () => { scrollTop?: number } | null;
          } | null;
          let isNative = false;
          if (node) {
            const dom = node.getScrollableNode?.();
            // ⚠️ На native getScrollableNode() возвращает ЧИСЛО → `"scrollTop" in
            // <число>` бросает "right operand of 'in' is not an object" (краш-фикс
            // 2026-06-11). typeof-проверка делает блок web-only, как и задумано.
            if (dom && typeof dom === "object" && "scrollTop" in dom) {
              const d = dom as { scrollTop?: number };
              // «Прилипла» = браузер не сбросил позицию с прошлого кадра
              // (читаем ДО того, как выставим снова).
              if (Math.abs((d.scrollTop ?? 0) - y) <= 1) stable += 1;
              else stable = 0;
              d.scrollTop = y;
            } else {
              node.scrollTo?.({ y, animated: false });
              isNative = true;
            }
          }
          frame += 1;
          const done = isNative || (stable >= 10 && frame >= 30) || frame >= 120;
          if (done) {
            restoringRef.current = false;
          } else {
            raf = requestAnimationFrame(tick);
          }
        };
        tick();
      }

      return () => {
        focusedRef.current = false;
        restoringRef.current = false;
        cancelled = true;
        if (raf) cancelAnimationFrame(raf);
      };
    }, []),
  );

  return { ref, onScroll };
}
