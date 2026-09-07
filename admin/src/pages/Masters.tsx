// Специалисты: кто виден в каталоге, кто скрыт, и ручное решение админа.
// DECISION владельца 2026-09-07: «в админке подтверждать специалистов
// (показывать или нет) и блокировать». Автоматика: профиль виден с первой
// категории (0169); админ может скрыть (suspended) или вернуть, а также
// заблокировать аккаунт целиком (admin_set_user_status).
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  EmptyState,
  ErrorState,
  formatDate,
  formatPhone,
  fullName,
  SkeletonRows,
} from "../components/ui";
import { api, type MasterRow } from "../lib/api";

function visibilityLabel(m: MasterRow): { text: string; status: string } {
  if (m.user_status === "banned") return { text: "Заблокирован", status: "banned" };
  if (m.master_status === "suspended") return { text: "Скрыт админом", status: "suspended" };
  if (m.master_status === "active" && !m.is_hidden) return { text: "В каталоге", status: "active" };
  return { text: "Нет категории", status: "pending" };
}

export function Masters({ onOpen }: { onOpen: (userId: string) => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MasterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    void tick; // перезагрузка по кнопке — зависимость намеренная
    let cancelled = false;
    setRows(null);
    setError(null);
    const timer = setTimeout(() => {
      api
        .listMasters(search)
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
  }, [search, tick]);

  const setVisible = async (m: MasterRow, visible: boolean) => {
    const reason = window.prompt(
      visible ? "Причина показа (попадёт в журнал)" : "Причина скрытия (попадёт в журнал)",
      visible ? "Проверен" : "",
    );
    if (reason === null) return;
    setBusyId(m.id);
    try {
      await api.setMasterVisibility(m.id, visible, reason);
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const block = async (m: MasterRow) => {
    const reason = window.prompt("Причина блокировки аккаунта (попадёт в журнал)", "");
    if (reason === null) return;
    if (reason.trim().length < 3) {
      window.alert("Укажите причину — минимум три символа.");
      return;
    }
    setBusyId(m.id);
    try {
      await api.setUserStatus(m.id, "banned", reason);
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Каталог</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Специалисты
          </h1>
        </div>
        <input
          className="input"
          style={{ maxWidth: 320 }}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, фамилия или номер"
          aria-label="Поиск по специалистам"
        />
      </div>
      <p className="body-md text-mute" style={{ marginTop: 8 }}>
        Профиль виден в каталоге, как только специалист выбрал категорию. «Скрыть» убирает его из
        каталога без блокировки аккаунта; «Заблокировать» закрывает аккаунт целиком.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !rows ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Специалистов пока нет"
          hint={search ? "Проверьте номер или имя." : "Никто ещё не включил режим специалиста."}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Специалист</th>
                <th>Категории</th>
                <th>Фото</th>
                <th>Рейтинг</th>
                <th>Состояние</th>
                <th>С</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const v = visibilityLabel(m);
                const busy = busyId === m.id;
                const canShow =
                  m.user_status !== "banned" && !(m.master_status === "active" && !m.is_hidden);
                const canHide = m.user_status !== "banned" && m.master_status !== "suspended";
                return (
                  <tr key={m.id}>
                    <td>
                      <button type="button" className="link" onClick={() => onOpen(m.id)}>
                        {fullName(m.first_name, m.last_name)}
                      </button>
                      <div className="text-mute body-sm">{formatPhone(m.phone)}</div>
                    </td>
                    <td>{m.categories.length > 0 ? m.categories.join(", ") : "—"}</td>
                    <td>{m.photos_count}</td>
                    <td>
                      {m.rating_count
                        ? `${Number(m.rating_avg ?? 0).toFixed(1)} · ${m.rating_count}`
                        : "—"}
                    </td>
                    <td>
                      <Badge status={v.status} />
                      <span className="body-sm" style={{ marginLeft: 6 }}>
                        {v.text}
                      </span>
                    </td>
                    <td>{formatDate(m.created_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canShow ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void setVisible(m, true)}
                        >
                          Показать
                        </button>
                      ) : null}
                      {canHide ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void setVisible(m, false)}
                        >
                          Скрыть
                        </button>
                      ) : null}
                      {m.user_status !== "banned" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void block(m)}
                          style={{ color: "var(--error)" }}
                        >
                          Заблокировать
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
