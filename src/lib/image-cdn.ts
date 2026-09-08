/**
 * image-cdn.ts — быстрая загрузка фото: подгонка под размер показа, webp,
 * крошечный размытый плейсхолдер.
 *
 * До 2026-09-08 ресайз делал иностранный прокси images.weserv.nl (Cloudflare):
 * лишний хоп за границу, в мобильных сетях РФ нестабилен. DECISION владельца
 * 2026-09-08: «избавиться от иностранного». Теперь ресайз делает наш же
 * сервер — контейнер xtrud-imgproxy на Beget (`/render/<ширина>/<качество>/
 * <bucket>/<path>`), а nginx кэширует результат. Чужие адреса (не наше
 * хранилище) не проксируются вовсе — отдаются как есть.
 *
 * Что НЕ трогаем (возвращаем ссылку как есть):
 *   - локальные ассеты из require (number-id) — сюда вообще не попадают;
 *   - относительные `/assets/...`, `blob:`, `data:`, `file:`;
 *   - `.svg` — иконки, ресайз не нужен;
 *   - любые адреса вне нашего хранилища.
 * Старые ссылки, обёрнутые в weserv (из БД), разворачиваем до исходника.
 */

import { env } from "@/lib/env";

const WESERV_MARK = "images.weserv.nl/?url=";
const STORAGE_PUBLIC = "/storage/v1/object/public/";
const STORAGE_RENDER = "/storage/v1/render/image/public/";
const FILES_PUBLIC = "/files/";
const OWN_ORIGIN = env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");

function isRemoteHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Исходный адрес из старой weserv-обёртки; остальное — без изменений. */
function unwrap(url: string): string {
  const i = url.indexOf(WESERV_MARK);
  if (i === -1) return url;
  const rest = url.slice(i + WESERV_MARK.length);
  const amp = rest.indexOf("&");
  const enc = amp === -1 ? rest : rest.slice(0, amp);
  let src: string;
  try {
    src = decodeURIComponent(enc);
  } catch {
    src = enc;
  }
  return isRemoteHttp(src) ? src : `https://${src}`;
}

/** Путь `bucket/file` внутри нашего публичного хранилища, иначе null. */
function ownStoragePath(url: string): string | null {
  if (!url.startsWith(OWN_ORIGIN)) return null;
  const rest = url.slice(OWN_ORIGIN.length);
  const marker = rest.startsWith(STORAGE_PUBLIC)
    ? STORAGE_PUBLIC
    : rest.startsWith(STORAGE_RENDER)
      ? STORAGE_RENDER
      : rest.startsWith(FILES_PUBLIC)
        ? FILES_PUBLIC
        : null;
  if (!marker) return null;
  const [path = "", query = ""] = rest.slice(marker.length).split("?");
  if (path.length === 0) return null;
  // ?v=<метка> — версия файла при перезаписи по тому же пути (аватар).
  const v = new URLSearchParams(query).get("v");
  return v ? `${path}?v=${encodeURIComponent(v)}` : path;
}

function canOptimize(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  return isRemoteHttp(url) || url.includes(WESERV_MARK);
}

export interface CdnOptions {
  /** Ширина показа в логических px (CSS-пикселях). */
  width: number;
  /** Качество 20-100. Дефолт 62 — баланс «лёгкое/чёткое» для фото-плиток. */
  quality?: number;
  /** Множитель плотности экрана (retina). Дефолт 2. */
  dpr?: number;
}

// Если контейнер ещё не измерен (onLayout не сработал), width приходит 0 →
// нельзя просить 1px. Берём дефолт под телефонную ширину.
const FALLBACK_WIDTH = 480;
const MIN_VALID_WIDTH = 16;
// Ограниченный набор ширин — больше попаданий в кэш nginx.
const WIDTH_STEPS = [96, 160, 240, 320, 480, 640, 800, 1080, 1440, 1920];

function snapWidth(w: number): number {
  for (const step of WIDTH_STEPS) if (w <= step) return step;
  return WIDTH_STEPS[WIDTH_STEPS.length - 1] ?? 1920;
}

// Превью делает наш imgproxy: /render/<ширина>/<качество>/<bucket>/<path>
// (nginx → xtrud-imgproxy, кэш 7 дней). Старые ссылки
// /storage/v1/object/public/… ведут к тем же файлам — они перенесены в
// /opt/xtrud/files.
function render(path: string, width: number, quality: number): string {
  const [file = "", query = ""] = path.split("?");
  return `${OWN_ORIGIN}/render/${width}/${quality}/${file}${query ? `?${query}` : ""}`;
}

export function cdnImage(url: string, opts: CdnOptions): string {
  if (!canOptimize(url)) return url;
  const src = unwrap(url);
  const path = ownStoragePath(src);
  if (!path) return src;
  const dpr = opts.dpr ?? 2;
  const logical =
    Number.isFinite(opts.width) && opts.width >= MIN_VALID_WIDTH ? opts.width : FALLBACK_WIDTH;
  const q = Math.min(100, Math.max(20, opts.quality ?? 62));
  return render(path, snapWidth(Math.round(logical * dpr)), q);
}

/** Крошечная версия под размытый плейсхолдер (blur-up). */
export function cdnBlur(url: string | null | undefined): string | undefined {
  if (!canOptimize(url)) return undefined;
  const src = unwrap(url);
  const path = ownStoragePath(src);
  if (!path) return undefined;
  return render(path, 32, 20);
}
