// Каркас панели (2026-10-04): боковая панель с группами и счётчиками очередей,
// на узком экране — шапка с поиском и выезжающее меню. Счётчики обновляются
// раз в минуту и при возврате на вкладку.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type Attention, api, type StaffRole } from "../lib/api";
import { CommandPalette } from "./CommandPalette";
import { Icon } from "./icons";

export type Section =
  | "overview"
  | "analytics"
  | "users"
  | "masters"
  | "orders"
  | "reviews"
  | "reports"
  | "verifications"
  | "recovery"
  | "instagram"
  | "companies"
  | "experienceBadges"
  | "uncategorized"
  | "hiddenOrders"
  | "catalog"
  | "promo"
  | "broadcast"
  | "settings"
  | "team"
  | "journal";

interface NavItem {
  id: Section;
  label: string;
  path: string;
  icon: () => ReactNode;
  count?: (a: Attention) => number | null;
}

export const NAV: Array<{ title: string | null; items: NavItem[] }> = [
  {
    title: null,
    items: [
      { id: "overview", label: "Обзор", path: "/", icon: Icon.home },
      // Аналитика (0243, №299): задания, специалисты, клиенты, по дням.
      { id: "analytics", label: "Аналитика", path: "/analytics", icon: Icon.star },
    ],
  },
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
      // Подтверждение компаний (0245, №308) — только админ: WhatsApp и ИНН.
      { id: "companies", label: "Компании", path: "/companies", icon: Icon.users },
      // Заявки на значок «Большой опыт» (0246, №318) — только админ: WhatsApp.
      {
        id: "experienceBadges",
        label: "Большой опыт",
        path: "/experience-badges",
        icon: Icon.star,
      },
      // Счётчик — не из admin_attention (его не трогаем): длина своего же
      // списка, см. useUncategorizedCount ниже (0230, №251).
      { id: "uncategorized", label: "Без категории", path: "/uncategorized", icon: Icon.grid },
      // Счётчик — длина своего же списка, см. useShadowHiddenCount ниже
      // (0231, №253): admin_attention не трогаем.
      {
        id: "hiddenOrders",
        label: "Скрытые задания",
        path: "/hidden-orders",
        icon: Icon.flag,
      },
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
      { id: "team", label: "Команда", path: "/team", icon: Icon.users },
      { id: "journal", label: "Журнал", path: "/journal", icon: Icon.journal },
    ],
  },
];

/**
 * Разделы управляющего (docs/STAFF_ROLES_2026-10.md §2): задания без
 * категории, «красный флаг», жалобы. Остальное — только админ; база
 * всё равно ответит forbidden, меню лишь не показывает лишнего.
 */
const MANAGER_SECTIONS: ReadonlySet<Section> = new Set([
  "uncategorized",
  "hiddenOrders",
  "reports",
  // Аналитика — цифры без телефонов (0243, №299).
  "analytics",
]);

export function canOpenSection(role: StaffRole, id: Section): boolean {
  return role === "admin" || MANAGER_SECTIONS.has(id);
}

/** Первая страница после входа: у управляющего нет «Обзора» (метрики — админу). */
export function homePath(role: StaffRole): string {
  return role === "admin" ? "/" : "/uncategorized";
}

export function navFor(role: StaffRole): typeof NAV {
  return NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => canOpenSection(role, i.id)),
  })).filter((g) => g.items.length > 0);
}

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

/**
 * Счётчик «Скрытые задания» — не серверный admin_attention (его не меняем по
 * заданию), а длина своего же списка admin_list_shadow_hidden_orders (0231,
 * №253).
 */
function useShadowHiddenCount(): number {
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    api
      .listShadowHiddenOrders(200)
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
  role,
  section,
  title,
  navigate,
  onSignOut,
  children,
}: {
  role: StaffRole;
  section: Section;
  title: string;
  navigate: (path: string) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const nav = navFor(role);
  const attention = useAttention();
  const uncategorizedCount = useUncategorizedCount();
  const shadowHiddenCount = useShadowHiddenCount();
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
        (attention.verifications_pending ?? 0) +
        (attention.recovery_new ?? 0) +
        (attention.instagram_pending ?? 0)
      : 0) +
    uncategorizedCount +
    shadowHiddenCount;

  return (
    <div className={`shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Разделы">
        <div className="sidebar-brand">
          <span className="brand-mark">x</span>
          <div>
            <div className="brand-name">xtrud</div>
            <div className="brand-tag">{role === "admin" ? "админка" : "управление"}</div>
          </div>
        </div>
        <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <Icon.search />
          Поиск
          <span className="kbd">⌘K</span>
        </button>
        {nav.map((group) => (
          <nav key={group.title ?? "top"} className="nav-group" aria-label={group.title ?? "Обзор"}>
            {group.title ? <div className="nav-group-title">{group.title}</div> : null}
            {group.items.map((item) => {
              const count =
                item.id === "uncategorized"
                  ? uncategorizedCount
                  : item.id === "hiddenOrders"
                    ? shadowHiddenCount
                    : attention && item.count
                      ? (item.count(attention) ?? 0)
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
          nav={nav}
          searchPeople={role === "admin"}
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
