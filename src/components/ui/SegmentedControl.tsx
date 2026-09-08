/**
 * SegmentedControl — переключатель контекста в закреплённой шапке вкладки
 * («Как клиент / Как мастер», «Найти специалиста / Я специалист»). Один
 * компонент для всех вкладок — одинаковый вид (DECISION владельца 2026-09-08:
 * «в специалистах такой же переключатель, как в моих заданиях»).
 *
 * Цвет активного сегмента: accent — клиентский контекст, primary (ink) —
 * контекст специалиста (DECISION владельца 2026-09-06: две роли — два цвета).
 */

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { hapticSelection } from "@/lib/haptics";

export interface SegmentItem<T extends string> {
  id: T;
  label: string;
  /** Счётчик после подписи; null/0 — не показывается. */
  count?: number | null;
  tone?: "accent" | "primary";
}

export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<SegmentItem<T>>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <View className="mx-4 mb-3 flex-row rounded-xl bg-canvas-soft p-1">
      {items.map((item) => {
        const active = value === item.id;
        const title =
          item.count != null && item.count > 0 ? `${item.label} · ${item.count}` : item.label;
        const tone = item.tone ?? "accent";
        const activeClass = tone === "primary" ? "bg-primary" : "bg-accent";
        const activeText = tone === "primary" ? "text-on-primary" : "text-on-accent";
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityLabel={title}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (active) return;
              hapticSelection();
              onChange(item.id);
            }}
            className={`min-h-12 flex-1 items-center justify-center rounded-lg ${
              active ? activeClass : ""
            }`}
          >
            <AppText
              weight="semibold"
              className={`text-body-md ${active ? activeText : "text-mute"}`}
            >
              {title}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
