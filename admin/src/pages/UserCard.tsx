// Карточка человека: профиль, контакты, его задания, отклики и отзывы.
// Здесь же — смена пароля: телефонные аккаунты письмом восстановить нельзя,
// адрес у них синтетический (DECISION владельца 2026-09-03).

import { type FormEvent, useEffect, useState } from "react";
import {
  Badge,
  ErrorState,
  Field,
  formatDate,
  formatPhone,
  fullName,
  SkeletonRows,
} from "../components/ui";
import { api, type UserCard as UserCardData } from "../lib/api";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 16 }}>
      <span className="body-md text-mute">{label}</span>
      <span className="body-md" style={{ color: "var(--ink)", textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function PasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setPassword(userId, password, reason);
      setDone(true);
      setPassword("");
      setReason("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <p className="mono-eyebrow">Восстановление доступа</p>
      <p className="body-md text-mute">
        Задайте временный пароль и передайте его человеку лично. Попросите сменить его после входа.
        Факт смены попадёт в журнал, сам пароль — нет.
      </p>
      <Field label="Новый пароль" hint="Минимум 6 символов">
        <input
          className="input"
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          disabled={busy}
          required
          minLength={6}
        />
      </Field>
      <Field label="Причина" hint="Например: обращение в поддержку, подтвердил номер и город">
        <input
          className="input"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
          required
          minLength={3}
        />
      </Field>
      {error ? (
        <div className="banner-error body-md" role="alert">
          {error}
        </div>
      ) : null}
      {done ? (
        <div className="banner-ok body-md" role="status">
          Пароль изменён. Передайте его человеку и попросите сменить.
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Меняем…" : "Сменить пароль"}
      </button>
    </form>
  );
}

export function UserCard({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [card, setCard] = useState<UserCardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setCard(null);
    api
      .userCard(userId)
      .then(setCard)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, [userId]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!card) return <SkeletonRows count={4} height={80} />;

  const user = card.user;

  return (
    <div>
      <div className="page-header">
        <div>
          <button type="button" className="nav-link" onClick={onBack} style={{ paddingLeft: 0 }}>
            ← Все люди
          </button>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            {fullName(user.first_name, user.last_name)}
          </h1>
          <div className="row" style={{ marginTop: 8 }}>
            <Badge status={user.status} />
            {user.is_admin ? <span className="badge">админ</span> : null}
            {user.is_master ? <span className="badge">исполнитель</span> : null}
          </div>
        </div>
      </div>

      <div className="grid-two">
        <div className="card stack">
          <p className="mono-eyebrow">Профиль</p>
          <Row label="Номер" value={formatPhone(user.phone)} />
          <Row label="Адрес входа" value={user.login_email ?? "—"} />
          <Row label="Юзернейм" value={user.username ? `@${user.username}` : "—"} />
          <Row label="Город" value={user.city_id ?? "—"} />
          <Row label="Район" value={user.district ?? "—"} />
          <Row label="Регистрация" value={formatDate(user.created_at)} />
          <Row label="Последний вход" value={formatDate(user.last_sign_in_at)} />
        </div>

        <div className="card">
          <PasswordForm userId={user.id} onDone={load} />
        </div>
      </div>

      <div className="grid-two" style={{ marginTop: 16 }}>
        <div className="card">
          <p className="mono-eyebrow">Задания · {card.orders.length}</p>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            {card.orders.length === 0 ? (
              <p className="body-md text-mute">Нет заданий</p>
            ) : (
              card.orders.map((order) => (
                <div key={order.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="body-md" style={{ color: "var(--ink)" }}>
                    {order.title}
                  </span>
                  <span className="body-sm text-mute">{formatDate(order.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <p className="mono-eyebrow">Отклики · {card.responses.length}</p>
          <div className="stack" style={{ marginTop: 12, gap: 8 }}>
            {card.responses.length === 0 ? (
              <p className="body-md text-mute">Нет откликов</p>
            ) : (
              card.responses.map((response) => (
                <div key={response.id} className="row" style={{ justifyContent: "space-between" }}>
                  <span className="cell-mono">{response.status}</span>
                  <span className="body-sm text-mute">{formatDate(response.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
