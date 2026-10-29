// Специалисты: кто виден в каталоге, кто скрыт, и ручное решение админа.
// DECISION владельца 2026-09-07: «в админке подтверждать специалистов
// (показывать или нет) и блокировать». Автоматика: профиль виден с первой
// категории (0169); админ может скрыть (suspended) или вернуть, а также
// заблокировать аккаунт целиком (admin_set_user_status).
import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import {
  Badge,
  EmptyState,
  ErrorState,
  formatDate,
  formatPhone,
  fullName,
  PageHead,
  SkeletonRows,
} from "../components/ui";
import { api, type MasterRow } from "../lib/api";

function visibilityLabel(m: MasterRow): { text: string; status: string } {
  if (m.user_status === "banned") return { text: "Заблокирован", status: "banned" };
  if (m.master_status === "suspended") return { text: "Скрыт админом", status: "suspended" };
  if (m.master_status === "active" && !m.is_hidden) return { text: "В каталоге", status: "active" };
  return { text: "Нет категории", status: "pending" };
}

export function Masters({
  onOpen,
  onBack,
}: {
  onOpen: (userId: string) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<MasterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  const { confirm, toast } = useFeedback();

  const act = async (id: string, fn: () => Promise<unknown>, done: string) => {
    setBusyId(id);
    try {
      await fn();
      toast(done);
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    } finally {
      setBusyId(null);
    }
  };

  useEffect(() => {
    void tick; // перезагрузка по кнопке — зависимость намеренная
    let cancelled = false;
    setRows(null);
    setError(null);
    const timer = setTimeout(() => {
      api
        .listMasters(search)
        .then((data) => {
          if (!cancelled) setRows(data);
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, tick]);

  const setVisible = async (m: MasterRow, visible: boolean) => {
    const reason = await confirm({
      title: visible ? "Показать в каталоге?" : "Скрыть из каталога?",
      text: visible
        ? undefined
        : "Аккаунт не блокируется — специалист просто пропадёт из каталога.",
      confirmLabel: visible ? "Показать" : "Скрыть",
      danger: !visible,
      reason: true,
      reasons: visible ? ["Проверен"] : ["Неполный профиль", "Жалобы клиентов", "Не отвечает"],
    });
    if (reason === null) return;
    await act(
      m.id,
      () => api.setMasterVisibility(m.id, visible, reason),
      visible ? "Показан" : "Скрыт",
    );
  };

  // Значок «Большой опыт» (владелец, 2026-10-05): выдаём по своему решению,
  // бесплатно, бессрочно; снимаем вручную. Причина — в журнал.
  const toggleBadge = async (m: MasterRow) => {
    const on = !m.has_experience_badge;
    const reason = await confirm({
      title: on ? "Выдать «Большой опыт»?" : "Снять «Большой опыт»?",
      confirmLabel: on ? "Выдать" : "Снять",
      danger: !on,
      reason: true,
      reasons: on ? ["Проверили работы и опыт"] : ["Опыт не подтвердился", "Жалобы клиентов"],
    });
    if (reason === null) return;
    await act(
      m.id,
      () => api.setExperienceBadge(m.id, on, reason),
      on ? "Значок выдан" : "Значок снят",
    );
  };

  const block = async (m: MasterRow) => {
    const reason = await confirm({
      title: "Заблокировать аккаунт?",
      text: "Человек не сможет войти. Снять блокировку можно в карточке.",
      confirmLabel: "Заблокировать",
      danger: true,
      reason: true,
      reasons: ["Мошенничество", "Повторные нарушения"],
    });
    if (reason === null) return;
    await act(m.id, () => api.setUserStatus(m.id, "banned", reason), "Заблокирован");
  };

  return (
    <div>
      <PageHead onBack={onBack} backLabel="Ещё" title="Специалисты" />
      <div className="page-head-actions">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Имя, фамилия или номер"
          aria-label="Поиск по специалистам"
        />
      </div>
      <p className="body-md text-mute" style={{ marginTop: 8 }}>
        Профиль виден в каталоге, как только специалист выбрал категорию. «Скрыть» убирает его из
        каталога без блокировки аккаунта; «Заблокировать» закрывает аккаунт целиком. «Большой опыт»
        — значок в профиле по вашему решению; специалисты с паспортом и значком выше в поиске.
      </p>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !rows ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Специалистов пока нет"
          hint={search ? "Проверьте номер или имя." : "Никто ещё не включил режим специалиста."}
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Специалист</th>
                <th>Категории</th>
                <th>Фото</th>
                <th>Рейтинг</th>
                <th>Состояние</th>
                <th>Доверие</th>
                <th>С</th>
                <th aria-label="Действия" />
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const v = visibilityLabel(m);
                const busy = busyId === m.id;
                const canShow =
                  m.user_status !== "banned" && !(m.master_status === "active" && !m.is_hidden);
                const canHide = m.user_status !== "banned" && m.master_status !== "suspended";
                return (
                  <tr key={m.id}>
                    <td>
                      <button type="button" className="link" onClick={() => onOpen(m.id)}>
                        {fullName(m.first_name, m.last_name)}
                      </button>
                      <div className="text-mute body-sm">{formatPhone(m.phone)}</div>
                    </td>
                    <td>{m.categories.length > 0 ? m.categories.join(", ") : "—"}</td>
                    <td>{m.photos_count}</td>
                    <td>
                      {m.rating_count
                        ? `${Number(m.rating_avg ?? 0).toFixed(1)} · ${m.rating_count}`
                        : "—"}
                    </td>
                    <td>
                      <Badge status={v.status} />
                      <span className="body-sm" style={{ marginLeft: 6 }}>
                        {v.text}
                      </span>
                    </td>
                    <td>
                      {m.is_verified ? <span className="badge">паспорт</span> : null}{" "}
                      {m.has_experience_badge ? <span className="badge">большой опыт</span> : null}
                      {!m.is_verified && !m.has_experience_badge ? "—" : null}
                    </td>
                    <td>{formatDate(m.created_at)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canShow ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void setVisible(m, true)}
                        >
                          Показать
                        </button>
                      ) : null}
                      {canHide ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void setVisible(m, false)}
                        >
                          Скрыть
                        </button>
                      ) : null}
                      {m.user_status !== "banned" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void toggleBadge(m)}
                        >
                          {m.has_experience_badge ? "Снять «Большой опыт»" : "Дать «Большой опыт»"}
                        </button>
                      ) : null}
                      {m.user_status !== "banned" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          onClick={() => void block(m)}
                          style={{ color: "var(--error)" }}
                        >
                          Заблокировать
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
