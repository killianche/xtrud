// Очередь жалоб. Модератор видит предмет жалобы, а не голый идентификатор:
// решать по номеру объекта невозможно.
//
// Разбор — два разных действия с разными причинами: решение по жалобе
// (обоснована или нет) и санкция человеку. Жалобу можно отклонить, не трогая
// человека, и наказать можно без жалобы — из его карточки.

import { useEffect, useState } from "react";
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

function ReportCard({
  report,
  onDone,
  onOpenUser,
  onOpenOrder,
}: {
  report: ReportRow;
  onDone: () => void;
  onOpenUser: (id: string) => void;
  onOpenOrder: (id: string) => void;
}) {
  const { confirm, choose, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const pending = report.status === "pending";
  const target = TARGET_LABEL[report.target_type] ?? report.target_type;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      toast(done);
      refreshAttention();
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось выполнить действие.", true);
    } finally {
      setBusy(false);
    }
  };

  const dismiss = async () => {
    const reason = await confirm({
      title: "Жалоба необоснованна?",
      text: "Жалоба закроется без последствий для человека.",
      confirmLabel: "Закрыть жалобу",
      reason: true,
      reasons: ["Нарушения нет", "Спор между сторонами", "Повторная жалоба"],
    });
    if (reason === null) return;
    await run(() => api.resolveReport(report.id, "dismissed", reason), "Жалоба закрыта");
  };

  const act = async () => {
    const userId = report.target_user_id;
    const options = [
      ...(report.target_type === "order"
        ? [
            {
              value: "hide",
              label: "Снять задание",
              hint: "Автору — уведомление с причиной",
              danger: true,
            },
          ]
        : []),
      ...(userId
        ? [
            { value: "warn", label: "Предупредить", hint: "Человеку придёт предупреждение" },
            {
              value: "suspend",
              label: "Приостановить",
              hint: "Не сможет публиковать и откликаться",
            },
            {
              value: "ban",
              label: "Заблокировать",
              hint: "Навсегда, можно снять в карточке",
              danger: true,
            },
          ]
        : []),
      { value: "resolve", label: "Закрыть как решённую", hint: "Меры приняты вне админки" },
    ];
    const pick = await choose({
      title: "Что сделать?",
      text: `${target}: ${report.target_label?.trim() || "—"}`,
      options,
    });
    if (pick === null) return;
    const label = options.find((o) => o.value === pick)?.label ?? "";
    const reason = await confirm({
      title: `${label}?`,
      confirmLabel: label,
      danger: pick === "ban" || pick === "hide",
      reason: true,
      reasons: [REASON_LABEL[report.reason] ?? "Нарушение правил", "Повторное нарушение"],
    });
    if (reason === null) return;
    if (pick === "hide")
      await run(() => api.hideOrder(report.target_id, reason, report.id), "Задание снято");
    else if (pick === "warn" && userId)
      await run(() => api.warnUser(userId, reason, report.id), "Предупреждение отправлено");
    else if (pick === "suspend" && userId)
      await run(
        () => api.setUserStatus(userId, "suspended" as UserStatus, reason, report.id),
        "Приостановлен",
      );
    else if (pick === "ban" && userId)
      await run(
        () => api.setUserStatus(userId, "banned" as UserStatus, reason, report.id),
        "Заблокирован",
      );
    else if (pick === "resolve")
      await run(() => api.resolveReport(report.id, "resolved", reason), "Жалоба решена");
  };

  const openTarget = () => {
    if (report.target_type === "order") onOpenOrder(report.target_id);
    else if (report.target_user_id) onOpenUser(report.target_user_id);
  };

  return (
    <article className="card request">
      <div className="request-head">
        <span
          className="cell-icon"
          style={{ background: "var(--tint-red)", width: 44, height: 44, borderRadius: 12 }}
        >
          <Icon.flag size={22} />
        </span>
        <button
          type="button"
          className="cell-main"
          style={{ textAlign: "left" }}
          onClick={openTarget}
        >
          <span className="caption">
            {target} · {REASON_LABEL[report.reason] ?? report.reason}
          </span>
          <span className="headline">
            {report.target_label?.trim() || "Предмет жалобы не найден"}
          </span>
        </button>
        {!pending ? (
          <span className="badge">{STATUS_LABEL[report.status] ?? report.status}</span>
        ) : null}
      </div>

      {report.description ? <p className="quote">{report.description}</p> : null}

      <div className="meta">
        <span>от {report.reporter_label?.trim() || "неизвестно"}</span>
        <RelativeTime iso={report.created_at} />
        {report.reports_on_target > 1 ? (
          <span style={{ color: "var(--danger)" }}>жалоб на это: {report.reports_on_target}</span>
        ) : null}
        {report.reports_by_reporter > 3 ? (
          <span>автор жаловался {report.reports_by_reporter} раз</span>
        ) : null}
      </div>

      {pending ? (
        <div className="actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void dismiss()}
          >
            Необоснованна
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void act()}
          >
            Принять меры
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function Reports({
  onBack,
  onOpenUser,
  onOpenOrder,
}: {
  onBack: () => void;
  onOpenUser: (id: string) => void;
  onOpenOrder: (id: string) => void;
}) {
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
  useEffect(load, [onlyPending]);

  return (
    <>
      <PageHead onBack={onBack} backLabel="Входящие" title="Жалобы" />
      <Segmented
        label="Жалобы"
        value={onlyPending ? "pending" : "all"}
        options={[
          { value: "pending", label: "Ждут разбора" },
          { value: "all", label: "Все" },
        ]}
        onChange={(v) => setOnlyPending(v === "pending")}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={160} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={onlyPending}
          title={onlyPending ? "Новых жалоб нет" : "Жалоб нет"}
          hint="Здесь появятся обращения из приложения."
        />
      ) : (
        <div className="stack">
          {rows.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onDone={load}
              onOpenUser={onOpenUser}
              onOpenOrder={onOpenOrder}
            />
          ))}
        </div>
      )}
    </>
  );
}
