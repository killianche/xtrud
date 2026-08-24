/**
 * image-cdn.ts — быстрая загрузка удалённых фото (Instagram-стиль).
 *
 * Зачем. Фото на сайте грузились медленно и «прыгали» из серого пустого блока
 * (жалоба пользователя 2026-05-22). Причины: качали полноразмерный тяжёлый JPEG
 * даже в маленькую плитку, и пока картинка едет — пустота. Большие ленты
 * (Instagram, Pinterest, Airbnb) решают это тремя приёмами, которые здесь и
 * реализованы:
 *   1. Подгонка под размер показа — не качаем 800px в плитку 120px.
 *   2. webp + умеренное качество — байт в 3-4 раза меньше JPEG.
 *   3. Blur-up плейсхолдер — мгновенно показываем крошечную размытую версию,
 *      затем плавно подменяем чёткой. Никакого «серого пустого блока».
 *
 * Реализация через публичный image-CDN images.weserv.nl (ресайз + webp + blur +
 * кэш на их стороне). Та же служба, через которую переписаны демо-ссылки в БД
 * (миграция 0105). Каждый компонент с фото уже имеет onError-fallback, поэтому
 * даже при недоступности CDN пользователь видит запасной placeholder, а не
 * сломанную картинку.
 *
 * Что НЕ трогаем (возвращаем ссылку как есть):
 *   - локальные ассеты из require (number-id) — сюда вообще не попадают;
 *   - относительные `/assets/...`, `blob:`, `data:`, `file:` — локальные/уже
 *     быстрые, ресайзить нечем;
 *   - `.svg` — иконки, ресайз не нужен.
 * Уже обёрнутые weserv-ссылки (из БД) нормализуем: вынимаем исходный src и
 * переобёртываем под нужный размер — без двойной вложенности.
 */

const WESERV = "https://images.weserv.nl/?url=";
const WESERV_MARK = "images.weserv.nl/?url=";

function isRemoteHttp(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** Вынуть исходный src из уже обёрнутой weserv-ссылки (или вернуть как есть). */
function unwrap(url: string): string {
  const i = url.indexOf(WESERV_MARK);
  if (i === -1) return url;
  const rest = url.slice(i + WESERV_MARK.length);
  const amp = rest.indexOf("&");
  const enc = amp === -1 ? rest : rest.slice(0, amp);
  try {
    return decodeURIComponent(enc);
  } catch {
    return enc;
  }
}

/** Можно ли оптимизировать эту ссылку через CDN. */
function canOptimize(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("file:")) {
    return false;
  }
  // Локальный/относительный ассет (не http и не уже-weserv) — пропускаем.
  if (!isRemoteHttp(url) && !url.includes("weserv.nl")) return false;
  if (/\.svg(\?|$)/i.test(url)) return false;
  return true;
}

/** weserv ждёт url без протокола; кодируем, чтобы query-параметры не ломали строку. */
function encodeSource(src: string): string {
  const noProto = src.replace(/^https?:\/\//i, "");
  return encodeURIComponent(noProto);
}

export interface CdnOptions {
  /** Ширина показа в логических px (CSS-пикселях). */
  width: number;
  /** Качество 1-100. Дефолт 62 — баланс «лёгкое/чёткое» для фото-плиток. */
  quality?: number;
  /** Множитель плотности экрана (retina). Дефолт 2. */
  dpr?: number;
}

// Если контейнер ещё не измерен (onLayout не сработал, useAppWidth=0 на первой
// отрисовке web), width приходит 0 → нельзя просить «w=1» (это битый 1px-кадр,
// растянутый на весь блок). В таком случае берём дефолт под телефонную ширину.
const FALLBACK_WIDTH = 480;
// Ниже этого размер не имеет смысла (плитки от ~64px) — отсекаем мусорные 0/1.
const MIN_VALID_WIDTH = 16;

/**
 * Оптимизированная ссылка под размер показа: webp, нужная ширина, без
 * увеличения мелких исходников (`we`).
 */
export function cdnImage(url: string, opts: CdnOptions): string {
  if (!canOptimize(url)) return url;
  const src = unwrap(url);
  const dpr = opts.dpr ?? 2;
  const logical =
    Number.isFinite(opts.width) && opts.width >= MIN_VALID_WIDTH ? opts.width : FALLBACK_WIDTH;
  const w = Math.round(logical * dpr);
  const q = opts.quality ?? 62;
  return `${WESERV}${encodeSource(src)}&w=${w}&output=webp&q=${q}&we`;
}

/**
 * Крошечная размытая версия для blur-up плейсхолдера (~1KB). Передавать в
 * expo-image `placeholder={{ uri: cdnBlur(url) }}`. Если ссылку нельзя
 * оптимизировать — вернёт undefined (плейсхолдера не будет, и это ок).
 */
export function cdnBlur(url: string | null | undefined): string | undefined {
  if (!canOptimize(url)) return undefined;
  const src = unwrap(url);
  return `${WESERV}${encodeSource(src)}&w=32&output=webp&q=30&blur=4`;
}
