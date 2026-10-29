// Паспорта — проверка личности частного мастера (0174; редизайн №367/№368).
//
// DECISION владельца 2026-09-07: человек присылает фото паспорта, админ
// подтверждает — у имени появляется значок. 2026-10-29: паспорт нужен
// частному мастеру; компании — подтверждение компании (без логотипа). Если в
// «Паспорта» прислали логотип или документы фирмы — «Это компания»: заявка
// отклоняется с понятной причиной, профиль переводится в «Компания».
//
// Фото — приватное, по подписанной ссылке на 10 минут, только админу.
// Открывается на весь экран с увеличением (раньше — крошечное превью).

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import { Sheet } from "../components/Sheet";
import { refreshAttention } from "../components/Shell";
import {
  EmptyState,
  ErrorState,
  formatPhone,
  fullName,
  PageHead,
  PhotoViewer,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type VerificationRow } from "../lib/api";

type Tab = "pending" | "approved" | "rejected";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "pending", label: "Ждут" },
  { value: "approved", label: "Подтверждены" },
  { value: "rejected", label: "Отклонены" },
];

const REJECT_REASONS = [
  "Это не паспорт",
  "Фото нечёткое — данные не читаются",
  "Нужен разворот с фото",
  "Имя в профиле не совпадает с паспортом",
];

const COMPANY_REASON =
  "Это не паспорт. Похоже, вы компания — мы перевели профиль в «Компания». Укажите название и отправьте заявку на подтверждение компании: Профиль → Проверка.";

function Photo({
  path,
  label,
  onOpen,
}: {
  path: string;
  label: string;
  onOpen: (url: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api
      .verificationPhotoUrl(path)
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return (
    <button
      type="button"
      className="photo"
      onClick={() => url && onOpen(url)}
      disabled={!url}
      aria-label={`${label} — открыть на весь экран`}
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <span className="empty footnote" style={{ height: "100%", padding: 8 }}>
          {failed ? (
            "Фото недоступно"
          ) : (
            <span className="skeleton" style={{ position: "absolute", inset: 0 }} />
          )}
        </span>
      )}
      <span className="photo-label">{label}</span>
    </button>
  );
}

