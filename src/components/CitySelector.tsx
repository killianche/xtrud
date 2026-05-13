/**
 * CitySelector — chip-кнопка "Город ▾" + bottom-sheet со списком городов.
 *
 * Состояние города пока хранится в Zustand store (см. ниже). Когда добавится
 * таблица `cities` в Supabase + Yandex Maps геолокация — заменим список.
 *
 * Использование:
 *   <CitySelector />   // chip с текущим городом, тап открывает sheet
 */

import { ChevronDown, Check, MapPin } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AppText } from "@/components/AppText";
import { BottomSheet, Chip } from "@/components/ui";
import { storage } from "@/lib/storage";
import { useThemeColors } from "@/lib/use-theme-color";

/** Города Республики Ингушетия (старт). Расширяется при экспансии на СКФО. */
export const CITIES = [
  { id: "magas", name: "Магас" },
  { id: "nazran", name: "Назрань" },
  { id: "sunzha", name: "Сунжа" },
  { id: "malgobek", name: "Малгобек" },
  { id: "karabulak", name: "Карабулак" },
] as const;

export type CityId = (typeof CITIES)[number]["id"];

interface CityState {
  cityId: CityId;
  setCityId: (id: CityId) => void;
}

export const useCityStore = create<CityState>()(
  persist(
    (set) => ({
      cityId: "magas",
      setCityId: (id) => set({ cityId: id }),
    }),
    {
      name: "xtrud-city",
      version: 1,
      storage: createJSONStorage(() => storage),
    },
  ),
);

export function getCityName(id: CityId): string {
  return CITIES.find((c) => c.id === id)?.name ?? "Магас";
}

export function CitySelector() {
  const cityId = useCityStore((s) => s.cityId);
  const setCityId = useCityStore((s) => s.setCityId);
  const [open, setOpen] = useState(false);
  const tc = useThemeColors(["ink", "mute", "primary"]);

  return (
    <>
      <Chip
        variant="outline"
        size="md"
        onPress={() => setOpen(true)}
        leftIcon={<MapPin size={14} strokeWidth={1.75} color={tc.mute} />}
        rightIcon={<ChevronDown size={14} strokeWidth={1.75} color={tc.mute} />}
      >
        {getCityName(cityId)}
      </Chip>

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Выберите город"
        subtitle="Мастеров покажем именно в нём"
      >
        <View style={{ gap: 4 }}>
          {CITIES.map((c) => {
            const isSelected = c.id === cityId;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => {
                  setCityId(c.id);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 14,
                  paddingHorizontal: 4,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <AppText
                  weight={isSelected ? "semibold" : "regular"}
                  style={{ color: tc.ink, fontSize: 16, lineHeight: 24 }}
                >
                  {c.name}
                </AppText>
                {isSelected ? <Check size={20} strokeWidth={2} color={tc.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}
