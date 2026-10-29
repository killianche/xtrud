// Карточка человека: профиль, контакты, его задания, отклики и отзывы.
// Здесь же — смена пароля: телефонные аккаунты письмом восстановить нельзя,
// адрес у них синтетический (DECISION владельца 2026-09-03).

import { type FormEvent, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import {
  Badge,
  Cell,
  ErrorState,
  Field,
  formatDate,
  formatPhone,
  fullName,
  PageHead,
  placeName,
  RelativeTime,
  SkeletonRows,
  statusLabel,
  waLink,
} from "../components/ui";
import { api, type UserCard as UserCardData, type UserStatus } from "../lib/api";
import { useStaffRole } from "../lib/role";

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

const PASSPORT_LABEL: Record<string, string> = {
  none: "Не отправлял",
  pending: "На проверке",
  approved: "Подтверждён",
  rejected: "Отклонён",
};

const COMPANY_LABEL: Record<string, string> = {
  none: "Заявки нет",
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Отклонена",
  withdrawn: "Заявки нет",
};

/**
 * Тип аккаунта специалиста (№368, 0255): «Частный мастер» ↔ «Компания».
 * Бригада = компания. Админ переводит сам, если человек перепутал (например,
 * прислал логотип фирмы в «Паспорт»). Человеку — уведомление, что делать.
 */
function MasterSection({
  userId,
  master,
  canEdit,
  onDone,
}: {
  userId: string;
  master: NonNullable<UserCardData["master"]>;
  canEdit: boolean;
  onDone: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const isCompany = master.account_type !== "solo";

  const switchTo = async (type: "solo" | "company") => {
    const reason = await confirm({
      title: type === "company" ? "Перевести в «Компания»?" : "Перевести в «Частный мастер»?",
      text:
        type === "company"
          ? "Человеку придёт уведомление: указать название и отправить заявку на подтверждение компании. Паспорт ему не нужен."
          : master.company_verified
            ? "Значок «Компания» снимется, название и заявка компании удалятся. Человеку предложат подтвердить личность паспортом."
            : "Название компании удалится. Человеку предложат подтвердить личность паспортом.",
      confirmLabel: "Перевести",
      danger: type === "solo" && master.company_verified,
      reason: true,
      reasons:
        type === "company"
          ? ["Прислал документы компании вместо паспорта", "Работает бригадой", "Попросил сам"]
          : ["Работает один", "Попросил сам"],
    });
    if (reason === null) return;
    setBusy(true);
    try {
      await api.setAccountType(userId, type, reason);
      toast(type === "company" ? "Теперь «Компания»" : "Теперь «Частный мастер»");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <h2 className="section-title">Специалист</h2>
      {canEdit ? (
        <fieldset className="segmented" aria-label="Тип аккаунта" style={{ border: 0, margin: 0 }}>
          <button
            type="button"
            aria-pressed={!isCompany}
            className={!isCompany ? "is-active" : undefined}
            disabled={busy || !isCompany}
            onClick={() => void switchTo("solo")}
          >
            Частный мастер
          </button>
          <button
            type="button"
            aria-pressed={isCompany}
            className={isCompany ? "is-active" : undefined}
            disabled={busy || isCompany}
            onClick={() => void switchTo("company")}
          >
            Компания
          </button>
        </fieldset>
      ) : null}
      <div className="group">
        {!canEdit ? <Cell title="Тип" value={isCompany ? "Компания" : "Частный мастер"} /> : null}
        {isCompany ? <Cell title="Название" value={master.legal_name ?? "не указано"} /> : null}
        {isCompany ? (
          <Cell
            title="Компания"
            value={master.company_verified ? "Подтверждена" : COMPANY_LABEL[master.company_status]}
          />
        ) : null}
        <Cell
          title={isCompany ? "Паспорт · по желанию" : "Паспорт"}
          value={master.verified ? "Подтверждён" : PASSPORT_LABEL[master.passport_status]}
        />
        <Cell title="Большой опыт" value={master.experience_badge ? "Есть значок" : "Нет"} />
      </div>
      <p className="section-footer">
        Частному мастеру — паспорт, компании (и бригаде) — подтверждение компании.
      </p>
    </section>
  );
}

export function UserCard({
  userId,
  onBack,
  onOpenOrder,
}: {
  userId: string;
  onBack: () => void;
  onOpenOrder: (id: string) => void;
}) {
  // Управляющему пароль и номер входа закрыты, телефон база не отдаёт (0239).
  const isAdminSession = useStaffRole() === "admin";
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
  const name = fullName(user.first_name, user.last_name);

  return (
    <>
      <PageHead onBack={onBack} title={name} />
      <div className="row" style={{ marginTop: -8 }}>
        <Badge status={user.status} />
        {user.is_admin ? <span className="badge">админ</span> : null}
        {user.is_master ? (
          <span className="badge">специалист</span>
        ) : (
          <span className="badge">клиент</span>
        )}
      </div>

      {isAdminSession && user.phone ? (
        <div className="actions">
          <a className="btn btn-ghost" href={`tel:${user.phone}`}>
            <Icon.phone size={20} /> Позвонить
          </a>
          <a
            className="btn btn-success"
            href={waLink(user.phone)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon.whatsapp size={20} /> WhatsApp
          </a>
        </div>
      ) : null}

      {card.master ? (
        <MasterSection
          userId={user.id}
          master={card.master}
          canEdit={isAdminSession}
          onDone={load}
        />
      ) : null}

      <section className="section">
        <h2 className="section-title">Профиль</h2>
        <div className="group">
          {isAdminSession ? (
            <>
              <Cell title="Номер" value={formatPhone(user.phone)} />
              <Cell title="Вход" value={user.login_email ?? "—"} />
            </>
          ) : null}
          <Cell title="Город" value={placeName(user.city_id)} />
          {user.district ? <Cell title="Район" value={placeName(user.district)} /> : null}
          <Cell title="Регистрация" value={formatDate(user.created_at)} />
          <Cell title="Последний вход" value={formatDate(user.last_sign_in_at)} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Задания · {card.orders.length}</h2>
        <div className="group">
          {card.orders.length === 0 ? (
            <Cell title={<span className="text-mute">Нет заданий</span>} />
          ) : (
            card.orders.map((order) => (
              <Cell
                key={order.id}
                title={order.title}
                sub={<RelativeTime iso={order.created_at} />}
                value={<Badge status={order.status} />}
                onClick={() => onOpenOrder(order.id)}
              />
            ))
          )}
        </div>
      </section>

      {card.responses.length > 0 ? (
        <section className="section">
          <h2 className="section-title">Предложения · {card.responses.length}</h2>
          <div className="group">
            {card.responses.map((response) => (
              <Cell
                key={response.id}
                title={statusLabel(response.status)}
                sub={<RelativeTime iso={response.created_at} />}
                onClick={() => onOpenOrder(response.order_id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <h2 className="section-title">Действия</h2>
        <div className="stack">
          {isAdminSession ? (
            <>
              <div className="card">
                <PasswordForm userId={user.id} onDone={load} />
              </div>
              <div className="card">
                <PhoneForm userId={user.id} current={user.phone} onDone={load} />
              </div>
            </>
          ) : null}
          <div className="card">
            <Sanctions
              userId={user.id}
              status={user.status}
              isAdmin={user.is_admin}
              onDone={load}
            />
          </div>
        </div>
      </section>
    </>
  );
}
