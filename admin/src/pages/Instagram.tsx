// Проверка Instagram специалистов (0218, №207): заявка появляется, когда
// специалист указывает или меняет Instagram; в профиле он виден только после
// одобрения. Проверьте, что профиль существует, принадлежит этому
// специалисту и показывает его работы.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { refreshAttention } from "../components/Shell";
import {
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type InstagramRequestRow } from "../lib/api";

const STATUS: Record<InstagramRequestRow["status"], string> = {
  pending: "На проверке",
  approved: "Одобрен",
  rejected: "Отклонён",
};

export function Instagram({ onOpen }: { onOpen: (userId: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<InstagramRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listInstagramRequests(filter === "pending" ? "pending" : null)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  const review = async (r: InstagramRequestRow, approve: boolean) => {
    const reason = await confirm({
      title: approve ? `Одобрить @${r.handle}?` : `Отклонить @${r.handle}?`,
      text: approve
        ? "Instagram появится в профиле специалиста, ему придёт уведомление."
        : "Специалист получит уведомление с причиной и сможет указать другой профиль.",
      confirmLabel: approve ? "Одобрить" : "Отклонить",
      danger: !approve,
      reason: !approve,
    });
    if (reason === null) return;
    setBusyId(r.user_id);
    try {
      await api.reviewInstagram(r.user_id, r.handle, approve, reason);
      toast(approve ? "Instagram одобрен" : "Instagram отклонён");
      refreshAttention();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead eyebrow="Модерация" title="Instagram" />
      <div className="toolbar">
        <Segmented
          value={filter}
          options={[
            { value: "pending", label: "На проверке" },
            { value: "all", label: "Все" },
          ]}
          onChange={setFilter}
        />
      </div>
      <p className="body-sm text-mute" style={{ margin: "0 0 16px" }}>
        Откройте профиль, проверьте, что он принадлежит специалисту и показывает его работы. В
        приложении рядом стоит пометка: Instagram принадлежит Meta — организация признана
        экстремистской и запрещена в России.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={72} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "Новых заявок нет" : "Заявок нет"}
          hint="Заявка появляется, когда специалист указывает Instagram."
        />
      ) : (
        <div className="list">
          {rows.map((r) => (
            <div
              key={r.user_id}
              className="list-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">
                  <a href={`https://instagram.com/${r.handle}`} target="_blank" rel="noreferrer">
                    @{r.handle}
                  </a>
                </div>
                <div className="cell-sub">
                  <button type="button" className="link" onClick={() => onOpen(r.user_id)}>
                    {r.user_label ?? "Без имени"}
                  </button>
                  {" · "}
                  <RelativeTime iso={r.submitted_at} />
                  {r.status !== "pending" ? ` · ${STATUS[r.status]}` : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                </div>
              </div>
              {r.status === "pending" ? (
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyId === r.user_id}
                    onClick={() => void review(r, false)}
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === r.user_id}
                    onClick={() => void review(r, true)}
                  >
                    Одобрить
                  </button>
                </div>
              ) : (
                <span className="badge">{STATUS[r.status]}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
