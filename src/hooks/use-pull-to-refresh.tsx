/**
 * Pull-to-refresh для списочных экранов.
 *
 * По умолчанию обновляет ВСЕ активные запросы. Это дорого: вкладки в нижнем
 * меню остаются смонтированными, поэтому один свайп на карточке мастера
 * перезапрашивал заодно категории главной, топ-мастеров и счётчики
 * непрочитанного.
 *
 * Экран может передать свои ключи и обновлять только себя:
 *   const refresh = usePullToRefresh(["master-public", "reviews-for-target"]);
 *
 * Совпадение по первому элементу ключа, поэтому ["master-public"] покрывает и
 * ["master-public", masterId].
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { RefreshControl } from "react-native";
import { useThemeColor } from "@/lib/use-theme-color";

export function usePullToRefresh(scopeKeys?: readonly string[]) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Цвет спиннера берётся из токена: захардкоженный хекс не менялся в тёмной
  // теме и был дефектом приёмки (.claude/rules/design-enforcement.md §2).
  const spinnerColor = useThemeColor("accent");

  // Ключи приходят литералом на месте вызова, поэтому ссылка на массив новая
  // на каждом рендере — сериализуем, чтобы onRefresh не пересоздавался.
  const scopeSignature = scopeKeys ? scopeKeys.join(" ") : null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (scopeSignature === null) {
        await qc.refetchQueries({ type: "active" });
        return;
      }
      const roots = scopeSignature.split(" ");
      await qc.refetchQueries({
        type: "active",
        predicate: (query) => {
          const head = query.queryKey[0];
          return typeof head === "string" && roots.includes(head);
        },
      });
    } finally {
      setRefreshing(false);
    }
  }, [qc, scopeSignature]);

  const control = useMemo(
    () => <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={spinnerColor} />,
    [refreshing, onRefresh, spinnerColor],
  );

  return { refreshing, onRefresh, control };
}
