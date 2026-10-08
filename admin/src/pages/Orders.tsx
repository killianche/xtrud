// «Задания» (2026-10-04): все задания площадки — фильтр по состоянию, поиск
// по названию или номеру клиента. Строка ведёт в карточку задания.

import { useEffect, useState } from "react";
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type OrderRow } from "../lib/api";

type Filter = "all" | "open" | "completed" | "cancelled";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "open", label: "Открытые" },
  { value: "completed", label: "Исполнитель выбран" },
  { value: "cancelled", label: "Отменённые" },
];

const COLS = "minmax(0,2.4fr) minmax(0,1.2fr) minmax(0,1fr) 70px 110px 120px";

export function Orders({ onOpen }: { onOpen: (orderId: string) => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload — ручное обновление
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const timer = setTimeout(() => {
      api
        .listOrders(search, filter === "all" ? null : filter, 100)
        .then((r) => !cancelled && setRows(r))
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, filter, reload]);

  return (
    <div>
      <PageHead eyebrow="Площадка" title="Задания" />
      <div className="toolbar">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название или номер клиента"
          aria-label="Поиск заданий"
        />
        <Segmented value={filter} options={FILTERS} onChange={setFilter} />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !rows ? (
        <SkeletonRows count={6} height={52} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={search ? "Ничего не нашлось" : "Заданий нет"}
          hint={search ? "Проверьте название или номер." : "Здесь появятся задания из приложения."}
        />
      ) : (
        <div className="list">
          <div className="list-row is-head" style={{ gridTemplateColumns: COLS }}>
            <span>Задание</span>
            <span>Клиент</span>
            <span>Место</span>
            <span>Предложения</span>
            <span>Состояние</span>
            <span>Создано</span>
          </div>
          {rows.map((o) => (
            <a
              key={o.id}
              className="list-row is-link"
              style={{ gridTemplateColumns: COLS }}
              href={`#/orders/${o.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onOpen(o.id);
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{o.title}</div>
                <div className="cell-sub">{o.category ?? "—"}</div>
              </div>
              <span className="cell-sub col-hide-sm">{o.client_label ?? "Без имени"}</span>
              <span className="cell-sub col-hide-sm">{o.city ?? "Вся Ингушетия"}</span>
              <span className="cell-num col-hide-sm">{o.responses_count}</span>
              <span>
                <Badge status={o.status} />
              </span>
              <span className="cell-sub col-hide-sm">
                <RelativeTime iso={o.created_at} />
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
