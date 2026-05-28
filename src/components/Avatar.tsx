/**
 * Avatar — кружок с фото или инициалами-fallback.
 *
 * Паттерн как у LinkedIn / Notion / Cal.com:
 * - Есть `url` → expo-image с background placeholder
 *   Если загрузка фейлится (Safari CORS / 404 / тайм-аут) → onError
 *   переключает на инициалы/иконку. Без этого fallback в Safari оставался
 *   пустой кружок bg-surface-2 — выглядело как «фото не загружается».
 * - Нет `url`, есть `name` → инициалы (1-2 буквы) на детерминированном цвете по seed
 * - Нет ни url ни name → нейтральный круг с иконкой `User` (без жёлтых точек и пастелей)
 *
 * Цвет seed-based, чтобы у одного и того же юзера всегда тот же фон даже
 * без аватара. Палитра — приглушённые tailwind-100 (Notion / Linear / Google
 * Workspace стиль), с тёмным текстом #1f2937 (slate-800) для AA-контраста 7+.
 *
 * 2026-05-27: палитра приведена с tailwind-200 (amber/pink/orange — кричало)
 * на tailwind-100 (нейтрально-приглушённое). Раньше «жёлтый кричащий аватар»
 * выпадал из Vercel-палитры; новая шкала ближе к десатурированным нейтральным
 * с лёгким оттенком, как у Notion-членов команды.
 */

import { Image, type ImageContentFit } from "expo-image";
import { User } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { realAvatarUrl } from "@/lib/avatar";
import { useThemeColors } from "@/lib/use-theme-color";

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";

interface AvatarProps {
  url?: string | null;
  /** Отображаемое имя — берём первую букву first + last (или одну если 1 слово). */
  name?: string | null;
  /** Стабильный seed для цвета placeholder (обычно user.id). */
  seed?: string | null;
  size?: AvatarSize;
  /** expo-image content-fit; по умолчанию `cover`. */
  contentFit?: ImageContentFit;
}

const SIZE_MAP: Record<AvatarSize, { px: number; text: string }> = {
  xs: { px: 24, text: "text-[10px]" },
  sm: { px: 32, text: "text-[12px]" },
  md: { px: 44, text: "text-[15px]" },
  lg: { px: 64, text: "text-[20px]" },
  xl: { px: 96, text: "text-[30px]" },
};

// Приглушённые фоны (tailwind-100) + тёмный текст #1f2937 → AA-контраст 7+.
// Стиль Notion / Linear / Google Workspace: нейтрально-десатурированные с
// лёгким оттенком, никаких кричащих amber/pink/orange.
const PLACEHOLDER_PALETTE = [
  "#f1f5f9", // slate-100 — холодно-нейтральный серый
  "#e7e5e4", // stone-200 — тёпло-нейтральный серый
  "#dbeafe", // blue-100 — очень светлый синий
  "#d1fae5", // emerald-100 — мягкий зелёный
  "#fce7f3", // pink-100 — приглушённый розовый
  "#fef3c7", // amber-100 — мягкий бежевый (вместо кричащего amber-200)
  "#e0e7ff", // indigo-100 — приглушённый лавандовый
  "#ede9fe", // violet-100 — приглушённый сиреневый
];

export function Avatar({ url, name, seed, size = "md", contentFit = "cover" }: AvatarProps) {
  const dims = SIZE_MAP[size];
  const initials = useMemo(() => extractInitials(name), [name]);
  const bgColor = useMemo(() => pickColor(seed ?? name ?? ""), [seed, name]);
  const tc = useThemeColors(["surface-2", "muted"]);
  // Реальное фото = только загрузка в Storage. DiceBear-заглушки → null →
  // показываем инициалы (решение владельца 2026-05-23, src/lib/avatar.ts).
  const resolvedUrl = useMemo(() => realAvatarUrl(url), [url]);
  // Safari-fallback: см. шапку файла. При смене url сбрасываем флаг,
  // чтобы новая попытка загрузки не была заблокирована предыдущей ошибкой.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [resolvedUrl]);

  if (resolvedUrl && !imageFailed) {
    return (
      <View
        style={{ width: dims.px, height: dims.px, borderRadius: dims.px / 2 }}
        className="overflow-hidden bg-surface-2"
      >
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: "100%", height: "100%" }}
          contentFit={contentFit}
          transition={150}
          onError={() => setImageFailed(true)}
          priority="high"
        />
      </View>
    );
  }

  // Нет имени — нейтральный кружок с User-иконкой (без пастелей и спецсимволов).
  if (!initials) {
    return (
      <View
        style={{
          width: dims.px,
          height: dims.px,
          borderRadius: dims.px / 2,
          backgroundColor: tc["surface-2"],
        }}
        className="items-center justify-center"
      >
        <User size={dims.px * 0.5} weight="bold" color={tc.muted} />
      </View>
    );
  }

  return (
    <View
      style={{
        width: dims.px,
        height: dims.px,
        borderRadius: dims.px / 2,
        backgroundColor: bgColor,
      }}
      className="items-center justify-center"
    >
      <AppText weight="semibold" className={`${dims.text} text-slate-800`}>
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
    const word = parts[0];
    if (!word) return "";
    return word.slice(0, 1).toUpperCase();
  }
  const first = parts[0]?.slice(0, 1) ?? "";
  const last = parts[parts.length - 1]?.slice(0, 1) ?? "";
  return (first + last).toUpperCase();
}

function pickColor(seed: string): string {
  if (!seed) {
    return PLACEHOLDER_PALETTE[0] as string;
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % PLACEHOLDER_PALETTE.length;
  return PLACEHOLDER_PALETTE[idx] as string;
}
