// «Без категории» (0230, №251): задания, которым при публикации не подошла
// ни одна категория каталога — они живут в служебной категории
// `uncategorized` (не видна в приложении). Админ либо переносит задание в
// существующую категорию, либо создаёт новую и сразу закрепляет её за этим
// заданием. По образцу очередей «Паспорта»/«Instagram»/«Восстановление»:
// список, подтверждение действия через useFeedback().confirm, тост, журнал.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFeedback } from "../components/feedback";
import { refreshAttention } from "../components/Shell";
import { EmptyState, ErrorState, plural, RelativeTime, SkeletonRows } from "../components/ui";
import {
  type AiAssistProposal,
  type AiCategorySuggestionRow,
  api,
  type CategoryRow,
  type UncategorizedOrderRow,
} from "../lib/api";

/**
 * Небольшой набор имён Phosphor для новой категории — те же имена, что есть
 * в src/lib/category-icons.ts (каталог мобильного приложения). Сам файл не
 * импортируем: это модуль phosphor-react-native, в веб-сборке админки его
 * нет и не должно быть.
 */
const DEFAULT_ICON = "Wrench";
const ICON_OPTIONS: Array<{ name: string; label: string }> = [
  { name: DEFAULT_ICON, label: "Wrench — гаечный ключ" },
  { name: "Hammer", label: "Hammer — молоток" },
  { name: "Broom", label: "Broom — веник" },
  { name: "Truck", label: "Truck — грузовик" },
  { name: "PaintBrush", label: "PaintBrush — кисть" },
  { name: "Scissors", label: "Scissors — ножницы" },
  { name: "Car", label: "Car — автомобиль" },
  { name: "Laptop", label: "Laptop — ноутбук" },
  { name: "Plant", label: "Plant — растение" },
  { name: "Shovel", label: "Shovel — лопата" },
  { name: "TreeEvergreen", label: "TreeEvergreen — дерево" },
  { name: "WashingMachine", label: "WashingMachine — стиральная машина" },
  { name: "Package", label: "Package — коробка" },
  { name: "Megaphone", label: "Megaphone — рупор" },
];

/** Готовые причины отказа — одним касанием (№367). Автор видит причину. */
export const REJECT_REASONS = [
  "Это реклама услуг, а не задание",
  "Повтор задания",
  "Запрещённая тема",
  "Непонятно, что нужно сделать",
];

function place(o: UncategorizedOrderRow): string {
  const parts = [o.city_name, o.district, o.village].filter((p): p is string => !!p?.trim());
  return parts.length > 0 ? parts.join(", ") : "Вся Ингушетия";
}

