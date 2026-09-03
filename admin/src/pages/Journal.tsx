// Журнал действий администратора. Таблица append-only на стороне базы:
// строки нельзя ни изменить, ни удалить — на вопрос «кто это сделал» должен
// быть ответ.

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, formatDate, SkeletonRows } from "../components/ui";
import { type ActionRow, api } from "../lib/api";

const ACTION_LABEL: Record<string, string> = {
  set_password: "Смена пароля",
  suspend: "Приостановка",
  block: "Блокировка",
  unblock: "Снятие санкции",
  warn: "Предупреждение",
  hide_review: "Скрытие отзыва",
};

export function Journal() {
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setRows(null);
    api
      .listActions()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">История</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Журнал действий
          </h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>
          Обновить
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Действий пока нет"
          hint="Здесь появится каждое действие администратора."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-mono">{formatDate(row.performed_at)}</td>
                  <td>{row.admin_label ?? "—"}</td>
                  <td className="cell-ink">{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td className="cell-mono">{row.target_type}</td>
                  <td>{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
