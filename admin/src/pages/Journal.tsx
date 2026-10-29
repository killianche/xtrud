// Журнал действий администратора. Таблица append-only на стороне базы:
// строки нельзя ни изменить, ни удалить — на вопрос «кто это сделал» должен
// быть ответ.

import { useEffect, useState } from "react";
import { EmptyState, ErrorState, PageHead, RelativeTime, SkeletonRows } from "../components/ui";
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
  category_open_responses: "Кто может предлагать услуги",
  set_find_tiles: "Плитки «Найти задание»",
  broadcast_push: "Рассылка push",
  set_require_login: "Обязательный вход",
  set_composer_start: "Первый экран создания задания",
  set_composer_form: "Форма задания: одним экраном / по шагам",
  instagram_approve: "Instagram одобрен",
  experience_badge_grant: "Выдан значок «Большой опыт»",
  experience_badge_revoke: "Снят значок «Большой опыт»",
  experience_badge_reject: "Отклонена заявка на «Большой опыт»",
  instagram_reject: "Instagram отклонён",
  order_set_category: "Категория задания назначена",
  category_create: "Категория создана",
  order_shadow_hide: "Задание скрыто тайно",
  order_shadow_unhide: "Скрытое задание открыто",
};

export function Journal({ onBack }: { onBack: () => void }) {
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
      <PageHead
        onBack={onBack}
        backLabel="Ещё"
        title="Журнал"
        lede="Каждое действие команды — кто, когда и почему."
      />

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
        <div className="group">
          {rows.map((row) => (
            <div key={row.id} className="cell" style={{ alignItems: "flex-start" }}>
              <span className="cell-main">
                <span className="cell-title">{ACTION_LABEL[row.action] ?? row.action}</span>
                {row.reason ? <span className="cell-sub cell-ink">{row.reason}</span> : null}
                <span className="footnote text-mute">
                  {row.admin_label ?? "—"} · <RelativeTime iso={row.performed_at} />
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
