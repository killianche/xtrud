// Настройки площадки. Сейчас — лимиты публикации заданий (0203): владелец
// 2026-09-16 «дай выкладывать сколько хотят; настройку ограничения — в
// админку». 0 — без ограничения. Проверяет база при каждой публикации,
// приложение читает те же значения заранее.

import { useEffect, useState } from "react";
import { useFeedback } from "../components/feedback";
import { ErrorState, Field, Segmented, SkeletonRows } from "../components/ui";
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

      <FlagCards />

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
    </div>
  );
}

type Flags = { find_tiles?: string; require_login?: boolean };

/** Флаги приложения (0216/0217) — один запрос на обе карточки; при сбое —
 *  ошибка и «Повторить», а не вечный скелетон или выдуманное значение. */
function FlagCards() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setError(null);
    setFlags(null);
    api
      .appFlags()
      .then(setFlags)
      .catch((e: Error) => setError(e.message));
  };
  useEffect(load, []);
  if (error) {
    return (
      <div className="card" style={{ maxWidth: 520 }}>
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }
  return (
    <>
      <RequireLoginCard flags={flags} onChange={setFlags} />
      <FindTilesCard flags={flags} onChange={setFlags} />
    </>
  );
}

/** Вид плиток «Найти задание» (флаг find_tiles): примерить мозаику и вернуть
 *  сетку одним нажатием — без новой сборки приложения. */
function FindTilesCard({ flags, onChange }: { flags: Flags | null; onChange: (f: Flags) => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const variant = flags ? (flags.find_tiles === "mosaic" ? "mosaic" : "grid") : null;
  const change = async (next: "mosaic" | "grid") => {
    if (busy || next === variant) return;
    setBusy(true);
    try {
      onChange({ ...flags, ...(await api.setFindTiles(next)) });
      toast(next === "mosaic" ? "Включена мозаика" : "Включена сетка");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="mono-eyebrow">Плитки «Найти задание»</p>
      <p className="body-md text-mute" style={{ margin: 0 }}>
        Мозаика — первые шесть разделов крупно, остальные мельче. Сетка — все разделы одинаковыми
        карточками. В приложении меняется при следующем открытии экрана; старые версии приложения
        всегда показывают сетку.
      </p>
      {variant === null ? (
        <SkeletonRows count={1} height={36} />
      ) : (
        <Segmented
          value={variant}
          options={[
            { value: "mosaic", label: "Мозаика" },
            { value: "grid", label: "Сетка" },
          ]}
          onChange={(v) => void change(v)}
        />
      )}
    </div>
  );
}

/** Обязательный вход (флаг require_login): приложение сразу просит номер и
 *  пароль. Выключатель — на случай, если App Review попросит доступ без
 *  входа: действует без новой сборки. */
function RequireLoginCard({
  flags,
  onChange,
}: {
  flags: Flags | null;
  onChange: (f: Flags) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const enabled = flags ? flags.require_login === true : null;
  const change = async (next: boolean) => {
    if (busy || next === enabled) return;
    const ok = await confirm({
      title: next ? "Включить обязательный вход?" : "Пустить гостей без входа?",
      text: next
        ? "При открытии приложения человек сразу вводит номер и пароль. Без входа приложением пользоваться нельзя."
        : "Смотреть задания и специалистов можно будет без входа; вход понадобится, чтобы опубликовать задание или откликнуться.",
      confirmLabel: next ? "Включить" : "Выключить",
    });
    if (ok === null) return;
    setBusy(true);
    try {
      onChange({ ...flags, ...(await api.setRequireLogin(next)) });
      toast(next ? "Обязательный вход включён" : "Гости снова могут смотреть без входа");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="mono-eyebrow">Вход в приложение</p>
      <p className="body-md text-mute" style={{ margin: 0 }}>
        Обязательный вход — при открытии приложения сразу «Ваш номер», затем пароль или регистрация.
        Действует для новой версии приложения при следующем запуске.
      </p>
      {enabled === null ? (
        <SkeletonRows count={1} height={36} />
      ) : (
        <Segmented
          value={enabled ? "on" : "off"}
          options={[
            { value: "on", label: "Обязательный вход" },
            { value: "off", label: "Можно без входа" },
          ]}
          onChange={(v) => void change(v === "on")}
        />
      )}
    </div>
  );
}
