// Заявки на значок «Большой опыт» (0246, №318, docs/BADGE_REQUESTS_2026-10.md).
// Специалист рассказал об опыте и оставил WhatsApp. Напишите ему, попросите
// фото работ или отзывы, посмотрите профиль — и решите. Значок бесплатный и
// бессрочный, снять его можно в разделе «Специалисты». Только админ: в
// заявке WhatsApp.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import {
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type ExperienceBadgeRequestRow } from "../lib/api";

const STATUS: Record<ExperienceBadgeRequestRow["status"], string> = {
  pending: "На проверке",
  approved: "Значок выдан",
  rejected: "Не выдан",
};

export function ExperienceBadges({ onOpen }: { onOpen: (userId: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [rows, setRows] = useState<ExperienceBadgeRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listExperienceBadgeRequests(filter === "all" ? null : filter)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  const act = async (r: ExperienceBadgeRequestRow, approve: boolean) => {
    const name = r.user_label ?? "специалиста";
    const reason = await confirm({
      title: approve ? `Выдать значок «${name}»?` : `Отклонить заявку «${name}»?`,
      text: approve
        ? "В профиле и в списке специалистов появится «Большой опыт». Специалисту придёт уведомление."
        : "Специалист получит уведомление с причиной и сможет дополнить заявку.",
      confirmLabel: approve ? "Выдать" : "Отклонить",
      danger: !approve,
      reason: !approve,
    });
    if (reason === null) return;
    setBusyId(r.user_id);
    try {
      await api.reviewExperienceBadge(r.user_id, approve, reason || null, r.revision);
      toast(approve ? "Значок выдан" : "Заявка отклонена");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead eyebrow="Модерация" title="Большой опыт" />
      <div className="toolbar">
        <Segmented
          value={filter}
          options={[
            { value: "pending", label: "На проверке" },
            { value: "approved", label: "Выданные" },
            { value: "all", label: "Все" },
          ]}
          onChange={setFilter}
        />
      </div>
      <p className="body-sm text-mute" style={{ margin: "0 0 16px" }}>
        Напишите специалисту в WhatsApp, попросите фото работ или контакты прошлых клиентов,
        откройте его профиль. Выдавайте, когда опыт подтверждается не только словами.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={88} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "Новых заявок нет" : "Заявок нет"}
          hint="Заявка появляется, когда специалист просит значок в «Я специалист»."
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
                  <button type="button" className="link" onClick={() => onOpen(r.user_id)}>
                    {r.user_label ?? "Без имени"}
                  </button>
                  {r.is_verified ? " · паспорт проверен" : ""}
                </div>
                <div className="cell-sub" style={{ whiteSpace: "pre-wrap" }}>
                  {r.about}
                </div>
                <div className="cell-sub">
                  {r.categories.length > 0 ? `${r.categories.join(", ")} · ` : "Без категорий · "}
                  <a href={`https://wa.me/${r.whatsapp}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
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
                    onClick={() => void act(r, false)}
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === r.user_id}
                    onClick={() => void act(r, true)}
                  >
                    Выдать
                  </button>
                </div>
              ) : (
                <span className="badge">
                  {r.status === "approved" && !r.granted_at ? "Значок снят" : STATUS[r.status]}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
