// Команда (0239, №286, docs/STAFF_ROLES_2026-10.md §4): кто админ и кто
// управляющий. Только админу. Здесь назначают и убирают УПРАВЛЯЮЩИХ;
// права администратора меняются только вручную в базе — вход в админку
// по одному паролю, и утёкший пароль не должен раздавать админов (ревью
// xtrud-security 2026-10-07, I1). Каждое изменение с причиной в журнале.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import {
  EmptyState,
  ErrorState,
  formatPhone,
  fullName,
  PageHead,
  RelativeTime,
  SkeletonRows,
} from "../components/ui";
import { api, type StaffRole, type StaffRow, type UserRow } from "../lib/api";

const ROLE_LABEL: Record<StaffRole, string> = {
  admin: "Администратор",
  manager: "Управляющий",
};

const MANAGER_HINT =
  "Задания без категории, «красный флаг», жалобы, блокировка. Без телефонов и паспортов.";

function AddMember({ staffIds, onDone }: { staffIds: Set<string>; onDone: () => void }) {
  const { confirm, toast } = useFeedback();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<UserRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .listUsers(q, 8)
        .then((r) => !cancelled && setFound(r))
        .catch(() => !cancelled && setFound([]))
        .finally(() => !cancelled && setSearching(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const grant = async (u: UserRow) => {
    const name = fullName(u.first_name, u.last_name);
    const reason = await confirm({
      title: `${name} — управляющий?`,
      text: MANAGER_HINT,
      confirmLabel: "Назначить",
      reason: true,
    });
    if (reason === null) return;
    try {
      await api.setStaffRole(u.id, "manager", reason);
      toast(`${name}: управляющий`);
      setQuery("");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось назначить.", true);
    }
  };

  return (
    <div className="card stack">
      <p className="mono-eyebrow">Добавить управляющего</p>
      <input
        className="input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Имя или номер телефона"
        aria-label="Найти человека"
      />
      {query.trim().length >= 2 && !searching && found.length === 0 ? (
        <p className="body-sm text-mute">Никого не нашлось.</p>
      ) : null}
      {found.map((u) => (
        <div key={u.id} className="row" style={{ justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p className="body-md" style={{ color: "var(--ink)", margin: 0 }}>
              {fullName(u.first_name, u.last_name)}
            </p>
            <p className="body-sm text-mute" style={{ margin: 0 }}>
              {formatPhone(u.phone)}
              {u.status !== "active" ? " · не активен" : ""}
            </p>
          </div>
          {staffIds.has(u.id) || u.is_admin ? (
            <span className="body-sm text-mute">уже в команде</span>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={u.status !== "active"}
              onClick={() => void grant(u)}
            >
              Сделать управляющим
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MemberRow({
  m,
  onOpenUser,
  onDone,
}: {
  m: StaffRow;
  onOpenUser: (id: string) => void;
  onDone: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const name = fullName(m.first_name, m.last_name);

  const remove = async () => {
    const reason = await confirm({
      title: `Убрать ${name} из команды?`,
      text: "Аккаунт станет обычным, доступ к управлению закроется сразу.",
      confirmLabel: "Убрать",
      danger: true,
      reason: true,
    });
    if (reason === null) return;
    try {
      await api.setStaffRole(m.id, null, reason);
      toast(`${name} больше не в команде`);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось убрать.", true);
    }
  };

  return (
    <div
      className="card row"
      style={{ justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
    >
      <div style={{ minWidth: 0 }}>
        <button type="button" className="link" onClick={() => onOpenUser(m.id)}>
          {name}
        </button>
        <p className="body-sm text-mute" style={{ margin: "2px 0 0" }}>
          {ROLE_LABEL[m.role]} · {formatPhone(m.phone)}
          {m.is_demo ? " · тестовый" : ""}
          {m.status !== "active" ? " · не активен" : ""}
          {m.last_active_at ? (
            <>
              {" "}
              · заходил <RelativeTime iso={m.last_active_at} />
            </>
          ) : null}
        </p>
      </div>
      {m.role === "manager" ? (
        <button type="button" className="btn btn-ghost" onClick={() => void remove()}>
          Убрать
        </button>
      ) : (
        <span className="body-sm text-mute">права меняются вручную в базе</span>
      )}
    </div>
  );
}

export function Team({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api
      .listStaff()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <PageHead eyebrow="Система" title="Команда" />
      <p className="body-sm text-mute" style={{ margin: "0 0 16px" }}>
        Управляющий разбирает задания без категории и жалобы, блокирует нарушителей — в приложении и
        здесь. Каталог, паспорта, телефоны, рассылки и настройки остаются у администратора.
      </p>
      <div className="stack">
        <AddMember staffIds={new Set((rows ?? []).map((r) => r.id))} onDone={load} />
        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : !rows ? (
          <SkeletonRows count={3} height={64} />
        ) : rows.length === 0 ? (
          <EmptyState title="Команда пуста" />
        ) : (
          rows.map((m) => <MemberRow key={m.id} m={m} onOpenUser={onOpenUser} onDone={load} />)
        )}
      </div>
    </div>
  );
}
