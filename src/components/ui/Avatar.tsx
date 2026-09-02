/**
 * Avatar v2 — кружок с фото / инициалами / fallback-иконкой User.
 *
 * Логика fallback'ов (по убыванию приоритета):
 *   1. `url` → expo-image с placeholder
 *      Если загрузка фейлится (Safari + CORS / 404 / тайм-аут) → onError
 *      переключает на инициалы/иконку (см. пункты 2-3). Это критично для
 *      Safari, где expo-image без onError-fallback оставлял пустой кружок.
 *   2. инициалы из `name` → детерминированный пастельный фон по `seed`
 *   3. ни url, ни name → нейтральный кружок canvas-soft-2 + Lucide User в mute
 *
 * Цвета через NativeWind className (CSS-var resolution).
 */

import { Image, type ImageContentFit } from "expo-image";
import { User } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { realAvatarUrl } from "@/lib/avatar";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  seed?: string | null;
  size?: AvatarSize;
  contentFit?: ImageContentFit;
}

const SIZE_MAP: Record<AvatarSize, { px: number; textSize: number; iconSize: number }> = {
  xs: { px: 24, textSize: 10, iconSize: 12 },
  sm: { px: 32, textSize: 12, iconSize: 16 },
  md: { px: 44, textSize: 15, iconSize: 22 },
  lg: { px: 64, textSize: 20, iconSize: 32 },
  xl: { px: 96, textSize: 30, iconSize: 48 },
};

// Пастельные фоны через Tailwind classes (CSS-var через --badge-*).
const PALETTE_CLASSES = [
  "bg-badge-amber",
  "bg-badge-emerald",
  "bg-badge-sky",
  "bg-badge-violet",
  "bg-badge-pink",
  "bg-badge-orange",
] as const;

export function Avatar({ url, name, seed, size = "md", contentFit = "cover" }: AvatarProps) {
  const dims = SIZE_MAP[size];
  const initials = useMemo(() => extractInitials(name), [name]);
  const paletteClass = useMemo(() => pickPaletteClass(seed ?? name ?? ""), [seed, name]);
  const resolvedUrl = useMemo(() => normalizeAvatarUrl(url), [url]);
  // Safari-fallback: если фото не загрузилось (CORS / 404 / неподдерж. формат)
  // — переключаемся на инициалы/иконку. Сбрасываем state при смене URL,
  // чтобы новая попытка не была заблокирована предыдущей ошибкой.
  const [imageFailed, setImageFailed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: URL change intentionally resets the failed-image fallback
  useEffect(() => {
    setImageFailed(false);
  }, [resolvedUrl]);

  if (resolvedUrl && !imageFailed) {
    return (
      <View
        className="overflow-hidden bg-canvas-soft-2"
        style={{ width: dims.px, height: dims.px, borderRadius: dims.px / 2 }}
      >
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit={contentFit}
          transition={150}
          onError={() => setImageFailed(true)}
          // Аватары в списках мастеров — критичный визуальный элемент,
          // приоритет «high» поднимает их в очереди network-requests
          // (важно на Safari mobile с медленным 3G/4G).
          priority="high"
        />
      </View>
    );
  }

  // Нет имени — нейтральный кружок с User-иконкой.
  if (!initials) {
    return (
      <View
        className="bg-canvas-soft-2 items-center justify-center"
        style={{ width: dims.px, height: dims.px, borderRadius: dims.px / 2 }}
      >
        <User size={dims.iconSize} weight="bold" color="currentColor" className="text-mute" />
      </View>
    );
  }

  // Инициалы — пастельный seed-фон + ink текст.
  return (
    <View
      className={`${paletteClass} items-center justify-center`}
      style={{ width: dims.px, height: dims.px, borderRadius: dims.px / 2 }}
    >
      <AppText
        weight="semibold"
        className="text-ink"
        style={{ fontSize: dims.textSize, lineHeight: dims.textSize + 2 }}
      >
        {initials}
      </AppText>
    </View>
  );
}

function extractInitials(name?: string | null): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0]?.slice(0, 1).toUpperCase() ?? "";
  }
  const first = parts[0]?.slice(0, 1) ?? "";
  const last = parts[parts.length - 1]?.slice(0, 1) ?? "";
  return (first + last).toUpperCase();
}

// Любой `api.dicebear.com` URL — это сгенерированная заглушка (demo-fixture,
// seed-fallback), а не загруженное пользователем фото → возвращаем null, чтобы
// <Avatar> показал ИНИЦИАЛЫ (решение владельца 2026-05-23, см. src/lib/avatar.ts).
// Имя `normalizeAvatarUrl` сохранено для обратной совместимости импортов
// (master/[id]) — делегирует в единый realAvatarUrl.
export const normalizeAvatarUrl = realAvatarUrl;

function pickPaletteClass(seed: string): (typeof PALETTE_CLASSES)[number] {
  if (!seed) return PALETTE_CLASSES[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PALETTE_CLASSES.length;
  return PALETTE_CLASSES[idx] ?? PALETTE_CLASSES[0];
}
