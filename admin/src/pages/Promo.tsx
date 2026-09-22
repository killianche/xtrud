// Реклама на Главной приложения (0206). Владелец, 2026-09-22: «в админку —
// добавление баннера с фотографией». Баннер — фото 16:9 и необязательная
// ссылка рекламодателя. Включённые видны в приложении сразу для всех версий,
// начиная со сборки 106; нет ни одного включённого — блока «Реклама» на
// Главной нет вовсе.

import { useEffect, useRef, useState } from "react";
import { EmptyState, ErrorState, Field, SkeletonRows } from "../components/ui";
import { api, type PromoBannerRow } from "../lib/api";

export function Promo() {
  const [rows, setRows] = useState<PromoBannerRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    setLoadError(null);
    api
      .listPromoBanners()
      .then(setRows)
      .catch((e: Error) => setLoadError(e.message));
  };
  useEffect(load, []);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-header">
        <div>
          <p className="mono-eyebrow">Главная приложения</p>
          <h1 className="heading-lg" style={{ marginTop: 4 }}>
            Реклама
          </h1>
        </div>
      </div>

      <AddBanner onAdded={load} />

      {loadError ? (
        <ErrorState message={loadError} onRetry={load} />
      ) : !rows ? (
        <SkeletonRows count={2} height={120} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Баннеров нет"
          hint="Добавьте фото — баннер появится на Главной приложения."
        />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          {rows.map((row, i) => (
            <BannerCard
              key={row.id}
              row={row}
              isFirst={i === 0}
              isLast={i === rows.length - 1}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AddBanner({ onAdded }: { onAdded: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Выберите фото баннера.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.addPromoBanner(file, link, title);
      setFile(null);
      setLink("");
      setTitle("");
      if (inputRef.current) inputRef.current.value = "";
      setSaved("Баннер добавлен и показывается на Главной.");
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card stack" style={{ maxWidth: 560 }}>
      <p className="mono-eyebrow">Новый баннер</p>
      <Field label="Фото" hint="Формат 16:9, например 1600×900. JPEG, PNG или WebP, до 20 МБ.">
        <input
          ref={inputRef}
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
        />
      </Field>
      {preview ? <BannerImage src={preview} alt="Предпросмотр баннера" /> : null}
      <Field label="Ссылка" hint="Необязательно. Куда ведёт нажатие: сайт, WhatsApp, Instagram">
        <input
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field label="Рекламодатель" hint="Необязательно. Читается вслух для незрячих">
        <input
          className="input"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
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
        <button type="submit" className="btn btn-primary" disabled={busy || !file}>
          {busy ? "Загружаем…" : "Добавить баннер"}
        </button>
      </div>
    </form>
  );
}

function BannerCard({
  row,
  isFirst,
  isLast,
  onChanged,
}: {
  row: PromoBannerRow;
  isFirst: boolean;
  isLast: boolean;
  onChanged: () => void;
}) {
  const [link, setLink] = useState(row.link_url ?? "");
  const [title, setTitle] = useState(row.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dirty = link !== (row.link_url ?? "") || title !== (row.title ?? "");

  return (
    <div className="card stack" style={{ maxWidth: 560, opacity: row.is_active ? 1 : 0.7 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className={`badge ${row.is_active ? "badge-active" : "badge-warn"}`}>
          {row.is_active ? "Показывается" : "Выключен"}
        </span>
        <div className="row" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || isFirst}
            onClick={() => run(() => api.movePromoBanner(row.id, true))}
            aria-label="Показывать раньше"
          >
            ↑
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || isLast}
            onClick={() => run(() => api.movePromoBanner(row.id, false))}
            aria-label="Показывать позже"
          >
            ↓
          </button>
        </div>
      </div>
      <BannerImage src={row.image_url} alt={row.title ?? "Баннер"} />
      <Field label="Ссылка">
        <input
          className="input"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={busy}
        />
      </Field>
      <Field label="Рекламодатель">
        <input
          className="input"
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </Field>
      {error ? (
        <div className="banner-error body-md" role="alert">
          {error}
        </div>
      ) : null}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        {dirty ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() =>
              run(() =>
                api.updatePromoBanner({
                  id: row.id,
                  link_url: link,
                  title,
                  is_active: row.is_active,
                }),
              )
            }
          >
            Сохранить
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() =>
            run(() =>
              api.updatePromoBanner({
                id: row.id,
                link_url: row.link_url,
                title: row.title,
                is_active: !row.is_active,
              }),
            )
          }
        >
          {row.is_active ? "Выключить" : "Включить"}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Удалить баннер вместе с фото?")) {
              void run(() => api.deletePromoBanner(row.id));
            }
          }}
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

function BannerImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--hairline-soft)",
      }}
    >
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}
