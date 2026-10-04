// Мелкие общие детали панели. Ничего декоративного: значок состояния,
// пустой экран, ошибка, скелет и формат величин.

import type { ReactNode } from "react";
import { Icon } from "./icons";

/** Подписи состояний всех объектов панели: техническое значение наружу не показываем. */
const STATUS: Record<
  string,
  { label: string; tone: "" | "ok" | "active" | "warn" | "error" | "muted" }
> = {
  // люди
  active: { label: "Активен", tone: "active" },
  suspended: { label: "Приостановлен", tone: "warn" },
  banned: { label: "Заблокирован", tone: "error" },
  blocked: { label: "Заблокирован", tone: "error" },
  deleted: { label: "Удалён", tone: "muted" },
  // задания
  draft: { label: "Черновик", tone: "muted" },
  open: { label: "Открыто", tone: "active" },
  in_progress: { label: "В работе", tone: "warn" },
  awaiting_confirmation: { label: "Ждёт подтверждения", tone: "warn" },
  completed: { label: "Выполнено", tone: "ok" },
  disputed: { label: "Спор", tone: "error" },
  cancelled: { label: "Отменено", tone: "muted" },
  expired: { label: "Истекло", tone: "muted" },
  // отклики
  sent: { label: "Отправлен", tone: "" },
  viewed: { label: "Просмотрен", tone: "" },
  accepted: { label: "Выбран", tone: "ok" },
  rejected: { label: "Отклонён", tone: "muted" },
  withdrawn: { label: "Отозван", tone: "muted" },
  // отзывы
  visible: { label: "Виден", tone: "ok" },
  hidden: { label: "Скрыт", tone: "muted" },
  pending: { label: "Ждёт", tone: "warn" },
};

export function Badge({ status }: { status: string }) {
  const view = STATUS[status] ?? { label: status, tone: "" };
  return <span className={`badge ${view.tone ? `badge-${view.tone}` : ""}`}>{view.label}</span>;
}

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
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

/** 1 задание, 2 задания, 5 заданий. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word =
    m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n} ${word}`;
}

/** «5 мин назад», «вчера, 14:05», «3 сен» — точная дата в подсказке. */
export function RelativeTime({ iso }: { iso: string | null }) {
  if (!iso) return <span>—</span>;
  return (
    <time dateTime={iso} title={formatDate(iso)}>
      {relative(iso)}
    </time>
  );
}

export function relative(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  const min = Math.round((now - t) / 60_000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24 && new Date(t).getDate() === new Date(now).getDate()) return `${h} ч назад`;
  const d = new Date(t);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now - 86_400_000);
  if (d.toDateString() === yesterday.toDateString()) return `вчера, ${time}`;
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function PageHead({
  eyebrow,
  title,
  actions,
  onBack,
  backLabel,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        {onBack ? (
          <button type="button" className="back-link" onClick={onBack}>
            <Icon.chevronLeft />
            {backLabel ?? "Назад"}
          </button>
        ) : eyebrow ? (
          <p className="mono-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="heading-lg">{title}</h1>
      </div>
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span className="text-mute">—</span>;
  const full = Math.round(rating);
  return (
    <span className="stars" role="img" aria-label={`Оценка ${rating} из 5`}>
      {"★".repeat(full)}
      <span style={{ opacity: 0.25 }}>{"★".repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

/** Линия динамики без осей — форма важнее точных значений, они в подписи. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const w = 100;
  const h = 30;
  const step = w / (values.length - 1);
  const points = values.map(
    (v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * (h - 2) - 1).toFixed(2)}`,
  );
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
