// Каркас панели (2026-10-04): боковая панель с группами и счётчиками очередей,
// на узком экране — шапка с поиском и выезжающее меню. Счётчики обновляются
// раз в минуту и при возврате на вкладку.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type Attention, api } from "../lib/api";
import { CommandPalette } from "./CommandPalette";
import { Icon } from "./icons";

export type Section =
  | "overview"
  | "users"
  | "masters"
  | "orders"
  | "reviews"
  | "reports"
  | "verifications"
  | "recovery"
  | "instagram"
  | "uncategorized"
  | "catalog"
  | "promo"
  | "broadcast"
  | "settings"
  | "journal";

interface NavItem {
  id: Section;
  label: string;
  path: string;
  icon: () => ReactNode;
  count?: (a: Attention) => number;
}

export const NAV: Array<{ title: string | null; items: NavItem[] }> = [
  { title: null, items: [{ id: "overview", label: "Обзор", path: "/", icon: Icon.home }] },
  {
    title: "Площадка",
    items: [
      { id: "users", label: "Люди", path: "/users", icon: Icon.users },
      // Без счётчика: master_profiles.status='pending' — «нет категорий»,
      // а не «ждёт одобрения» (отчёт xtrud-backend 2026-10-04).
      { id: "masters", label: "Специалисты", path: "/masters", icon: Icon.tool },
      { id: "orders", label: "Задания", path: "/orders", icon: Icon.task },
      { id: "reviews", label: "Отзывы", path: "/reviews", icon: Icon.star },
    ],
  },
  {
    title: "Модерация",
    items: [
      {
        id: "reports",
        label: "Жалобы",
        path: "/reports",
        icon: Icon.flag,
        count: (a) => a.reports_open,
      },
      {
        id: "verifications",
        label: "Паспорта",
        path: "/verifications",
        icon: Icon.id,
        count: (a) => a.verifications_pending,
      },
      {
        id: "recovery",
        label: "Восстановление",
        path: "/recovery",
        icon: Icon.phone,
        count: (a) => a.recovery_new,
      },
      {
        id: "instagram",
        label: "Instagram",
        path: "/instagram",
        icon: Icon.image,
        count: (a) => a.instagram_pending ?? 0,
      },
      // Счётчик — не из admin_attention (его не трогаем): длина своего же
      // списка, см. useUncategorizedCount ниже (0230, №251).
      { id: "uncategorized", label: "Без категории", path: "/uncategorized", icon: Icon.grid },
    ],
  },
  {
    title: "Контент",
    items: [
      { id: "catalog", label: "Каталог", path: "/catalog", icon: Icon.grid },
      { id: "promo", label: "Реклама", path: "/promo", icon: Icon.image },
      { id: "broadcast", label: "Рассылка", path: "/broadcast", icon: Icon.megaphone },
    ],
  },
  {
    title: "Система",
    items: [
      { id: "settings", label: "Настройки", path: "/settings", icon: Icon.settings },
      { id: "journal", label: "Журнал", path: "/journal", icon: Icon.journal },
    ],
  },
];

export function sectionLabel(id: Section): string {
  for (const g of NAV) for (const i of g.items) if (i.id === id) return i.label;
  return "";
}

const THEME_KEY = "xtrud-admin-theme";

function initialTheme(): "light" | "dark" {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* хранилище недоступно — по системе */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useAttention(): Attention | null {
  const [attention, setAttention] = useState<Attention | null>(null);
  const load = useCallback(() => {
    api
      .attention()
      .then(setAttention)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("xtrud-admin-refresh", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xtrud-admin-refresh", onFocus);
    };
  }, [load]);
  return attention;
}

/** После действия, меняющего очередь, — обновить счётчики в меню. */
export function refreshAttention(): void {
  window.dispatchEvent(new Event("xtrud-admin-refresh"));
}

/**
 * Счётчик «Без категории» — не серверный admin_attention (его не меняем по
 * заданию), а длина своего же списка admin_list_uncategorized_orders.
 */
function useUncategorizedCount(): number {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    api
      .listUncategorizedOrders(200)
      .then((rows) => setCount(rows.length))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    window.addEventListener("xtrud-admin-refresh", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("xtrud-admin-refresh", onFocus);
    };
  }, [load]);
  return count;
}

export function Shell({
  section,
  title,
  navigate,
  onSignOut,
  children,
}: {
  section: Section;
  title: string;
  navigate: (path: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const attention = useAttention();
  const uncategorizedCount = useUncategorizedCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(initialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
      if (e.key === "Escape") {
        setMenuOpen(false);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (path: string) => {
    setMenuOpen(false);
    navigate(path);
  };
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      /* без сохранения — только на эту вкладку */
    }
  };
  const totalQueue =
    (attention
      ? attention.reports_open +
        attention.verifications_pending +
        attention.recovery_new +
        (attention.instagram_pending ?? 0)
      : 0) + uncategorizedCount;

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Разделы">
        <div className="sidebar-brand">
          <span className="brand-mark">x</span>
          <div>
            <div className="brand-name">xtrud</div>
            <div className="brand-tag">админка</div>
          </div>
        </div>
        <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Icon.search />
          Поиск
          <span className="kbd">⌘K</span>
        </button>
        {NAV.map((group) => (
          <nav key={group.title ?? "top"} className="nav-group" aria-label={group.title ?? "Обзор"}>
            {group.title ? <div className="nav-group-title">{group.title}</div> : null}
            {group.items.map((item) => {
              const count =
                item.id === "uncategorized"
                  ? uncategorizedCount
                  : attention && item.count
                    ? item.count(attention)
                    : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="nav-item"
                  aria-current={section === item.id ? "page" : undefined}
                  onClick={() => go(item.path)}
                >
                  <item.icon />
                  {item.label}
                  {count > 0 ? (
                    <span className="nav-count">{count > 99 ? "99+" : count}</span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        ))}
        <div className="sidebar-footer">
          <button type="button" className="nav-item" onClick={toggleTheme}>
            {theme === "dark" ? <Icon.sun /> : <Icon.moon />}
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </button>
          <button type="button" className="nav-item" onClick={onSignOut}>
            <Icon.logout />
            Выйти
          </button>
        </div>
      </aside>
      {menuOpen ? (
        <button
          type="button"
          className="scrim"
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn"
            aria-label="Меню"
            onClick={() => setMenuOpen(true)}
          >
            <Icon.menu />
            {totalQueue > 0 ? <span className="dot" /> : null}
          </button>
          <span className="topbar-title">{title}</span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Поиск"
            onClick={() => setPaletteOpen(true)}
          >
            <Icon.search />
          </button>
        </header>
        <main className="main-inner">{children}</main>
      </div>

      {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onGo={(path) => {
            setPaletteOpen(false);
            go(path);
          }}
        />
      ) : null}
    </div>
  );
}
