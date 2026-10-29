// «Входящие» — главный экран админки (№367): всё, что ждёт решения, в одном
// месте. Сверху — очереди с числом (нажал → разобрал), ниже — остальные
// очереди тихо, без чисел. Если ничего не ждёт — «Всё разобрано».
//
// Числа — admin_attention (0255: «Без категории» без отменённых и скрытых —
// ошибка из №368 больше не висит счётчиком).

import { type ReactNode, useEffect, useState } from "react";
import { Icon } from "../components/icons";
import { inboxTotal, useAttention } from "../components/Shell";
import { Cell, EmptyState, PageHead, SkeletonRows } from "../components/ui";
import type { Attention, StaffRole } from "../lib/api";
import { type PushState, pushState } from "../lib/push";

interface Queue {
  id: string;
  title: string;
  hint: string;
  path: string;
  icon: ReactNode;
  tint: string;
  count: (a: Attention) => number | null | undefined;
  adminOnly?: boolean;
}

const QUEUES: Queue[] = [
  {
    id: "orders",
    title: "Задания на проверке",
    hint: "Не подошла категория — отнести или отклонить",
    path: "/orders/review",
    icon: <Icon.task size={18} />,
    tint: "var(--tint-orange)",
    count: (a) => a.uncategorized_open,
  },
  {
    id: "reports",
    title: "Жалобы",
    hint: "На людей, задания и отзывы",
    path: "/inbox/reports",
    icon: <Icon.flag size={18} />,
    tint: "var(--tint-red)",
    count: (a) => a.reports_open,
  },
  {
    id: "passport",
    title: "Паспорта",
    hint: "Подтверждение личности частного мастера",
    path: "/inbox/passport",
    icon: <Icon.id size={18} />,
    tint: "var(--tint-blue)",
    count: (a) => a.verifications_pending,
    adminOnly: true,
  },
  {
    id: "company",
    title: "Компании",
    hint: "Название, Instagram, WhatsApp",
    path: "/inbox/company",
    icon: <Icon.building size={18} />,
    tint: "var(--tint-indigo)",
    count: (a) => a.companies_pending,
    adminOnly: true,
  },
  {
    id: "experience",
    title: "Большой опыт",
    hint: "Заявки на значок",
    path: "/inbox/experience",
    icon: <Icon.medal size={18} />,
    tint: "var(--tint-yellow)",
    count: (a) => a.experience_pending,
    adminOnly: true,
  },
  {
    id: "instagram",
    title: "Instagram",
    hint: "Ссылки в профилях",
    path: "/inbox/instagram",
    icon: <Icon.instagram size={18} />,
    tint: "var(--tint-pink)",
    count: (a) => a.instagram_pending,
    adminOnly: true,
  },
  {
    id: "recovery",
    title: "Восстановление доступа",
    hint: "Просят перезвонить",
    path: "/inbox/recovery",
    icon: <Icon.phone size={18} />,
    tint: "var(--tint-green)",
    count: (a) => a.recovery_new,
    adminOnly: true,
  },
  {
    id: "suspicious",
    title: "Подозрительные отзывы",
    hint: "Похоже на накрутку",
    path: "/inbox/suspicious",
    icon: <Icon.alert size={18} />,
    tint: "var(--tint-gray)",
    count: () => null,
    adminOnly: true,
  },
];

function greeting(now = new Date()): string {
  const h = now.getHours();
  const part =
    h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  const date = now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  return `${part} · ${date}`;
}

export function Inbox({ role, navigate }: { role: StaffRole; navigate: (path: string) => void }) {
  const attention = useAttention();
  const [push, setPush] = useState<PushState | null>(null);

  useEffect(() => {
    pushState()
      .then(setPush)
      .catch(() => setPush("unsupported"));
  }, []);

  const queues = QUEUES.filter((q) => role === "admin" || !q.adminOnly);
  const waiting = attention ? queues.filter((q) => (q.count(attention) ?? 0) > 0) : [];
  const quiet = attention ? queues.filter((q) => !((q.count(attention) ?? 0) > 0)) : [];
  const total = inboxTotal(attention);

  return (
    <>
      {role === "admin" ? (
        <PageHead onBack={() => navigate("/summary")} backLabel="Сводка" title="Входящие" />
      ) : (
        <PageHead eyebrow={greeting()} title="Входящие" />
      )}

      {push === "off" || push === "needs-install" ? (
        <button
          type="button"
          className="card"
          onClick={() => navigate("/more/notifications")}
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            textAlign: "left",
            width: "100%",
          }}
        >
          <span
            className="cell-icon"
            style={{ background: "var(--accent)", width: 40, height: 40, borderRadius: 12 }}
          >
            <Icon.bell size={22} />
          </span>
          <span className="cell-main">
            <span className="headline">Включите уведомления</span>
            <span className="cell-sub">
              {push === "needs-install"
                ? "Добавьте админку на экран «Домой» — тогда iPhone сможет присылать заявки"
                : "Новые паспорта, жалобы и задания — сразу на iPhone"}
            </span>
          </span>
          <span className="chevron">
            <Icon.chevronRight />
          </span>
        </button>
      ) : null}

      {attention === null ? (
        <SkeletonRows count={4} height={56} />
      ) : (
        <>
          {waiting.length > 0 ? (
            <section className="section" aria-labelledby="waiting-title">
              <h2 className="section-title" id="waiting-title">
                Ждут решения · {total}
              </h2>
              <div className="group">
                {waiting.map((q) => (
                  <Cell
                    key={q.id}
                    icon={q.icon}
                    iconBg={q.tint}
                    title={q.title}
                    sub={q.hint}
                    count={q.count(attention)}
                    onClick={() => navigate(q.path)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <div className="card">
              <EmptyState
                done
                title="Всё разобрано"
                hint="Новые заявки появятся здесь — и придут уведомлением, если оно включено."
              />
            </div>
          )}

          <section className="section" aria-labelledby="queues-title">
            <h2 className="section-title" id="queues-title">
              {waiting.length > 0 ? "Остальные очереди" : "Очереди"}
            </h2>
            <div className="group">
              {quiet.map((q) => (
                <Cell
                  key={q.id}
                  icon={q.icon}
                  iconBg={q.tint}
                  title={q.title}
                  onClick={() => navigate(q.path)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
