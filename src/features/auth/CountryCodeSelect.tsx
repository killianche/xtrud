/**
 * Селектор страны для поля телефона (2026-05-20).
 *
 * UX: pill-кнопка слева от input. По тапу открывается отдельный route
 * `/country-select` с нативной iOS `formSheet`-модальностью
 * (`docs/IOS_FOUNDATION.md` §2.4) — раньше здесь был самописный
 * `BottomSheet` (full-screen `<Modal>`), теперь presentation/detents задаёт
 * `Stack.Screen` route'а (см. `app/(auth)/country-select.tsx`). Выбор
 * возвращается через `useCountrySelectStore`, этот компонент слушает store
 * через `useEffect` и вызывает `onSelect` — паттерн 1-в-1 с
 * `src/features/orders/LocationPicker.tsx`.
 *
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
import { useRouter } from "expo-router";
import { CaretDown } from "phosphor-react-native";
import { useEffect } from "react";
import { Pressable } from "react-native";
import { AppText } from "@/components/AppText";
import { useCountrySelectStore } from "@/features/auth/country-select-store";
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
  const router = useRouter();
  const tc = useThemeColors(["mute"]);

  // Слушаем store — когда пользователь выбрал страну на /country-select,
  // применяем в форму и обнуляем поле, чтобы следующий цикл не сработал
  // повторно (см. LocationPicker.tsx — тот же handshake).
  const result = useCountrySelectStore((s) => s.result);
  const setResult = useCountrySelectStore((s) => s.setResult);
  useEffect(() => {
    if (!result) return;
    const country = COUNTRIES.find((c) => c.code === result.value);
    if (country && country.code !== selected.code) onSelect(country);
    setResult(null);
  }, [result, selected.code, onSelect, setResult]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Код страны: ${selected.name}, +${selected.dial}`}
      disabled={disabled}
      onPress={() =>
        router.push({ pathname: "/country-select", params: { code: selected.code } } as never)
      }
      // min-h, не h: сидит в одном ряду с полем номера
      // (app/(auth)/register.tsx), у которого больше нет
      // maxFontSizeMultiplier — обе фиксированные высоты должны расти
      // синхронно на AX-размерах, иначе ряд разъедется.
      // Вид — как у Input size="lg" (стандарт auth-форм 2026-09-02): та же
      // высота 54, заливка canvas-soft, рамка 1.5 hairline-strong, радиус xl.
      className={`flex-row items-center gap-2 rounded-xl border-hairline-strong bg-canvas-soft px-3 ${
        disabled ? "opacity-50" : "active:bg-canvas-soft-2"
      }`}
      style={{ minHeight: 54, borderWidth: 1.5 }}
    >
      <Image
        source={{ uri: flagUrl(selected.code) }}
        style={{ width: 22, height: 16, borderRadius: 2 }}
        contentFit="cover"
      />
      <AppText weight="semibold" className="text-body-lg text-ink">
        +{selected.dial}
      </AppText>
      <CaretDown size={16} weight="bold" color={tc.mute} />
    </Pressable>
  );
}
