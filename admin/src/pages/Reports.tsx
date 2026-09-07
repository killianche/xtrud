// Очередь жалоб. Модератор видит предмет жалобы, а не голый идентификатор:
// решать по номеру объекта невозможно.
//
// Разбор — два разных действия с разными причинами: решение по жалобе
// (обоснована или нет) и санкция человеку. Жалобу можно отклонить, не трогая
// человека, и наказать можно без жалобы — из его карточки.

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, formatDate, SkeletonRows } from "../components/ui";
import { api, type ReportRow, type UserStatus } from "../lib/api";

const REASON_LABEL: Record<string, string> = {
  spam: "Спам",
  fraud: "Мошенничество",
  inappropriate: "Недопустимое содержание",
  fake_profile: "Поддельный профиль",
  fake_review: "Поддельный отзыв",
  off_platform: "Увод за пределы площадки",
  safety: "Безопасность",
  other: "Другое",
};

const TARGET_LABEL: Record<string, string> = {
  user: "Пользователь",
  order: "Задание",
  review: "Отзыв",
  message: "Сообщение",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Ждёт разбора",
  reviewed: "Рассмотрена",
  resolved: "Решена",
  dismissed: "Отклонена",
};

function ReportCard({ report, onDone }: { report: ReportRow; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    if (reason.trim().length < 3) {
      setError("Сначала напишите причину — она попадёт в журнал.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await action();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  };

  const sanction = (status: UserStatus) => {
    if (!report.target_user_id) {
      setError("У этой жалобы не найден человек — санкция неприменима.");
      return;
    }
    return run(() =>
      api.setUserStatus(report.target_user_id as string, status, reason.trim(), report.id),
    );
  };

  const pending = report.status === "pending";

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="mono-eyebrow">
            {TARGET_LABEL[report.target_type] ?? report.target_type} ·{" "}
            {REASON_LABEL[report.reason] ?? report.reason}
          </p>
          <p className="heading-md" style={{ marginTop: 6 }}>
            {report.target_label?.trim() || "Предмет жалобы не найден"}
          </p>
        </div>
        <span className={`badge ${pending ? "badge-warn" : ""}`}>
          {STATUS_LABEL[report.status] ?? report.status}
        </span>
      </div>

      {report.description ? (
        <p className="body-md text-body" style={{ margin: 0 }}>
          {report.description}
        </p>
      ) : null}

      <div className="row body-sm text-mute" style={{ gap: 16, flexWrap: "wrap" }}>
        <span>Пожаловался: {report.reporter_label?.trim() || "неизвестно"}</span>
        <span>Жалоб на объект: {report.reports_on_target}</span>
        <span>Жалоб от автора: {report.reports_by_reporter}</span>
        <span>{formatDate(report.created_at)}</span>
      </div>

      {pending ? (
        <>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина решения — попадёт в журнал"
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
              onClick={() => run(() => api.resolveReport(report.id, "dismissed", reason.trim()))}
            >
              Отклонить жалобу
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !report.target_user_id}
              onClick={() =>
                run(() => api.warnUser(report.target_user_id as string, reason.trim(), report.id))
              }
            >
              Предупредить
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || !report.target_user_id}
              onClick={() => sanction("suspended")}
            >
              Приостановить
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !report.target_user_id}
              onClick={() => sanction("banned")}
            >
              Заблокировать
            </button>
            {report.target_type === "order" ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => run(() => api.hideOrder(report.target_id, reason.trim(), report.id))}
              >
                Скрыть задание
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => run(() => api.resolveReport(report.id, "resolved", reason.trim()))}
            >
              Закрыть как решённую
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function Reports() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(true);

  const load = () => {
    setError(null);
    setRows(null);
    api
      .listReports(onlyPending ? "pending" : null)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: перезагрузка при смене фильтра
  useEffect(load, [onlyPending]);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Модерация</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Жалобы
          </h1>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setOnlyPending((v) => !v)}>
            {onlyPending ? "Показать все" : "Только новые"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={load}>
            Обновить
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={160} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={onlyPending ? "Новых жалоб нет" : "Жалоб нет"}
          hint="Здесь появятся обращения из приложения."
        />
      ) : (
        <div className="stack">
          {rows.map((report) => (
            <ReportCard key={report.id} report={report} onDone={load} />
          ))}
        </div>
      )}
    </div>
  );
}
