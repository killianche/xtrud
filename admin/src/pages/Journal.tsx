// Журнал действий администратора. Таблица append-only на стороне базы:
// строки нельзя ни изменить, ни удалить — на вопрос «кто это сделал» должен
// быть ответ.

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, formatDate, SkeletonRows } from "../components/ui";
import { type ActionRow, api } from "../lib/api";

/** Подписи действий — полный список из ограничения admin_actions_action_check. */
export const ACTION_LABEL: Record<string, string> = {
  warn: "Предупреждение",
  suspend: "Приостановка",
  unsuspend: "Снятие приостановки",
  ban: "Блокировка",
  unban: "Снятие блокировки",
  hide: "Скрытие",
  unhide: "Возврат из скрытых",
  hide_order: "Задание скрыто",
  restore_order: "Задание возвращено",
  dismiss_report: "Жалоба отклонена",
  resolve_report: "Жалоба решена",
  issue_signed_url: "Просмотр документа",
  verification_approve: "Паспорт подтверждён",
  verification_reject: "Паспорт отклонён",
  master_show: "Специалист показан",
  master_hide: "Специалист скрыт",
  set_password: "Временный пароль",
  set_phone: "Смена номера",
  set_order_limits: "Лимиты публикации",
  set_find_screen: "Вид экрана поиска",
  promo_banner_add: "Баннер добавлен",
  promo_banner_update: "Баннер изменён",
  promo_banner_delete: "Баннер удалён",
  resolve_recovery_request: "Заявка на звонок закрыта",
  category_show: "Подраздел показан",
  category_hide: "Подраздел скрыт",
  category_open_responses: "Кто может откликаться",
  set_find_tiles: "Плитки «Найти задание»",
  broadcast_push: "Рассылка push",
  set_require_login: "Обязательный вход",
  set_composer_start: "Первый экран создания задания",
  set_composer_form: "Форма задания: одним экраном / по шагам",
  instagram_approve: "Instagram одобрен",
  experience_badge_grant: "Выдан значок «Большой опыт»",
  experience_badge_revoke: "Снят значок «Большой опыт»",
  instagram_reject: "Instagram отклонён",
  order_set_category: "Категория задания назначена",
  category_create: "Категория создана",
};

export function Journal() {
  const [rows, setRows] = useState<ActionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    setRows(null);
    api
      .listActions()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">История</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Журнал действий
          </h1>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>
          Обновить
        </button>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={6} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Действий пока нет"
          hint="Здесь появится каждое действие администратора."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Кто</th>
                <th>Действие</th>
                <th>Объект</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="cell-mono">{formatDate(row.performed_at)}</td>
                  <td>{row.admin_label ?? "—"}</td>
                  <td className="cell-ink">{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td className="cell-mono">{row.target_type}</td>
                  <td>{row.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
