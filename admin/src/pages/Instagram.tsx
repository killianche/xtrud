// Проверка Instagram специалистов (0218, №207): заявка появляется, когда
// специалист указывает или меняет Instagram; в профиле он виден только после
// одобрения. Проверьте, что профиль существует, принадлежит этому
// специалисту и показывает его работы.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
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

export function Instagram({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
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
      reasons: approve
        ? undefined
        : ["Профиль не этого специалиста", "Нет работ в профиле", "Профиль закрыт"],
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
    <>
      <PageHead
        onBack={onBack}
        backLabel="Входящие"
        title="Instagram"
        lede="Профиль должен принадлежать специалисту и показывать его работы."
      />
      <Segmented
        label="Заявки"
        value={filter}
        options={[
          { value: "pending", label: "На проверке" },
          { value: "all", label: "Все" },
        ]}
        onChange={setFilter}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={120} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={filter === "pending"}
          title={filter === "pending" ? "Новых заявок нет" : "Заявок нет"}
          hint="Заявка появляется, когда специалист указывает Instagram."
        />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <article key={r.user_id} className="card request">
              <div className="request-head">
                <span
                  className="cell-icon"
                  style={{
                    background: "var(--tint-pink)",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                  }}
                >
                  <Icon.instagram size={22} />
                </span>
                <div className="cell-main">
                  <a
                    className="headline"
                    href={`https://instagram.com/${r.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    @{r.handle}
                  </a>
                  <span className="meta">
                    <button type="button" className="link" onClick={() => onOpen(r.user_id)}>
                      {r.user_label ?? "Без имени"}
                    </button>
                    <RelativeTime iso={r.submitted_at} />
                  </span>
                </div>
                {r.status !== "pending" ? (
                  <span className={`badge ${r.status === "approved" ? "badge-ok" : "badge-error"}`}>
                    {STATUS[r.status]}
                  </span>
                ) : null}
              </div>
              {r.reason && r.status === "rejected" ? (
                <p className="footnote text-mute" style={{ margin: 0 }}>
                  Причина: {r.reason}
                </p>
              ) : null}
              {r.status === "pending" ? (
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-danger"
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
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
