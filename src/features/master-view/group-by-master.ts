// Чистая группировка строк по мастеру.
//
// Вынесена из хука пакетной загрузки, потому что тот тянет клиент базы, а с
// ним react-native, который vitest не разбирает (Flow-синтаксис). Логика,
// которую стоит проверять тестом, не должна зависеть от платформы.

/** Группирует строки по master_id, сохраняя порядок выдачи сервера. */
export function groupByMaster<T extends { master_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.master_id);
    if (list) list.push(row);
    else map.set(row.master_id, [row]);
  }
  return map;
}
