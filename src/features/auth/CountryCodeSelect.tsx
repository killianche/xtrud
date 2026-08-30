/**
 * Селектор страны для поля телефона (2026-05-20).
 *
 * UX: pill-кнопка слева от input. По тапу — bottom-sheet со списком стран.
 * Дефолт — Россия (+7). Список фокусирован на близкие к Ингушетии страны:
 * РФ, Беларусь, Казахстан, Узбекистан, Армения, Грузия, Турция, ОАЭ — это
 * 95% real-world кейсов. Остальные страны можно добавить позже.
 *
 * Поле phone в форме хранит только digits (без кода). Полный E.164-номер
 * собирается на submit: `country.dial + digits`.
 *
 * 2026-05-27: эмодзи-флаги (🇷🇺/🇰🇿/...) заменены на SVG-флаги через flagcdn.com.
 * Эмодзи нарушали правило «никаких эмодзи в UI» из CLAUDE.md — на разных
 * платформах рендерились по-разному (Apple emoji vs Twemoji vs Google Noto)
 * и выпадали из Vercel-эстетики. CDN — тот же подход что Iconify для иконок
 * категорий (см. docs/ICONS.md): простой URL, кеш, fallback пустой.
 */

import { Image } from "expo-image";
import { CaretDown, Check } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useThemeColors } from "@/lib/use-theme-color";

/** URL флага страны (PNG из flagcdn.com). w40 даёт ~40×27px — достаточно
 *  для chip-display 20×14 и list-row 28×20. */
function flagUrl(code: string): string {
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

export interface Country {
  /** ISO-3166 alpha-2 (для будущей i18n + флаг через flagcdn.com). */
  code: string;
  /** Дисплейное название. */
  name: string;
  /** Телефонный код страны без +, например "7" или "375". */
  dial: string;
  /** Ожидаемая длина номера ПОСЛЕ кода страны (без знака +). */
  digitsLength: number;
}

export const COUNTRIES: Country[] = [
  { code: "RU", name: "Россия", dial: "7", digitsLength: 10 },
  { code: "KZ", name: "Казахстан", dial: "7", digitsLength: 10 },
  { code: "BY", name: "Беларусь", dial: "375", digitsLength: 9 },
  { code: "UZ", name: "Узбекистан", dial: "998", digitsLength: 9 },
  { code: "AM", name: "Армения", dial: "374", digitsLength: 8 },
  { code: "GE", name: "Грузия", dial: "995", digitsLength: 9 },
  { code: "TR", name: "Турция", dial: "90", digitsLength: 10 },
  { code: "AE", name: "ОАЭ", dial: "971", digitsLength: 9 },
  { code: "DE", name: "Германия", dial: "49", digitsLength: 11 },
  { code: "US", name: "США", dial: "1", digitsLength: 10 },
];

/** Дефолтная страна — Россия. */
export const DEFAULT_COUNTRY: Country = COUNTRIES[0] ?? {
  code: "RU",
  name: "Россия",
  dial: "7",
  digitsLength: 10,
};

interface CountryCodeSelectProps {
  selected: Country;
  onSelect: (country: Country) => void;
  disabled?: boolean;
}

export function CountryCodeSelect({ selected, onSelect, disabled }: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const tc = useThemeColors(["mute", "accent"]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Код страны: ${selected.name}, +${selected.dial}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        // min-h, не h: сидит в одном ряду с полем номера
        // (app/(auth)/register.tsx), у которого больше нет
        // maxFontSizeMultiplier — обе фиксированные высоты должны расти
        // синхронно на AX-размерах, иначе ряд разъедется.
        className={`min-h-12 flex-row items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-3 ${
          disabled ? "opacity-50" : "active:bg-canvas-soft"
        }`}
      >
        <Image
          source={{ uri: flagUrl(selected.code) }}
          style={{ width: 22, height: 16, borderRadius: 2 }}
          contentFit="cover"
        />
        <AppText weight="semibold" className="text-body-md text-ink">
          +{selected.dial}
        </AppText>
        <CaretDown size={14} weight="bold" color={tc.mute} />
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Страна">
        <ScrollView showsVerticalScrollIndicator={false}>
          {COUNTRIES.map((country) => {
            const isSelected = country.code === selected.code;
            return (
              <Pressable
                key={country.code}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onSelect(country);
                  setOpen(false);
                }}
                className="min-h-14 flex-row items-center gap-3 px-6 active:bg-canvas-soft"
              >
                <Image
                  source={{ uri: flagUrl(country.code) }}
                  style={{ width: 28, height: 20, borderRadius: 2 }}
                  contentFit="cover"
                />
                <View className="flex-1">
                  <AppText weight="semibold" className="text-body-md text-ink">
                    {country.name}
                  </AppText>
                  <AppText weight="mono" className="text-mono-caption text-mute">
                    +{country.dial}
                  </AppText>
                </View>
                {isSelected ? <Check size={20} weight="bold" color={tc.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
