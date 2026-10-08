// «Обзор» (2026-10-04): первым — что требует действия (очереди со
// счётчиками, клик ведёт в очередь), дальше — цифры площадки с динамикой за
// 30 дней и последние действия журнала. Только измеренные величины.

import { useCallback, useEffect, useState } from "react";
import { ErrorState, PageHead, RelativeTime, SkeletonRows, Sparkline } from "../components/ui";
import { type ActionRow, type Attention, api, type Metrics, type SeriesPoint } from "../lib/api";
import { ACTION_LABEL } from "./Journal";

export function Overview({ navigate }: { navigate: (path: string) => void }) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [actions, setActions] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .metrics()
      .then(setMetrics)
      .catch((e: Error) => setError(e.message));
    api
      .attention()
      .then(setAttention)
      .catch(() => setAttention(null));
    api
      .metricsSeries(30)
      .then(setSeries)
      .catch(() => setSeries([]));
    api
      .listActions(5)
      .then(setActions)
      .catch(() => setActions([]));
  }, []);
  useEffect(load, [load]);

  const sum = (key: keyof Omit<SeriesPoint, "day">) =>
    (series ?? []).reduce((acc, p) => acc + (p[key] ?? 0), 0);
  const line = (key: keyof Omit<SeriesPoint, "day">) => (series ?? []).map((p) => p[key] ?? 0);

  const queues = attention
    ? [
        { label: "Жалобы", value: attention.reports_open, hint: "ждут разбора", path: "/reports" },
        {
          label: "Звонки",
          value: attention.recovery_new ?? 0,
          hint: "забыли пароль",
          path: "/recovery",
        },
        {
          label: "Instagram",
          value: attention.instagram_pending ?? 0,
          hint: "на проверке",
          path: "/instagram",
        },
        {
          label: "Паспорта",
          value: attention.verifications_pending ?? 0,
          hint: "на проверке",
          path: "/verifications",
        },
      ]
    : null;
  const nothingToDo = queues?.every((q) => q.value === 0);

  return (
    <div>
      <PageHead
        eyebrow="Обзор"
        title="Площадка"
        actions={
          <button type="button" className="btn btn-ghost" onClick={load}>
            Обновить
          </button>
        }
      />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <div className="section-title" style={{ marginTop: 0 }}>
            <h2 className="heading-md">Требует внимания</h2>
            {nothingToDo ? <span className="body-md text-mute">Всё разобрано</span> : null}
          </div>
          {queues ? (
            <div className="attention-grid">
              {queues.map((q) => (
                <button
                  key={q.path}
                  type="button"
                  className={`attention-card ${q.value > 0 ? "is-hot" : ""}`}
                  onClick={() => navigate(q.path)}
                >
                  <span className="mono-eyebrow">{q.label}</span>
                  <span className="attention-value">{q.value}</span>
                  <span className="body-sm text-mute">{q.hint}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="attention-grid">
              <SkeletonRows count={1} height={104} />
            </div>
          )}

          <div className="section-title">
            <h2 className="heading-md">Площадка</h2>
            <span className="body-sm text-mute">за 30 дней</span>
          </div>
          {metrics ? (
            <div className="kpi-grid">
              <div className="kpi">
                <span className="mono-eyebrow">Регистрации</span>
                <span className="kpi-value">+{sum("signups")}</span>
                <span className="body-sm text-mute">
                  всего людей {metrics.users_total.toLocaleString("ru-RU")}
                </span>
                <Sparkline values={line("signups")} />
              </div>
              <div className="kpi">
                <span className="mono-eyebrow">Задания</span>
                <span className="kpi-value">+{sum("orders")}</span>
                <span className="body-sm text-mute">открыто сейчас {metrics.orders_open}</span>
                <Sparkline values={line("orders")} />
              </div>
              <div className="kpi">
                <span className="mono-eyebrow">Предложения</span>
                <span className="kpi-value">+{sum("responses")}</span>
                <span className="body-sm text-mute">
                  всего {metrics.responses_total.toLocaleString("ru-RU")}
                </span>
                <Sparkline values={line("responses")} />
              </div>
              <div className="kpi">
                <span className="mono-eyebrow">Специалисты</span>
                <span className="kpi-value">{metrics.masters_total}</span>
                <span className="body-sm text-mute">
                  санкций {metrics.users_suspended + metrics.users_banned}
                </span>
              </div>
            </div>
          ) : (
            <SkeletonRows count={1} height={120} />
          )}

          <div className="section-title">
            <h2 className="heading-md">Последние действия</h2>
            <button type="button" className="btn btn-ghost" onClick={() => navigate("/journal")}>
              Весь журнал
            </button>
          </div>
          {actions === null ? (
            <SkeletonRows count={3} />
          ) : actions.length === 0 ? (
            <p className="body-md text-mute">Действий пока не было.</p>
          ) : (
            <div className="list">
              {actions.map((a) => (
                <div
                  key={a.id}
                  className="list-row"
                  style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,2fr) 140px" }}
                >
                  <span className="cell-title">{ACTION_LABEL[a.action] ?? a.action}</span>
                  <span className="cell-sub col-hide-sm">{a.reason ?? "—"}</span>
                  <span className="cell-sub" style={{ textAlign: "right" }}>
                    <RelativeTime iso={a.performed_at} />
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
