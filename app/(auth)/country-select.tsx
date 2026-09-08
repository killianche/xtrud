/**
 * /country-select — пикер страны для поля телефона на регистрации.
 *
 * Раньше жил как `BottomSheet` внутри `CountryCodeSelect` (см.
 * `src/features/auth/CountryCodeSelect.tsx`). Теперь — отдельный route с
 * нативной iOS `formSheet`-модальностью (`docs/IOS_FOUNDATION.md` §2.4):
 * выбор параметра → `formSheet` с `sheetAllowedDetents`, а не самописный
 * full-screen `<Modal>`.
 *
 * 10 стран — на обычном шрифте список короткий, но на accessibility-размерах
 * (Dynamic Type без искусственного капа) высота строк растёт, и сумма может не
 * поместиться в `fitToContents` (тот же риск, что у `category/city-select` —
 * там тоже ~10-13 строк). Поэтому — массив detents `[0.6, 1.0]` со скроллом
 * + `sheetExpandsWhenScrolledToEdge`, а не `fitToContents`.
 *
 * Handshake — `useCountrySelectStore` + `router.back()`; `CountryCodeSelect`
 * (триггер на форме регистрации) слушает store и применяет выбор.
 *
 * Живёт в `(auth)` группе (не `(details)`), т.к. `CountryCodeSelect`
 * используется только на `/(auth)/register` — свой вложенный `<Stack>`
 * из `app/(auth)/_layout.tsx`, доступен анонимно как и остальные auth-экраны.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AppText } from "@/components/AppText";
import { PickerSheetPage } from "@/components/ui";
import type { PickerOption } from "@/components/ui/PickerSheet";
import { COUNTRIES } from "@/features/auth/CountryCodeSelect";
import { useCountrySelectStore } from "@/features/auth/country-select-store";
import { flagEmoji } from "@/features/auth/flag-emoji";

function isCountryCode(value: string | undefined): boolean {
  return !!value && COUNTRIES.some((c) => c.code === value);
}

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.6, 1.0],
  sheetExpandsWhenScrolledToEdge: true,
  sheetGrabberVisible: true,
};

export default function CountrySelectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const setResult = useCountrySelectStore((s) => s.setResult);

  const currentCode = isCountryCode(params.code) ? (params.code as string) : COUNTRIES[0]?.code;

  const close = () => router.back();

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PickerSheetPage
        title="Страна"
        searchable={false}
        options={COUNTRIES.map<PickerOption>((c) => ({
          id: c.code,
          title: c.name,
          subtitle: `+${c.dial}`,
          icon: <AppText className="text-body-lg">{flagEmoji(c.code)}</AppText>,
        }))}
        selectedId={currentCode ?? null}
        onSelect={(id) => {
          setResult(id);
          close();
        }}
        onClose={close}
      />
    </>
  );
}
