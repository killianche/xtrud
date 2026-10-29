// Отклик на действие: тост «Готово» / ошибка, подтверждение с причиной,
// ввод значения и выбор действия — всё шторкой снизу (components/Sheet.tsx),
// вместо window.prompt/confirm (№367).
//
// Каждое действие админа пишется в журнал с причиной, поэтому подтверждение
// сразу спрашивает её. Готовые причины — чипами одним касанием: на телефоне
// печатать «Это не паспорт» каждый раз неудобно.

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Sheet } from "./Sheet";

interface ToastItem {
  id: number;
  text: string;
  error: boolean;
}

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmLabel: string;
  danger?: boolean;
  /** Спросить причину для журнала (≥3 символов). */
  reason?: boolean;
  /** Готовые причины — чипами; «Другое» открывает поле. */
  reasons?: string[];
  /** Начальный текст причины. */
  defaultReason?: string;
  reasonPlaceholder?: string;
}

export interface AskOptions {
  title: string;
  text?: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  multiline?: boolean;
  inputMode?: "text" | "numeric" | "tel" | "url" | "email";
  /** null — можно; строка — текст ошибки. */
  validate?: (value: string) => string | null;
}

export interface ChooseOption {
  value: string;
  label: string;
  hint?: string;
  danger?: boolean;
}

type Request =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: string | null) => void }
  | { kind: "ask"; opts: AskOptions; resolve: (v: string | null) => void }
  | {
      kind: "choose";
      opts: { title: string; text?: string; options: ChooseOption[] };
      resolve: (v: string | null) => void;
    };

const Ctx = createContext<{
  toast: (text: string, error?: boolean) => void;
  confirm: (opts: ConfirmOptions) => Promise<string | null>;
  ask: (opts: AskOptions) => Promise<string | null>;
  choose: (opts: {
    title: string;
    text?: string;
    options: ChooseOption[];
  }) => Promise<string | null>;
} | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [request, setRequest] = useState<Request | null>(null);
  const seq = useRef(0);

  const toast = useCallback((text: string, error = false) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 2600);
    // Короткая вибрация там, где она есть (Android); iOS Safari её не даёт.
    try {
      navigator.vibrate?.(error ? [20, 40, 20] : 12);
    } catch {
      /* нет — и не надо */
    }
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<string | null>((resolve) => setRequest({ kind: "confirm", opts, resolve })),
    [],
  );
  const ask = useCallback(
    (opts: AskOptions) =>
      new Promise<string | null>((resolve) => setRequest({ kind: "ask", opts, resolve })),
    [],
  );
  const choose = useCallback(
    (opts: { title: string; text?: string; options: ChooseOption[] }) =>
      new Promise<string | null>((resolve) => setRequest({ kind: "choose", opts, resolve })),
    [],
  );

  const finish = useCallback(
    (value: string | null) => {
      request?.resolve(value);
      setRequest(null);
    },
    [request],
  );

  return (
    <Ctx.Provider value={{ toast, confirm, ask, choose }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? "is-error" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
      {request?.kind === "confirm" ? <ConfirmSheet opts={request.opts} onDone={finish} /> : null}
      {request?.kind === "ask" ? <AskSheet opts={request.opts} onDone={finish} /> : null}
      {request?.kind === "choose" ? <ChooseSheet opts={request.opts} onDone={finish} /> : null}
    </Ctx.Provider>
  );
}

const OTHER = "Другое…";

function ConfirmSheet({
  opts,
  onDone,
}: {
  opts: ConfirmOptions;
  onDone: (v: string | null) => void;
}) {
  const chips = opts.reasons ?? [];
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState(opts.defaultReason ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const showInput = !!opts.reason && (chips.length === 0 || picked === OTHER);

  useEffect(() => {
    if (showInput && chips.length > 0) inputRef.current?.focus();
  }, [showInput, chips.length]);

  const value = picked && picked !== OTHER ? picked : reason.trim();
  const ok = !opts.reason || value.length >= 3;

  return (
    <Sheet
      title={opts.title}
      subtitle={opts.text}
      labelledBy="confirm-title"
      onClose={() => onDone(null)}
      footer={
        <>
          <button
            type="button"
            className={`btn btn-block ${opts.danger ? "btn-danger" : "btn-primary"}`}
            disabled={!ok}
            onClick={() => onDone(value)}
          >
            {opts.confirmLabel}
          </button>
          <button type="button" className="btn btn-block btn-plain" onClick={() => onDone(null)}>
            Отмена
          </button>
        </>
      }
    >
      {opts.reason && chips.length > 0 ? (
        <div className="stack">
          <span className="field-label">Причина</span>
          <div className="chips">
            {[...chips, OTHER].map((c) => (
              <button
                key={c}
                type="button"
                className="chip"
                aria-pressed={picked === c}
                onClick={() => setPicked(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {showInput ? (
        <textarea
          ref={inputRef}
          className="textarea"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={opts.reasonPlaceholder ?? "Причина — попадёт в журнал"}
          aria-label="Причина"
        />
      ) : null}
    </Sheet>
  );
}

function AskSheet({ opts, onDone }: { opts: AskOptions; onDone: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.initial ?? "");
  const error = opts.validate ? opts.validate(value.trim()) : value.trim().length === 0 ? "" : null;
  const submit = () => {
    if (error === null) onDone(value.trim());
  };
  return (
    <Sheet
      title={opts.title}
      subtitle={opts.text}
      labelledBy="ask-title"
      onClose={() => onDone(null)}
      footer={
        <>
          <button
            type="button"
            className="btn btn-block btn-primary"
            disabled={error !== null}
            onClick={submit}
          >
            {opts.confirmLabel ?? "Готово"}
          </button>
          <button type="button" className="btn btn-block btn-plain" onClick={() => onDone(null)}>
            Отмена
          </button>
        </>
      }
    >
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {opts.label ? <span className="field-label">{opts.label}</span> : null}
        {opts.multiline ? (
          <textarea
            className="textarea"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder}
            aria-label={opts.label ?? opts.title}
          />
        ) : (
          <input
            className="input"
            value={value}
            inputMode={opts.inputMode}
            onChange={(e) => setValue(e.target.value)}
            placeholder={opts.placeholder}
            aria-label={opts.label ?? opts.title}
            enterKeyHint="done"
            // biome-ignore lint/a11y/noAutofocus: шторка открыта ради этого поля
            autoFocus
          />
        )}
        {error ? (
          <span className="body-sm text-error" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    </Sheet>
  );
}

function ChooseSheet({
  opts,
  onDone,
}: {
  opts: { title: string; text?: string; options: ChooseOption[] };
  onDone: (v: string | null) => void;
}) {
  return (
    <Sheet
      title={opts.title}
      subtitle={opts.text}
      labelledBy="choose-title"
      onClose={() => onDone(null)}
      footer={
        <button type="button" className="btn btn-block btn-plain" onClick={() => onDone(null)}>
          Отмена
        </button>
      }
    >
      <div className="group">
        {opts.options.map((o) => (
          <button key={o.value} type="button" className="cell" onClick={() => onDone(o.value)}>
            <span className="cell-main">
              <span
                className="cell-title"
                style={o.danger ? { color: "var(--danger)" } : undefined}
              >
                {o.label}
              </span>
              {o.hint ? <span className="cell-sub">{o.hint}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function useFeedback() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("FeedbackProvider не подключён");
  return ctx;
}
