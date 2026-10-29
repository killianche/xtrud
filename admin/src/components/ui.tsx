// Мелкие общие детали панели. Ничего декоративного: значок состояния,
// пустой экран, ошибка, скелет и формат величин.

import { type ReactNode, useEffect, useState } from "react";
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
  completed: { label: "Исполнитель выбран", tone: "ok" },
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

export function EmptyState({
  title,
  hint,
  done,
}: {
  title: string;
  hint?: string;
  /** «Всё разобрано» — спокойная зелёная галочка вместо пустоты. */
  done?: boolean;
}) {
  return (
    <div className="empty">
      {done ? (
        <span className="empty-icon">
          <Icon.check size={28} />
        </span>
      ) : null}
      <p className="headline" style={{ color: "var(--ink)" }}>
        {title}
      </p>
      {hint ? (
        <p className="body-md text-mute" style={{ margin: 0, maxWidth: 360 }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <p className="headline" style={{ color: "var(--ink)" }}>
        Не удалось загрузить
      </p>
      <p className="body-md text-mute" style={{ margin: 0 }}>
        {message}
      </p>
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

/**
 * Шапка страницы: «‹ Назад» (если есть), крупный заголовок как в iOS,
 * подпись и действия. Заголовок дублируется в полоске навигации при
 * прокрутке (Shell).
 */
export function PageHead({
  eyebrow,
  title,
  lede,
  actions,
  onBack,
  backLabel,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div className="page-head">
      {onBack ? (
        <button type="button" className="back-link" onClick={onBack} style={{ marginLeft: -6 }}>
          <Icon.chevronLeft size={24} />
          {backLabel ?? "Назад"}
        </button>
      ) : eyebrow ? (
        <p className="caption" style={{ margin: 0 }}>
          {eyebrow}
        </p>
      ) : null}
      <div className="page-head-row">
        <h1 className="large-title" data-page-title={title}>
          {title}
        </h1>
      </div>
      {lede ? <p className="page-lede">{lede}</p> : null}
      {actions ? <div className="page-head-actions">{actions}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string; count?: number | null }>;
  onChange: (next: T) => void;
  label?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count ? <span className="count">{o.count}</span> : null}
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

/** Ячейка сгруппированного списка — как строка в «Настройках» iPhone. */
export function Cell({
  icon,
  iconBg,
  title,
  sub,
  value,
  count,
  onClick,
  chevron = true,
  danger,
}: {
  icon?: ReactNode;
  iconBg?: string;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  count?: number | null;
  onClick?: () => void;
  chevron?: boolean;
  danger?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <span className="cell-icon" style={iconBg ? { background: iconBg } : undefined}>
          {icon}
        </span>
      ) : null}
      <span className="cell-main">
        <span className="cell-title" style={danger ? { color: "var(--danger)" } : undefined}>
          {title}
        </span>
        {sub ? <span className="cell-sub">{sub}</span> : null}
      </span>
      {value != null ? <span className="cell-value">{value}</span> : null}
      {count ? <span className="count">{count}</span> : null}
      {onClick && chevron ? (
        <span className="chevron">
          <Icon.chevronRight />
        </span>
      ) : null}
    </>
  );
  const cls = `cell${icon ? " has-icon" : ""}`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Переключатель iOS. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function Avatar({ name, src }: { name: string; src?: string | null }) {
  return <span className="avatar">{src ? <img src={src} alt="" /> : initials(name)}</span>;
}

/** Ссылка на WhatsApp по номеру (только цифры). */
export function waLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl =
    digits.length === 10
      ? `7${digits}`
      : digits.length === 11 && digits[0] === "8"
        ? `7${digits.slice(1)}`
        : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Текст заявки целиком, ссылки нажимаются (№369: раньше обрезался «…»). */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className="quote">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: части текста не переставляются
          <a key={i} href={part} target="_blank" rel="noopener noreferrer">
            {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: части текста не переставляются
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/** Фото на весь экран с увеличением по касанию и щипком. */
export function PhotoViewer({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={title ?? "Фото"}>
      <div className="viewer-bar">
        <button type="button" className="btn-icon" onClick={onClose} aria-label="Закрыть">
          <Icon.x />
        </button>
        <span className="headline">{title}</span>
        <a
          className="btn-icon"
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Открыть оригинал"
        >
          <Icon.external />
        </a>
      </div>
      <button
        type="button"
        className={`viewer-stage${zoomed ? " is-zoomed" : ""}`}
        onClick={() => setZoomed((z) => !z)}
        aria-label={zoomed ? "Уменьшить" : "Увеличить"}
      >
        <img src={src} alt={title ?? ""} />
      </button>
      <p className="viewer-foot">
        {zoomed ? "Коснитесь, чтобы уменьшить" : "Коснитесь, чтобы увеличить · можно щипком"}
      </p>
    </div>
  );
}

/**
 * Название города/района по id — тот же список, что в приложении
 * (src/lib/location-config.ts). Раньше карточка показывала «nazran».
 */
const PLACE_NAME: Record<string, string> = {
  "nazran-magas": "Назрань · Магас",
  nazran: "Назрань",
  magas: "Магас",
  karabulak: "Карабулак",
  malgobek: "Малгобек",
  sunzha: "Сунжа",
  ordzhonikidzevskaya: "Орджоникидзевская",
  sernovodskaya: "Серноводская",
  nesterovskaya: "Нестеровская",
  nazranovsky: "Назрановский район",
  sunzhensky: "Сунженский район",
  malgobeksky: "Малгобекский район",
  dzheirakhsky: "Джейрахский район",
};

export function placeName(id: string | null | undefined): string {
  if (!id) return "—";
  return PLACE_NAME[id] ?? id;
}
