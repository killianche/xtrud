// Вход в панель — по номеру и звонку (№380, владелец 2026-11-09: «пароль
// нигде не спрашивать»): номер → звонок со своего телефона на выданный
// бесплатный номер → вход. Признак администратора читается из базы при
// первом же запросе: клеймо в токене доверять нельзя, отзыв прав должен
// действовать сразу.
//
// Прежний вход почтой и паролем — только если сервер вернул его флагом
// (GET /v2/auth/options → passwordLogin).
//
// Второй фактор (TOTP) в этой версии не включён — он обязателен по контракту
// (docs/ADMIN_PANEL.md §6), но включать его можно только вместе с описанной
// процедурой восстановления при потере устройства, иначе владелец запрёт себя
// снаружи. Задача стоит в CHECKLIST.md.

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Field } from "../components/ui";
import {
  authOptions,
  type CallCheck,
  callStart,
  callStatus,
  login,
  loginWithCall,
} from "../lib/api";

/** Раз в 3 с — как в приложении (у опроса на сервере свой лимит). */
const POLL_MS = 3000;

/** «8 928 …», «+7 928 …», «928 …» → +79281234567; иначе null. */
function canonical(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
  return d.length === 10 ? `+7${d}` : null;
}

export function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [passwordLogin, setPasswordLogin] = useState<boolean | null>(null);
  useEffect(() => {
    void authOptions().then((o) => setPasswordLogin(o.passwordLogin));
  }, []);

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
        {passwordLogin === null ? null : passwordLogin ? (
          <PasswordForm onSignedIn={onSignedIn} />
        ) : (
          <PhoneCallForm onSignedIn={onSignedIn} />
        )}
      </div>
    </div>
  );
}

function PhoneCallForm({ onSignedIn }: { onSignedIn: () => void }) {
  const [raw, setRaw] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [check, setCheck] = useState<(CallCheck & { expiresAt: number }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const polling = useRef(false);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  const start = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const p = canonical(raw);
    if (!p) {
      setError("Введите номер полностью: +7 и десять цифр.");
      return;
    }
    setBusy(true);
    setError(null);
    const r = await callStart(p, phone === p ? check?.secret : undefined);
    setBusy(false);
    if (!r.call) {
      setCheck(null);
      setError(r.error);
      return;
    }
    setPhone(p);
    setCheck({ ...r.call, expiresAt: Date.now() + r.call.expiresInSec * 1000 });
  };

  // Ждём звонок: опрос раз в 3 с, пока номер действует.
  useEffect(() => {
    if (!check || !phone) return;
    const t = window.setInterval(async () => {
      setNow(Date.now());
      if (Date.now() >= check.expiresAt) {
        setCheck(null);
        setError("Время вышло — получите новый номер.");
        return;
      }
      if (polling.current) return;
      polling.current = true;
      const s = await callStatus(phone, check.secret);
      polling.current = false;
      if (s.expired) {
        setCheck(null);
        setError("Время вышло — получите новый номер.");
        return;
      }
      if (!s.token) return;
      window.clearInterval(t);
      const res = await loginWithCall(phone, s.token);
      if (res.error) {
        setCheck(null);
        setError(res.error);
        return;
      }
      signedIn.current();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [check, phone]);

  if (check && phone) {
    const left = Math.max(0, Math.ceil((check.expiresAt - now) / 1000));
    return (
      <div className="stack" style={{ marginTop: 32 }}>
        <p className="body-md">
          Позвоните с телефона <strong>{phone}</strong> на номер ниже. Это бесплатно — звонок
          сбросится сам, и панель откроется.
        </p>
        <a className="heading-lg" href={`tel:+${check.callPhone}`}>
          {check.callPhonePretty}
        </a>
        <p className="body-md text-mute" role="status">
          Ждём звонок · номер действует {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        </p>
        <button
          type="button"
          className="btn btn-pill"
          onClick={() => {
            setCheck(null);
            setError(null);
          }}
        >
          Другой номер
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={start} className="stack" style={{ marginTop: 32 }}>
      <Field label="Номер телефона">
        <input
          className="input"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="+7 928 123-45-67"
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
        {busy ? "Получаем номер…" : "Войти по звонку"}
      </button>
    </form>
  );
}

function PasswordForm({ onSignedIn }: { onSignedIn: () => void }) {
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
        setError(signInError);
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
  );
}
