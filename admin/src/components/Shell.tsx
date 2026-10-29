// Каркас админки (№367, 2026-10-29): «приложение на iPhone», а не сайт.
//
// Четыре вкладки внизу вместо бокового меню на 22 пункта:
//   Входящие — всё, что ждёт решения (очереди со счётчиками);
//   Задания  — на проверке, опубликованные, отклонённые, скрытые;
//   Люди     — поиск человека, карточка;
//   Ещё      — аналитика, каталог, рассылка, журнал, настройки, уведомления.
// Сверху — полупрозрачная полоска с коротким заголовком, который появляется,
// когда крупный заголовок страницы уехал вверх (как в iOS).
//
// Счётчик «Входящих» — из admin_attention (0255: без отменённых и скрытых);
// он же — число на иконке приложения на экране «Домой» (Badging API, iOS 16.4+).

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type Attention, api, type StaffRole } from "../lib/api";
import { Icon } from "./icons";

export type Tab = "inbox" | "orders" | "users" | "more";

const TABS: Array<{
  id: Tab;
  label: string;
  path: string;
  icon: () => ReactNode;
  adminOnly?: boolean;
}> = [
  // У админа первая вкладка — «Сводка» (цифры + что ждёт решения, №372),
  // у управляющего — «Входящие»: общие цифры ему закрыты (STAFF_ROLES §2).
  { id: "inbox", label: "Входящие", path: "/inbox", icon: () => <Icon.inbox size={26} /> },
  { id: "orders", label: "Задания", path: "/orders", icon: () => <Icon.task size={26} /> },
  {
    id: "users",
    label: "Люди",
    path: "/users",
    icon: () => <Icon.users size={26} />,
    adminOnly: true,
  },
  { id: "more", label: "Ещё", path: "/more", icon: () => <Icon.more size={26} /> },
];

/** Сколько всего ждёт решения — по тем очередям, что видит роль. */
export function inboxTotal(a: Attention | null): number {
  if (!a) return 0;
  return (
    (a.reports_open ?? 0) +
    (a.uncategorized_open ?? 0) +
    (a.verifications_pending ?? 0) +
    (a.recovery_new ?? 0) +
    (a.instagram_pending ?? 0) +
    (a.companies_pending ?? 0) +
    (a.experience_pending ?? 0)
  );
}

let attentionCache: Attention | null = null;

export function useAttention(): Attention | null {
  const [attention, setAttention] = useState<Attention | null>(attentionCache);
  const load = useCallback(() => {
    api
      .attention()
      .then((a) => {
        attentionCache = a;
        setAttention(a);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", load);
    window.addEventListener("xtrud-admin-refresh", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("xtrud-admin-refresh", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  return attention;
}

/** После действия, меняющего очередь, — обновить счётчики. */
export function refreshAttention(): void {
  window.dispatchEvent(new Event("xtrud-admin-refresh"));
}

/** Число на иконке приложения (экран «Домой»). Без поддержки — ничего. */
function useAppBadge(total: number) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    try {
      if (total > 0) void nav.setAppBadge?.(total)?.catch(() => undefined);
      else void nav.clearAppBadge?.()?.catch(() => undefined);
    } catch {
      /* не поддерживается */
    }
  }, [total]);
}

/** Полоска сверху получает линию и короткий заголовок после прокрутки. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 44);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return scrolled;
}

export function Shell({
  role,
  tab,
  title,
  navigate,
  children,
}: {
  role: StaffRole;
  tab: Tab;
  title: string;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const attention = useAttention();
  const total = inboxTotal(attention);
  const scrolled = useScrolled();
  useAppBadge(total);

  useEffect(() => {
    document.title = title ? `${title} · xtrud` : "xtrud";
  }, [title]);

  const tabs = TABS.filter((t) => role === "admin" || !t.adminOnly).map((t) =>
    t.id === "inbox" && role === "admin"
      ? { ...t, label: "Сводка", path: "/summary", icon: () => <Icon.chart size={26} /> }
      : t,
  );

  return (
    <div className="app">
      <header className={`navbar${scrolled ? " is-scrolled" : ""}`}>
        <span className="navbar-title" aria-hidden={!scrolled}>
          {title}
        </span>
      </header>
      <main className="page" id="main">
        {children}
      </main>
      <nav className="tabbar" aria-label="Разделы">
        <div className="tabbar-inner">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                className="tab"
                aria-current={active ? "page" : undefined}
                aria-label={
                  t.id === "inbox" && total > 0 ? `${t.label}, ждут решения: ${total}` : t.label
                }
                onClick={() => {
                  if (active) window.scrollTo({ top: 0, behavior: "smooth" });
                  navigate(t.path);
                }}
              >
                {t.icon()}
                <span>{t.label}</span>
                {t.id === "inbox" && total > 0 ? (
                  <span className="count" aria-hidden="true">
                    {total > 99 ? "99+" : total}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
