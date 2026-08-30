// Pill-переключатель активной роли в хедере главной (для dual-role пользователей).
// Видимый только если is_master=true. Client-only — пилюли скрыты.

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import type { ActiveRole } from "@/features/auth/use-set-active-role";

interface RoleSwitcherProps {
  activeRole: ActiveRole;
  onChange: (role: ActiveRole) => void;
  disabled?: boolean;
}

export function RoleSwitcher({ activeRole, onChange, disabled }: RoleSwitcherProps) {
  return (
    <View className="flex-row gap-1 self-start rounded-pill bg-surface-2 p-1">
      <RolePill
        label="Клиент"
        selected={activeRole === "client"}
        disabled={disabled}
        onPress={() => onChange("client")}
      />
      <RolePill
        label="Мастер"
        selected={activeRole === "master"}
        disabled={disabled}
        onPress={() => onChange("master")}
      />
    </View>
  );
}

interface RolePillProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function RolePill({ label, selected, disabled, onPress }: RolePillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled || selected}
      className={`h-9 items-center justify-center rounded-pill px-4 ${
        selected ? "bg-canvas" : "active:opacity-60"
      }`}
    >
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-caption ${selected ? "text-ink" : "text-muted"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
