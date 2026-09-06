/**
 * Полоса ближайших дат — как выбор дня в TaskRabbit: день недели и число в
 * капсулах, листается горизонтально, выбранная — в фирменном цвете.
 * Только будущие даты; без календаря на месяц — задание на «через полгода»
 * здесь не размещают.
 */

import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { hapticSelection } from "@/lib/haptics";
import { upcomingDates } from "./steps";

const DAYS = 30;

function parts(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${iso}T00:00:00`);
  return {
    weekday: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(d),
    day: String(d.getDate()),
    month: new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(d).replace(".", ""),
  };
}

export function DateStrip({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (iso: string) => void;
}) {
  const dates = upcomingDates(DAYS);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 24 }}
    >
      {dates.map((iso, i) => {
        const p = parts(iso);
        const selected = iso === value;
        const label = i === 0 ? "Сегодня" : i === 1 ? "Завтра" : p.weekday;
        return (
          <Pressable
            key={iso}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}, ${p.day} ${p.month}`}
            onPress={() => {
              hapticSelection();
              onChange(iso);
            }}
            className={`min-w-[64px] items-center rounded-2xl px-3 py-2.5 ${
              selected ? "bg-accent" : "bg-canvas"
            }`}
          >
            <AppText className={`text-ios-footnote ${selected ? "text-on-accent" : "text-mute"}`}>
              {label}
            </AppText>
            <AppText
              weight="semibold"
              className={`text-ios-title2 ${selected ? "text-on-accent" : "text-ink"}`}
            >
              {p.day}
            </AppText>
            <AppText className={`text-ios-footnote ${selected ? "text-on-accent" : "text-mute"}`}>
              {p.month}
            </AppText>
          </Pressable>
        );
      })}
      <View className="w-2" />
    </ScrollView>
  );
}
