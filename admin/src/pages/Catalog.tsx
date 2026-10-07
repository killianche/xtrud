// «Каталог» — работа с разделами и подкатегориями (№284, план —
// docs/ADMIN_CATALOG_2026-10.md). Слева разделы: порядок и переименование.
// Справа подкатегории выбранного раздела: правка (название, иконка, раздел,
// синонимы), видимость, кто откликается, порядок, задания категории с
// массовым переносом, «Удалить» = «Слить в…» (задания, специалисты и синонимы
// переходят в другую подкатегорию, эта выключается). Новые разделы — через
// сборку приложения: их иконки и место в каталоге зашиты в приложение.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "../components/feedback";
import { EmptyState, ErrorState, PageHead, plural, SkeletonRows } from "../components/ui";
import { api, type CategoryOrderRow, type CategoryRow } from "../lib/api";

/** Иконки, которые знает приложение (src/lib/category-icons.ts), с подписью. */
const ICONS: Array<{ name: string; label: string }> = [
  { name: "Wrench", label: "Гаечный ключ" },
  { name: "Hammer", label: "Молоток" },
  { name: "PaintBrush", label: "Кисть" },
  { name: "PaintBucket", label: "Ведро краски" },
  { name: "Wall", label: "Стена" },
  { name: "Door", label: "Дверь" },
  { name: "HardHat", label: "Каска" },
  { name: "Crane", label: "Кран" },
  { name: "Lightning", label: "Молния" },
  { name: "Drop", label: "Капля" },
  { name: "Pipe", label: "Труба" },
  { name: "Fire", label: "Огонь" },
  { name: "Snowflake", label: "Снежинка" },
  { name: "Fan", label: "Вентилятор" },
  { name: "Broom", label: "Веник" },
  { name: "Sparkle", label: "Блеск" },
  { name: "WashingMachine", label: "Стиральная машина" },
  { name: "Trash", label: "Мусор" },
  { name: "Bug", label: "Жук" },
  { name: "Plant", label: "Растение" },
  { name: "TreeEvergreen", label: "Дерево" },
  { name: "Shovel", label: "Лопата" },
  { name: "Couch", label: "Диван" },
  { name: "House", label: "Дом" },
  { name: "Key", label: "Ключ" },
  { name: "SecurityCamera", label: "Камера наблюдения" },
  { name: "Television", label: "Телевизор" },
  { name: "Laptop", label: "Ноутбук" },
  { name: "DeviceMobile", label: "Телефон" },
  { name: "Truck", label: "Грузовик" },
  { name: "Package", label: "Коробка" },
  { name: "Car", label: "Машина" },
  { name: "Tire", label: "Колесо" },
  { name: "Engine", label: "Двигатель" },
  { name: "GraduationCap", label: "Учёба" },
  { name: "BookOpen", label: "Книга" },
  { name: "Translate", label: "Язык" },
  { name: "Scales", label: "Весы" },
  { name: "Calculator", label: "Калькулятор" },
  { name: "Briefcase", label: "Портфель" },
  { name: "Baby", label: "Ребёнок" },
  { name: "HandHeart", label: "Забота" },
  { name: "Scissors", label: "Ножницы" },
  { name: "Megaphone", label: "Рупор" },
];

const STATUS_LABEL: Record<string, string> = {
  open: "Открыто",
  completed: "Исполнитель выбран",
  cancelled: "Закрыто",
  expired: "Истекло",
  in_progress: "В работе",
};

function place(o: CategoryOrderRow): string {
  const parts = [o.city_name, o.district, o.village].filter((p): p is string => !!p?.trim());
  return parts.length > 0 ? parts.join(", ") : "Вся Ингушетия";
}

interface Section {
  id: string;
  name: string;
  sort: number;
  items: CategoryRow[];
}

