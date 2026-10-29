// Подтверждение компаний (0245, №308, docs/COMPANY_VERIFICATION_2026-10.md):
// специалист указал компанию и прислал Instagram и WhatsApp. Проверьте, что
// Instagram принадлежит этой компании и показывает её работы, при сомнении —
// напишите в WhatsApp. Подтверждение ставит значок рядом с названием и
// показывает Instagram в профиле. Только админ: в заявке WhatsApp и ИНН.

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
  waLink,
} from "../components/ui";
import { api, type CompanyRequestRow } from "../lib/api";

const STATUS: Record<CompanyRequestRow["status"], string> = {
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Не подтверждена",
};

export function Companies({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
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
      reasons:
        kind === "reject"
          ? [
              "Instagram не этой компании",
              "Не ответили в WhatsApp",
              "Чужая известная марка",
              "В Instagram нет работ",
            ]
          : kind === "revoke"
            ? ["Компания сменилась", "Жалобы клиентов"]
            : undefined,
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
        title="Компании"
        lede="Instagram должен принадлежать компании и показывать её работы. Сомневаетесь — напишите в WhatsApp. Известную марку без подтверждения — отклоняйте."
      />
      <Segmented
        label="Заявки"
        value={filter}
        options={[
          { value: "pending", label: "На проверке" },
          { value: "approved", label: "Подтверждённые" },
          { value: "all", label: "Все" },
        ]}
        onChange={setFilter}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={2} height={200} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={filter === "pending"}
          title={filter === "pending" ? "Новых заявок нет" : "Заявок нет"}
          hint="Заявка появляется, когда специалист отправляет компанию на проверку."
        />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <article key={r.user_id} className="card request">
              <div className="request-head">
                <span
                  className="cell-icon"
                  style={{
                    background: "var(--tint-indigo)",
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                  }}
                >
                  <Icon.building size={22} />
                </span>
                <div className="cell-main">
                  <span className="headline">{r.legal_name}</span>
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
              {r.inn ? (
                <p className="footnote text-mute" style={{ margin: 0 }}>
                  ИНН {r.inn}
                </p>
              ) : null}
              <div className="actions">
                <a
                  className="btn btn-ghost"
                  href={`https://instagram.com/${r.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon.instagram size={20} /> @{r.instagram}
                </a>
                <a
                  className="btn btn-success"
                  href={waLink(
                    r.whatsapp,
                    `Здравствуйте! Это xtrud, по заявке компании «${r.legal_name}».`,
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icon.whatsapp size={20} /> WhatsApp
                </a>
              </div>
              {r.status === "pending" ? (
                <div className="actions">
                  <button
                    type="button"
                    className="btn btn-danger"
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
                  className="btn btn-ghost btn-block"
                  disabled={busyId === r.user_id}
                  onClick={() => void act(r, "revoke")}
                >
                  Снять значок
                </button>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
