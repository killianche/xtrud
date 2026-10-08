// Список людей с поиском по имени и номеру. Номер ищется по цифрам, поэтому
// «8 928…», «+7 928…» и «928…» находят одного и того же человека.

import { useEffect, useState } from "react";
import {
  Badge,
  EmptyState,
  ErrorState,
  formatPhone,
  fullName,
  PageHead,
  RelativeTime,
  SkeletonRows,
} from "../components/ui";
import { api, type UserRow } from "../lib/api";

export function Users({ onOpen }: { onOpen: (userId: string) => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    // Небольшая задержка, чтобы не дёргать базу на каждую букву.
    const timer = setTimeout(() => {
      api
        .listUsers(search)
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const COLS = "minmax(0,2fr) minmax(0,1.2fr) 130px 80px 80px 120px";
  return (
    <div>
      <PageHead eyebrow="Площадка" title="Люди" />
      <div className="toolbar">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, фамилия или номер"
          aria-label="Поиск по людям"
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setSearch((s) => `${s}`)} />
      ) : !rows ? (
        <SkeletonRows count={6} height={52} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Никого не нашлось"
          hint={search ? "Проверьте номер или имя." : "В базе пока нет пользователей."}
        />
      ) : (
        <div className="list">
          <div className="list-row is-head" style={{ gridTemplateColumns: COLS }}>
            <span>Имя</span>
            <span>Номер</span>
            <span>Состояние</span>
            <span>Задания</span>
            <span>Предложения</span>
            <span>Регистрация</span>
          </div>
          {rows.map((row) => (
            <a
              key={row.id}
              className="list-row is-link"
              style={{ gridTemplateColumns: COLS }}
              href={`#/users/${row.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey) return;
                e.preventDefault();
                onOpen(row.id);
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{fullName(row.first_name, row.last_name)}</div>
                <div className="cell-sub">
                  {[row.is_admin ? "админ" : null, row.is_master ? "специалист" : "клиент"]
                    .filter(Boolean)
                    .join(" · ")}
                  <span className="col-show-sm"> · {formatPhone(row.phone)}</span>
                </div>
              </div>
              <span className="cell-num col-hide-sm">{formatPhone(row.phone)}</span>
              <span>
                <Badge status={row.status} />
              </span>
              <span className="cell-num col-hide-sm">{row.orders_count}</span>
              <span className="cell-num col-hide-sm">{row.responses_count}</span>
              <span className="cell-sub col-hide-sm">
                <RelativeTime iso={row.created_at} />
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
