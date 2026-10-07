// Оболочка панели: вход, проверка прав администратора и переключение
// разделов. Маршрутизация — по хешу, отдельная библиотека не нужна.
// Каркас (боковая панель, поиск ⌘K, тосты) — components/Shell.tsx,
// docs/ADMIN_REDESIGN_2026-10.md.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FeedbackProvider } from "./components/feedback";
import { canOpenSection, homePath, type Section, Shell, sectionLabel } from "./components/Shell";
import { api, hasSession, logout, type StaffRole } from "./lib/api";
import { StaffRoleContext } from "./lib/role";
import { Broadcast } from "./pages/Broadcast";
import { Catalog } from "./pages/Catalog";
import { HiddenOrders } from "./pages/HiddenOrders";
import { Instagram } from "./pages/Instagram";
import { Journal } from "./pages/Journal";
import { Login } from "./pages/Login";
import { Masters } from "./pages/Masters";
import { OrderCard } from "./pages/OrderCard";
import { Orders } from "./pages/Orders";
import { Overview } from "./pages/Overview";
import { Promo } from "./pages/Promo";
import { Recovery } from "./pages/Recovery";
import { Reports } from "./pages/Reports";
import { Reviews } from "./pages/Reviews";
import { Settings } from "./pages/Settings";
import { Team } from "./pages/Team";
import { Uncategorized } from "./pages/Uncategorized";
import { UserCard } from "./pages/UserCard";
import { Users } from "./pages/Users";
import { Verifications } from "./pages/Verifications";

type Session = "loading" | "anonymous" | "not-admin" | StaffRole;

function useHashRoute(): [string, (next: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || "/");
  useEffect(() => {
    const onChange = () => setRoute(window.location.hash.slice(1) || "/");
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
    navigate("/");
  };

  if (session === "loading") {
    return (
      <div className="state">
        <p className="body-md text-mute">Проверяем доступ…</p>
      </div>
    );
  }

  if (session === "anonymous") {
    return <Login onSignedIn={() => void check()} />;
  }

  if (session === "not-admin") {
    return (
      <div className="state">
        <p className="heading-md" style={{ color: "var(--ink)" }}>
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

  const userMatch = /^\/users\/(.+)$/.exec(route);
  const orderMatch = /^\/orders\/(.+)$/.exec(route);
  const first = route.split("/")[1] ?? "";
  const known: Record<string, Section> = {
    users: "users",
    masters: "masters",
    orders: "orders",
    reviews: "reviews",
    reports: "reports",
    verifications: "verifications",
    recovery: "recovery",
    instagram: "instagram",
    uncategorized: "uncategorized",
    "hidden-orders": "hiddenOrders",
    catalog: "catalog",
    promo: "promo",
    broadcast: "broadcast",
    settings: "settings",
    journal: "journal",
    team: "team",
  };
  const role: StaffRole = session;
  const section: Section = known[first] ?? (role === "admin" ? "overview" : "uncategorized");
  const openUser = (id: string) => navigate(`/users/${id}`);

  let page: ReactNode;
  if (!userMatch && !orderMatch && !canOpenSection(role, section)) {
    page = (
      <div className="state">
        <p className="heading-md" style={{ color: "var(--ink)" }}>
          Нет доступа
        </p>
        <p className="body-md text-mute">Этот раздел открыт только администратору.</p>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => navigate(homePath(role))}
          style={{ marginTop: 8 }}
        >
          К моим разделам
        </button>
      </div>
    );
  } else if (userMatch?.[1]) {
    page = <UserCard userId={userMatch[1]} onBack={() => window.history.back()} />;
  } else if (orderMatch?.[1]) {
    page = (
      <OrderCard
        orderId={orderMatch[1]}
        onBack={() => window.history.back()}
        onOpenUser={openUser}
      />
    );
  } else {
    switch (section) {
      case "users":
        page = <Users onOpen={openUser} />;
        break;
      case "masters":
        page = <Masters onOpen={openUser} />;
        break;
      case "orders":
        page = <Orders onOpen={(id) => navigate(`/orders/${id}`)} />;
        break;
      case "reviews":
        page = <Reviews onOpenUser={openUser} />;
        break;
      case "verifications":
        page = <Verifications onOpen={openUser} />;
        break;
      case "reports":
        page = <Reports />;
        break;
      case "recovery":
        page = <Recovery onOpen={openUser} />;
        break;
      case "instagram":
        page = <Instagram onOpen={openUser} />;
        break;
      case "uncategorized":
        page = <Uncategorized onOpenOrder={(id) => navigate(`/orders/${id}`)} />;
        break;
      case "hiddenOrders":
        page = <HiddenOrders onOpenOrder={(id) => navigate(`/orders/${id}`)} />;
        break;
      case "catalog":
        page = <Catalog />;
        break;
      case "journal":
        page = <Journal />;
        break;
      case "settings":
        page = <Settings />;
        break;
      case "promo":
        page = <Promo />;
        break;
      case "broadcast":
        page = <Broadcast />;
        break;
      case "team":
        page = <Team onOpenUser={openUser} />;
        break;
      default:
        page = <Overview navigate={navigate} />;
    }
  }

  return (
    <StaffRoleContext.Provider value={role}>
      <FeedbackProvider>
        <Shell
          role={role}
          section={section}
          title={sectionLabel(section)}
          navigate={navigate}
          onSignOut={() => void signOut()}
        >
          {page}
        </Shell>
      </FeedbackProvider>
    </StaffRoleContext.Provider>
  );
}
