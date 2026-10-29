// «Большой опыт» — заявки на значок (0246, №318; редизайн №369/№370).
//
// Владелец 2026-10-29: «текст заявки не виден — обрезан, кнопки огромные»;
// «добавь кнопки Отклонить, Выдать, Скрыть, чтобы посмотреть скрытых потом».
// Теперь: заявка целиком, ссылки и WhatsApp нажимаются, действия — под
// текстом. «Скрыть» (0255) убирает заявку из очереди в «Скрытые», человек
// видит прежнее «На проверке»; вернуть — одной кнопкой.
//
// Только админ: в заявке WhatsApp.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import { refreshAttention } from "../components/Shell";
import {
  Avatar,
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  RichText,
  Segmented,
  SkeletonRows,
  waLink,
} from "../components/ui";
import { api, type ExperienceBadgeRequestRow } from "../lib/api";

type Filter = "pending" | "deferred" | "approved" | "rejected";

const REJECT_REASONS = [
  "Мало подтверждений опыта",
  "Нет фото работ",
  "Не ответил в WhatsApp",
  "Опыт меньше заявленного",
];

function RequestCard({
  r,
  onOpen,
  onDone,
}: {
  r: ExperienceBadgeRequestRow;
  onOpen: (id: string) => void;
  onDone: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const name = r.user_label ?? "Без имени";

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      refreshAttention();
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const ok = await confirm({
      title: `Выдать значок «${name}»?`,
      text: "В профиле и в списке специалистов появится «Большой опыт». Специалисту придёт уведомление.",
      confirmLabel: "Выдать значок",
    });
    if (ok === null) return;
    await run(() => api.reviewExperienceBadge(r.user_id, true, null, r.revision), "Значок выдан");
  };

  const reject = async () => {
    const reason = await confirm({
      title: "Отклонить заявку?",
      text: "Специалист получит уведомление с причиной и сможет дополнить заявку.",
      confirmLabel: "Отклонить",
      danger: true,
      reason: true,
      reasons: REJECT_REASONS,
    });
    if (reason === null) return;
    await run(
      () => api.reviewExperienceBadge(r.user_id, false, reason, r.revision),
      "Заявка отклонена",
    );
  };

  const defer = (on: boolean) =>
    run(
      () => api.deferExperienceBadge(r.user_id, on),
      on ? "Скрыта — она в «Скрытых»" : "Вернули в очередь",
    );

  const open = r.status === "pending" || r.status === "deferred";

  return (
    <article className="card request">
      <div className="request-head">
        <Avatar name={name} />
        <button
          type="button"
          className="cell-main"
          style={{ textAlign: "left" }}
          onClick={() => onOpen(r.user_id)}
        >
          <span className="headline">{name}</span>
          <span className="meta">
            <RelativeTime iso={r.submitted_at} />
            {r.is_verified ? (
              <span style={{ color: "var(--success-deep)" }}>паспорт проверен</span>
            ) : null}
          </span>
        </button>
        {r.status === "approved" ? (
          <span className="badge badge-ok">{r.granted_at ? "Выдан" : "Снят"}</span>
        ) : r.status === "rejected" ? (
          <span className="badge badge-error">Не выдан</span>
        ) : r.status === "deferred" ? (
          <span className="badge badge-muted">Скрыта</span>
        ) : null}
      </div>

      <RichText text={r.about} />

      {r.categories.length > 0 ? (
        <div className="tags">
          {r.categories.map((c) => (
            <span key={c} className="tag">
              {c}
            </span>
          ))}
        </div>
      ) : null}

      {r.reason && r.status === "rejected" ? (
        <p className="footnote text-mute" style={{ margin: 0 }}>
          Причина: {r.reason}
        </p>
      ) : null}

      <div className="actions">
        <a
          className="btn btn-success"
          href={waLink(r.whatsapp, `Здравствуйте! Это xtrud, по заявке на значок «Большой опыт».`)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon.whatsapp size={20} /> WhatsApp
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => onOpen(r.user_id)}>
          Профиль
        </button>
      </div>

      {open ? (
        <>
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void reject()}
            >
              Отклонить
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void approve()}
            >
              Выдать
            </button>
          </div>
          <button
            type="button"
            className="btn btn-plain btn-sm"
            disabled={busy}
            onClick={() => void defer(r.status !== "deferred")}
          >
            {r.status === "deferred" ? (
              <>
                <Icon.undo size={18} /> Вернуть в очередь
              </>
            ) : (
              <>
                <Icon.eyeOff size={18} /> Скрыть — посмотреть позже
              </>
            )}
          </button>
        </>
      ) : null}
    </article>
  );
}

export function ExperienceBadges({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("pending");
  const [rows, setRows] = useState<ExperienceBadgeRequestRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listExperienceBadgeRequests(filter)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, [filter]);
  useEffect(load, [load]);

  return (
    <>
      <PageHead
        onBack={onBack}
        backLabel="Входящие"
        title="Большой опыт"
        lede="Напишите в WhatsApp, попросите фото работ или контакты прошлых клиентов. Выдавайте, когда опыт подтверждается не только словами."
      />
      <Segmented
        label="Заявки"
        value={filter}
        options={[
          { value: "pending", label: "Ждут" },
          { value: "deferred", label: "Скрытые" },
          { value: "approved", label: "Выданы" },
          { value: "rejected", label: "Отказ" },
        ]}
        onChange={setFilter}
      />
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={2} height={240} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={filter === "pending"}
          title={
            filter === "pending"
              ? "Новых заявок нет"
              : filter === "deferred"
                ? "Скрытых заявок нет"
                : "Пока пусто"
          }
          hint={
            filter === "deferred"
              ? "Здесь будут заявки, которые вы скрыли, чтобы вернуться позже."
              : undefined
          }
        />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <RequestCard key={r.user_id} r={r} onOpen={onOpen} onDone={load} />
          ))}
        </div>
      )}
    </>
  );
}
