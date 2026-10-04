// Отклик на действие: тост «Готово» / ошибка и окно подтверждения с причиной.
// Каждое действие админа пишется в журнал с причиной, поэтому подтверждение
// сразу спрашивает её — отдельное поле на каждой карточке не нужно.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface ToastItem {
  id: number;
  text: string;
  error: boolean;
}

interface ConfirmRequest {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Спросить причину для журнала (≥3 символов). */
  reason?: boolean;
  resolve: (reason: string | null) => void;
}

const Ctx = createContext<{
  toast: (text: string, error?: boolean) => void;
  confirm: (r: Omit<ConfirmRequest, "resolve">) => Promise<string | null>;
} | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, error = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (r: Omit<ConfirmRequest, "resolve">) =>
      new Promise<string | null>((resolve) => setRequest({ ...r, resolve })),
    [],
  );

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? "is-error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
      {request ? (
        <ConfirmDialog
          request={request}
          onClose={(reason) => {
            request.resolve(reason);
            setRequest(null);
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}

function ConfirmDialog({
  request,
  onClose,
}: {
  request: ConfirmRequest;
  onClose: (reason: string | null) => void;
}) {
  const [reason, setReason] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const ok = !request.reason || reason.trim().length >= 3;
  return (
    <div className="overlay">
      <button
        type="button"
        className="overlay-bg"
        aria-label="Отмена"
        onClick={() => onClose(null)}
      />
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={request.title}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onClose(reason.trim());
        }}
      >
        <div>
          <p className="heading-md">{request.title}</p>
          {request.text ? (
            <p className="body-md text-body" style={{ margin: "6px 0 0" }}>
              {request.text}
            </p>
          ) : null}
        </div>
        {request.reason ? (
          <input
            ref={inputRef}
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина — попадёт в журнал"
          />
        ) : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => onClose(null)}>
            Отмена
          </button>
          <button
            type="submit"
            className={`btn ${request.danger ? "btn-danger" : "btn-primary"}`}
            disabled={!ok}
          >
            {request.confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("FeedbackProvider не подключён");
  return ctx;
}
