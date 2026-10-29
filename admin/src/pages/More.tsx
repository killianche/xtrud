// «Ещё» — всё, что не очередь: цифры, каталог, рассылка, настройки,
// команда, журнал и уведомления этого устройства (№367). Сгруппировано как
// «Настройки» iPhone.

import type { ReactNode } from "react";
import { Icon } from "../components/icons";
import { Cell, PageHead } from "../components/ui";
import type { StaffRole } from "../lib/api";

interface Item {
  path: string;
  title: string;
  icon: ReactNode;
  tint: string;
  adminOnly?: boolean;
}

const GROUPS: Array<{ title: string; items: Item[] }> = [
  {
    title: "Площадка",
    items: [
      {
        path: "/more/analytics",
        title: "Аналитика",
        icon: <Icon.chart size={18} />,
        tint: "var(--tint-teal)",
      },
      {
        path: "/more/masters",
        title: "Специалисты",
        icon: <Icon.tool size={18} />,
        tint: "var(--tint-ink)",
        adminOnly: true,
      },
      {
        path: "/more/reviews",
        title: "Отзывы",
        icon: <Icon.star size={18} />,
        tint: "var(--tint-yellow)",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Контент",
    items: [
      {
        path: "/more/catalog",
        title: "Каталог категорий",
        icon: <Icon.grid size={18} />,
        tint: "var(--tint-indigo)",
        adminOnly: true,
      },
      {
        path: "/more/promo",
        title: "Реклама на главной",
        icon: <Icon.image size={18} />,
        tint: "var(--tint-pink)",
        adminOnly: true,
      },
      {
        path: "/more/broadcast",
        title: "Рассылка",
        icon: <Icon.megaphone size={18} />,
        tint: "var(--tint-orange)",
        adminOnly: true,
      },
    ],
  },
  {
    title: "Управление",
    items: [
      {
        path: "/more/notifications",
        title: "Уведомления",
        icon: <Icon.bell size={18} />,
        tint: "var(--tint-red)",
      },
      {
        path: "/more/settings",
        title: "Настройки приложения",
        icon: <Icon.settings size={18} />,
        tint: "var(--tint-gray)",
        adminOnly: true,
      },
      {
        path: "/more/team",
        title: "Команда",
        icon: <Icon.shield size={18} />,
        tint: "var(--tint-blue)",
        adminOnly: true,
      },
      {
        path: "/more/journal",
        title: "Журнал действий",
        icon: <Icon.journal size={18} />,
        tint: "var(--tint-green)",
        adminOnly: true,
      },
    ],
  },
];

export function More({
  role,
  navigate,
  onSignOut,
}: {
  role: StaffRole;
  navigate: (path: string) => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <PageHead title="Ещё" />
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => role === "admin" || !i.adminOnly);
        if (items.length === 0) return null;
        return (
          <section key={g.title} className="section">
            <h2 className="section-title">{g.title}</h2>
            <div className="group">
              {items.map((i) => (
                <Cell
                  key={i.path}
                  icon={i.icon}
                  iconBg={i.tint}
                  title={i.title}
                  onClick={() => navigate(i.path)}
                />
              ))}
            </div>
          </section>
        );
      })}
      <div className="group">
        <Cell title="Выйти" danger chevron={false} onClick={onSignOut} />
      </div>
      <p className="section-footer" style={{ textAlign: "center" }}>
        {role === "admin" ? "Администратор" : "Управляющий"} · xtrud
      </p>
    </>
  );
}
