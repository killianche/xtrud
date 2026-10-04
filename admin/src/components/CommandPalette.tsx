// Общий поиск ⌘K (как в Linear): разделы, люди (имя или номер) и задания
// (название или номер клиента) в одном списке. Стрелки — выбор, Enter —
// открыть, Esc — закрыть. Люди и задания ищутся теми же функциями, что
// и в разделах, — отдельного серверного поиска не нужно.

import { useEffect, useMemo, useRef, useState } from "react";
import { api, type OrderRow, type UserRow } from "../lib/api";
import { Icon } from "./icons";
import { NAV } from "./Shell";
import { formatPhone, fullName, statusLabel } from "./ui";

interface Item {
  key: string;
  group: string;
  label: string;
  sub?: string;
  path: string;
}

export function CommandPalette({
  onClose,
  onGo,
}: {
  onClose: () => void;
  onGo: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      setOrders([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .listUsers(q, 6)
        .then((r) => !cancelled && setUsers(r))
        .catch(() => undefined);
      api
        .listOrders(q, null, 6)
        .then((r) => !cancelled && setOrders(r))
        .catch(() => undefined);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const sections: Item[] = NAV.flatMap((g) => g.items)
      .filter((i) => !q || i.label.toLowerCase().includes(q))
      .map((i) => ({ key: `s-${i.id}`, group: "Разделы", label: i.label, path: i.path }));
    return [
      ...sections,
      ...users.map((u) => ({
        key: `u-${u.id}`,
        group: "Люди",
        label: fullName(u.first_name, u.last_name),
        sub: formatPhone(u.phone),
        path: `/users/${u.id}`,
      })),
      ...orders.map((o) => ({
        key: `o-${o.id}`,
        group: "Задания",
        label: o.title,
        sub: statusLabel(o.status),
        path: `/orders/${o.id}`,
      })),
    ];
  }, [query, users, orders]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: новый список — выбор с начала
  useEffect(() => {
    setActive(0);
  }, [items]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && items[active]) {
      onGo(items[active].path);
    }
  };

  let lastGroup = "";
  return (
    <div className="overlay">
      <button type="button" className="overlay-bg" aria-label="Закрыть поиск" onClick={onClose} />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Поиск">
        <input
          ref={inputRef}
          className="palette-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Имя, номер телефона, задание или раздел"
          aria-label="Поиск"
        />
        <div className="palette-list" role="listbox">
          {items.length === 0 ? (
            <div className="palette-empty">
              {query.trim().length < 2 ? "Начните вводить" : "Ничего не найдено"}
            </div>
          ) : (
            items.map((item, index) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.key}>
                  {header ? <div className="palette-group">{header}</div> : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className="palette-item"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => onGo(item.path)}
                  >
                    {item.group === "Разделы" ? <Icon.arrowRight /> : null}
                    <span className="cell-title">{item.label}</span>
                    {item.sub ? <span className="cell-sub">{item.sub}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
