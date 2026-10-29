// Оболочка админки: вход, проверка роли и маршруты (№367). Маршрутизация —
// по хешу (#/inbox, #/orders/<id>…), отдельная библиотека не нужна. Push-
// уведомления открывают те же адреса (server/src/push/webpush.ts).
//
// Каркас — components/Shell.tsx (вкладки «Входящие / Задания / Люди / Ещё»),
// решение — docs/ADMIN_MOBILE_2026-10.md.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FeedbackProvider } from "./components/feedback";
import { Shell, type Tab } from "./components/Shell";
import { api, hasSession, logout, type StaffRole } from "./lib/api";
import { StaffRoleContext } from "./lib/role";
import { Analytics } from "./pages/Analytics";
import { Broadcast } from "./pages/Broadcast";
import { Catalog } from "./pages/Catalog";
import { Companies } from "./pages/Companies";
import { ExperienceBadges } from "./pages/ExperienceBadges";
import { Inbox } from "./pages/Inbox";
import { Instagram } from "./pages/Instagram";
import { Journal } from "./pages/Journal";
import { Login } from "./pages/Login";
import { Masters } from "./pages/Masters";
import { More } from "./pages/More";
import { Notifications } from "./pages/Notifications";
import { OrderCard } from "./pages/OrderCard";
import { Orders, type OrdersSegment } from "./pages/Orders";
import { Promo } from "./pages/Promo";
import { Recovery } from "./pages/Recovery";
import { Reports } from "./pages/Reports";
import { Reviews } from "./pages/Reviews";
import { Settings } from "./pages/Settings";
import { Summary } from "./pages/Summary";
import { Suspicious } from "./pages/Suspicious";
import { Team } from "./pages/Team";
import { UserCard } from "./pages/UserCard";
import { Users } from "./pages/Users";
import { Verifications } from "./pages/Verifications";

type Session = "loading" | "anonymous" | "not-admin" | StaffRole;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Старые адреса (закладки, ссылки в журнале) → новые. */
const LEGACY: Record<string, string> = {
  "/verifications": "/inbox/passport",
  "/companies": "/inbox/company",
  "/instagram": "/inbox/instagram",
  "/experience-badges": "/inbox/experience",
  "/recovery": "/inbox/recovery",
  "/reports": "/inbox/reports",
  "/suspicious": "/inbox/suspicious",
  "/uncategorized": "/orders/review",
  "/hidden-orders": "/orders/hidden",
  "/analytics": "/more/analytics",
  "/masters": "/more/masters",
  "/reviews": "/more/reviews",
  "/catalog": "/more/catalog",
  "/promo": "/more/promo",
  "/broadcast": "/more/broadcast",
  "/settings": "/more/settings",
  "/journal": "/more/journal",
  "/team": "/more/team",
};

/** Что открыто управляющему (docs/STAFF_ROLES_2026-10.md §2). */
const MANAGER_ROUTES = [
  /^\/inbox$/,
  /^\/inbox\/reports$/,
  /^\/orders(\/(review|hidden))?$/,
  /^\/orders\/[0-9a-f-]{36}$/i,
  /^\/more$/,
  /^\/more\/(analytics|notifications)$/,
];

function readRoute(): string {
  const raw = window.location.hash.slice(1) || "/";
  return LEGACY[raw] ?? raw;
}

function useHashRoute(): [string, (next: string) => void] {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const navigate = useCallback((next: string) => {
    window.location.hash = next;
  }, []);
  return [route, navigate];
}

