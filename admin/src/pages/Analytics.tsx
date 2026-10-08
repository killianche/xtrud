// Аналитика (0243, №299). Что считаем — по запросу владельца и роли
// «директор»: дошло ли задание до специалистов, был ли отклик, нажали ли
// «Позвонить» / «WhatsApp»; по каждому заданию, специалисту, клиенту и по
// дням. Честно: нажатие ≠ звонок, уведомление «отправлено», не «доставлено»;
// на малых числах — «x из y», а не проценты. Тестовые задания, админы и
// управляющие в цифры не входят.

import { useEffect, useRef, useState } from "react";
import {
  EmptyState,
  ErrorState,
  formatDate,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
  Sparkline,
  statusLabel,
} from "../components/ui";
import {
  type AnalyticsClientRow,
  type AnalyticsDailyRow,
  type AnalyticsMasterRow,
  type AnalyticsOrderRow,
  api,
} from "../lib/api";

type Tab = "summary" | "orders" | "masters" | "clients" | "daily";
type Days = "7" | "30" | "90";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "summary", label: "Сводка" },
  { value: "orders", label: "Задания" },
  { value: "masters", label: "Специалисты" },
  { value: "clients", label: "Клиенты" },
  { value: "daily", label: "По дням" },
];

/** «2 из 12», процент — только когда есть из чего (≥ 20). */
function ofTotal(part: number, total: number): string {
  if (total <= 0) return "—";
  const pct = total >= 20 ? ` · ${Math.round((part / total) * 100)} %` : "";
  return `${part} из ${total}${pct}`;
}

