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
import { api, type UserCard as UserCardData, type UserStatus } from "../lib/api";

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

/** Пароль без похожих символов: его диктуют вслух и переписывают руками. */
function generatePassword(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function PasswordForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Выданный пароль показываем здесь и сейчас — больше его не увидит никто,
  // включая нас: в базе только необратимый отпечаток.
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.setPassword(userId, password, reason);
      setIssued(password);
      setCopied(false);
      setPassword("");
      setReason("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сменить пароль.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued);
      setCopied(true);
    } catch {
      setError("Скопируйте пароль вручную: браузер не дал доступ к буферу обмена.");
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <p className="mono-eyebrow">Восстановление доступа</p>
      <p className="body-md text-mute">
        Действующий пароль показать нельзя: в базе хранится только необратимый отпечаток, самого
        пароля нет ни у кого. Чтобы вернуть доступ, задайте временный пароль и передайте его
        человеку лично, а он сменит его после входа. В журнал попадает факт смены и причина, сам
        пароль — нет.
      </p>
      <Field label="Новый пароль" hint="Минимум 6 символов">
        <div className="row" style={{ gap: 8 }}>
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
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setPassword(generatePassword())}
            disabled={busy}
          >
            Сгенерировать
          </button>
        </div>
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
      {issued ? (
        <div className="banner-ok body-md" role="status">
          <div>
            Временный пароль: <span className="cell-mono">{issued}</span>
          </div>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={copy}>
              {copied ? "Скопировано" : "Скопировать"}
            </button>
          </div>
          <div style={{ marginTop: 8 }}>
            Передайте его человеку и попросите сменить после входа. Пароль виден, пока вы не ушли со
            страницы: второй раз его не покажет никто.
          </div>
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Меняем…" : "Сменить пароль"}
      </button>
    </form>
  );
}

/** Смена номера входа: человек потерял симкарту и войти не может — вход по
 *  номеру. Прежние входы прекращаются, подтверждение личности снимается
 *  (0182): номер подтверждал связь «этот человек — этот аккаунт». */
function PhoneForm({
  userId,
  current,
  onDone,
}: {
  userId: string;
  current: string | null;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.setPhone(userId, phone, reason);
      setDone(res.phone);
      setPhone("");
      setReason("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сменить номер.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack">
      <p className="mono-eyebrow">Номер входа</p>
      <p className="body-md text-mute">
        Сейчас {formatPhone(current)}. Меняйте, только если человек потерял номер и подтвердил, что
        аккаунт его. Прежние входы прекратятся, значок проверенного снимется, войти нужно будет по
        новому номеру.
      </p>
      <Field label="Новый номер" hint="С кодом страны, например +7 928 000-00-00">
        <input
          className="input"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy}
          required
        />
      </Field>
      <Field
        label="Причина"
        hint="Например: обращение в поддержку, подтвердил имя, город и задания"
      >
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
          Номер изменён на {formatPhone(done)}. Если пароль человек не помнит — задайте временный
          рядом.
        </div>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>
        {busy ? "Меняем…" : "Сменить номер"}
      </button>
    </form>
  );
}

/** Санкции. Снятие — такое же простое действие, как наказание: иначе
 *  ошибочная блокировка живёт вечно. Причина обязательна во всех случаях. */
function Sanctions({
  userId,
  status,
  isAdmin,
  onDone,
}: {
  userId: string;
  status: string;
  isAdmin: boolean;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>, label: string) => {
    if (busy) return;
    if (reason.trim().length < 3) {
      setError("Сначала напишите причину — она попадёт в журнал.");
      return;
    }
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await action();
      setDone(label);
      setReason("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (next: UserStatus, label: string) =>
    run(() => api.setUserStatus(userId, next, reason.trim()), label);

  if (isAdmin) {
    return (
      <div className="stack">
        <p className="mono-eyebrow">Санкции</p>
        <p className="body-md text-mute">
          К администратору неприменимы: панель закрылась бы сама за собой.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="mono-eyebrow">Санкции</p>
      <p className="body-md text-mute">
        Каждое действие требует причины и попадает в журнал. Приостановка и блокировка различаются
        только тяжестью — обе снимаются кнопкой «Снять санкцию».
      </p>
      <input
        className="input"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Причина — попадёт в журнал"
        disabled={busy}
      />
      {error ? (
        <div className="banner-error body-md" role="alert">
          {error}
        </div>
      ) : null}
      {done ? (
        <div className="banner-ok body-md" role="status">
          {done}
        </div>
      ) : null}
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => run(() => api.warnUser(userId, reason.trim()), "Предупреждение записано")}
        >
          Предупредить
        </button>
        {status !== "suspended" ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => setStatus("suspended", "Доступ приостановлен")}
          >
            Приостановить
          </button>
        ) : null}
        {status !== "banned" ? (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => setStatus("banned", "Пользователь заблокирован")}
          >
            Заблокировать
          </button>
        ) : null}
        {status !== "active" ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => setStatus("active", "Санкция снята")}
          >
            Снять санкцию
          </button>
        ) : null}
      </div>
    </div>
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

        <div className="stack">
          <div className="card">
            <PasswordForm userId={user.id} onDone={load} />
          </div>
          <div className="card">
            <PhoneForm userId={user.id} current={user.phone} onDone={load} />
          </div>
          <div className="card">
            <Sanctions
              userId={user.id}
              status={user.status}
              isAdmin={user.is_admin}
              onDone={load}
            />
          </div>
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
