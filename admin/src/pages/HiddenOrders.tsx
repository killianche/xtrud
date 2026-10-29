// Скрытые задания «красный флаг» (0231, №253): владелец запретил публикацию
// заданий на темы красоты, пластики, тату и музыки — такие задания тихо
// скрываются при публикации или правке автором. Автор видит задание как
// обычно и не знает, что оно скрыто; специалисты его не видят и не могут
// откликнуться. Здесь админ может посмотреть список и открыть задание
// вручную, а также тихо скрыть открытое задание (без уведомления автору).

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { refreshAttention } from "../components/Shell";
import { EmptyState, ErrorState, plural, RelativeTime, SkeletonRows } from "../components/ui";
import { api, type ShadowHiddenOrderRow } from "../lib/api";

const DEFAULT_UNHIDE_REASON = "Проверено — можно показывать";

const TOPIC_LABEL: Record<string, string> = {
  beauty: "Красота",
  plastic: "Пластика",
  tattoo: "Тату",
  music: "Музыка",
  // admin_hide_order_shadow (скрыто вручную, не по словарю).
  manual: "Вручную",
};

const SOURCE_LABEL: Record<string, string> = {
  auto: "Автоматически",
  backfill: "При запуске",
  admin: "Вручную",
};

function place(o: ShadowHiddenOrderRow): string {
  const parts = [o.city_name, o.district, o.village].filter((p): p is string => !!p?.trim());
  return parts.length > 0 ? parts.join(", ") : "Вся Ингушетия";
}

function HiddenOrderRow({
  order,
  onOpenOrder,
  onDone,
}: {
  order: ShadowHiddenOrderRow;
  onOpenOrder: (id: string) => void;
  onDone: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(DEFAULT_UNHIDE_REASON);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topicLabel = TOPIC_LABEL[order.topic] ?? order.topic;
  const sourceLabel = SOURCE_LABEL[order.source] ?? order.source;

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError("Причина — минимум 3 символа.");
      return;
    }
    const ok = await confirm({
      title: `Открыть задание «${order.title}»?`,
      text: "Задание станет видно всем, специалистам придёт уведомление.",
      confirmLabel: "Открыть",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.unhideOrder(order.id, reason.trim());
      toast(result.notified ? "Открыто, специалисты уведомлены" : "Открыто");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось открыть задание.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card request">
      <div className="request-head">
        <div className="cell-main">
          <button
            type="button"
            className="headline"
            style={{ textAlign: "left" }}
            onClick={() => onOpenOrder(order.id)}
          >
            {order.title}
          </button>
          <div className="meta">
            <span>{place(order)}</span>
            <span>
              скрыто <RelativeTime iso={order.hidden_at} />
            </span>
            <span>
              {plural(order.responses_count, "предложение", "предложения", "предложений")}
            </span>
          </div>
        </div>
        <span className="badge badge-warn">{topicLabel}</span>
      </div>
      {order.description_short ? <p className="quote">{order.description_short}</p> : null}
      <p className="footnote text-mute" style={{ margin: 0 }}>
        {order.source === "admin"
          ? `Причина: ${order.matched ?? "—"}`
          : `Нашлось слово: «${order.matched ?? "—"}»`}{" "}
        · {sourceLabel}
      </p>

      {!open ? (
        <button type="button" className="btn btn-ghost btn-block" onClick={() => setOpen(true)}>
          Показать в ленте
        </button>
      ) : (
        <div className="stack">
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={DEFAULT_UNHIDE_REASON}
            aria-label="Причина — попадёт в журнал"
          />
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setError(null);
              }}
            >
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Сохраняем…" : "Открыть"}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

export function HiddenOrders({ onOpenOrder }: { onOpenOrder: (orderId: string) => void }) {
  const [rows, setRows] = useState<ShadowHiddenOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listShadowHiddenOrders()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="stack">
      <p className="page-lede" style={{ padding: "0 4px" }}>
        Задания на запрещённые темы скрываются сами. Автор видит своё задание как обычно,
        специалисты — нет.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={140} />
      ) : rows.length === 0 ? (
        <EmptyState
          done
          title="Скрытых заданий нет"
          hint="Сюда попадают задания на запрещённые темы — красота, пластика, тату, музыка."
        />
      ) : (
        <div className="stack">
          {rows.map((o) => (
            <HiddenOrderRow key={o.id} order={o} onOpenOrder={onOpenOrder} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}