/** Дробь по-русски: «1,4». */
function num(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function minutes(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m} мин`;
  const h = Math.round(m / 6) / 10;
  return h < 48 ? `${h.toString().replace(".", ",")} ч` : `${Math.round(m / 1440)} д`;
}

/** Загрузка по ключу: новый ключ (период, сортировка, поиск) — новый запрос. */
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: перезагрузка по ключу и «Повторить» — намеренно.
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    loadRef
      .current()
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  return { data, error, reload: () => setTick((t) => t + 1) };
}

function Summary({ days }: { days: number }) {
  const o = useLoad(() => api.analyticsOverview(days), `${days}`);
  const d = useLoad(() => api.analyticsDaily(days), `${days}`);
  if (o.error) return <ErrorState message={o.error} onRetry={o.reload} />;
  if (!o.data) return <SkeletonRows count={2} height={120} />;
  const m = o.data;
  const line = (k: keyof AnalyticsDailyRow) => (d.data ?? []).map((r) => Number(r[k]) || 0);
  const kpis: Array<{ label: string; value: string; hint: string; spark?: number[] }> = [
    {
      label: "Задания",
      value: String(m.orders_published),
      hint: m.orders_test_excluded
        ? `без ${m.orders_test_excluded} тестовых`
        : "от реальных клиентов",
      spark: line("orders"),
    },
    {
      label: "Дошли до специалистов",
      value: ofTotal(m.orders_reached, m.orders_published),
      hint:
        m.reach_avg_masters != null
          ? `в среднем ${num(m.reach_avg_masters)} чел. на задание`
          : "уведомление отправлено",
      spark: line("new_order_notifications"),
    },
    {
      label: "С предложением",
      value: ofTotal(m.orders_with_response, m.orders_published),
      hint: `первое предложение: медиана ${minutes(m.first_response_median_min)}`,
      spark: line("responses"),
    },
    {
      label: "Нажали связаться",
      value: ofTotal(m.orders_with_contact, m.orders_published),
      hint: `«Позвонить» ${m.call_clicks} · WhatsApp ${m.whatsapp_clicks}`,
      spark: line("call_clicks"),
    },
    {
      label: "Выбран исполнитель",
      value: ofTotal(m.orders_picked, m.orders_published),
      hint: `предложений ${m.responses_total}, отозвано ${m.responses_withdrawn}`,
    },
    {
      label: "Специалисты открывали задания",
      value: String(m.order_views),
      hint: `разных специалистов ${m.order_viewers}`,
      spark: line("order_views"),
    },
    {
      label: "Просмотры профилей",
      value: String(m.profile_views),
      hint: "профили специалистов",
      spark: line("profile_views"),
    },
    {
      label: "Активны в день",
      value: m.active_users_avg != null ? num(m.active_users_avg) : "—",
      hint:
        m.active_masters_avg != null
          ? `из них специалистов ${num(m.active_masters_avg)}; регистраций ${m.signups}`
          : `регистраций ${m.signups}`,
      spark: line("active_users"),
    },
  ];
  return (
    <>
      {m.tracking_since ? (
        <p className="body-sm text-mute" style={{ margin: "0 0 12px" }}>
          Нажатия считаются с {formatDate(m.tracking_since)}. Нажатие — не звонок: разговор xtrud не
          видит.
        </p>
      ) : (
        <p className="body-sm text-mute" style={{ margin: "0 0 12px" }}>
          Нажатия «Позвонить» и «WhatsApp» начнут считаться с выхода новой версии приложения.
        </p>
      )}
      <div className="kpi-grid">
        {kpis.map((k) => (
          <div key={k.label} className="kpi">
            <span className="mono-eyebrow">{k.label}</span>
            <span className="kpi-value">{k.value}</span>
            <span className="body-sm text-mute">{k.hint}</span>
            {k.spark?.some((v) => v > 0) ? <Sparkline values={k.spark} /> : null}
          </div>
        ))}
      </div>
    </>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const ORDER_SORT: Array<{ value: string; label: string }> = [
  { value: "created", label: "Новые" },
  { value: "reach", label: "Охват" },
  { value: "responses", label: "Предложения" },
  { value: "clicks", label: "Нажатия" },
  { value: "first_response", label: "Первое предложение" },
];

function Orders({ days, onOpenOrder }: { days: number; onOpenOrder: (id: string) => void }) {
  const [sort, setSort] = useState("created");
  const [filter, setFilter] = useState<"all" | "noreach" | "noresp" | "nocontact">("all");
  const r = useLoad(() => api.analyticsOrders(days, sort), `${days}|${sort}`);
  const rows = (r.data ?? []).filter((o: AnalyticsOrderRow) =>
    filter === "noreach"
      ? o.reached_masters === 0
      : filter === "noresp"
        ? o.responses === 0
        : filter === "nocontact"
          ? o.responses > 0 && o.call_clicks + o.whatsapp_clicks === 0
          : true,
  );
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <Segmented value={sort} options={ORDER_SORT} onChange={setSort} />
        <Segmented
          value={filter}
          options={[
            { value: "all", label: "Все" },
            { value: "noreach", label: "Никому не ушло" },
            { value: "noresp", label: "Без предложений" },
            { value: "nocontact", label: "Предложения есть, нажатий нет" },
          ]}
          onChange={setFilter}
        />
      </div>
      {r.error ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <SkeletonRows count={5} />
      ) : rows.length === 0 ? (
        <EmptyState title="Заданий нет" hint="За этот период и с этим фильтром." />
      ) : (
        <Table
          head={[
            "Задание",
            "Клиент",
            "Дошло",
            "Открыли",
            "Предложения",
            "Первое предложение",
            "Позвонить",
            "WhatsApp",
            "Итог",
          ]}
        >
          {rows.map((o) => (
            <tr key={o.order_id} className="clickable" onClick={() => onOpenOrder(o.order_id)}>
              <td>
                <div className="body-md" style={{ color: "var(--ink)" }}>
                  {o.title}
                </div>
                <div className="body-sm text-mute">
                  {o.category_name ?? "Без категории"} · {formatDate(o.created_at)}
                  {o.contact_mode === "phone_open" ? " · напрямую" : ""}
                </div>
              </td>
              <td>{o.client_label ?? "—"}</td>
              <td>{o.reached_masters}</td>
              <td>{o.viewed_by_masters}</td>
              <td>
                {o.responses}
                {o.responses !== o.responses_active ? (
                  <span className="text-mute"> ({o.responses_active} живых)</span>
                ) : null}
                {o.responses > 0 ? (
                  <div className="body-sm text-mute">
                    {o.client_viewed_responses ? "клиент открыл" : "клиент не открыл"}
                  </div>
                ) : null}
              </td>
              <td>{minutes(o.minutes_to_first_response)}</td>
              <td>{o.call_clicks}</td>
              <td>{o.whatsapp_clicks}</td>
              <td>
                {statusLabel(o.status)}
                {o.picked_master_label ? (
                  <div className="body-sm text-mute">{o.picked_master_label}</div>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

const MASTER_SORT: Array<{ value: string; label: string }> = [
  { value: "clicks", label: "Нажатия" },
  { value: "responses", label: "Предложения" },
  { value: "reach", label: "Уведомления" },
  { value: "views", label: "Открыл заданий" },
  { value: "profile_views", label: "Просмотры профиля" },
  { value: "active", label: "Активность" },
  { value: "last_active", label: "Последний вход" },
];

function Masters({ days, onOpenUser }: { days: number; onOpenUser: (id: string) => void }) {
  const [sort, setSort] = useState("clicks");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const r = useLoad(() => api.analyticsMasters(days, sort, q), `${days}|${sort}|${q}`);
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя специалиста"
          aria-label="Поиск специалиста"
        />
        <Segmented value={sort} options={MASTER_SORT} onChange={setSort} />
      </div>
      {r.error ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <SkeletonRows count={5} />
      ) : r.data.length === 0 ? (
        <EmptyState title="Специалистов нет" />
      ) : (
        <Table
          head={[
            "Специалист",
            "Категорий",
            "Уведомлений",
            "Открыл",
            "Предложения",
            "Выбран",
            "Профиль смотрели",
            "Позвонить",
            "WhatsApp",
            "Сегодня",
            "Дней активен",
          ]}
        >
          {r.data.map((m: AnalyticsMasterRow) => (
            <tr key={m.master_id} className="clickable" onClick={() => onOpenUser(m.master_id)}>
              <td>
                <div className="body-md" style={{ color: "var(--ink)" }}>
                  {m.label ?? "Без имени"}
                </div>
                <div className="body-sm text-mute">
                  {statusLabel(m.status)}
                  {m.rating_overall_avg ? ` · ★ ${Number(m.rating_overall_avg).toFixed(1)}` : ""}
                  {m.last_active_at ? (
                    <>
                      {" · "}
                      <RelativeTime iso={m.last_active_at} />
                    </>
                  ) : null}
                </div>
              </td>
              <td>{m.categories_count}</td>
              <td>{m.reached_orders}</td>
              <td>{m.order_views}</td>
              <td>
                {m.responses}
                {m.responses_withdrawn ? (
                  <span className="text-mute"> (отозв. {m.responses_withdrawn})</span>
                ) : null}
              </td>
              <td>{m.responses_picked}</td>
              <td>{m.profile_views}</td>
              <td>{m.call_clicks}</td>
              <td>{m.whatsapp_clicks}</td>
              <td>{m.clicks_today}</td>
              <td>{m.active_days}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

const CLIENT_SORT: Array<{ value: string; label: string }> = [
  { value: "orders", label: "Задания" },
  { value: "responses", label: "Предложения" },
  { value: "clicks", label: "Нажатия" },
  { value: "last_order", label: "Последнее задание" },
  { value: "last_active", label: "Последний вход" },
];

function Clients({ days, onOpenUser }: { days: number; onOpenUser: (id: string) => void }) {
  const [sort, setSort] = useState("orders");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const r = useLoad(() => api.analyticsClients(days, sort, q), `${days}|${sort}|${q}`);
  return (
    <>
      <div className="row" style={{ gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          className="input"
          style={{ maxWidth: 260 }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя клиента"
          aria-label="Поиск клиента"
        />
        <Segmented value={sort} options={CLIENT_SORT} onChange={setSort} />
      </div>
      {r.error ? (
        <ErrorState message={r.error} onRetry={r.reload} />
      ) : !r.data ? (
        <SkeletonRows count={5} />
      ) : r.data.length === 0 ? (
        <EmptyState title="Клиентов за период нет" />
      ) : (
        <Table
          head={[
            "Клиент",
            "Выложил",
            "С предложением",
            "Предложений",
            "Позвонить",
            "WhatsApp",
            "Выбрал",
            "Отзывов",
            "Последнее задание",
          ]}
        >
          {r.data.map((c: AnalyticsClientRow) => (
            <tr key={c.client_id} className="clickable" onClick={() => onOpenUser(c.client_id)}>
              <td>
                <div className="body-md" style={{ color: "var(--ink)" }}>
                  {c.label ?? "Без имени"}
                </div>
                {c.last_active_at ? (
                  <div className="body-sm text-mute">
                    заходил <RelativeTime iso={c.last_active_at} />
                  </div>
                ) : null}
              </td>
              <td>{c.orders_published}</td>
              <td>{c.orders_with_response}</td>
              <td>{c.responses_received}</td>
              <td>{c.call_clicks}</td>
              <td>{c.whatsapp_clicks}</td>
              <td>{c.orders_picked}</td>
              <td>{c.reviews_left}</td>
              <td>{c.last_order_at ? formatDate(c.last_order_at) : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function Daily({ days }: { days: number }) {
  const r = useLoad(() => api.analyticsDaily(days), `${days}`);
  if (r.error) return <ErrorState message={r.error} onRetry={r.reload} />;
  if (!r.data) return <SkeletonRows count={5} />;
  const rows = [...r.data].reverse();
  return (
    <Table
      head={[
        "День",
        "Активны",
        "Специалистов",
        "Регистрации",
        "Задания",
        "Уведомлений",
        "Открыли",
        "Предложения",
        "Позвонить",
        "WhatsApp",
        "Профили",
      ]}
    >
      {rows.map((d) => (
        <tr key={d.day}>
          <td>
            {new Date(d.day).toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "short",
              weekday: "short",
            })}
          </td>
          <td>{d.active_users}</td>
          <td>{d.active_masters}</td>
          <td>{d.signups}</td>
          <td>{d.orders}</td>
          <td>{d.new_order_notifications}</td>
          <td>{d.order_views}</td>
          <td>{d.responses}</td>
          <td>{d.call_clicks}</td>
          <td>{d.whatsapp_clicks}</td>
          <td>{d.profile_views}</td>
        </tr>
      ))}
    </Table>
  );
}

export function Analytics({
  onOpenOrder,
  onOpenUser,
}: {
  onOpenOrder: (id: string) => void;
  onOpenUser: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [days, setDays] = useState<Days>("30");
  const n = Number(days);
  return (
    <div>
      <PageHead
        eyebrow="Площадка"
        title="Аналитика"
        actions={
          <Segmented
            value={days}
            options={[
              { value: "7", label: "7 дней" },
              { value: "30", label: "30 дней" },
              { value: "90", label: "90 дней" },
            ]}
            onChange={setDays}
          />
        }
      />
      <div style={{ marginBottom: 16 }}>
        <Segmented value={tab} options={TABS} onChange={setTab} />
      </div>
      {tab === "summary" ? (
        <Summary days={n} />
      ) : tab === "orders" ? (
        <Orders days={n} onOpenOrder={onOpenOrder} />
      ) : tab === "masters" ? (
        <Masters days={n} onOpenUser={onOpenUser} />
      ) : tab === "clients" ? (
        <Clients days={n} onOpenUser={onOpenUser} />
      ) : (
        <Daily days={n} />
      )}
    </div>
  );
}
