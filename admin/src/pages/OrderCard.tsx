// Карточка задания (2026-10-04): всё о задании на одной странице — описание,
// фото, клиент, отклики, исполнитель, отзывы. Действия: скрыть задание
// (модерация, клиент получит уведомление) и вернуть скрытое модерацией.

import { useCallback, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { refreshAttention } from "../components/Shell";
import {
  Badge,
  ErrorState,
  formatDate,
  formatPhone,
  PageHead,
  RelativeTime,
  SkeletonRows,
  Stars,
} from "../components/ui";
import { api, type OrderCardData } from "../lib/api";

const CONTACT_MODE: Record<string, string> = {
  chat_only: "Через предложения",
  phone_open: "Звонить напрямую",
  phone_masked: "Скрытый номер",
};

const OWN_PHOTO_HOST = "https://api.xtrud.pro/";

function isOwnPhoto(url: string): boolean {
  return typeof url === "string" && url.startsWith(OWN_PHOTO_HOST);
}

export function price(kind: string | null, value: number | null): string {
  if (kind === "negotiable" || value == null) return "Договорная";
  const v = `${value.toLocaleString("ru-RU")} ₽`;
  if (kind === "from") return `от ${v}`;
  if (kind === "up_to") return `до ${v}`;
  return v;
}

export function OrderCard({
  orderId,
  onBack,
  onOpenUser,
}: {
  orderId: string;
  onBack: () => void;
  onOpenUser: (userId: string) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [data, setData] = useState<OrderCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Пока действие идёт, кнопки заблокированы — без двойного клика.
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .orderCard(orderId)
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [orderId]);
  useEffect(load, [load]);

  if (error) {
    return (
      <div>
        <PageHead title="Задание" onBack={onBack} backLabel="Задания" />
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  if (!data) {
    return (
      <div>
        <PageHead title="Задание" onBack={onBack} backLabel="Задания" />
        <SkeletonRows count={4} height={80} />
      </div>
    );
  }

  const o = data.order;
  const responses = data.responses ?? [];
  const reviews = data.reviews ?? [];
  const canHide = !["cancelled", "expired", "completed"].includes(o.status);
  // Признак «скрыто модерацией» — от сервера по журналу админа: текст
  // причины клиент может написать сам (ревью xtrud-security, F1).
  const canRestore = o.restorable === true;
  // Фото — только из нашего хранилища; чужую ссылку не открываем и не
  // загружаем (иначе её владелец узнаёт адрес админа; F2).
  const photos = (o.photo_urls ?? []).filter(isOwnPhoto);
  const foreignPhotos = (o.photo_urls ?? []).length - photos.length;

  const hide = async () => {
    const reason = await confirm({
      title: "Скрыть задание?",
      text: "Задание пропадёт из ленты, клиент получит уведомление с причиной.",
      confirmLabel: "Скрыть",
      danger: true,
      reason: true,
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.hideOrder(o.id, reason, null);
      toast("Задание скрыто");
      refreshAttention();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось скрыть", true);
    } finally {
      setBusy(false);
    }
  };

  // Скрыть тихо (0231, №253): для тем из красного флага — автор не узнает,
  // задание просто пропадает из ленты и рассылки, как при автоматическом
  // скрытии. Доступно только для открытого задания (admin_hide_order_shadow).
  const hideShadow = async () => {
    const reason = await confirm({
      title: "Скрыть задание тихо?",
      text: "Задание пропадёт из ленты и рассылки специалистам. Автор не получит уведомление и не узнает, что оно скрыто.",
      confirmLabel: "Скрыть тихо",
      danger: true,
      reason: true,
    });
    if (!reason) return;
    setBusy(true);
    try {
      const result = await api.hideOrderShadow(o.id, reason);
      toast(result.changed ? "Задание скрыто тихо" : "Уже скрыто");
      refreshAttention();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось скрыть", true);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    const reason = await confirm({
      title: "Вернуть задание в ленту?",
      text: "Задание снова станет открытым, клиент получит уведомление.",
      confirmLabel: "Вернуть",
      reason: true,
    });
    if (!reason) return;
    setBusy(true);
    try {
      await api.restoreOrder(o.id, reason);
      toast("Задание снова в ленте");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось вернуть", true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHead
        title={o.title}
        onBack={onBack}
        backLabel="Задания"
        actions={
          <>
            <Badge status={o.status} />
            {canRestore ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void restore()}
              >
                {busy ? "Сохраняем…" : "Вернуть в ленту"}
              </button>
            ) : null}
            {canHide ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => void hide()}
              >
                {busy ? "Сохраняем…" : "Скрыть задание"}
              </button>
            ) : null}
            {o.status === "open" ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy}
                onClick={() => void hideShadow()}
              >
                {busy ? "Сохраняем…" : "Скрыть тихо"}
              </button>
            ) : null}
          </>
        }
      />

      <div className="detail-grid">
        <div className="stack" style={{ gap: 16 }}>
          <section className="card stack">
            <p className="mono-eyebrow">Описание</p>
            <p className="body-lg" style={{ margin: 0, whiteSpace: "pre-wrap" }}>
              {o.description?.trim() || "Без описания"}
            </p>
            {photos.length > 0 ? (
              <div className="photo-strip">
                {photos.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="Фото задания" loading="lazy" />
                  </a>
                ))}
              </div>
            ) : null}
            {foreignPhotos > 0 ? (
              <p className="body-sm text-mute" style={{ margin: 0 }}>
                Внешних ссылок на фото: {foreignPhotos} — скрыты.
              </p>
            ) : null}
            {o.cancel_reason ? (
              <div className="banner-error body-md">
                {canRestore
                  ? `Скрыто модерацией: ${o.cancel_reason.replace(/^moderation:\s*/, "")}`
                  : `Причина отмены: ${o.cancel_reason}`}
              </div>
            ) : null}
          </section>

          <section>
            <div className="section-title" style={{ marginTop: 8 }}>
              <h2 className="heading-md">Предложения</h2>
              <span className="body-md text-mute">{responses.length}</span>
            </div>
            {responses.length === 0 ? (
              <p className="body-md text-mute">Предложений пока нет.</p>
            ) : (
              <div className="list">
                {responses.map((r) => (
                  <a
                    key={r.id}
                    className="list-row is-link"
                    style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
                    href={`#/users/${r.master_id}`}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-title">
                        {r.master_label ?? "Без имени"}
                        {r.master_id === o.picked_master_id ? " · исполнитель" : ""}
                      </div>
                      <div className="cell-sub">
                        {price(r.price_kind, r.price_value)}
                        {r.message ? ` · ${r.message}` : ""}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <Badge status={r.status} />
                      <span className="cell-sub col-hide-sm">
                        <RelativeTime iso={r.created_at} />
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>

          {reviews.length > 0 ? (
            <section>
              <div className="section-title" style={{ marginTop: 8 }}>
                <h2 className="heading-md">Отзывы</h2>
              </div>
              <div className="list">
                {reviews.map((r) => (
                  <div
                    key={r.id}
                    className="list-row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-title">
                        <Stars rating={r.rating} /> {r.author_label ?? ""}
                      </div>
                      <div className="cell-sub">{r.text ?? "Без текста"}</div>
                    </div>
                    <Badge status={r.status} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="card">
          <dl className="kv">
            <dt>Клиент</dt>
            <dd>
              <button
                type="button"
                className="back-link"
                style={{ color: "var(--link)", margin: 0 }}
                onClick={() => onOpenUser(o.client_id)}
              >
                {o.client_label ?? "Без имени"}
              </button>
            </dd>
            <dt>Телефон</dt>
            <dd>
              {o.client_phone ? (
                <a href={`tel:${o.client_phone}`} style={{ whiteSpace: "nowrap" }}>
                  {formatPhone(o.client_phone)}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt>Связь</dt>
            <dd>{CONTACT_MODE[o.contact_mode ?? ""] ?? "—"}</dd>
            <dt>Категория</dt>
            <dd>{o.category ?? "—"}</dd>
            <dt>Место</dt>
            <dd>{o.city ?? o.district ?? "Вся Ингушетия"}</dd>
            <dt>Бюджет</dt>
            <dd>{price(o.budget_kind, o.budget_value)}</dd>
            <dt>Когда</dt>
            <dd>
              {o.preferred_date
                ? new Date(o.preferred_date).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                  })
                : "Не важно"}
            </dd>
            <dt>Исполнитель</dt>
            <dd>
              {o.picked_master_id ? (
                <button
                  type="button"
                  className="back-link"
                  style={{ color: "var(--link)", margin: 0 }}
                  onClick={() => onOpenUser(o.picked_master_id as string)}
                >
                  {o.picked_master_label ?? "Без имени"}
                </button>
              ) : (
                "Не выбран"
              )}
            </dd>
            <dt>Создано</dt>
            <dd>{formatDate(o.created_at)}</dd>
          </dl>
        </aside>
      </div>
    </div>
  );
}
