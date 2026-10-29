// «Сводка» — главный экран админки (№372, владелец 2026-10-29: «самым
// главным сделай сводку, как было — сколько зарегистрировано, сколько
// заданий, сколько предложений, за выбранный период»).
//
// Цифры — только измеренные: всего — admin_metrics, за период —
// admin_metrics_series (по дням, московское время, до 365 дней; проект
// запущен 2026-08-31, поэтому «Всё время» = 365 дней покрывает всё).
// Сравнение — с предыдущим таким же периодом. Ниже — что ждёт решения.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { inboxTotal, useAttention } from "../components/Shell";
import {
  Cell,
  ErrorState,
  PageHead,
  plural,
  Segmented,
  SkeletonRows,
  Sparkline,
} from "../components/ui";
import { api, type Metrics, type SeriesPoint } from "../lib/api";

type Period = "1" | "7" | "30" | "90" | "all";

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "1", label: "Сегодня" },
  { value: "7", label: "7 дней" },
  { value: "30", label: "30 дней" },
  { value: "90", label: "90 дней" },
  { value: "all", label: "Всё время" },
];

const PERIOD_KEY = "xtrud-admin-summary-period";

function initialPeriod(): Period {
  try {
    const saved = window.localStorage.getItem(PERIOD_KEY);
    if (saved && PERIODS.some((p) => p.value === saved)) return saved as Period;
  } catch {
    /* хранилище недоступно — по умолчанию */
  }
  return "30";
}

type Key = "signups" | "orders" | "responses";

function sum(points: SeriesPoint[], key: Key): number {
  return points.reduce((acc, p) => acc + (p[key] ?? 0), 0);
}

const fmt = (n: number) => n.toLocaleString("ru-RU");

/**
 * Линия для плитки: до месяца — по дням, дольше — по неделям (иначе 90–365
 * точек сливаются в сплошную полосу).
 */
function chartLine(points: SeriesPoint[], key: Key): number[] {
  const values = points.map((p) => p[key] ?? 0);
  if (values.length <= 31) return values;
  const weeks: number[] = [];
  for (let i = 0; i < values.length; i += 7) {
    weeks.push(values.slice(i, i + 7).reduce((a, b) => a + b, 0));
  }
  return weeks;
}

/** «+12% к прошлым 7 дням» — только если есть с чем сравнить. */
function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  if (before === 0 && now === 0) return <span className="footnote text-mute">как и {label}</span>;
  if (before === 0) return <span className="footnote text-mute">{label} — 0</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const color = pct > 0 ? "var(--success-deep)" : pct < 0 ? "var(--danger)" : "var(--mute)";
  return (
    <span className="footnote" style={{ color }}>
      {pct > 0 ? "▲" : pct < 0 ? "▼" : "="} {Math.abs(pct)}%{" "}
      <span className="text-mute">к {label}</span>
    </span>
  );
}

function Tile({
  title,
  value,
  sub,
  delta,
  line,
}: {
  title: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: ReactNode;
  line?: number[];
}) {
  return (
    <div className="kpi">
      <span className="caption">{title}</span>
      <span className="kpi-value">{value}</span>
      {sub ? <span className="footnote text-mute">{sub}</span> : null}
      {delta}
      {line && line.length > 1 ? (
        <div style={{ height: 32, marginTop: 6 }}>
          <Sparkline values={line} />
        </div>
      ) : null}
    </div>
  );
}

export function Summary({ navigate }: { navigate: (path: string) => void }) {
  const attention = useAttention();
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [series, setSeries] = useState<SeriesPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = period === "all" ? 365 : Number(period);

  const load = useCallback(() => {
    setError(null);
    setSeries(null);
    api
      .metrics()
      .then(setMetrics)
      .catch((e: Error) => setError(e.message));
    // Вдвое длиннее — вторая половина для сравнения с прошлым периодом.
    api
      .metricsSeries(Math.min(days * 2, 365))
      .then(setSeries)
      .catch((e: Error) => setError(e.message));
  }, [days]);
  useEffect(load, [load]);

  const choose = (p: Period) => {
    setPeriod(p);
    try {
      window.localStorage.setItem(PERIOD_KEY, p);
    } catch {
      /* не запомним — не страшно */
    }
  };

  // «Всё время» — с первого дня, когда что-то произошло (запуск
  // 2026-08-31), без пустого года до него.
  const sliced = series ? series.slice(-days) : [];
  const firstActive = sliced.findIndex((p) => p.signups + p.orders + p.responses > 0);
  const current = period === "all" && firstActive > 0 ? sliced.slice(firstActive) : sliced;
  const previous = series && period !== "all" ? series.slice(-days * 2, -days) : [];
  const compareLabel =
    period === "1" ? "вчера" : period === "7" ? "прошлым 7 дням" : `прошлым ${days} дням`;
  const waiting = inboxTotal(attention);

  const tile = (key: Key, title: string, total: number | undefined, totalLabel: string) => {
    const now = sum(current, key);
    return (
      <Tile
        title={title}
        value={fmt(period === "all" ? (total ?? now) : now)}
        sub={
          period === "all"
            ? undefined
            : total !== undefined
              ? `${totalLabel} ${fmt(total)}`
              : undefined
        }
        delta={
          period !== "all" && previous.length === days ? (
            <Delta now={now} before={sum(previous, key)} label={compareLabel} />
          ) : undefined
        }
        line={period === "1" ? undefined : chartLine(current, key)}
      />
    );
  };

  return (
    <>
      <PageHead title="Сводка" />
      <Segmented label="Период" value={period} options={PERIODS} onChange={choose} />

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !series || !metrics ? (
        <div className="kpi-grid">
          <SkeletonRows count={1} height={150} />
          <SkeletonRows count={1} height={150} />
          <SkeletonRows count={1} height={150} />
          <SkeletonRows count={1} height={150} />
        </div>
      ) : (
        <div className="kpi-grid">
          {tile("signups", "Регистрации", metrics.users_total, "всего людей")}
          {tile("orders", "Задания", metrics.orders_total, "всего")}
          {tile("responses", "Предложения", metrics.responses_total, "всего")}
          <Tile
            title="Сейчас"
            value={fmt(metrics.orders_open)}
            sub={`открытых заданий · специалистов ${fmt(metrics.masters_total)}`}
          />
        </div>
      )}

      <div className="group">
        <Cell
          icon={<Icon.chart size={18} />}
          iconBg="var(--tint-teal)"
          title="Подробная аналитика"
          sub="Дошли ли задания до специалистов, нажатия «Позвонить», кто активен"
          onClick={() => navigate("/more/analytics")}
        />
      </div>

      <section className="section">
        <h2 className="section-title">Ждут решения</h2>
        <div className="group">
          <Cell
            icon={<Icon.inbox size={18} />}
            iconBg={waiting > 0 ? "var(--accent)" : "var(--tint-green)"}
            title={waiting > 0 ? plural(waiting, "заявка", "заявки", "заявок") : "Всё разобрано"}
            sub={
              waiting > 0
                ? "Задания, жалобы, паспорта, компании и другие очереди"
                : "Новые заявки появятся здесь"
            }
            count={waiting}
            onClick={() => navigate("/inbox")}
          />
        </div>
      </section>
    </>
  );
}
