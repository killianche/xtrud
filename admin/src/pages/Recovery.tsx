// Заявки «Забыли пароль?» (0214, DECISION владельца 2026-10-04): человек
// оставил номер в приложении — админам пришёл push. Порядок: позвонить на
// номер аккаунта, убедиться, что это владелец (имя, что публиковал), открыть
// карточку → «Сменить пароль» → продиктовать временный, затем закрыть заявку.
// Номер в заявке — номер АККАУНТА, а не введённый в форме.

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, formatDate, formatPhone, SkeletonRows } from "../components/ui";
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
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось закрыть заявку.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="mono-eyebrow">{formatDate(request.created_at)}</p>
          <p className="heading-md" style={{ marginTop: 6 }}>
            {request.user_label?.trim() || "Без имени"}
          </p>
          <p className="body-md" style={{ margin: "4px 0 0" }}>
            <a href={`tel:${request.phone}`}>{formatPhone(request.phone)}</a>
          </p>
        </div>
        <span className={`badge ${open ? "badge-warn" : ""}`}>{STATUS_LABEL[request.status]}</span>
      </div>

      {request.note ? (
        <p className="body-sm text-mute" style={{ margin: 0 }}>
          {request.note}
        </p>
      ) : null}

      {open ? (
        <>
          <p className="body-sm text-mute" style={{ margin: 0 }}>
            Позвоните на этот номер, убедитесь, что это владелец аккаунта, задайте временный пароль
            в карточке и закройте заявку.
          </p>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Заметка — попадёт в журнал (для отказа обязательна)"
            disabled={busy}
          />
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          <div className="row" style={{ flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => onOpen(request.user_id)}
            >
              Открыть карточку
            </button>
            <button
              type="button"
              className="btn btn-ghost"
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
              Доступ восстановлен
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Recovery({ onOpen }: { onOpen: (userId: string) => void }) {
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
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Поддержка</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Восстановление пароля
          </h1>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setOnlyNew((v) => !v)}>
            {onlyNew ? "Показать все" : "Только новые"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={load}>
            Обновить
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={140} />
      ) : rows.length === 0 ? (
        <EmptyState
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
    </div>
  );
}
