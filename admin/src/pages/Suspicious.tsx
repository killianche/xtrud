// «Подозрительные» (0254, №356): отзывы без задания на проверке/с признаками
// накрутки и специалисты по баллу подозрительности. Вкладка «На проверке» —
// решение (одобрить/скрыть) через существующий admin_set_review_status, тот
// же поток, что в Reviews.tsx. Вкладка «Специалисты» — таблица сигналов, как
// в Masters.tsx; период зафиксирован на 30 дней (RPC принимает p_days, но
// переключатель в этой итерации не сделан).
import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { refreshAttention } from "../components/Shell";
import {
  EmptyState,
  ErrorState,
  PageHead,
  plural,
  RelativeTime,
  Segmented,
  SkeletonRows,
  Stars,
} from "../components/ui";
import { api, type FlaggedReviewRow, type SuspiciousSpecialistRow } from "../lib/api";

type Tab = "flagged" | "specialists";

const FLAG_LABEL: Record<string, { label: string; hint: string }> = {
  new_account: { label: "Новый аккаунт", hint: "Автору отзыва меньше 7 дней" },
  shared_device: {
    label: "Общее устройство",
    hint: "Автор и специалист заходили с одного устройства",
  },
  burst: { label: "Всплеск отзывов", hint: "Специалисту пришло ≥3 отзыва без задания за 7 дней" },
  mutual: { label: "Взаимный отзыв", hint: "Специалист тоже оставлял отзыв автору" },
};

/** «аккаунту 2 дня» / «аккаунту меньше дня» — сигнал, по которому решают. */
function accountAgeLabel(iso: string | null): string {
  if (!iso) return "возраст неизвестен";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "аккаунту меньше дня";
  return `аккаунту ${plural(days, "день", "дня", "дней")}`;
}

function FlaggedReviews({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<FlaggedReviewRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listFlaggedReviews()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const approve = async (row: FlaggedReviewRow) => {
    setBusyId(row.id);
    try {
      await api.setReviewStatus(row.id, "visible", "Проверено");
      toast("Отзыв одобрен");
      load();
      refreshAttention();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось одобрить отзыв", true);
    } finally {
      setBusyId(null);
    }
  };

  const hide = async (row: FlaggedReviewRow) => {
    const reason = await confirm({
      title: "Скрыть отзыв?",
      text: "Отзыв не появится на странице специалиста и перестанет влиять на рейтинг.",
      confirmLabel: "Скрыть",
      danger: true,
      reason: true,
    });
    if (!reason) return;
    setBusyId(row.id);
    try {
      await api.setReviewStatus(row.id, "hidden", reason);
      toast("Отзыв скрыт");
      load();
      refreshAttention();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось скрыть отзыв", true);
    } finally {
      setBusyId(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <SkeletonRows count={5} height={110} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Нечего проверять"
        hint="Отзывы без задания с признаками накрутки появятся здесь."
      />
    );
  }

  return (
    <div className="stack">
      {rows.map((r) => (
        <div key={r.id} className="card stack" style={{ gap: 10 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}
          >
            <div style={{ minWidth: 0 }}>
              <Stars rating={r.rating} />
              <p className="body-md" style={{ margin: "6px 0 0" }}>
                <button
                  type="button"
                  className="back-link"
                  style={{ color: "var(--ink)", margin: 0, fontWeight: 500 }}
                  onClick={() => onOpenUser(r.author_id)}
                >
                  {r.author_label ?? "Без имени"}
                </button>
                <span className="text-mute body-sm">
                  {" "}
                  ({accountAgeLabel(r.author_created_at)}, заданий: {r.author_orders_count})
                </span>
                <span className="text-mute"> → </span>
                <button
                  type="button"
                  className="back-link"
                  style={{ color: "var(--ink)", margin: 0, fontWeight: 500 }}
                  onClick={() => onOpenUser(r.target_id)}
                >
                  {r.target_label ?? "Без имени"}
                </button>
              </p>
            </div>
          </div>
          <p className="body-md text-body" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {r.text?.trim() || "Без текста"}
          </p>
          {r.flags.length > 0 ? (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {r.flags.map((f) => (
                <span key={f} className="badge" title={FLAG_LABEL[f]?.hint}>
                  {FLAG_LABEL[f]?.label ?? f}
                </span>
              ))}
            </div>
          ) : null}
          <div
            className="row body-sm text-mute"
            style={{ justifyContent: "space-between", flexWrap: "wrap" }}
          >
            <RelativeTime iso={r.created_at} />
            <div className="row" style={{ gap: 8 }}>
              {r.status !== "visible" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busyId === r.id}
                  onClick={() => void approve(r)}
                >
                  Одобрить
                </button>
              ) : null}
              {r.status !== "hidden" ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busyId === r.id}
                  onClick={() => void hide(r)}
                >
                  Скрыть
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const SUSPICIOUS_DAYS = 30;

function SuspiciousSpecialists({ onOpen }: { onOpen: (userId: string) => void }) {
  const [rows, setRows] = useState<SuspiciousSpecialistRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listSuspiciousSpecialists(SUSPICIOUS_DAYS)
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <SkeletonRows count={6} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Подозрительных нет"
        hint="Специалисты с баллом подозрительности за период не найдены."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Специалист</th>
            <th>Балл</th>
            <th>Отзывов всего / без задания</th>
            <th>Новые аккаунты</th>
            <th>Без единого задания</th>
            <th>Общее устройство</th>
            <th>Взаимные</th>
            <th>Доля 5★</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.target_id} className="clickable" onClick={() => onOpen(r.target_id)}>
              <td>{r.target_label ?? "Без имени"}</td>
              <td className="cell-mono">{r.score}</td>
              <td className="cell-mono">
                {r.reviews_total} / {r.reviews_direct}
              </td>
              <td className="cell-mono">{r.from_new_accounts}</td>
              <td className="cell-mono">{r.from_accounts_without_orders}</td>
              <td className="cell-mono">{r.shared_device}</td>
              <td className="cell-mono">{r.mutual}</td>
              <td className="cell-mono">
                {/* Процент от 1-2 отзывов вводит в заблуждение (design-quality.md §5). */}
                {r.reviews_total >= 3 ? `${Math.round(r.five_star_share * 100)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Suspicious({
  onOpenUser,
  onBack,
}: {
  onOpenUser: (userId: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("flagged");

  return (
    <div>
      <PageHead onBack={onBack} backLabel="Входящие" title="Подозрительные" />
      <div className="toolbar">
        <Segmented
          value={tab}
          options={[
            { value: "flagged", label: "На проверке" },
            { value: "specialists", label: "Специалисты" },
          ]}
          onChange={setTab}
        />
      </div>
      {tab === "flagged" ? (
        <FlaggedReviews onOpenUser={onOpenUser} />
      ) : (
        <SuspiciousSpecialists onOpen={onOpenUser} />
      )}
    </div>
  );
}
