// Оболочка панели: вход, проверка прав администратора и переключение
// разделов. Маршрутизация — по хешу, отдельная библиотека ради пяти экранов
// не нужна.

import { useCallback, useEffect, useState } from "react";
import { api, getClient } from "./lib/api";
import { Dashboard } from "./pages/Dashboard";
import { Journal } from "./pages/Journal";
import { Login } from "./pages/Login";
import { Masters } from "./pages/Masters";
import { Reports } from "./pages/Reports";
import { UserCard } from "./pages/UserCard";
import { Users } from "./pages/Users";

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
    const supabase = await getClient();
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
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
    const supabase = await getClient();
    await supabase.auth.signOut();
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
  const section = route.startsWith("/users")
    ? "users"
    : route.startsWith("/masters")
      ? "masters"
      : route.startsWith("/reports")
        ? "reports"
        : route.startsWith("/journal")
          ? "journal"
          : "overview";

  return (
    <>
      <nav className="nav-bar">
        <span className="nav-wordmark">xtrud</span>
        <div className="nav-links">
          <button
            type="button"
            className="nav-link"
            aria-current={section === "overview" ? "page" : undefined}
            onClick={() => navigate("/")}
          >
            Обзор
          </button>
          <button
            type="button"
            className="nav-link"
            aria-current={section === "users" ? "page" : undefined}
            onClick={() => navigate("/users")}
          >
            Люди
          </button>
          <button
            type="button"
            className="nav-link"
            aria-current={section === "masters" ? "page" : undefined}
            onClick={() => navigate("/masters")}
          >
            Специалисты
          </button>
          <button
            type="button"
            className="nav-link"
            aria-current={section === "reports" ? "page" : undefined}
            onClick={() => navigate("/reports")}
          >
            Жалобы
          </button>
          <button
            type="button"
            className="nav-link"
            aria-current={section === "journal" ? "page" : undefined}
            onClick={() => navigate("/journal")}
          >
            Журнал
          </button>
        </div>
        <span className="nav-spacer" />
        <button type="button" className="btn btn-ghost" onClick={signOut}>
          Выйти
        </button>
      </nav>

      <main className="container">
        {userMatch?.[1] ? (
          <UserCard userId={userMatch[1]} onBack={() => navigate("/users")} />
        ) : section === "users" ? (
          <Users onOpen={(id) => navigate(`/users/${id}`)} />
        ) : section === "masters" ? (
          <Masters onOpen={(id) => navigate(`/users/${id}`)} />
        ) : section === "reports" ? (
          <Reports />
        ) : section === "journal" ? (
          <Journal />
        ) : (
          <Dashboard />
        )}
      </main>
    </>
  );
}