/** Разделы каталога — из тех же строк, что и подразделы (как в Catalog.tsx). */
function sectionsOf(categories: CategoryRow[]): Array<{ id: string; name: string }> {
  const map = new Map<string, string>();
  for (const c of categories) map.set(c.l1_id, c.l1_name);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

function OrderRowCard({
  order,
  suggestion,
  categories,
  categoriesError,
  onReloadCategories,
  onOpenOrder,
  onDone,
}: {
  order: UncategorizedOrderRow;
  /** Что предложила нейросеть, если она уже смотрела задание (№279). */
  suggestion?: AiCategorySuggestionRow;
  categories: CategoryRow[] | null;
  categoriesError: string | null;
  onReloadCategories: () => void;
  onOpenOrder: (id: string) => void;
  onDone: () => void;
}) {
  const { confirm, toast } = useFeedback();
  const [mode, setMode] = useState<"assign" | "create" | "ai" | null>(null);
  // Помощник-нейросеть (№282): команда админа → предложение → «Применить».
  const [instruction, setInstruction] = useState("");
  const [asking, setAsking] = useState(false);
  const [proposal, setProposal] = useState<AiAssistProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(() => sectionsOf(categories ?? []), [categories]);

  // «Назначить категорию».
  const [assignL1, setAssignL1] = useState("");
  const [assignL2, setAssignL2] = useState("");
  const [reason, setReason] = useState("Подобрана категория");
  const assignOptions = useMemo(
    () =>
      (categories ?? []).filter(
        (c) => c.l1_id === assignL1 && c.l2_id !== "uncategorized" && c.is_active,
      ),
    [categories, assignL1],
  );

  // «Создать новую категорию».
  const [createL1, setCreateL1] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(DEFAULT_ICON);
  const [terms, setTerms] = useState("");

  const openAssign = () => {
    setMode("assign");
    setError(null);
    setAssignL1((v) => v || sections[0]?.id || "");
  };
  const openCreate = () => {
    setMode("create");
    setError(null);
    setCreateL1((v) => v || sections[0]?.id || "");
  };
  const close = () => {
    setMode(null);
    setError(null);
  };

  const submitAssign = async () => {
    if (!assignL2) {
      setError("Выберите категорию.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Причина — минимум 3 символа.");
      return;
    }
    const l2 = assignOptions.find((c) => c.l2_id === assignL2);
    const ok = await confirm({
      title: `Назначить «${l2?.l2_name ?? assignL2}» заданию «${order.title}»?`,
      text:
        order.status === "open"
          ? "Задание открыто — специалистов этой категории уведомит рассылка, как при публикации."
          : "Задание перейдёт в эту категорию.",
      confirmLabel: "Назначить",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.setOrderCategory(order.id, assignL2, reason.trim());
      toast("Категория назначена");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось назначить категорию.");
    } finally {
      setBusy(false);
    }
  };

  const ask = async () => {
    setAsking(true);
    setError(null);
    setProposal(null);
    try {
      setProposal(await api.aiAssist(order.id, instruction.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось спросить нейросеть.");
    } finally {
      setAsking(false);
    }
  };

  // Применить: назначить существующую или создать новую и назначить.
  const applyCreate = async (
    sectionId: string,
    nameRu: string,
    icon: string | null,
    terms: string[],
  ) => {
    const ok = await confirm({
      title: `Создать категорию «${nameRu}» и назначить заданию?`,
      text: "Категория появится в каталоге и будет закреплена за этим заданием.",
      confirmLabel: "Создать",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      const created = await api.createCategory(sectionId, nameRu, icon ?? DEFAULT_ICON, terms);
      await api.setOrderCategory(order.id, created.l2_id, "Категория по подсказке нейросети");
      toast(`Категория «${created.name_ru}» создана и назначена`);
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать категорию.");
    } finally {
      setBusy(false);
    }
  };
  const applyAssign = async (l2Id: string, l2Name: string) => {
    const ok = await confirm({
      title: `Назначить «${l2Name}» заданию «${order.title}»?`,
      text: "Специалистов этой категории уведомит рассылка.",
      confirmLabel: "Назначить",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.setOrderCategory(order.id, l2Id, "Подсказка нейросети");
      toast("Категория назначена");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось назначить категорию.");
    } finally {
      setBusy(false);
    }
  };

  // Одним нажатием — то, что предложила нейросеть (№279).
  const acceptSuggestion = async () => {
    if (!suggestion?.suggested_l2) return;
    const ok = await confirm({
      title: `Назначить «${suggestion.l2_name ?? suggestion.suggested_l2}» заданию «${order.title}»?`,
      text: "Подсказка нейросети. Специалистов этой категории уведомит рассылка.",
      confirmLabel: "Назначить",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.setOrderCategory(order.id, suggestion.suggested_l2, "Подсказка нейросети");
      toast("Категория назначена");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось назначить категорию.");
    } finally {
      setBusy(false);
    }
  };

  const submitCreate = async () => {
    if (!createL1) {
      setError("Выберите раздел.");
      return;
    }
    if (name.trim().length < 2) {
      setError("Название — минимум 2 символа.");
      return;
    }
    const ok = await confirm({
      title: `Создать категорию «${name.trim()}» и назначить заданию?`,
      text: "Категория появится в каталоге и будет закреплена за этим заданием.",
      confirmLabel: "Создать",
    });
    if (ok === null) return;
    setBusy(true);
    setError(null);
    try {
      const termList = terms
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const created = await api.createCategory(createL1, name.trim(), icon, termList);
      await api.setOrderCategory(
        order.id,
        created.l2_id,
        "Новая категория подобрана автоматически",
      );
      toast(`Категория «${created.name_ru}» создана и назначена`);
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать категорию.");
    } finally {
      setBusy(false);
    }
  };

  // «Это не задание» (№367/№368): отклонить — автору уведомление с причиной,
  // задание уходит в «Отклонённые», откуда его можно вернуть.
  const reject = async () => {
    const reason = await confirm({
      title: "Отклонить задание?",
      text: `«${order.title}» пропадёт из ленты. Автору придёт уведомление с причиной. Вернуть можно в «Отклонённых».`,
      confirmLabel: "Отклонить",
      danger: true,
      reason: true,
      reasons: REJECT_REASONS,
    });
    if (reason === null) return;
    setBusy(true);
    setError(null);
    try {
      await api.hideOrder(order.id, reason, null);
      toast("Отклонено — в «Отклонённых»");
      refreshAttention();
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось отклонить.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card request">
      <div className="request-head">
        <div className="cell-main">
          <button
            type="button"
            className="headline"
            style={{ textAlign: "left" }}
            onClick={() => onOpenOrder(order.id)}
          >
            {order.title}
          </button>
          <div className="meta">
            <span>{place(order)}</span>
            <RelativeTime iso={order.created_at} />
            <span>
              {plural(order.responses_count, "предложение", "предложения", "предложений")}
            </span>
          </div>
        </div>
      </div>
      {order.description_short ? <p className="quote">{order.description_short}</p> : null}

      {suggestion ? (
        <p className="banner body-sm" style={{ margin: 0 }}>
          {suggestion.status === "pending"
            ? "Нейросеть ещё смотрит задание…"
            : suggestion.suggested_l2
              ? `Нейросеть предлагает: ${suggestion.l2_name ?? suggestion.suggested_l2}${
                  suggestion.confidence != null
                    ? ` (уверенность ${Math.round(suggestion.confidence * 100)}%)`
                    : ""
                }`
              : "Нейросеть не смогла подобрать категорию"}
        </p>
      ) : null}
      {suggestion?.suggested_new ? (
        <div className="row" style={{ flexWrap: "wrap", alignItems: "center" }}>
          <p className="body-sm" style={{ margin: 0, flex: 1, minWidth: 200 }}>
            Нейросеть предлагает создать категорию «{suggestion.suggested_new.name}»
            {suggestion.suggested_new.section_name
              ? ` в разделе «${suggestion.suggested_new.section_name}»`
              : ""}
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              const n = suggestion.suggested_new;
              if (n) void applyCreate(n.section_id, n.name, null, []);
            }}
          >
            Создать
          </button>
        </div>
      ) : null}
      {mode === null && error ? (
        <div className="banner-error body-md" role="alert">
          {error}
        </div>
      ) : null}
      {mode === null ? (
        <div className="stack" style={{ gap: 8 }}>
          {suggestion?.suggested_l2 && suggestion.status !== "pending" ? (
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={() => void acceptSuggestion()}
            >
              В «{suggestion.l2_name ?? suggestion.suggested_l2}»
            </button>
          ) : null}
          <div className="actions">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void reject()}
            >
              Отклонить
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={openAssign}>
              Категория
            </button>
          </div>
          <div className="row" style={{ justifyContent: "center", gap: 4 }}>
            <button type="button" className="btn btn-plain btn-sm" onClick={openCreate}>
              Новая категория
            </button>
            <button
              type="button"
              className="btn btn-plain btn-sm"
              onClick={() => {
                setMode("ai");
                setError(null);
                setProposal(null);
              }}
            >
              Спросить нейросеть
            </button>
          </div>
        </div>
      ) : mode === "ai" ? (
        <div className="stack">
          <textarea
            className="input"
            rows={2}
            maxLength={500}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Например: «это электрика» или «создай категорию „Ремонт уличного освещения“». Можно оставить пустым — нейросеть предложит сама."
            aria-label="Команда нейросети"
          />
          <p className="body-sm text-mute" style={{ margin: 0 }}>
            Не пишите имена и контакты клиента: команда уходит в нейросеть DeepSeek.
          </p>
          {proposal ? (
            <div className="card stack" style={{ gap: 8 }}>
              {proposal.action === "assign" ? (
                <p className="body-md" style={{ margin: 0 }}>
                  Назначить «{proposal.l2_name}» ({proposal.section_name})
                </p>
              ) : proposal.action === "create" ? (
                <p className="body-md" style={{ margin: 0 }}>
                  Создать категорию «{proposal.name}» в разделе «{proposal.section_name}»
                  {proposal.terms.length > 0 ? ` · слова поиска: ${proposal.terms.join(", ")}` : ""}
                </p>
              ) : (
                <p className="body-md" style={{ margin: 0 }}>
                  {proposal.message}
                </p>
              )}
              {proposal.explanation ? (
                <p className="body-sm text-mute" style={{ margin: 0 }}>
                  {proposal.explanation}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy || asking}
              onClick={close}
            >
              Отмена
            </button>
            <button
              type="button"
              className={
                proposal && proposal.action !== "unclear" ? "btn btn-ghost" : "btn btn-primary"
              }
              disabled={busy || asking}
              onClick={() => void ask()}
            >
              {asking ? "Нейросеть думает…" : proposal ? "Спросить ещё раз" : "Спросить"}
            </button>
            {proposal && proposal.action === "assign" ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || asking}
                onClick={() => void applyAssign(proposal.l2_id, proposal.l2_name)}
              >
                Применить
              </button>
            ) : proposal && proposal.action === "create" ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || asking}
                onClick={() =>
                  void applyCreate(
                    proposal.section_id,
                    proposal.name,
                    proposal.icon,
                    proposal.terms,
                  )
                }
              >
                Применить
              </button>
            ) : null}
          </div>
        </div>
      ) : categoriesError ? (
        <ErrorState message={categoriesError} onRetry={onReloadCategories} />
      ) : !categories ? (
        <SkeletonRows count={1} height={40} />
      ) : mode === "assign" ? (
        <div className="stack">
          <div className="row" style={{ flexWrap: "wrap" }}>
            <select
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              value={assignL1}
              onChange={(e) => {
                setAssignL1(e.target.value);
                setAssignL2("");
              }}
              aria-label="Раздел"
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              value={assignL2}
              onChange={(e) => setAssignL2(e.target.value)}
              aria-label="Категория"
            >
              <option value="">Выберите категорию</option>
              {assignOptions.map((c) => (
                <option key={c.l2_id} value={c.l2_id}>
                  {c.l2_name}
                  {c.is_visible ? "" : " (скрыта)"}
                </option>
              ))}
            </select>
          </div>
          <input
            className="input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Подобрана категория"
            aria-label="Причина — попадёт в журнал"
          />
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submitAssign()}
            >
              Назначить
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <select
            className="input"
            value={createL1}
            onChange={(e) => setCreateL1(e.target.value)}
            aria-label="Раздел"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Название категории"
            aria-label="Название категории"
          />
          <select
            className="input"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            aria-label="Иконка"
          >
            {ICON_OPTIONS.map((i) => (
              <option key={i.name} value={i.name}>
                {i.label}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Слова поиска через запятую — необязательно"
            aria-label="Слова поиска"
          />
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void submitCreate()}
            >
              Создать и назначить
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * «На проверке» — открытые задания без категории (0255: без отменённых и
 * скрытых). Встраивается сегментом во вкладку «Задания».
 */
export function Uncategorized({ onOpenOrder }: { onOpenOrder: (orderId: string) => void }) {
  const [rows, setRows] = useState<UncategorizedOrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRow[] | null>(null);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  // Подсказки нейросети — дополнение: не загрузились — список работает как раньше.
  const [suggestions, setSuggestions] = useState<Map<string, AiCategorySuggestionRow>>(new Map());

  const load = useCallback(() => {
    setRows(null);
    setError(null);
    api
      .listUncategorizedOrders()
      .then(setRows)
      .catch((e: Error) => setError(e.message));
    api
      .listAiCategorySuggestions()
      .then((list) => setSuggestions(new Map(list.map((s) => [s.order_id, s]))))
      .catch(() => setSuggestions(new Map()));
  }, []);
  const loadCategories = useCallback(() => {
    setCategoriesError(null);
    api
      .listCategories()
      .then(setCategories)
      .catch((e: Error) => setCategoriesError(e.message));
  }, []);
  useEffect(load, [load]);
  useEffect(loadCategories, [loadCategories]);

  return (
    <div className="stack">
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={3} height={160} />
      ) : rows.length === 0 ? (
        <EmptyState
          done
          title="Проверять нечего"
          hint="Сюда попадают задания, которым при публикации не подошла ни одна категория: отнесите в категорию или отклоните."
        />
      ) : (
        <div className="stack">
          {rows.map((o) => (
            <OrderRowCard
              key={o.id}
              order={o}
              suggestion={suggestions.get(o.id)}
              categories={categories}
              categoriesError={categoriesError}
              onReloadCategories={loadCategories}
              onOpenOrder={onOpenOrder}
              onDone={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
