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

type Flags = {
  find_tiles?: string;
  require_login?: boolean;
  composer_start?: string;
  composer_form?: string;
};

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
      <ComposerStartCard flags={flags} onChange={setFlags} />
      <ComposerFormCard flags={flags} onChange={setFlags} />
    </>
  );
}

/** Первый экран создания задания (флаг composer_start, 0228, №242): «Что
 *  нужно сделать?» с подсказками категорий или прежний каталог разделов.
 *  Нужен, чтобы откатить новый путь без новой сборки. */
function ComposerStartCard({
  flags,
  onChange,
}: {
  flags: Flags | null;
  onChange: (f: Flags) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const current = flags ? (flags.composer_start === "catalog" ? "catalog" : "quick") : null;
  const change = async (next: "quick" | "catalog") => {
    if (busy || next === current) return;
    const ok = await confirm({
      title: next === "quick" ? "Начинать со слов?" : "Вернуть выбор из каталога?",
      text:
        next === "quick"
          ? "Первый экран — поле «Что нужно сделать?», категории появляются подсказками при вводе."
          : "Первый экран — список разделов, как раньше. Поиск по словам остаётся над списком.",
      confirmLabel: next === "quick" ? "Включить" : "Вернуть",
    });
    if (ok === null) return;
    setBusy(true);
    try {
      onChange({ ...flags, ...(await api.setComposerStart(next)) });
      toast(
        next === "quick" ? "Создание задания начинается со слов" : "Возвращён выбор из каталога",
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="mono-eyebrow">Создание задания</p>
      <p className="body-md text-mute" style={{ margin: 0 }}>
        С чего начинается создание задания. Действует для приложения 1.0.4 (сборка 135) и новее при
        следующем открытии.
      </p>
      {current === null ? (
        <SkeletonRows count={1} height={36} />
      ) : (
        <Segmented
          value={current}
          options={[
            { value: "quick", label: "Со слов" },
            { value: "catalog", label: "Из каталога" },
          ]}
          onChange={(v) => void change(v === "catalog" ? "catalog" : "quick")}
        />
      )}
    </div>
  );
}

/** Форма задания одним экраном (флаг composer_form, 0229, №249): шаги 2+
 *  создания задания — все пункты на одном экране (бывший «Проверьте
 *  задание», теперь форма) или прежний один вопрос на экран. Нужен, чтобы
 *  откатить форму без новой сборки. */
function ComposerFormCard({
  flags,
  onChange,
}: {
  flags: Flags | null;
  onChange: (f: Flags) => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const current = flags ? (flags.composer_form === "steps" ? "steps" : "single") : null;
  const change = async (next: "single" | "steps") => {
    if (busy || next === current) return;
    const ok = await confirm({
      title: next === "single" ? "Все пункты на одном экране?" : "Вернуть по шагам?",
      text:
        next === "single"
          ? "После выбора категории — одна форма со всеми полями: название, место, срок, бюджет, связь."
          : "После выбора категории — снова один вопрос на экран, как раньше.",
      confirmLabel: next === "single" ? "Включить" : "Вернуть",
    });
    if (ok === null) return;
    setBusy(true);
    try {
      onChange({ ...flags, ...(await api.setComposerForm(next)) });
      toast(next === "single" ? "Форма задания — одним экраном" : "Возвращена форма по шагам");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Не удалось сохранить", true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card stack" style={{ maxWidth: 520 }}>
      <p className="mono-eyebrow">Форма задания</p>
      <p className="body-md text-mute" style={{ margin: 0 }}>
        Шаги 2+ создания задания (после выбора категории). Действует для новой версии приложения при
        следующем запуске.
      </p>
      {current === null ? (
        <SkeletonRows count={1} height={36} />
      ) : (
        <Segmented
          value={current}
          options={[
            { value: "single", label: "Одним экраном" },
            { value: "steps", label: "По шагам" },
          ]}
          onChange={(v) => void change(v === "steps" ? "steps" : "single")}
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
        : "Смотреть задания и специалистов можно будет без входа; вход понадобится, чтобы опубликовать задание или предложить свои услуги.",
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
