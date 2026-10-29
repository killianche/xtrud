// «Задания» (№367): одна вкладка вместо трёх пунктов меню.
//
//   На проверке — открытые без категории (бывшее «Без категории»; 0255 — без
//                 отменённых и отклонённых, ошибка №368): отнести или отклонить;
//   Опубликованы — открытые в ленте;
//   Отклонённые  — сняты модерацией («это не задание»), можно вернуть;
//   Скрытые      — «красный флаг», тихо скрыты;
//   Все          — поиск по названию или номеру клиента.
//
// Управляющему — только «На проверке» и «Скрытые» (STAFF_ROLES §2).

import { useCallback, useContext, useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { Icon } from "../components/icons";
import { refreshAttention, useAttention } from "../components/Shell";
import {
  Badge,
  EmptyState,
  ErrorState,
  PageHead,
  RelativeTime,
  Segmented,
  SkeletonRows,
} from "../components/ui";
import { api, type OrderRow } from "../lib/api";
import { StaffRoleContext } from "../lib/role";
import { HiddenOrders } from "./HiddenOrders";
import { Uncategorized } from "./Uncategorized";

export type OrdersSegment = "review" | "open" | "rejected" | "hidden";

/** «moderation: Не задание» → «Не задание». */
export function moderationReason(cancelReason: string | null): string | null {
  if (!cancelReason) return null;
  return cancelReason.startsWith("moderation:")
    ? cancelReason.slice("moderation:".length).trim()
    : null;
}

function OrderList({
  segment,
  search,
  onOpen,
}: {
  segment: "open" | "rejected" | "all";
  search: string;
  onOpen: (id: string) => void;
}) {
  const { confirm, toast } = useFeedback();
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload — ручное обновление
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    const status = segment === "all" ? null : segment;
    const timer = setTimeout(
      () => {
        api
          .listOrders(search, status, 100)
          .then((r) => !cancelled && setRows(r))
          .catch((e: Error) => !cancelled && setError(e.message));
      },
      search ? 250 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, segment, reload]);

  const restore = async (o: OrderRow) => {
    const reason = await confirm({
      title: "Вернуть задание в ленту?",
      text: `«${o.title}» снова увидят специалисты, автору придёт уведомление.`,
      confirmLabel: "Вернуть",
      reason: true,
      reasons: ["Отклонено по ошибке", "Автор исправил"],
    });
    if (reason === null) return;
    try {
      await api.restoreOrder(o.id, reason);
      toast("Задание снова в ленте");
      refreshAttention();
      setReload((n) => n + 1);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось вернуть", true);
    }
  };

  return (
    <div className="stack">
      {segment === "rejected" ? (
        <p className="page-lede" style={{ padding: "0 4px" }}>
          Сняты модерацией — например, реклама услуг вместо задания. Автор знает причину. Вернуть
          можно в любой момент.
        </p>
      ) : null}
      {error ? (
        <ErrorState message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : !rows ? (
        <SkeletonRows count={6} height={64} />
      ) : rows.length === 0 ? (
        <EmptyState
          done={segment === "rejected" && !search}
          title={
            search
              ? "Ничего не нашлось"
              : segment === "rejected"
                ? "Отклонённых нет"
                : "Заданий нет"
          }
          hint={search ? "Проверьте название или номер." : undefined}
        />
      ) : (
        <div className="group">
          {rows.map((o) => {
            const why = moderationReason(o.cancel_reason);
            return (
              <div key={o.id} className="cell" style={{ alignItems: "flex-start" }}>
                <button
                  type="button"
                  className="cell-main"
                  style={{ textAlign: "left" }}
                  onClick={() => onOpen(o.id)}
                >
                  <span className="cell-title">{o.title}</span>
                  <span className="cell-sub">
                    {[o.category, o.city ?? "Вся Ингушетия", o.client_label]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {segment === "rejected" && why ? (
                    <span className="cell-sub" style={{ color: "var(--danger)" }}>
                      Причина: {why}
                    </span>
                  ) : null}
                  <span className="footnote text-mute">
                    <RelativeTime iso={o.created_at} />
                    {o.responses_count > 0 ? ` · предложений: ${o.responses_count}` : ""}
                  </span>
                </button>
                {segment === "rejected" ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => void restore(o)}
                  >
                    Вернуть
                  </button>
                ) : segment === "all" ? (
                  <Badge status={why ? "hidden" : o.status} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Orders({
  segment,
  onSegment,
  onOpen,
}: {
  segment: OrdersSegment;
  onSegment: (s: OrdersSegment) => void;
  onOpen: (id: string) => void;
}) {
  const role = useContext(StaffRoleContext);
  const attention = useAttention();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const options: Array<{ value: OrdersSegment; label: string; count?: number | null }> = [
    { value: "review", label: "Проверка", count: attention?.uncategorized_open },
    ...(isAdmin
      ? ([
          { value: "open", label: "В ленте" },
          { value: "rejected", label: "Отклонены" },
        ] as const)
      : []),
    { value: "hidden", label: "Скрытые" },
  ];
  const current = options.some((o) => o.value === segment) ? segment : "review";
  const open = useCallback((id: string) => onOpen(id), [onOpen]);

  return (
    <>
      <PageHead title="Задания" />
      {isAdmin ? (
        <div className="search">
          <Icon.search size={18} />
          <input
            className="input"
            type="search"
            enterKeyHint="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по всем заданиям"
            aria-label="Поиск по всем заданиям: название или номер клиента"
          />
        </div>
      ) : null}
      {search.trim() ? (
        <OrderList key="all" segment="all" search={search} onOpen={open} />
      ) : (
        <>
          <Segmented label="Какие задания" value={current} options={options} onChange={onSegment} />
          {current === "review" ? (
            <Uncategorized onOpenOrder={open} />
          ) : current === "hidden" ? (
            <HiddenOrders onOpenOrder={open} />
          ) : (
            <OrderList key={current} segment={current} search="" onOpen={open} />
          )}
        </>
      )}
    </>
  );
}