export function Catalog() {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  // Одна раскрытая панель на экране: правка, задания, слияние или новая.
  const [panel, setPanel] = useState<{ kind: "edit" | "orders" | "merge"; l2: string } | null>(
    null,
  );
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api
      .listCategories()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const sections = useMemo<Section[]>(() => {
    const map = new Map<string, Section>();
    for (const r of rows ?? []) {
      if (r.l2_id === "uncategorized") continue;
      const s = map.get(r.l1_id) ?? {
        id: r.l1_id,
        name: r.l1_name,
        sort: r.l1_sort_order ?? 0,
        items: [],
      };
      s.items.push(r);
      map.set(r.l1_id, s);
    }
    const list = [...map.values()].sort((a, b) => a.sort - b.sort);
    for (const s of list) s.items.sort((a, b) => a.sort_order - b.sort_order);
    return list;
  }, [rows]);

  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const current = sections.find((s) => s.id === sectionId) ?? null;
  const q = search.trim().toLowerCase();
  // Поиск — по всем разделам сразу; без поиска — подкатегории выбранного.
  const visibleItems = q
    ? sections.flatMap((s) =>
        s.items.filter(
          (r) =>
            r.l2_name.toLowerCase().includes(q) ||
            (r.terms ?? []).some((t) => t.toLowerCase().includes(q)),
        ),
      )
    : (current?.items ?? []);
  const activeTargets = (rows ?? []).filter(
    (r) => r.is_active && r.is_visible && r.l2_id !== "uncategorized",
  );

  /** Общая обёртка: причина в журнал → действие → тост → обновление. */
  const run = async (
    ask: { title: string; text?: string; confirmLabel: string; danger?: boolean },
    action: (reason: string) => Promise<string>,
  ) => {
    const reason = await confirm({ ...ask, reason: true });
    if (!reason) return false;
    setBusy(true);
    try {
      toast(await action(reason));
      load();
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // Порядок — без окна причины: стрелка должна срабатывать сразу; в журнал
  // уходит понятная причина сама.
  const quick = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не получилось", true);
    } finally {
      setBusy(false);
    }
  };

  const moveSection = (id: string, dir: -1 | 1) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    void quick(async () => {
      await api.reorderCatalog("l1", ids, "Порядок разделов в каталоге");
    });
  };
  const moveItem = (s: Section, l2: string, dir: -1 | 1) => {
    const ids = s.items.map((r) => r.l2_id);
    const i = ids.indexOf(l2);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j] as string, ids[i] as string];
    void quick(async () => {
      await api.reorderCatalog("l2", ids, "Порядок подкатегорий в каталоге");
    });
  };
  const renameSection = async (s: Section) => {
    const name = window.prompt("Новое название раздела", s.name)?.trim();
    if (!name || name === s.name) return;
    await run(
      { title: `Переименовать «${s.name}» в «${name}»?`, confirmLabel: "Переименовать" },
      async (reason) => {
        await api.renameSection(s.id, name, reason);
        return "Раздел переименован";
      },
    );
  };

  return (
    <div>
      <PageHead eyebrow="Контент" title="Каталог" />
      <div className="toolbar">
        <input
          className="input"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Найти подкатегорию или синоним"
          aria-label="Поиск по каталогу"
        />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={8} height={52} />
      ) : (
        <div className="catalog-split">
          {/* Разделы */}
          <nav className="list" aria-label="Разделы">
            {sections.map((s, i) => (
              <div
                key={s.id}
                className={`list-row is-link ${s.id === sectionId && !q ? "is-selected" : ""}`}
                style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
              >
                <button
                  type="button"
                  className="link-plain"
                  onClick={() => {
                    setSectionId(s.id);
                    setSearch("");
                    setPanel(null);
                    setCreating(false);
                  }}
                >
                  <div className="cell-title">{s.name}</div>
                  <div className="cell-sub">
                    {plural(s.items.length, "подкатегория", "подкатегории", "подкатегорий")} ·{" "}
                    {plural(
                      s.items.reduce((n, r) => n + r.open_orders, 0),
                      "открытое",
                      "открытых",
                      "открытых",
                    )}
                  </div>
                </button>
                <div className="row" style={{ gap: 2 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    disabled={busy || i === 0}
                    onClick={() => moveSection(s.id, -1)}
                    aria-label={`Раздел «${s.name}» выше`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    disabled={busy || i === sections.length - 1}
                    onClick={() => moveSection(s.id, 1)}
                    aria-label={`Раздел «${s.name}» ниже`}
                  >
                    ↓
                  </button>
                </div>
              </div>
            ))}
          </nav>

          {/* Подкатегории */}
          <section className="stack" style={{ gap: 12 }}>
            {q ? (
              <h2 className="heading-md" style={{ margin: 0 }}>
                Найдено: {visibleItems.length}
              </h2>
            ) : current ? (
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <h2 className="heading-md" style={{ margin: 0 }}>
                  {current.name}
                </h2>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy}
                    onClick={() => void renameSection(current)}
                  >
                    Переименовать раздел
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => {
                      setCreating((v) => !v);
                      setPanel(null);
                    }}
                  >
                    Новая подкатегория
                  </button>
                </div>
              </div>
            ) : null}

            {creating && current && !q ? (
              <EditPanel
                title="Новая подкатегория"
                initial={{
                  name: "",
                  icon: current.items[0]?.icon ?? "Wrench",
                  l1: current.id,
                  terms: [],
                }}
                sections={sections}
                busy={busy}
                onCancel={() => setCreating(false)}
                onSave={async (v) => {
                  const ok = await run(
                    { title: `Создать «${v.name}» в «${current.name}»?`, confirmLabel: "Создать" },
                    async () => {
                      await api.createCategory(v.l1, v.name, v.icon, v.terms);
                      return "Подкатегория создана";
                    },
                  );
                  if (ok) setCreating(false);
                }}
              />
            ) : null}

            {visibleItems.length === 0 ? (
              <EmptyState title={q ? "Ничего не нашлось" : "В разделе нет подкатегорий"} />
            ) : (
              visibleItems.map((r) => {
                const sec = sections.find((s) => s.id === r.l1_id);
                const idx = sec?.items.findIndex((x) => x.l2_id === r.l2_id) ?? -1;
                const open = panel?.l2 === r.l2_id ? panel.kind : null;
                return (
                  <div
                    key={r.l2_id}
                    className="card stack"
                    style={{ gap: 10, opacity: r.is_active ? 1 : 0.6 }}
                  >
                    <div
                      className="row"
                      style={{ justifyContent: "space-between", flexWrap: "wrap" }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div className="cell-title">
                          {r.l2_name}
                          {!r.is_visible ? <span className="cell-sub"> · скрыта</span> : null}
                          {!r.is_active ? <span className="cell-sub"> · выключена</span> : null}
                        </div>
                        <div className="cell-sub">
                          {q ? `${r.l1_name} · ` : ""}
                          {plural(r.open_orders, "открытое", "открытых", "открытых")} ·{" "}
                          {plural(r.masters, "специалист", "специалиста", "специалистов")}
                          {r.terms && r.terms.length > 0
                            ? ` · синонимы: ${r.terms.slice(0, 6).join(", ")}${r.terms.length > 6 ? "…" : ""}`
                            : ""}
                        </div>
                      </div>
                      {!q && sec ? (
                        <div className="row" style={{ gap: 2 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            disabled={busy || idx <= 0}
                            onClick={() => moveItem(sec, r.l2_id, -1)}
                            aria-label={`«${r.l2_name}» выше`}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            disabled={busy || idx === sec.items.length - 1}
                            onClick={() => moveItem(sec, r.l2_id, 1)}
                            aria-label={`«${r.l2_name}» ниже`}
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      {(
                        [
                          ["edit", "Изменить"],
                          ["orders", `Задания (${r.total_orders ?? r.open_orders})`],
                          ["merge", "Удалить / слить"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          className={`btn ${open === kind ? "btn-primary" : "btn-ghost"}`}
                          disabled={busy || (kind === "merge" && !r.is_active)}
                          onClick={() => {
                            setPanel(open === kind ? null : { kind, l2: r.l2_id });
                            setCreating(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy || !r.is_active}
                        onClick={() =>
                          void run(
                            {
                              title: r.is_visible
                                ? `Скрыть «${r.l2_name}»?`
                                : `Показать «${r.l2_name}»?`,
                              text: r.is_visible
                                ? "Подкатегория пропадёт из каталога и из подбора. Опубликованные задания останутся."
                                : "Подкатегория появится в каталоге и в подборе.",
                              confirmLabel: r.is_visible ? "Скрыть" : "Показать",
                              danger: r.is_visible,
                            },
                            async (reason) => {
                              await api.setCategoryVisible(r.l2_id, !r.is_visible, reason);
                              return r.is_visible ? "Скрыта" : "Показана";
                            },
                          )
                        }
                      >
                        {r.is_visible ? "Скрыть" : "Показать"}
                      </button>
                      {r.open_responses === undefined ? null : (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy}
                          title="Кто может откликаться на задания этой подкатегории"
                          onClick={() =>
                            void run(
                              {
                                title: r.open_responses
                                  ? `«${r.l2_name}»: только специалисты категории?`
                                  : `«${r.l2_name}»: откликаться может любой?`,
                                confirmLabel: "Сохранить",
                              },
                              async (reason) => {
                                await api.setCategoryOpenResponses(
                                  r.l2_id,
                                  !r.open_responses,
                                  reason,
                                );
                                return "Сохранено";
                              },
                            )
                          }
                        >
                          {r.open_responses ? "Отклик: любой" : "Отклик: специалисты"}
                        </button>
                      )}
                    </div>

                    {open === "edit" ? (
                      <EditPanel
                        title="Изменить подкатегорию"
                        initial={{
                          name: r.l2_name,
                          icon: r.icon ?? "Wrench",
                          l1: r.l1_id,
                          terms: r.terms ?? [],
                        }}
                        sections={sections}
                        busy={busy}
                        onCancel={() => setPanel(null)}
                        onSave={async (v) => {
                          const ok = await run(
                            { title: `Сохранить «${v.name}»?`, confirmLabel: "Сохранить" },
                            async (reason) => {
                              const res = await api.updateCategory(
                                r.l2_id,
                                {
                                  name: v.name !== r.l2_name ? v.name : null,
                                  icon: v.icon !== r.icon ? v.icon : null,
                                  l1Id: v.l1 !== r.l1_id ? v.l1 : null,
                                  terms: v.terms,
                                },
                                reason,
                              );
                              return res.changed ? "Сохранено" : "Изменений нет";
                            },
                          );
                          if (ok) setPanel(null);
                        }}
                      />
                    ) : open === "orders" ? (
                      <OrdersPanel
                        category={r}
                        targets={activeTargets.filter((t) => t.l2_id !== r.l2_id)}
                        busy={busy}
                        onMove={async (ids, into, notify) => {
                          const target = activeTargets.find((t) => t.l2_id === into);
                          return run(
                            {
                              title: `Перенести ${plural(ids.length, "задание", "задания", "заданий")} в «${target?.l2_name ?? into}»?`,
                              text: notify
                                ? "Специалистам новой категории уйдёт уведомление об открытых заданиях (кого уже звали — не повторно)."
                                : "Без уведомлений специалистам.",
                              confirmLabel: "Перенести",
                            },
                            async (reason) => {
                              const res = await api.moveOrders(ids, into, reason, notify);
                              return `Перенесено: ${res.moved}`;
                            },
                          );
                        }}
                      />
                    ) : open === "merge" ? (
                      <MergePanel
                        category={r}
                        targets={activeTargets.filter((t) => t.l2_id !== r.l2_id)}
                        busy={busy}
                        onMerge={async (into, notify) => {
                          const target = activeTargets.find((t) => t.l2_id === into);
                          const ok = await run(
                            {
                              title: `Слить «${r.l2_name}» в «${target?.l2_name ?? into}»?`,
                              text: `Перейдут ${plural(r.total_orders ?? r.open_orders, "задание", "задания", "заданий")} и ${plural(r.masters, "специалист", "специалиста", "специалистов")}, синонимы и услуги. «${r.l2_name}» выключится; название станет синонимом.`,
                              confirmLabel: "Слить",
                              danger: true,
                            },
                            async (reason) => {
                              const res = await api.mergeCategory(r.l2_id, into, reason, notify);
                              return `Слито: заданий ${res.orders_main + res.orders_extra}, специалистов ${res.masters_moved + res.masters_merged}`;
                            },
                          );
                          if (ok) setPanel(null);
                        }}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Правка или создание подкатегории: название, иконка, раздел, синонимы. */
function EditPanel({
  title,
  initial,
  sections,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  initial: { name: string; icon: string; l1: string; terms: string[] };
  sections: Section[];
  busy: boolean;
  onCancel: () => void;
  onSave: (v: { name: string; icon: string; l1: string; terms: string[] }) => Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [l1, setL1] = useState(initial.l1);
  const [terms, setTerms] = useState<string[]>(initial.terms);
  const [term, setTerm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const addTerm = () => {
    const t = term.trim().toLowerCase();
    if (t.length < 2) return;
    if (!terms.includes(t)) setTerms([...terms, t]);
    setTerm("");
  };
  const iconKnown = ICONS.some((i) => i.name === icon);
  return (
    <div className="card-inset stack" style={{ gap: 10 }}>
      <p className="heading-sm" style={{ margin: 0 }}>
        {title}
      </p>
      <label className="stack" style={{ gap: 4 }}>
        <span className="body-sm text-mute">Название</span>
        <input
          className="input"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}>
          <span className="body-sm text-mute">Раздел</span>
          <select className="input" value={l1} onChange={(e) => setL1(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="stack" style={{ gap: 4, flex: 1, minWidth: 180 }}>
          <span className="body-sm text-mute">Иконка</span>
          <select className="input" value={icon} onChange={(e) => setIcon(e.target.value)}>
            {iconKnown ? null : <option value={icon}>{icon} (текущая)</option>}
            {ICONS.map((i) => (
              <option key={i.name} value={i.name}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <span className="body-sm text-mute">
          Синонимы для поиска и нейросети — слова, которыми люди называют эту работу
        </span>
        <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
          {terms.map((t) => (
            <button
              key={t}
              type="button"
              className="chip"
              onClick={() => setTerms(terms.filter((x) => x !== t))}
              aria-label={`Убрать синоним «${t}»`}
            >
              {t} ×
            </button>
          ))}
        </div>
        <div className="row">
          <input
            className="input"
            value={term}
            maxLength={80}
            placeholder="Добавить синоним"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTerm();
              }
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={addTerm}>
            Добавить
          </button>
        </div>
      </div>
      {err ? (
        <div className="banner-error body-md" role="alert">
          {err}
        </div>
      ) : null}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => {
            if (name.trim().length < 2) {
              setErr("Название — минимум 2 символа.");
              return;
            }
            setErr(null);
            void onSave({ name: name.trim(), icon, l1, terms });
          }}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

/** Задания категории: отметить и перенести в другую. */
function OrdersPanel({
  category,
  targets,
  busy,
  onMove,
}: {
  category: CategoryRow;
  targets: CategoryRow[];
  busy: boolean;
  onMove: (ids: string[], into: string, notify: boolean) => Promise<boolean>;
}) {
  const [status, setStatus] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<CategoryOrderRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [into, setInto] = useState("");
  // Уведомлять — по умолчанию да, но не при большом переносе: специалисту не
  // нужна лавина «Новая заявка» (ревью безопасности №284).
  const [notifyChoice, setNotifyChoice] = useState<boolean | null>(null);
  const notify = notifyChoice ?? picked.size <= 10;
  const load = useCallback(() => {
    setRows(null);
    setErr(null);
    api
      .listCategoryOrders(category.l2_id, status, 200)
      .then((r) => {
        setRows(r);
        setPicked(new Set());
      })
      .catch((e: Error) => setErr(e.message));
  }, [category.l2_id, status]);
  useEffect(load, [load]);
  const all = rows ?? [];
  return (
    <div className="card-inset stack" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="row">
          {(["open", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${status === s ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setStatus(s)}
            >
              {s === "open" ? "Открытые" : "Все"}
            </button>
          ))}
        </div>
        {all.length > 0 ? (
          <button
            type="button"
            className="link"
            onClick={() =>
              setPicked(picked.size === all.length ? new Set() : new Set(all.map((o) => o.id)))
            }
          >
            {picked.size === all.length ? "Снять все" : "Отметить все"}
          </button>
        ) : null}
      </div>
      {err ? (
        <ErrorState message={err} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={44} />
      ) : all.length === 0 ? (
        <p className="body-sm text-mute" style={{ margin: 0 }}>
          {status === "open" ? "Открытых заданий нет." : "Заданий нет."}
        </p>
      ) : (
        <div className="list">
          {all.map((o) => (
            <label
              key={o.id}
              className="list-row is-link"
              style={{ gridTemplateColumns: "auto minmax(0,1fr) auto" }}
            >
              <input
                type="checkbox"
                checked={picked.has(o.id)}
                onChange={() => {
                  const next = new Set(picked);
                  if (next.has(o.id)) next.delete(o.id);
                  else next.add(o.id);
                  setPicked(next);
                }}
                aria-label={`Отметить «${o.title}»`}
              />
              <div style={{ minWidth: 0 }}>
                <div className="cell-title">{o.title}</div>
                <div className="cell-sub">
                  {place(o)} · {plural(o.responses_count, "отклик", "отклика", "откликов")}
                  {o.is_main ? "" : " · дополнительная категория"}
                  {o.is_hidden ? " · скрыто" : ""}
                </div>
              </div>
              <span className="cell-sub">{STATUS_LABEL[o.status] ?? o.status}</span>
            </label>
          ))}
        </div>
      )}
      {picked.size > 0 ? (
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            value={into}
            onChange={(e) => setInto(e.target.value)}
            aria-label="Куда перенести"
          >
            <option value="">Перенести в…</option>
            {targets.map((t) => (
              <option key={t.l2_id} value={t.l2_id}>
                {t.l1_name} → {t.l2_name}
              </option>
            ))}
          </select>
          <label className="row body-sm" style={{ gap: 6 }}>
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotifyChoice(e.target.checked)}
            />
            Уведомить специалистов
          </label>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !into}
            onClick={async () => {
              if (await onMove([...picked], into, notify)) load();
            }}
          >
            Перенести {picked.size}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** «Удалить» = слить в другую подкатегорию: ничего не теряется. */
function MergePanel({
  category,
  targets,
  busy,
  onMerge,
}: {
  category: CategoryRow;
  targets: CategoryRow[];
  busy: boolean;
  onMerge: (into: string, notify: boolean) => Promise<void>;
}) {
  const [into, setInto] = useState("");
  const [notify, setNotify] = useState(category.open_orders <= 10);
  return (
    <div className="card-inset stack" style={{ gap: 10 }}>
      <p className="body-sm" style={{ margin: 0 }}>
        Подкатегория не удаляется бесследно: её задания (
        {category.total_orders ?? category.open_orders}
        ), специалисты ({category.masters}), синонимы и услуги перейдут в выбранную, а «
        {category.l2_name}» выключится. Отзывы и история сохранятся.
      </p>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <select
          className="input"
          style={{ flex: 1, minWidth: 220 }}
          value={into}
          onChange={(e) => setInto(e.target.value)}
          aria-label="Куда слить"
        >
          <option value="">Слить в…</option>
          {targets.map((t) => (
            <option key={t.l2_id} value={t.l2_id}>
              {t.l1_name} → {t.l2_name}
            </option>
          ))}
        </select>
        <label className="row body-sm" style={{ gap: 6 }}>
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Уведомить специалистов об открытых
        </label>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy || !into}
          onClick={() => void onMerge(into, notify)}
        >
          Слить и выключить
        </button>
      </div>
    </div>
  );
}
