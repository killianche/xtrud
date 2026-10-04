// «Рассылка» (владелец, 2026-10-04, №200): push всем или части людей.
// Сообщение придёт push-уведомлением тем, у кого разрешены уведомления, и
// появится в «Уведомлениях» приложения у всех получателей. Предпросмотр
// показывает, как оно выглядит на экране блокировки, и сколько людей его
// получат. Лимиты базы: не чаще раза в 10 минут и не больше 5 в сутки —
// случайная или чужая рассылка не зальёт всех сообщениями.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import {
  EmptyState,
  ErrorState,
  Field,
  PageHead,
  plural,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type BroadcastAudience, type BroadcastRow } from "../lib/api";

const AUDIENCE: Array<{ value: BroadcastAudience; label: string }> = [
  { value: "all", label: "Все" },
  { value: "clients", label: "Клиенты" },
  { value: "masters", label: "Специалисты" },
];
const AUDIENCE_LABEL: Record<BroadcastAudience, string> = {
  all: "всем",
  clients: "клиентам",
  masters: "специалистам",
};

export function Broadcast() {
  const { toast, confirm } = useFeedback();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [preview, setPreview] = useState<{ recipients: number; with_push: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTry, setPreviewTry] = useState(0);
  const [history, setHistory] = useState<BroadcastRow[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: previewTry — повтор вручную
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    api
      .broadcastPreview(audience)
      .then(setPreview)
      .catch((e: Error) => setPreviewError(e.message));
  }, [audience, previewTry]);

  const loadHistory = useCallback(() => {
    setHistoryError(null);
    api
      .listBroadcasts(20)
      .then(setHistory)
      .catch((e: Error) => setHistoryError(e.message));
  }, []);
  useEffect(loadHistory, [loadHistory]);

  const t = title.trim();
  const b = body.trim();
  // Без подсчёта получателей не отправляем: в подтверждении должно быть
  // настоящее число, а не «0» при сбое сети (QA 2026-10-04).
  const valid =
    t.length >= 3 && t.length <= 60 && b.length >= 3 && b.length <= 200 && preview !== null;

  const send = async () => {
    if (!preview) return;
    const count = preview.recipients;
    const ok = await confirm({
      title: `Отправить ${AUDIENCE_LABEL[audience]}?`,
      text: `${plural(count, "человек получит", "человека получат", "человек получат")} сообщение «${t}». Отменить отправку будет нельзя.`,
      confirmLabel: "Отправить",
    });
    if (ok === null) return;
    setBusy(true);
    try {
      const r = await api.broadcastPush(t, b, audience);
      toast(`Отправлено: ${plural(r.recipients, "получатель", "получателя", "получателей")}`);
      setTitle("");
      setBody("");
      loadHistory();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось отправить", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead eyebrow="Контент" title="Рассылка" />
      <div className="detail-grid">
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !busy) void send();
          }}
        >
          <Field label="Кому">
            <Segmented value={audience} options={AUDIENCE} onChange={setAudience} />
          </Field>
          {previewError ? (
            <div className="banner-error body-md" role="alert">
              Не удалось посчитать получателей: {previewError}{" "}
              <button type="button" className="link" onClick={() => setPreviewTry((n) => n + 1)}>
                Повторить
              </button>
            </div>
          ) : (
            <p className="body-sm text-mute" style={{ margin: 0 }}>
              {preview
                ? `Получат ${plural(preview.recipients, "человек", "человека", "человек")}, push на телефон — у ${preview.with_push} (остальные увидят в «Уведомлениях»).`
                : "Считаем получателей…"}
            </p>
          )}
          <Field label="Заголовок" hint={`${t.length}/60`}>
            <input
              className="input"
              value={title}
              maxLength={60}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Например: Новые категории в xtrud"
              disabled={busy}
            />
          </Field>
          <Field label="Текст" hint={`${b.length}/200`}>
            <textarea
              className="input"
              value={body}
              maxLength={200}
              rows={4}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Коротко и по делу — что нового и зачем открыть приложение"
              disabled={busy}
              style={{ resize: "vertical", minHeight: 96, paddingTop: 10 }}
            />
          </Field>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <span className="body-sm text-mute">Не чаще раза в 10 минут, до 5 в сутки</span>
            <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
              {busy ? "Отправляем…" : "Отправить"}
            </button>
          </div>
        </form>

        <aside className="card stack" aria-label="Как будет выглядеть">
          <p className="mono-eyebrow">На экране блокировки</p>
          <div className="push-preview">
            <div className="push-preview-icon">x</div>
            <div style={{ minWidth: 0 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="push-preview-app">XTRUD</span>
                <span className="push-preview-app">сейчас</span>
              </div>
              <div className="push-preview-title">{t || "Заголовок"}</div>
              <div className="push-preview-body">{b || "Текст сообщения"}</div>
            </div>
          </div>
        </aside>
      </div>

      <div className="section-title">
        <h2 className="heading-md">Отправленные</h2>
      </div>
      {historyError ? (
        <ErrorState message={historyError} onRetry={loadHistory} />
      ) : !history ? (
        <SkeletonRows count={3} />
      ) : history.length === 0 ? (
        <EmptyState title="Рассылок ещё не было" />
      ) : (
        <div className="list">
          {history.map((h) => (
            <div
              key={h.id}
              className="list-row"
              style={{ gridTemplateColumns: "minmax(0,1fr) 160px 120px" }}
            >
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{h.title}</div>
                <div className="cell-sub">{h.body}</div>
              </div>
              <span className="cell-sub col-hide-sm">
                {AUDIENCE_LABEL[h.audience]} · {h.recipients}
              </span>
              <span className="cell-sub">
                <RelativeTime iso={h.created_at} />
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
