// «Каталог» (2026-10-04): разделы и подразделы приложения. Подраздел можно
// скрыть или показать (вместе со счётчиками: сколько открытых заданий и
// специалистов в нём). Разделы верхнего уровня — состав релиза приложения
// (src/lib/product-scope.ts), здесь не меняются.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "../components/feedback";
import { EmptyState, ErrorState, PageHead, plural, SkeletonRows } from "../components/ui";
import { api, type CategoryRow } from "../lib/api";

export function Catalog() {
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<CategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // id строки, по которой идёт действие: её кнопка заблокирована.
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggleOpen = async (r: CategoryRow) => {
    const opening = !r.open_responses;
    const reason = await confirm({
      title: opening
        ? `«${r.l2_name}»: откликаться может любой?`
        : `«${r.l2_name}»: только специалисты категории?`,
      text: opening
        ? "Простые работы: откликнуться сможет любой вошедший, без категории в профиле."
        : "Откликаться смогут только специалисты, у которых эта категория в профиле. Остальным приложение предложит её добавить.",
      confirmLabel: "Сохранить",
      reason: true,
    });
    if (!reason) return;
    setBusyId(r.l2_id);
    try {
      await api.setCategoryOpenResponses(r.l2_id, opening, reason);
      toast(opening ? "Отклик открыт всем" : "Отклик — только специалистам");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось изменить подраздел", true);
    } finally {
      setBusyId(null);
    }
  };
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setError(null);
    api
      .listCategories()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, { name: string; items: CategoryRow[] }>();
    for (const r of rows ?? []) {
      if (q && !r.l2_name.toLowerCase().includes(q) && !r.l1_name.toLowerCase().includes(q)) {
        continue;
      }
      const g = map.get(r.l1_id) ?? { name: r.l1_name, items: [] };
      g.items.push(r);
      map.set(r.l1_id, g);
    }
    return [...map.entries()];
  }, [rows, search]);

  const toggle = async (r: CategoryRow) => {
    const showing = !r.is_visible;
    const reason = await confirm({
      title: showing ? `Показать «${r.l2_name}»?` : `Скрыть «${r.l2_name}»?`,
      text: showing
        ? "Подраздел появится в каталоге и при создании задания."
        : "Подраздел пропадёт из каталога и из выбора при создании задания. Уже опубликованные задания останутся.",
      confirmLabel: showing ? "Показать" : "Скрыть",
      danger: !showing,
      reason: true,
    });
    if (!reason) return;
    setBusyId(r.l2_id);
    try {
      await api.setCategoryVisible(r.l2_id, showing, reason);
      toast(showing ? "Подраздел показан" : "Подраздел скрыт");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось изменить подраздел", true);
    } finally {
      setBusyId(null);
    }
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
          placeholder="Найти подраздел"
          aria-label="Поиск по каталогу"
        />
      </div>
      <p className="body-sm text-mute" style={{ margin: "0 0 16px" }}>
        «Отклик: любой» — простые работы, откликнуться может любой вошедший. «Отклик: специалисты» —
        только те, у кого эта категория в профиле. Скрытый подраздел пропадает из каталога и из
        выбора при создании задания (в старых версиях приложения может остаться до обновления, но
        опубликовать в нём не получится).
      </p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={6} height={52} />
      ) : groups.length === 0 ? (
        <EmptyState title="Ничего не нашлось" />
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          {groups.map(([id, g]) => (
            <section key={id}>
              <h2 className="heading-md" style={{ marginBottom: 10 }}>
                {g.name}
              </h2>
              <div className="list">
                {g.items.map((r) => (
                  <div
                    key={r.l2_id}
                    className="list-row"
                    style={{ gridTemplateColumns: "minmax(0,1fr) 110px 120px auto auto" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        className="cell-title"
                        style={{ color: r.is_visible ? undefined : "var(--mute)" }}
                      >
                        {r.l2_name}
                      </div>
                      {!r.is_visible ? <div className="cell-sub">Скрыт</div> : null}
                    </div>
                    <span className="cell-sub col-hide-sm">
                      {plural(r.open_orders, "открытое", "открытых", "открытых")}
                    </span>
                    <span className="cell-sub col-hide-sm">
                      {plural(r.masters, "специалист", "специалиста", "специалистов")}
                    </span>
                    {r.open_responses === undefined ? (
                      <span />
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busyId === r.l2_id}
                        onClick={() => void toggleOpen(r)}
                        title="Кто может откликаться на задания этого подраздела"
                      >
                        {r.open_responses ? "Отклик: любой" : "Отклик: специалисты"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn ${r.is_visible ? "btn-ghost" : "btn-primary"}`}
                      disabled={busyId === r.l2_id}
                      onClick={() => void toggle(r)}
                    >
                      {r.is_visible ? "Скрыть" : "Показать"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
