/**
 * Pull-to-refresh helper для всех list-экранов.
 *
 * Возвращает `{ refreshing, onRefresh }` и готовый JSX `<RefreshControl />`.
 * Refetch'ит ВСЕ активные TanStack Query — экран сам решает что монтировать.
 *
 * Использование:
 *   const refresh = usePullToRefresh();
 *   <ScrollView refreshControl={refresh.control}>...</ScrollView>
 */

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { RefreshControl } from "react-native";

export function usePullToRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await qc.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [qc]);

  return {
    refreshing,
    onRefresh,
    control: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />,
  };
}
