// «Отзывы» (2026-10-04): все отзывы, фильтр «видимые / скрытые», скрыть или
// вернуть с причиной. Текст чужого отзыва не правится — только скрывается
// (ADMIN_PANEL.md §4).

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
  Stars,
} from "../components/ui";
import { api, type ReviewRow } from "../lib/api";

type Filter = "all" | "visible" | "hidden";

export function Reviews({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // id строки, по которой идёт действие: её кнопка заблокирована.
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listReviews(filter === "all" ? null : filter, 100)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  const toggle = async (r: ReviewRow) => {
    const hiding = r.status !== "hidden";
    const reason = await confirm({
      title: hiding ? "Скрыть отзыв?" : "Вернуть отзыв?",
      text: hiding
        ? "Отзыв пропадёт из профиля специалиста и перестанет влиять на рейтинг."
        : "Отзыв снова появится в профиле специалиста.",
      confirmLabel: hiding ? "Скрыть" : "Вернуть",
      danger: hiding,
      reason: true,
    });
    if (!reason) return;
    setBusyId(r.id);
    try {
      await api.setReviewStatus(r.id, hiding ? "hidden" : "visible", reason);
      toast(hiding ? "Отзыв скрыт" : "Отзыв возвращён");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось изменить отзыв", true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead eyebrow="Площадка" title="Отзывы" />
      <div className="toolbar">
        <Segmented
          value={filter}
          options={[
            { value: "all", label: "Все" },
            { value: "visible", label: "Видимые" },
            { value: "hidden", label: "Скрытые" },
          ]}
          onChange={setFilter}
        />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={5} height={72} />
      ) : rows.length === 0 ? (
        <EmptyState title="Отзывов нет" hint="Отзывы появляются после выполненных заданий." />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <div key={r.id} className="card stack" style={{ gap: 10 }}>
              <div
                className="row"
                style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
              >
                <div style={{ minWidth: 0 }}>
                  <Stars rating={r.rating} />
                  <p className="body-md" style={{ margin: "6px 0 0" }}>
                    <button
                      type="button"
                      className="back-link"
                      style={{ color: "var(--ink)", margin: 0, fontWeight: 500 }}
                      onClick={() => onOpenUser(r.author_id)}
                    >
                      {r.author_label ?? "Без имени"}
                    </button>
                    <span className="text-mute"> → </span>
                    <button
                      type="button"
                      className="back-link"
                      style={{ color: "var(--ink)", margin: 0, fontWeight: 500 }}
                      onClick={() => onOpenUser(r.target_id)}
                    >
                      {r.target_label ?? "Без имени"}
                    </button>
                  </p>
                </div>
                <Badge status={r.status} />
              </div>
              <p className="body-md text-body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {r.text?.trim() || "Без текста"}
              </p>
              <div
                className="row body-sm text-mute"
                style={{ justifyContent: "space-between", flexWrap: "wrap" }}
              >
                <span>
                  {r.order_title ? `${r.order_title} · ` : ""}
                  <RelativeTime iso={r.created_at} />
                </span>
                <button
                  type="button"
                  className={`btn ${r.status === "hidden" ? "btn-ghost" : "btn-danger"}`}
                  disabled={busyId === r.id}
                  onClick={() => void toggle(r)}
                >
                  {r.status === "hidden" ? "Вернуть" : "Скрыть"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
