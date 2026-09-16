// Настройки площадки. Сейчас — лимиты публикации заданий (0203): владелец
// 2026-09-16 «дай выкладывать сколько хотят; настройку ограничения — в
// админку». 0 — без ограничения. Проверяет база при каждой публикации,
// приложение читает те же значения заранее.

import { useEffect, useState } from "react";
import { ErrorState, Field, SkeletonRows } from "../components/ui";
import { api, type OrderLimits } from "../lib/api";

function describeLimit(value: number, noun: string): string {
  return value === 0 ? "без ограничения" : `${value} ${noun}`;
}

export function Settings() {
  const [limits, setLimits] = useState<OrderLimits | null>(null);
  const [daily, setDaily] = useState("0");
  const [active, setActive] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setError(null);
    setLimits(null);
    api
      .orderLimits()
      .then((l) => {
        setLimits(l);
        setDaily(String(l.daily));
        setActive(String(l.active));
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  const parse = (v: string) => (/^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : Number.NaN);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = parse(daily);
    const a = parse(active);
    if (!(d >= 0 && d <= 100 && a >= 0 && a <= 100)) {
      setError("Введите целые числа от 0 до 100. 0 — без ограничения.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const next = await api.setOrderLimits(d, a);
      setLimits(next);
      setSaved(
        `Сохранено: в сутки — ${describeLimit(next.daily, "заданий")}, активных — ${describeLimit(next.active, "заданий")}.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Площадка</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Настройки
          </h1>
        </div>
      </div>

      {error && !limits ? (
        <ErrorState message={error} onRetry={load} />
      ) : !limits ? (
        <SkeletonRows count={2} height={72} />
      ) : (
        <form onSubmit={save} className="card stack" style={{ maxWidth: 520 }}>
          <p className="mono-eyebrow">Публикация заданий</p>
          <p className="body-md text-mute">
            Сколько заданий человек может разместить. 0 — без ограничения. Действует сразу для всех
            версий приложения.
          </p>
          <Field
            label="Заданий в сутки"
            hint="За последние 24 часа, включая отменённые и удалённые"
          >
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
              disabled={busy}
              required
            />
          </Field>
          <Field label="Активных одновременно" hint="Открытые и с выбранным исполнителем">
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              value={active}
              onChange={(e) => setActive(e.target.value)}
              disabled={busy}
              required
            />
          </Field>
          {error ? (
            <div className="banner-error body-md" role="alert">
              {error}
            </div>
          ) : null}
          {saved ? (
            <p className="banner-ok body-md" role="status">
              {saved}
            </p>
          ) : null}
          <div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </form>
      )}
      <FindScreenCard />
    </div>
  );
}

/** Вид экрана «Найти задание» в приложении — откат без новой сборки (0205). */
function FindScreenCard() {
  const [variant, setVariant] = useState<"category_first" | "classic" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .appFlags()
      .then((f) => setVariant(f.find_screen))
      .catch((e: Error) => setError(e.message));
  }, []);

  const choose = async (next: "category_first" | "classic") => {
    if (busy || next === variant) return;
    setBusy(true);
    setError(null);
    try {
      const f = await api.setFindScreen(next);
      setVariant(f.find_screen);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const option = (id: "category_first" | "classic", title: string, text: string) => (
    <label className="row" style={{ gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
      <input
        type="radio"
        name="find-screen"
        checked={variant === id}
        disabled={busy || variant === null}
        onChange={() => void choose(id)}
        style={{ marginTop: 4 }}
      />
      <span>
        <span className="body-md" style={{ color: "var(--ink)", fontWeight: 600 }}>
          {title}
        </span>
        <br />
        <span className="body-sm text-mute">{text}</span>
      </span>
    </label>
  );

  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="mono-eyebrow">Экран «Найти задание»</p>
      <p className="body-md text-mute">
        Меняется у всех при следующем открытии приложения, новая сборка не нужна.
      </p>
      {option(
        "category_first",
        "Новый",
        "Поиск и пилюли «Категория», «Место»; при входе — разделы и три свежих задания.",
      )}
      {option("classic", "Прежний", "Сразу вся лента, круглые кнопки фильтра и места.")}
      {error ? (
        <div className="banner-error body-md" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
