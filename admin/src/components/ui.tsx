// Мелкие общие детали панели. Ничего декоративного: значок состояния,
// пустой экран, ошибка, скелет и формат величин.

import type { ReactNode } from "react";

export function Badge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active: { label: "Активен", className: "badge badge-active" },
    suspended: { label: "Приостановлен", className: "badge badge-warn" },
    blocked: { label: "Заблокирован", className: "badge badge-error" },
    deleted: { label: "Удалён", className: "badge" },
  };
  const view = map[status] ?? { label: status, className: "badge" };
  return <span className={view.className}>{view.label}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="state">
      <p className="heading-md" style={{ color: "var(--ink)" }}>
        {title}
      </p>
      {hint ? <p className="body-md text-mute">{hint}</p> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <p className="heading-md" style={{ color: "var(--ink)" }}>
        Не удалось загрузить
      </p>
      <p className="body-md text-mute">{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-ghost" onClick={onRetry} style={{ marginTop: 8 }}>
          Повторить
        </button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ count = 5, height = 44 }: { count?: number; height?: number }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: позиция и есть ключ
          key={index}
          className="skeleton"
          style={{ height }}
        />
      ))}
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="body-sm text-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="body-sm text-mute">{hint}</span>
      ) : null}
    </div>
  );
}

/** Дата в формате «3 сен 2026, 14:05» — читается быстрее, чем ISO. */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Номер показываем единообразно: +7 928 123-45-67. */
export function formatPhone(raw: string | null): string {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length >= 10 ? digits.slice(-10) : digits;
  if (ten.length !== 10) return raw;
  return `+7 ${ten.slice(0, 3)} ${ten.slice(3, 6)}-${ten.slice(6, 8)}-${ten.slice(8)}`;
}

export function fullName(first: string | null, last: string | null): string {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Без имени";
}
