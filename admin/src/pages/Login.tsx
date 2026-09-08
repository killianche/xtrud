// Вход в панель. Пароль проверяет GoTrue, а признак администратора читается
// из базы при первом же запросе: клеймо в токене доверять нельзя, отзыв прав
// должен действовать сразу.
//
// Второй фактор (TOTP) в этой версии не включён — он обязателен по контракту
// (docs/ADMIN_PANEL.md §6), но включать его можно только вместе с описанной
// процедурой восстановления при потере устройства, иначе владелец запрёт себя
// снаружи. Задача стоит в CHECKLIST.md.

import { type FormEvent, useState } from "react";
import { Field } from "../components/ui";
import { login } from "../lib/api";

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await login(email, password);
      if (signInError) {
        setError("Неверная почта или пароль.");
        return;
      }
      onSignedIn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось войти.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-mesh" aria-hidden="true" />
      <div className="card card-lg login-card">
        <p className="mono-eyebrow">xtrud</p>
        <h1 className="heading-lg" style={{ marginTop: 8 }}>
          Админка
        </h1>
        <p className="body-md text-mute" style={{ marginTop: 8 }}>
          Внутренний инструмент. Доступ только у администратора.
        </p>

        <form onSubmit={submit} className="stack" style={{ marginTop: 32 }}>
          <Field label="Почта">
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@xtrud.pro"
              disabled={busy}
              required
            />
          </Field>
          <Field label="Пароль">
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              required
            />
          </Field>

          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn btn-primary btn-pill" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
