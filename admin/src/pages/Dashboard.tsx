// Сводка площадки. Только измеренные величины из базы — ничего
// вычисленного «на глаз».

import { useEffect, useState } from "react";
import { ErrorState, SkeletonRows } from "../components/ui";
import { api, type Metrics } from "../lib/api";

function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card">
      <p className="mono-eyebrow">{label}</p>
      <p className="metric-value" style={{ marginTop: 12 }}>
        {value.toLocaleString("ru-RU")}
      </p>
      {hint ? (
        <p className="body-sm text-mute" style={{ marginTop: 4 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setMetrics(null);
    api
      .metrics()
      .then(setMetrics)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Обзор</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Площадка
          </h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>
          Обновить
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !metrics ? (
        <div className="grid-metrics">
          <SkeletonRows count={4} height={104} />
        </div>
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          <div className="grid-metrics">
            <Metric label="Люди" value={metrics.users_total} hint="кроме удалённых" />
            <Metric label="За 7 дней" value={metrics.signups_7d} hint="новых регистраций" />
            <Metric label="Открытые задания" value={metrics.orders_open} />
            <Metric label="Жалобы" value={metrics.reports_open} hint="ждут разбора" />
          </div>
          <div className="grid-metrics">
            <Metric label="Исполнители" value={metrics.masters_total} />
            <Metric label="Заданий всего" value={metrics.orders_total} />
            <Metric label="Откликов" value={metrics.responses_total} />
            <Metric
              label="Санкции"
              value={metrics.users_suspended + metrics.users_blocked}
              hint={`${metrics.users_suspended} приостановлено, ${metrics.users_blocked} заблокировано`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
