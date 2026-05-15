// ThemeSwitcher — segmented control «Системная / Светлая / Тёмная».
//
// На mobile тоже работает (override системной); на web — необходимо, т.к.
// системную тему пользователь не всегда контролирует.

import { Check, Moon, DeviceMobile, Sun } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ThemePreference } from "@/lib/theme";
import { useThemeColors } from "@/lib/use-theme-color";

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "Системная", icon: DeviceMobile },
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useColorScheme();
  const tc = useThemeColors(["ink", "body", "muted-soft"]);

  return (
    <View className="gap-2">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = preference === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setPreference(value)}
            className={`flex-row items-center justify-between rounded-md border p-3 active:opacity-70 ${
              selected ? "border-ink bg-surface-2" : "border-hairline bg-canvas"
            }`}
          >
            <View className="flex-row items-center gap-3">
              <Icon size={18} weight="bold" color={selected ? tc.ink : tc.body} />
              <AppText weight={selected ? "semibold" : "medium"} className="text-body-md text-ink">
                {label}
              </AppText>
            </View>
            {selected && <Check size={18} weight="bold" color={tc.ink} />}
          </Pressable>
        );
      })}
    </View>
  );
}