export function App() {
  const [session, setSession] = useState<Session>("loading");
  const [route, navigate] = useHashRoute();

  // Роль читаем из базы (my_staff_role, 0239): админ, управляющий или
  // никто. Не из токена — снятие роли действует сразу.
  //
  // Второго фактора нет: DECISION владельца 2026-09-03 «убери второй фактор,
  // просто по логину и паролю» (миграция 0150). Значит пароль администратора —
  // единственная преграда к персональным данным и смене чужих паролей.
  const check = useCallback(async () => {
    if (!hasSession()) {
      setSession("anonymous");
      return;
    }
    try {
      const role = await api.myStaffRole();
      setSession(role === "admin" || role === "manager" ? role : "not-admin");
    } catch {
      setSession("not-admin");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const signOut = async () => {
    await logout();
    setSession("anonymous");
    navigate("/inbox");
  };

  if (session === "loading") {
    return (
      <div className="state">
        <span className="brand-mark" aria-hidden="true">
          x
        </span>
      </div>
    );
  }

  if (session === "anonymous") {
    return <Login onSignedIn={() => void check()} />;
  }

  if (session === "not-admin") {
    return (
      <div className="state">
        <p className="title-2" style={{ color: "var(--ink)" }}>
          Доступ только для команды
        </p>
        <p className="body-md text-mute">
          У этой учётной записи нет роли администратора или управляющего.
        </p>
        <button type="button" className="btn btn-ghost" onClick={signOut} style={{ marginTop: 8 }}>
          Выйти
        </button>
      </div>
    );
  }

  const role: StaffRole = session;
  // Главная: у админа «Сводка» (№372), у управляющего — «Входящие».
  if (route === "/" || route === "") {
    return (
      <StaffRoleContext.Provider value={role}>
        <RedirectHome navigate={navigate} to={role === "admin" ? "/summary" : "/inbox"} />
      </StaffRoleContext.Provider>
    );
  }
  const allowed = role === "admin" || MANAGER_ROUTES.some((r) => r.test(route));
  const openUser = (id: string) => navigate(`/users/${id}`);
  const openOrder = (id: string) => navigate(`/orders/${id}`);
  const back = () => window.history.back();
  const parts = route.split("/").filter(Boolean);
  const [head, sub] = parts;

  let tab: Tab = "inbox";
  let title = "Входящие";
  let page: ReactNode;

  if (!allowed) {
    tab =
      head === "orders"
        ? "orders"
        : head === "users"
          ? "users"
          : head === "more"
            ? "more"
            : "inbox";
    title = "Нет доступа";
    page = (
      <div className="state">
        <p className="title-2" style={{ color: "var(--ink)" }}>
          Нет доступа
        </p>
        <p className="body-md text-mute">Этот раздел открыт только администратору.</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate("/inbox")}
          style={{ marginTop: 8 }}
        >
          Ко «Входящим»
        </button>
      </div>
    );
  } else if (head === "summary") {
    tab = "inbox";
    title = "Сводка";
    page = <Summary navigate={navigate} />;
  } else if (head === "orders") {
    tab = "orders";
    if (sub && UUID.test(sub)) {
      title = "Задание";
      page = <OrderCard orderId={sub} onBack={back} onOpenUser={openUser} />;
    } else {
      title = "Задания";
      const seg = (sub ?? (role === "admin" ? "review" : "review")) as OrdersSegment;
      page = (
        <Orders segment={seg} onSegment={(s) => navigate(`/orders/${s}`)} onOpen={openOrder} />
      );
    }
  } else if (head === "users") {
    tab = "users";
    if (sub && UUID.test(sub)) {
      title = "Человек";
      page = <UserCard userId={sub} onBack={back} onOpenOrder={openOrder} />;
    } else {
      title = "Люди";
      page = <Users onOpen={openUser} />;
    }
  } else if (head === "more") {
    tab = "more";
    const toMore = () => navigate("/more");
    switch (sub) {
      case "analytics":
        title = "Аналитика";
        page = <Analytics onOpenOrder={openOrder} onOpenUser={openUser} onBack={toMore} />;
        break;
      case "masters":
        title = "Специалисты";
        page = <Masters onOpen={openUser} onBack={toMore} />;
        break;
      case "reviews":
        title = "Отзывы";
        page = <Reviews onOpenUser={openUser} onBack={toMore} />;
        break;
      case "catalog":
        title = "Каталог";
        page = <Catalog onBack={toMore} />;
        break;
      case "promo":
        title = "Реклама";
        page = <Promo onBack={toMore} />;
        break;
      case "broadcast":
        title = "Рассылка";
        page = <Broadcast onBack={toMore} />;
        break;
      case "settings":
        title = "Настройки приложения";
        page = <Settings onBack={toMore} />;
        break;
      case "journal":
        title = "Журнал";
        page = <Journal onBack={toMore} />;
        break;
      case "team":
        title = "Команда";
        page = <Team onOpenUser={openUser} onBack={toMore} />;
        break;
      case "notifications":
        title = "Уведомления";
        page = <Notifications onBack={toMore} />;
        break;
      default:
        title = "Ещё";
        page = <More role={role} navigate={navigate} onSignOut={() => void signOut()} />;
    }
  } else {
    tab = "inbox";
    const toInbox = () => navigate("/inbox");
    switch (head === "inbox" ? sub : undefined) {
      case "reports":
        title = "Жалобы";
        page = <Reports onBack={toInbox} onOpenUser={openUser} onOpenOrder={openOrder} />;
        break;
      case "passport":
        title = "Паспорта";
        page = <Verifications onOpen={openUser} onBack={toInbox} />;
        break;
      case "company":
        title = "Компании";
        page = <Companies onOpen={openUser} onBack={toInbox} />;
        break;
      case "instagram":
        title = "Instagram";
        page = <Instagram onOpen={openUser} onBack={toInbox} />;
        break;
      case "experience":
        title = "Большой опыт";
        page = <ExperienceBadges onOpen={openUser} onBack={toInbox} />;
        break;
      case "recovery":
        title = "Восстановление";
        page = <Recovery onOpen={openUser} onBack={toInbox} />;
        break;
      case "suspicious":
        title = "Подозрительные";
        page = <Suspicious onOpenUser={openUser} onBack={toInbox} />;
        break;
      default:
        title = "Входящие";
        page = <Inbox role={role} navigate={navigate} />;
    }
  }

  return (
    <StaffRoleContext.Provider value={role}>
      <FeedbackProvider>
        <Shell role={role} tab={tab} title={title} navigate={navigate}>
          {page}
        </Shell>
      </FeedbackProvider>
    </StaffRoleContext.Provider>
  );
}

function RedirectHome({ navigate, to }: { navigate: (path: string) => void; to: string }) {
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}
