/**
 * Image upload utilities — выбор/съёмка → resize → upload в Supabase Storage.
 *
 * Дизайн:
 * - Клиентский resize обязателен (экономия трафика + RLS size-limit как safety-net).
 * - Загружаем как ArrayBuffer (Supabase-recommended для RN, безопасно с FormData
 *   bugs в react-native fetch+blob).
 * - Public URL отдаём вместе с server-side version-tag для cache-busting.
 */

import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Alert, Platform } from "react-native";
import { calcResizedDimensions } from "./image-resize";
import { supabase } from "./supabase";

// ============================================================================
// Resize presets — единые правила для UI
// ============================================================================

export const AVATAR_PRESET = {
  maxDimension: 512,
  compress: 0.82,
  format: ImageManipulator.SaveFormat.JPEG as const,
  contentType: "image/jpeg",
  extension: "jpg",
};

export const PORTFOLIO_PRESET = {
  // 2026-05-15: 1600→1920 по фидбэку «добавлять с определённым разрешением».
  // 1920px — стандарт detail-image у Airbnb/Behance, баланс качества/веса
  // (≈100-150 KB на JPEG q=0.82). Старые загрузки не пересжимаются.
  maxDimension: 1920,
  compress: 0.82,
  format: ImageManipulator.SaveFormat.JPEG as const,
  contentType: "image/jpeg",
  extension: "jpg",
};

/** Aspect-ratio guard для портфолио: если кадр сильно "кривой" (вытянутая
 *  полоска или экстремально-узкий), центрально обрезаем к 4:5. Это даёт
 *  Wildberries-style консистентный grid у клиента и убирает шум от
 *  случайных скриншотов/панорам. Фидбэк user 2026-05-15: «если разрешения
 *  кривые, обрезать». */
const PORTFOLIO_MIN_ASPECT = 0.5; // 1:2 — всё что у́же → обрезать
const PORTFOLIO_MAX_ASPECT = 2.0; // 2:1 — всё что шире → обрезать
const PORTFOLIO_TARGET_ASPECT = 4 / 5; // 0.8 — после crop'а так

function maybeCropAction(width: number, height: number): ImageManipulator.Action | null {
  if (width <= 0 || height <= 0) return null;
  const aspect = width / height;
  if (aspect >= PORTFOLIO_MIN_ASPECT && aspect <= PORTFOLIO_MAX_ASPECT) {
    return null;
  }
  // Целевое окно: width * PORTFOLIO_TARGET_ASPECT = height (вертикальный 4:5).
  // Не выходим за границы исходника.
  let targetW: number;
  let targetH: number;
  if (aspect > PORTFOLIO_MAX_ASPECT) {
    // слишком широкое → сужаем по высоте
    targetH = height;
    targetW = Math.round(height * PORTFOLIO_TARGET_ASPECT);
  } else {
    // слишком узкое → сужаем по высоте до target-aspect
    targetW = width;
    targetH = Math.round(width / PORTFOLIO_TARGET_ASPECT);
  }
  const originX = Math.max(0, Math.round((width - targetW) / 2));
  const originY = Math.max(0, Math.round((height - targetH) / 2));
  return {
    crop: {
      originX,
      originY,
      width: targetW,
      height: targetH,
    },
  };
}

export type ResizePreset = typeof AVATAR_PRESET;

// ============================================================================
// Picker — единая точка входа: камера/галерея/отмена
// ============================================================================

export type PickedImage = {
  uri: string;
  width: number;
  height: number;
};

export type PickSource = "camera" | "library";

/**
 * Показывает ActionSheet «Камера / Галерея / Отмена» и возвращает выбранное фото
 * либо null при отмене / отказе в правах.
 *
 * aspect=[1,1] для квадратной обрезки (аватары).
 */
