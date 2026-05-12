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
  maxDimension: 1600,
  compress: 0.85,
  format: ImageManipulator.SaveFormat.JPEG as const,
  contentType: "image/jpeg",
  extension: "jpg",
};

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
): Promise<{ uri: string; width: number; height: number }> {
  const resized = calcResizedDimensions(source, { maxDimension: preset.maxDimension });
  const actions: ImageManipulator.Action[] = resized ? [{ resize: resized }] : [];

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
