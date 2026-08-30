/**
 * useDebouncedValue — стандартный pattern для typeahead-поиска.
 *
 * Когда: typeahead, любое API-вызов на keystroke. По умолчанию 200ms —
 * порог восприятия инпута без визуального лага (Algolia/Google
 * autocomplete используют 150–250ms).
 *
 * Зачем: убрать (а) мерцание результатов на каждом нажатии, (б) лишние
 * сетевые roundtrips в Supabase, (в) race conditions когда ответы
 * приходят в порядке отличном от запросов.
 *
 * Использование:
 *   const debounced = useDebouncedValue(query, 200);
 *   const { data } = useQuery({ queryKey: ['x', debounced], ... });
 *
 * Когда НЕ использовать: pull-to-refresh, button-click, любые
 * discrete-эвенты (не каскад значений).
 */

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debouncedValue;
}
