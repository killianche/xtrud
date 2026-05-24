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
 */

import { CaretDown, Check } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { BottomSheet } from "@/components/ui";
import { useThemeColors } from "@/lib/use-theme-color";

export interface Country {
  /** ISO-3166 alpha-2 (для будущей i18n). */
  code: string;
  /** Дисплейное название. */
  name: string;
  /** Телефонный код страны без +, например "7" или "375". */
  dial: string;
  /** Эмоджи-флаг. */
  flag: string;
  /** Ожидаемая длина номера ПОСЛЕ кода страны (без знака +). */
  digitsLength: number;
}

export const COUNTRIES: Country[] = [
  { code: "RU", name: "Россия", dial: "7", flag: "🇷🇺", digitsLength: 10 },
  { code: "KZ", name: "Казахстан", dial: "7", flag: "🇰🇿", digitsLength: 10 },
  { code: "BY", name: "Беларусь", dial: "375", flag: "🇧🇾", digitsLength: 9 },
  { code: "UZ", name: "Узбекистан", dial: "998", flag: "🇺🇿", digitsLength: 9 },
  { code: "AM", name: "Армения", dial: "374", flag: "🇦🇲", digitsLength: 8 },
  { code: "GE", name: "Грузия", dial: "995", flag: "🇬🇪", digitsLength: 9 },
  { code: "TR", name: "Турция", dial: "90", flag: "🇹🇷", digitsLength: 10 },
  { code: "AE", name: "ОАЭ", dial: "971", flag: "🇦🇪", digitsLength: 9 },
  { code: "DE", name: "Германия", dial: "49", flag: "🇩🇪", digitsLength: 11 },
  { code: "US", name: "США", dial: "1", flag: "🇺🇸", digitsLength: 10 },
];

/** Дефолтная страна — Россия. */
export const DEFAULT_COUNTRY: Country = COUNTRIES[0]!;

interface CountryCodeSelectProps {
  selected: Country;
  onSelect: (country: Country) => void;
  disabled?: boolean;
}

export function CountryCodeSelect({
  selected,
  onSelect,
  disabled,
}: CountryCodeSelectProps) {
  const [open, setOpen] = useState(false);
  const tc = useThemeColors(["mute", "accent"]);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Код страны: ${selected.name}, +${selected.dial}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`h-12 flex-row items-center gap-2 rounded-md border border-hairline bg-canvas px-3 ${
          disabled ? "opacity-50" : "active:bg-canvas-soft"
        }`}
      >
        <AppText className="text-body-md">{selected.flag}</AppText>
        <AppText weight="semibold" className="text-body-md text-ink">
          +{selected.dial}
        </AppText>
        <CaretDown size={14} weight="bold" color={tc.mute} />
      </Pressable>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Страна"
      >
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
                className="h-14 flex-row items-center gap-3 px-6 active:bg-canvas-soft"
              >
                <AppText className="text-title-md">{country.flag}</AppText>
                <View className="flex-1">
                  <AppText weight="semibold" className="text-body-md text-ink">
                    {country.name}
                  </AppText>
                  <AppText weight="mono" className="text-mono-caption text-mute">
                    +{country.dial}
                  </AppText>
                </View>
                {isSelected ? (
                  <Check size={20} weight="bold" color={tc.accent} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
