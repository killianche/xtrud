/**
 * Avatar v2 — кружок с фото / инициалами / fallback-иконкой User.
 *
 * Логика fallback'ов (по убыванию приоритета):
 *   1. `url` → expo-image с placeholder
 *   2. инициалы из `name` → детерминированный пастельный фон по `seed`
 *   3. ни url, ни name → нейтральный кружок canvas-soft-2 + Lucide User в mute
 *
 * Дизайн под DESIGN.md (Vercel-based):
 *   - Размеры: xs 24 / sm 32 / md 44 / lg 64 / xl 96
 *   - Шрифт инициалов: Geist 600 SemiBold (через AppText weight="semibold")
 *   - Цвет инициалов: ink (тёмный на пастели, AA-контраст)
 *   - Border-radius: dims/2 (круг)
 *   - Пастельная палитра seed — `badge-*` токены (детерминированно через hash)
 */

import { Image, type ImageContentFit } from "expo-image";
import { User } from "lucide-react-native";
import { useMemo } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  url?: string | null;
  /** Имя пользователя — берём первую букву first + last (или одну если 1 слово). */
  name?: string | null;
  /** Стабильный seed для seed-цвета (обычно user.id). */
  seed?: string | null;
  size?: AvatarSize;
  contentFit?: ImageContentFit;
}

const SIZE_MAP: Record<AvatarSize, { px: number; textSize: number }> = {
  xs: { px: 24, textSize: 10 },
  sm: { px: 32, textSize: 12 },
  md: { px: 44, textSize: 15 },
  lg: { px: 64, textSize: 20 },
  xl: { px: 96, textSize: 30 },
};

// Пастельные фоны — токены badge-*, везде с одинаково тёмным текстом (ink, AA-контраст).
const PALETTE_KEYS = [
  "badge-amber",
  "badge-emerald",
  "badge-sky",
  "badge-violet",
  "badge-pink",
  "badge-orange",
] as const;

export function Avatar({ url, name, seed, size = "md", contentFit = "cover" }: AvatarProps) {
  const dims = SIZE_MAP[size];
  const initials = useMemo(() => extractInitials(name), [name]);
  const paletteKey = useMemo(() => pickPaletteKey(seed ?? name ?? ""), [seed, name]);
  const tc = useThemeColors([
    "canvas-soft-2",
    "mute",
    "ink",
    "badge-amber",
    "badge-emerald",
    "badge-sky",
    "badge-violet",
    "badge-pink",
    "badge-orange",
  ]);

  if (url) {
    return (
      <View
        style={{
          width: dims.px,
          height: dims.px,
          borderRadius: dims.px / 2,
          overflow: "hidden",
          backgroundColor: tc["canvas-soft-2"],
        }}
      >
        <Image
          source={{ uri: url }}
          style={{ width: "100%", height: "100%" }}
          contentFit={contentFit}
          transition={150}
        />
      </View>
    );
  }

  // Нет имени — нейтральный кружок с User-иконкой.
  if (!initials) {
    return (
      <View
        style={{
          width: dims.px,
          height: dims.px,
          borderRadius: dims.px / 2,
          backgroundColor: tc["canvas-soft-2"],
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <User size={dims.px * 0.5} strokeWidth={1.75} color={tc.mute} />
      </View>
    );
  }

  // Есть инициалы — пастельный seed-фон + ink текст.
  return (
    <View
      style={{
        width: dims.px,
        height: dims.px,
        borderRadius: dims.px / 2,
        backgroundColor: tc[paletteKey],
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <AppText
        weight="semibold"
        style={{ color: tc.ink, fontSize: dims.textSize, lineHeight: dims.textSize + 2 }}
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

function pickPaletteKey(seed: string): (typeof PALETTE_KEYS)[number] {
  if (!seed) return PALETTE_KEYS[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PALETTE_KEYS.length;
  return PALETTE_KEYS[idx] ?? PALETTE_KEYS[0];
}
