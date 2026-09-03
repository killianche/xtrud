// Список людей с поиском по имени и номеру. Номер ищется по цифрам, поэтому
// «8 928…», «+7 928…» и «928…» находят одного и того же человека.

import { useEffect, useState } from "react";
import {
  Badge,
  EmptyState,
  ErrorState,
  formatDate,
  formatPhone,
  fullName,
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

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Люди</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Пользователи
          </h1>
        </div>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, фамилия или номер"
          aria-label="Поиск по людям"
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setSearch((s) => s)} />
      ) : !rows ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Никого не нашлось"
          hint={search ? "Проверьте номер или имя." : "В базе пока нет пользователей."}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Номер</th>
                <th>Состояние</th>
                <th>Задания</th>
                <th>Отклики</th>
                <th>Регистрация</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="clickable"
                  onClick={() => onOpen(row.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onOpen(row.id);
                  }}
                >
                  <td className="cell-ink">
                    {fullName(row.first_name, row.last_name)}
                    {row.is_admin ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        админ
                      </span>
                    ) : null}
                    {row.is_master ? (
                      <span className="badge" style={{ marginLeft: 8 }}>
                        исполнитель
                      </span>
                    ) : null}
                  </td>
                  <td className="cell-mono">{formatPhone(row.phone)}</td>
                  <td>
                    <Badge status={row.status} />
                  </td>
                  <td className="cell-mono">{row.orders_count}</td>
                  <td className="cell-mono">{row.responses_count}</td>
                  <td className="cell-mono">{formatDate(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