/** Подтверждение: имя и фамилия — с документа, они закрепятся за профилем. */
function ApproveSheet({
  row,
  onDone,
}: {
  row: VerificationRow;
  onDone: (names: { first: string; last: string } | null) => void;
}) {
  const [last, setLast] = useState(row.last_name ?? "");
  const [first, setFirst] = useState(row.first_name ?? "");
  const ok = first.trim().length > 0 && last.trim().length > 0;
  return (
    <Sheet
      title="Подтвердить личность"
      subtitle="Впишите имя и фамилию как в паспорте — они закрепятся за профилем. Если человек сменит имя, значок снимется."
      labelledBy="approve-title"
      onClose={() => onDone(null)}
      footer={
        <>
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={!ok}
            onClick={() => onDone({ first: first.trim(), last: last.trim() })}
          >
            Подтвердить{ok ? `: ${first.trim()} ${last.trim()}` : ""}
          </button>
          <button type="button" className="btn btn-plain btn-block" onClick={() => onDone(null)}>
            Отмена
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Фамилия по паспорту</span>
        <input
          className="input"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          autoCapitalize="words"
        />
      </label>
      <label className="field">
        <span className="field-label">Имя по паспорту</span>
        <input
          className="input"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          autoCapitalize="words"
        />
      </label>
    </Sheet>
  );
}

function RequestCard({
  row,
  onOpenUser,
  onPhoto,
  onDone,
}: {
  row: VerificationRow;
  onOpenUser: (id: string) => void;
  onPhoto: (url: string, title: string) => void;
  onDone: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const name = fullName(row.first_name, row.last_name);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      refreshAttention();
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const reason = await confirm({
      title: "Отклонить паспорт?",
      text: "Причину человек увидит в уведомлении и сможет отправить фото заново.",
      confirmLabel: "Отклонить",
      danger: true,
      reason: true,
      reasons: REJECT_REASONS,
    });
    if (reason === null) return;
    await run(() => api.reviewVerification(row.user_id, false, reason), "Отклонено");
  };

  const toCompany = async () => {
    const ok = await confirm({
      title: "Это компания?",
      text: "Заявка на паспорт отклонится, профиль станет «Компания». Человеку придёт одно уведомление: указать название и отправить заявку компании.",
      confirmLabel: "Перевести в «Компания»",
    });
    if (ok === null) return;
    await run(async () => {
      await api.reviewVerification(row.user_id, false, COMPANY_REASON);
      await api.setAccountType(
        row.user_id,
        "company",
        "Прислал документы компании вместо паспорта",
        false,
      );
    }, "Переведён в «Компания»");
  };

  return (
    <article className="card request">
      <div className="request-head">
        <button
          type="button"
          className="cell-main"
          style={{ textAlign: "left" }}
          onClick={() => onOpenUser(row.user_id)}
        >
          <span className="headline">{name}</span>
          <span className="meta">
            <span>{formatPhone(row.phone)}</span>
            <RelativeTime iso={row.submitted_at} />
          </span>
        </button>
        {row.status === "approved" ? (
          <span className="badge badge-ok">Подтверждён</span>
        ) : row.status === "rejected" ? (
          <span className="badge badge-error">Отклонён</span>
        ) : null}
      </div>

      <div className="photos">
        <Photo
          path={row.passport_main_path}
          label="Паспорт"
          onOpen={(u) => onPhoto(u, `Паспорт · ${name}`)}
        />
        {row.selfie_path ? (
          <Photo
            path={row.selfie_path}
            label="Селфи"
            onOpen={(u) => onPhoto(u, `Селфи · ${name}`)}
          />
        ) : null}
      </div>

      {row.status === "rejected" && row.rejection_reason ? (
        <p className="footnote text-mute" style={{ margin: 0 }}>
          Причина: {row.rejection_reason}
        </p>
      ) : null}

      {row.status === "pending" ? (
        <>
          <p className="footnote text-mute" style={{ margin: 0 }}>
            Сверьте имя в профиле — «{name}» — с паспортом.
          </p>
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
              onClick={() => setApproving(true)}
            >
              Подтвердить
            </button>
          </div>
          <button
            type="button"
            className="btn btn-plain btn-sm"
            disabled={busy}
            onClick={() => void toCompany()}
          >
            <Icon.building size={18} /> Это компания, а не паспорт
          </button>
        </>
      ) : row.status === "rejected" ? (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={busy}
          onClick={() => setApproving(true)}
        >
          Всё-таки подтвердить
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-block"
          disabled={busy}
          onClick={() => void reject()}
        >
          Снять подтверждение
        </button>
      )}

      {approving ? (
        <ApproveSheet
          row={row}
          onDone={(names) => {
            setApproving(false);
            if (names) {
              void run(
                () => api.reviewVerification(row.user_id, true, "", names.first, names.last),
                "Личность подтверждена — значок у имени",
              );
            }
          }}
        />
      ) : null}
    </article>
  );
}

export function Verifications({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("pending");
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);
  const reload = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    void tick;
    let cancelled = false;
    setRows(null);
    setError(null);
    api
      .listVerifications(tab)
      .then((data) => !cancelled && setRows(data))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab, tick]);

  return (
    <>
      <PageHead
        onBack={onBack}
        backLabel="Входящие"
        title="Паспорта"
        lede="Только для частных мастеров. Компании подтверждаются в «Компаниях» — паспорт им не нужен."
      />
      <Segmented label="Заявки" value={tab} options={TABS} onChange={setTab} />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : rows === null ? (
        <SkeletonRows count={2} height={320} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={tab === "pending"}
          title={tab === "pending" ? "Паспортов на проверке нет" : "Пока пусто"}
          hint={tab === "pending" ? "Новые фото появятся здесь сразу после отправки." : undefined}
        />
      ) : (
        <div className="stack">
          {rows.map((r) => (
            <RequestCard
              key={r.user_id}
              row={r}
              onOpenUser={onOpen}
              onPhoto={(url, title) => setViewer({ url, title })}
              onDone={reload}
            />
          ))}
        </div>
      )}
      {viewer ? (
        <PhotoViewer src={viewer.url} title={viewer.title} onClose={() => setViewer(null)} />
      ) : null}
    </>
  );
}
