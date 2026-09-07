// Проверка личности: очередь фото паспортов, решение админа.
// DECISION владельца 2026-09-07: «человек отправляет фото паспорта, оно
// приходит в админку, админ подтверждает — появляется значок».
// Фото — в приватном бакете, показывается по подписанной ссылке на 10 минут
// и только администратору (RLS storage, 0174). Решение уходит человеку
// уведомлением; отклонение требует причины.
import { useCallback, useEffect, useState } from "react";
import {
  EmptyState,
  ErrorState,
  formatDate,
  formatPhone,
  fullName,
  SkeletonRows,
} from "../components/ui";
import { api, type VerificationRow } from "../lib/api";

type Tab = "pending" | "approved" | "rejected";

const TAB_LABEL: Record<Tab, string> = {
  pending: "Ждут проверки",
  approved: "Подтверждены",
  rejected: "Отклонены",
};

function Photo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .verificationPhotoUrl(path)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (failed) return <span className="body-sm text-mute">Фото недоступно</span>;
  if (!url) return <span className="body-sm text-mute">Загружаем…</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title="Открыть в полном размере">
      <img
        src={url}
        alt="Разворот паспорта"
        style={{ width: 160, height: 110, objectFit: "cover", borderRadius: 8, display: "block" }}
      />
    </a>
  );
}

export function Verifications({ onOpen }: { onOpen: (userId: string) => void }) {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    void tick;
    let cancelled = false;
    setRows(null);
    setError(null);
    api
      .listVerifications(tab)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, tick]);

  const decide = async (row: VerificationRow, approve: boolean) => {
    let reason = "";
    if (!approve) {
      const answer = window.prompt(
        "Причина отклонения — её увидит человек в уведомлении",
        "Фото нечёткое, данные не читаются",
      );
      if (answer === null) return;
      if (answer.trim().length < 3) {
        window.alert("Укажите причину — минимум три символа.");
        return;
      }
      reason = answer;
    } else if (
      !window.confirm(`Подтвердить личность: ${fullName(row.first_name, row.last_name)}?`)
    ) {
      return;
    }
    setBusyId(row.user_id);
    try {
      await api.reviewVerification(row.user_id, approve, reason);
      reload();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Проверка личности</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Паспорта
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {(Object.keys(TAB_LABEL) as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              className={key === tab ? "btn btn-primary" : "btn btn-ghost"}
              onClick={() => setTab(key)}
            >
              {TAB_LABEL[key]}
            </button>
          ))}
        </div>
      </div>
      <p className="body-md text-mute" style={{ marginTop: 8 }}>
        Сверьте имя и фамилию в аккаунте с паспортом. Фото видно только здесь и открывается по
        временной ссылке. После подтверждения у специалиста появляется значок в профиле.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows === null ? (
        <SkeletonRows count={4} height={120} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Заявок на проверку нет" : "Пока пусто"}
          hint={tab === "pending" ? "Новые фото появятся здесь сразу после отправки." : undefined}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Специалист</th>
                <th>Фото паспорта</th>
                <th>Отправлено</th>
                <th>Решение</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id}>
                  <td>
                    <button type="button" className="link" onClick={() => onOpen(r.user_id)}>
                      {fullName(r.first_name, r.last_name)}
                    </button>
                    <div className="text-mute body-sm">{formatPhone(r.phone)}</div>
                  </td>
                  <td>
                    <Photo path={r.passport_main_path} />
                  </td>
                  <td className="cell-mono">{formatDate(r.submitted_at)}</td>
                  <td>
                    {r.status === "approved" ? (
                      <span className="badge badge-active">Подтверждён</span>
                    ) : r.status === "rejected" ? (
                      <>
                        <span className="badge badge-error">Отклонён</span>
                        {r.rejection_reason ? (
                          <div className="text-mute body-sm" style={{ marginTop: 4 }}>
                            {r.rejection_reason}
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <span className="badge badge-warn">Ждёт</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {r.status !== "approved" ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyId === r.user_id}
                        onClick={() => void decide(r, true)}
                      >
                        Подтвердить
                      </button>
                    ) : null}{" "}
                    {r.status !== "rejected" ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === r.user_id}
                        onClick={() => void decide(r, false)}
                      >
                        Отклонить
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
