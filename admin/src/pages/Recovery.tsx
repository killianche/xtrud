// Заявки «Забыли пароль?» (0214, DECISION владельца 2026-10-04): человек
// оставил номер в приложении — админам пришёл push. Порядок: позвонить на
// номер аккаунта, убедиться, что это владелец (имя, что публиковал), открыть
// карточку → «Сменить пароль» → продиктовать временный, затем закрыть заявку.
// Номер в заявке — номер АККАУНТА, а не введённый в форме.

import { useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import { refreshAttention } from "../components/Shell";
import {
  EmptyState,
  ErrorState,
  formatPhone,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type RecoveryRequestRow } from "../lib/api";

const STATUS_LABEL: Record<RecoveryRequestRow["status"], string> = {
  new: "Ждёт звонка",
  done: "Доступ восстановлен",
  rejected: "Отклонена",
};

function RequestCard({
  request,
  onOpen,
  onDone,
}: {
  request: RecoveryRequestRow;
  onOpen: (userId: string) => void;
  onDone: () => void;
}) {
  const { toast } = useFeedback();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = request.status === "new";

  const resolve = async (status: "done" | "rejected") => {
    if (busy) return;
    if (status === "rejected" && note.trim().length < 3) {
      setError("Напишите, почему отклоняете, — это попадёт в журнал.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resolveRecoveryRequest(request.id, status, note.trim());
      toast(status === "done" ? "Заявка закрыта" : "Заявка отклонена");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось закрыть заявку.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card request">
      <div className="request-head">
        <button
          type="button"
          className="cell-main"
          style={{ textAlign: "left" }}
          onClick={() => onOpen(request.user_id)}
        >
          <span className="headline">{request.user_label?.trim() || "Без имени"}</span>
          <span className="meta">
            <RelativeTime iso={request.created_at} />
          </span>
        </button>
        <span
          className={`badge ${open ? "badge-warn" : request.status === "done" ? "badge-ok" : ""}`}
        >
          {STATUS_LABEL[request.status]}
        </span>
      </div>

      {request.note ? <p className="quote">{request.note}</p> : null}

      {open ? (
        <>
          <a className="btn btn-success btn-block" href={`tel:${request.phone}`}>
            <Icon.phone size={20} /> Позвонить {formatPhone(request.phone)}
          </a>
          <p className="footnote text-mute" style={{ margin: 0 }}>
            Убедитесь, что это владелец аккаунта (имя, что публиковал), задайте временный пароль в
            карточке человека и закройте заявку.
          </p>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка — в журнал (для отказа обязательна)"
            disabled={busy}
          />
          {error ? (
            <div className="banner-error" role="alert">
              {error}
            </div>
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void resolve("rejected")}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void resolve("done")}
            >
              Восстановлен
            </button>
          </div>
          <button
            type="button"
            className="btn btn-plain btn-sm"
            disabled={busy}
            onClick={() => onOpen(request.user_id)}
          >
            Открыть карточку — сменить пароль
          </button>
        </>
      ) : null}
    </article>
  );
}

export function Recovery({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<RecoveryRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyNew, setOnlyNew] = useState(true);

  const load = () => {
    setError(null);
    setRows(null);
    api
      .listRecoveryRequests(onlyNew ? "new" : null)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, [onlyNew]);

  return (
    <>
      <PageHead
        onBack={onBack}
        backLabel="Входящие"
        title="Восстановление"
        lede="Человек нажал «Забыли пароль?» и оставил номер. Номер в заявке — номер аккаунта."
      />
      <Segmented
        label="Заявки"
        value={onlyNew ? "new" : "all"}
        options={[
          { value: "new", label: "Ждут звонка" },
          { value: "all", label: "Все" },
        ]}
        onChange={(v) => setOnlyNew(v === "new")}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={140} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={onlyNew}
          title={onlyNew ? "Новых заявок нет" : "Заявок нет"}
          hint="Здесь появятся заявки «Забыли пароль?» из приложения — о каждой приходит push."
        />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <RequestCard key={r.id} request={r} onOpen={onOpen} onDone={load} />
          ))}
        </div>
      )}
    </>
  );
}
