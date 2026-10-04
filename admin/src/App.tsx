// Оболочка панели: вход, проверка прав администратора и переключение
// разделов. Маршрутизация — по хешу, отдельная библиотека не нужна.
// Каркас (боковая панель, поиск ⌘K, тосты) — components/Shell.tsx,
// docs/ADMIN_REDESIGN_2026-10.md.

import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FeedbackProvider } from "./components/feedback";
import { type Section, Shell, sectionLabel } from "./components/Shell";
import { api, hasSession, logout } from "./lib/api";
import { Catalog } from "./pages/Catalog";
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
import { UserCard } from "./pages/UserCard";
import { Users } from "./pages/Users";
import { Verifications } from "./pages/Verifications";

type Session = "loading" | "anonymous" | "not-admin" | "admin";

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

  // Признак админа проверяем вызовом admin_metrics: сервер ответит forbidden,
  // если прав нет. Так право читается из базы, а не из токена, и снятие прав
  // действует сразу.
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
      await api.metrics();
      setSession("admin");
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
          Доступ только для администратора
        </p>
        <p className="body-md text-mute">Эта учётная запись не имеет прав администратора.</p>
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
    catalog: "catalog",
    promo: "promo",
    settings: "settings",
    journal: "journal",
  };
  const section: Section = known[first] ?? "overview";
  const openUser = (id: string) => navigate(`/users/${id}`);

  let page: ReactNode;
  if (userMatch?.[1]) {
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
      default:
        page = <Overview navigate={navigate} />;
    }
  }

  return (
    <FeedbackProvider>
      <Shell
        section={section}
        title={sectionLabel(section)}
        navigate={navigate}
        onSignOut={() => void signOut()}
      >
        {page}
      </Shell>
    </FeedbackProvider>
  );
}