export async function pickImage(opts: {
  aspect?: [number, number];
  title?: string;
}): Promise<PickedImage | null> {
  // На web Alert.alert с custom buttons не работает (react-native-web Alert
  // не поддерживает onPress callbacks — кнопки игнорируются). Поэтому
  // chooseSource() никогда не возвращает выбор, picker не запускается.
  // Sprint 2026-05-20: на web используем <input type="file"> напрямую —
  // браузер сам показывает системный picker (фото / файлы / drag-drop).
  if (Platform.OS === "web") {
    return await pickImageWeb();
  }

  const source = await chooseSource(opts.title);
  if (!source) return null;

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа к камере", "Разрешите доступ в настройках приложения.");
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: opts.aspect,
      quality: 1,
    });
    return extractAsset(result);
  }

  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Нет доступа к фото", "Разрешите доступ в настройках приложения.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: opts.aspect,
    quality: 1,
  });
  return extractAsset(result);
}

function chooseSource(title?: string): Promise<PickSource | null> {
  return new Promise((resolve) => {
    Alert.alert(title ?? "Выберите источник", undefined, [
      { text: "Камера", onPress: () => resolve("camera") },
      { text: "Галерея", onPress: () => resolve("library") },
      { text: "Отмена", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/**
 * Web picker через `<input type="file">`. Создаёт скрытый input, открывает
 * системный диалог выбора файла, читает выбранное изображение через
 * createObjectURL → возвращает PickedImage с реальными width/height
 * (через Image() для замера размеров до resize).
 *
 * Resolve(null) если пользователь отменил выбор (фокус вернулся на window
 * без change-event'а) или выбрал не-изображение.
 *
 * На web aspect-crop (1:1 / 4:3) не применяется — браузерный input не
 * умеет кропить. Кроп делается уже в resizeImage через ImageManipulator,
 * который умеет работать с blob URL'ами на web.
 */
function pickImageWeb(): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.top = "-9999px";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    // Браузеры не вызывают onchange при отмене диалога — но вызывают
    // 'cancel' event (новый стандарт, Chrome 113+) либо просто фокус
    // возвращается. Используем оба пути с timeout fallback.
    let settled = false;
    // 2026-05-29 фикс «фото не сохранилось»: как только пользователь выбрал
    // файл — выставляем changeStarted=true СИНХРОННО в начале change-handler'а
    // (до чтения размеров). Тогда focus-fallback ниже не «съест» выбор, даже
    // если большое фото читается дольше 500мс. Раньше: большое фото с телефона
    // декодировалось >500мс, focus-таймер успевал settle(null) первым — выбор
    // терялся, заказ/аватар сохранялся без фото. Подтверждено в браузере.
    let changeStarted = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    const settle = (value: PickedImage | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    input.addEventListener("change", () => {
      changeStarted = true;
      const file = input.files?.[0];
      if (!file) {
        settle(null);
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      // Получаем размеры через Image() — нужны для resize-расчётов.
      const img = new Image();
      img.onload = () => {
        settle({ uri: objectUrl, width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        Alert.alert("Не удалось прочитать изображение", "Попробуйте другой файл.");
        settle(null);
      };
      img.src = objectUrl;
    });

    // 'cancel' event — Chrome 113+ / Safari 17+. На старых браузерах
    // fallback ниже через focus-event срабатывает.
    input.addEventListener("cancel", () => settle(null));

    // Fallback: если пользователь закрыл диалог без выбора и change/cancel
    // не сработали, ловим возврат фокуса на window. Считаем отменой ТОЛЬКО
    // если change так и не начался (changeStarted=false). Если выбор начался —
    // не вмешиваемся, даже если фото читается долго: settle() сделает
    // change-handler. Окно 1200мс — на случай, если change приходит позже focus.
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      setTimeout(() => {
        if (!changeStarted) settle(null);
      }, 1200);
    };
    // Регистрируем focus-handler ПОСЛЕ клика — иначе он сработает на open.
    setTimeout(() => {
      window.addEventListener("focus", onFocus);
    }, 0);

    document.body.appendChild(input);
    input.click();
  });
}

function extractAsset(result: ImagePicker.ImagePickerResult): PickedImage | null {
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

// ============================================================================
// Resize
// ============================================================================

/**
 * Уменьшает изображение чтобы максимальная сторона ≤ preset.maxDimension,
 * сжимает в JPEG. Возвращает новый local URI.
 *
 * Использует ImageManipulator с одним resize-step — это самый дешёвый
 * способ нормализовать любое входное фото к нашим лимитам.
 */
export async function resizeImage(
  source: PickedImage,
  preset: ResizePreset,
  opts?: { applyAspectGuard?: boolean },
): Promise<{ uri: string; width: number; height: number }> {
  const actions: ImageManipulator.Action[] = [];
  // Aspect-guard (только для портфолио, opt-in) — крайне-широкие или
  // крайне-узкие фото центрально обрезаем к 4:5.
  if (opts?.applyAspectGuard) {
    const crop = maybeCropAction(source.width, source.height);
    if (crop) actions.push(crop);
  }
  const resized = calcResizedDimensions(source, { maxDimension: preset.maxDimension });
  if (resized) actions.push({ resize: resized });

  const result = await ImageManipulator.manipulateAsync(source.uri, actions, {
    compress: preset.compress,
    format: preset.format,
  });

  return { uri: result.uri, width: result.width, height: result.height };
}

// ============================================================================
// Upload primitives
// ============================================================================

/**
 * Читает local file URI как ArrayBuffer и загружает в указанный bucket/path.
 *
 * upsert=true для аватаров (overwrite по фиксированному пути {user_id}/avatar.jpg),
 * upsert=false для портфолио (уникальные пути с UUID).
 *
 * Возвращает public URL с cache-bust query (`?v=<timestamp>`) — обязательно
 * чтобы клиент не показывал старое фото из кэша после re-upload.
 */
export async function uploadImage(opts: {
  bucket: "avatars" | "portfolio" | "order-photos";
  path: string;
  localUri: string;
  contentType: string;
  upsert: boolean;
}): Promise<{ path: string; publicUrl: string }> {
  const arrayBuffer = await readAsArrayBuffer(opts.localUri);

  const { error } = await supabase.storage.from(opts.bucket).upload(opts.path, arrayBuffer, {
    contentType: opts.contentType,
    upsert: opts.upsert,
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(`Не удалось загрузить файл: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(opts.bucket).getPublicUrl(opts.path);

  return {
    path: opts.path,
    publicUrl: `${publicUrl}?v=${Date.now()}`,
  };
}

async function readAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Не удалось прочитать локальный файл (${response.status})`);
  }
  return await response.arrayBuffer();
}

export async function deleteFromBucket(opts: {
  bucket: "avatars" | "portfolio" | "order-photos";
  path: string;
}): Promise<void> {
  const { error } = await supabase.storage.from(opts.bucket).remove([opts.path]);
  if (error) {
    throw new Error(`Не удалось удалить файл: ${error.message}`);
  }
}

// ============================================================================
// High-level helpers
// ============================================================================

/**
 * Полный pipeline аватара: pick → resize → upload в {userId}/avatar.jpg.
 * Возвращает null если пользователь отменил выбор.
 */
export async function pickResizeUploadAvatar(userId: string): Promise<{
  path: string;
  publicUrl: string;
} | null> {
  const picked = await pickImage({ aspect: [1, 1], title: "Аватар" });
  if (!picked) return null;

  const resized = await resizeImage(picked, AVATAR_PRESET);
  return await uploadImage({
    bucket: "avatars",
    path: `${userId}/avatar.${AVATAR_PRESET.extension}`,
    localUri: resized.uri,
    contentType: AVATAR_PRESET.contentType,
    upsert: true,
  });
}

/**
 * Полный pipeline портфолио-фото: pick → resize → upload в {userId}/{uuid}.jpg.
 * Возвращает null если отменили.
 *
 * aspect [4, 3] — Thumbtack/Airbnb-стандарт для work-фото. Минимальное
 * разрешение 1200×900 проверяется опционально (см. Alert ниже).
 */
export const PORTFOLIO_MIN_WIDTH = 1200;
export const PORTFOLIO_MIN_HEIGHT = 900;

export async function pickResizeUploadPortfolio(userId: string): Promise<{
  path: string;
  publicUrl: string;
} | null> {
  const picked = await pickImage({ aspect: [4, 3], title: "Фото работы" });
  if (!picked) return null;

  // Предупреждение о слабом разрешении — non-blocking.
  if (picked.width < PORTFOLIO_MIN_WIDTH || picked.height < PORTFOLIO_MIN_HEIGHT) {
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        "Фото небольшое",
        `Рекомендуем минимум ${PORTFOLIO_MIN_WIDTH}×${PORTFOLIO_MIN_HEIGHT} пикселей — иначе работа будет выглядеть размыто. Продолжить?`,
        [
          { text: "Отмена", style: "cancel", onPress: () => resolve(false) },
          { text: "Продолжить", onPress: () => resolve(true) },
        ],
      );
    });
    if (!proceed) return null;
  }

  const resized = await resizeImage(picked, PORTFOLIO_PRESET);
  const filename = `${randomId()}.${PORTFOLIO_PRESET.extension}`;
  return await uploadImage({
    bucket: "portfolio",
    path: `${userId}/${filename}`,
    localUri: resized.uri,
    contentType: PORTFOLIO_PRESET.contentType,
    upsert: false,
  });
}

function randomId(): string {
  // Не-крипто UUID-подобный id — для имени файла достаточно.
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Multi-pick + batch upload (портфолио)
// ============================================================================

/** Multi-pick из галереи для портфолио: до `maxCount` фото за раз.
 *
 *  2026-05-24: теперь делегирует общему `pickMultipleImages` — у того есть
 *  отдельная ВЕБ-ветка (`<input type="file" multiple>`) с корректной обработкой
 *  отмены и замером размеров, и ограничение `slice(0, maxCount)`. Раньше эта
 *  функция вызывала `launchImageLibraryAsync` напрямую — на сайте это работало
 *  ненадёжно (как у заказов до унификации). Камера multi-select не умеет,
 *  поэтому всегда галерея/файлы. */
export async function pickMultiplePortfolioImages(maxCount: number): Promise<PickedImage[]> {
  return pickMultipleImages(maxCount);
}

/** Одно фото для портфолио — resize + crop + upload. Используется batch'ем
 *  ниже, но можно вызвать одиночно (для legacy одно-фото flow). */
export async function processAndUploadPortfolioPhoto(
  userId: string,
  picked: PickedImage,
): Promise<{ path: string; publicUrl: string }> {
  const resized = await resizeImage(picked, PORTFOLIO_PRESET, {
    applyAspectGuard: true,
  });
  const filename = `${randomId()}.${PORTFOLIO_PRESET.extension}`;
  return await uploadImage({
    bucket: "portfolio",
    path: `${userId}/${filename}`,
    localUri: resized.uri,
    contentType: PORTFOLIO_PRESET.contentType,
    upsert: false,
  });
}

/** Batch upload портфолио. Параллельно по `concurrency` штук за раз —
 *  чтобы не забивать сеть и не превышать Supabase Storage rate-limits.
 *  Возвращает массив результатов в порядке входа (включая ошибки). */
export async function uploadPortfolioBatch(
  userId: string,
  items: PickedImage[],
  opts?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Array<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>> {
  const concurrency = opts?.concurrency ?? 3;
  const results: Array<
    { ok: true; path: string; publicUrl: string } | { ok: false; error: string }
  > = new Array(items.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      if (!item) return;
      try {
        const r = await processAndUploadPortfolioPhoto(userId, item);
        results[i] = { ok: true, ...r };
      } catch (e) {
        results[i] = {
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
      done++;
      opts?.onProgress?.(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ============================================================================
// Order photos — мульти-выбор (cross-platform) + batch upload в order-photos
//
// Фото заказа (до 5) грузятся в bucket order-photos в момент ПУБЛИКАЦИИ заказа
// (не сразу при выборе). Why: к моменту publish мы гарантированно знаем userId
// (для анона он появляется после JIT-signup), путь {userId}/{uuid}.jpg проходит
// RLS, и нет «осиротевших» файлов при отмене формы. В форме до публикации
// показываются локальные миниатюры (мгновенно), сама загрузка — при «Опубликовать».
// ============================================================================

/** Web-вариант мульти-выбора через <input type="file" multiple>. Возвращает до
 *  maxCount изображений с реальными размерами. Resolve([]) при отмене. */
function pickMultipleImagesWeb(maxCount: number): Promise<PickedImage[]> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve([]);
      return;
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.style.position = "fixed";
    input.style.top = "-9999px";
    input.style.left = "-9999px";
    input.style.opacity = "0";

    let settled = false;
    // 2026-05-29 фикс «фото заказа не сохраняются»: changeStarted=true
    // выставляем СИНХРОННО при выборе файлов, до измерения размеров. Иначе
    // focus-fallback (ниже) через 500мс делал settle([]) РАНЬШЕ, чем
    // успевало декодироваться большое фото — выбор пропадал, заказ
    // сохранялся с пустым списком фото. Воспроизведено в браузере: при
    // чтении >500мс возвращался "focus-empty" вместо файла.
    let changeStarted = false;
    const cleanup = () => {
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    const settle = (value: PickedImage[]) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    input.addEventListener("change", async () => {
      changeStarted = true;
      const files = Array.from(input.files ?? []).slice(0, maxCount);
      if (files.length === 0) {
        settle([]);
        return;
      }
      const measured = await Promise.all(
        files.map(
          (file) =>
            new Promise<PickedImage | null>((res) => {
              const objectUrl = URL.createObjectURL(file);
              const img = new Image();
              img.onload = () =>
                res({ uri: objectUrl, width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                res(null);
              };
              img.src = objectUrl;
            }),
        ),
      );
      settle(measured.filter((m): m is PickedImage => m !== null));
    });

    input.addEventListener("cancel", () => settle([]));
    const onFocus = () => {
      window.removeEventListener("focus", onFocus);
      // Отмена — только если выбор так и не начался. Долгое чтение большого
      // фото больше не теряется (см. комментарий к changeStarted выше).
      setTimeout(() => {
        if (!changeStarted) settle([]);
      }, 1200);
    };
    setTimeout(() => {
      window.addEventListener("focus", onFocus);
    }, 0);

    document.body.appendChild(input);
    input.click();
  });
}

/** Cross-platform мульти-выбор изображений (до maxCount). На web —
 *  <input multiple>, на мобайле — системный пикер галереи с selectionLimit. */
export async function pickMultipleImages(maxCount: number): Promise<PickedImage[]> {
  if (maxCount <= 0) return [];
  if (Platform.OS === "web") {
    return pickMultipleImagesWeb(maxCount);
  }
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Нет доступа к фото", "Разрешите доступ в настройках приложения.");
    return [];
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: maxCount,
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, maxCount).map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
  }));
}

/** Один кадр заказа → resize (1920px) → upload в order-photos/{userId}/{uuid}.jpg.
 *  Без жёсткого aspect-crop: в карусели заказа фото показываются через cover. */
async function processAndUploadOrderPhoto(
  userId: string,
  picked: PickedImage,
): Promise<{ path: string; publicUrl: string }> {
  const resized = await resizeImage(picked, PORTFOLIO_PRESET);
  const filename = `${randomId()}.${PORTFOLIO_PRESET.extension}`;
  return await uploadImage({
    bucket: "order-photos",
    path: `${userId}/${filename}`,
    localUri: resized.uri,
    contentType: PORTFOLIO_PRESET.contentType,
    upsert: false,
  });
}

/** Batch upload фото заказа. Сохраняет порядок входа (обложка = items[0]).
 *  Возвращает результаты по индексам: { ok, publicUrl } | { ok:false, error }. */
export async function uploadOrderPhotosBatch(
  userId: string,
  items: PickedImage[],
  opts?: {
    concurrency?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<Array<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>> {
  const concurrency = opts?.concurrency ?? 3;
  const results: Array<
    { ok: true; path: string; publicUrl: string } | { ok: false; error: string }
  > = new Array(items.length);
  let done = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      const item = items[i];
      if (!item) return;
      try {
        const r = await processAndUploadOrderPhoto(userId, item);
        results[i] = { ok: true, ...r };
      } catch (e) {
        results[i] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      done++;
      opts?.onProgress?.(done, items.length);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
