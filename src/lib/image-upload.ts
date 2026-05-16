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
import { Alert } from "react-native";
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

function maybeCropAction(
  width: number,
  height: number,
): ImageManipulator.Action | null {
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
  bucket: "avatars" | "portfolio";
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
  bucket: "avatars" | "portfolio";
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

/** Multi-pick из галереи: до `maxCount` фото за раз. Камера не поддерживает
 *  multi-select, поэтому всегда library. По фидбэку user 2026-05-15:
 *  «добавлять до 50 фотографий», «удобно работать». */
export async function pickMultiplePortfolioImages(
  maxCount: number,
): Promise<PickedImage[]> {
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
  return result.assets.map((a) => ({
    uri: a.uri,
    width: a.width,
    height: a.height,
  }));
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
): Promise<
  Array<{ ok: true; path: string; publicUrl: string } | { ok: false; error: string }>
> {
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

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
