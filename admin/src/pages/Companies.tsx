// Подтверждение компаний (0245, №308, docs/COMPANY_VERIFICATION_2026-10.md):
// специалист указал компанию и прислал Instagram и WhatsApp. Проверьте, что
// Instagram принадлежит этой компании и показывает её работы, при сомнении —
// напишите в WhatsApp. Подтверждение ставит значок рядом с названием и
// показывает Instagram в профиле. Только админ: в заявке WhatsApp и ИНН.

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
import { api, type CompanyRequestRow } from "../lib/api";

const STATUS: Record<CompanyRequestRow["status"], string> = {
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Не подтверждена",
};

export function Companies({ onOpen }: { onOpen: (userId: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");
  const [rows, setRows] = useState<CompanyRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listCompanyRequests(filter === "all" ? null : filter)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  const act = async (r: CompanyRequestRow, kind: "approve" | "reject" | "revoke") => {
    const reason = await confirm({
      title:
        kind === "approve"
          ? `Подтвердить «${r.legal_name}»?`
          : kind === "reject"
            ? `Отклонить «${r.legal_name}»?`
            : `Снять значок у «${r.legal_name}»?`,
      text:
        kind === "approve"
          ? "Рядом с названием появится значок «Компания», Instagram — в профиле. Специалисту придёт уведомление."
          : kind === "reject"
            ? "Специалист получит уведомление с причиной и сможет исправить заявку."
            : "Значок пропадёт сразу, специалисту придёт уведомление с причиной.",
      confirmLabel: kind === "approve" ? "Подтвердить" : kind === "reject" ? "Отклонить" : "Снять",
      danger: kind !== "approve",
      reason: kind !== "approve",
    });
    if (reason === null) return;
    setBusyId(r.user_id);
    try {
      if (kind === "revoke") await api.revokeCompany(r.user_id, reason);
      else await api.reviewCompany(r.user_id, kind === "approve", reason || null, r.revision);
      toast(
        kind === "approve"
          ? "Компания подтверждена"
          : kind === "reject"
            ? "Заявка отклонена"
            : "Значок снят",
      );
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <PageHead eyebrow="Модерация" title="Компании" />
      <div className="toolbar">
        <Segmented
          value={filter}
          options={[
            { value: "pending", label: "На проверке" },
            { value: "approved", label: "Подтверждённые" },
            { value: "all", label: "Все" },
          ]}
          onChange={setFilter}
        />
      </div>
      <p className="body-sm text-mute" style={{ margin: "0 0 16px" }}>
        Откройте Instagram: он должен принадлежать этой компании и показывать её работы. При
        сомнении напишите в WhatsApp. Название известной марки без подтверждения — отклоняйте.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={88} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "pending" ? "Новых заявок нет" : "Заявок нет"}
          hint="Заявка появляется, когда специалист отправляет компанию на проверку."
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
                <div className="cell-title">{r.legal_name}</div>
                <div className="cell-sub">
                  <a href={`https://instagram.com/${r.instagram}`} target="_blank" rel="noreferrer">
                    @{r.instagram}
                  </a>
                  {" · "}
                  <a href={`https://wa.me/${r.whatsapp}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                  {r.inn ? ` · ИНН ${r.inn}` : ""}
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
                    onClick={() => void act(r, "reject")}
                  >
                    Отклонить
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busyId === r.user_id}
                    onClick={() => void act(r, "approve")}
                  >
                    Подтвердить
                  </button>
                </div>
              ) : r.status === "approved" ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busyId === r.user_id}
                  onClick={() => void act(r, "revoke")}
                >
                  Снять значок
                </button>
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
