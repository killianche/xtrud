// RoleSwitcher — UI компонент переключения активной роли (P1-8).
//
// Видим только для dual-role users (is_master=true AND is_client=true).
// Single-role пользователи (только клиент или только мастер) не видят
// переключатель — у них всегда одна роль.
//
// Сегментный 2-toggle «Клиент / Мастер» в стиле iOS UISegmentedControl.
// При тапе → useSetActiveRole mutation + invalidate user → весь UI
// перерисовывается с новой ролью (главная, табы, бейджи).
//
// Размещение: src/features/auth/ (рядом с use-set-active-role.ts).
// Используется в app/(tabs)/profile/index.tsx.

import { Briefcase, User } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  type ActiveRole,
  useSetActiveRole,
} from "@/features/auth/use-set-active-role";
import { useThemeColors } from "@/lib/use-theme-color";

interface RoleSwitcherProps {
  userId: string;
  currentRole: ActiveRole;
  isMaster: boolean;
  isClient: boolean;
}

export function RoleSwitcher({ userId, currentRole, isMaster, isClient }: RoleSwitcherProps) {
  const setRole = useSetActiveRole();
  const tc = useThemeColors(["ink", "mute", "on-primary"]);

  // Скрываем переключатель если пользователь single-role.
  if (!isMaster || !isClient) return null;

  const handleSwitch = (role: ActiveRole) => {
    if (role === currentRole) return;
    setRole.mutate({ userId, role });
  };

  return (
    <View>
      <AppText weight="medium" className="text-caption text-muted">
        Сейчас вы
      </AppText>
      <View className="mt-2 flex-row rounded-pill bg-surface-2 p-1">
        <RoleToggle
          icon={User}
          label="Клиент"
          active={currentRole === "client"}
          disabled={setRole.isPending}
          onPress={() => handleSwitch("client")}
          activeColor={tc.ink}
          inactiveColor={tc.mute}
          activeText={tc["on-primary"]}
        />
        <RoleToggle
          icon={Briefcase}
          label="Мастер"
          active={currentRole === "master"}
          disabled={setRole.isPending}
          onPress={() => handleSwitch("master")}
          activeColor={tc.ink}
          inactiveColor={tc.mute}
          activeText={tc["on-primary"]}
        />
      </View>
      {setRole.error ? (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          Не удалось переключить роль. {setRole.error.message}
        </AppText>
      ) : null}
    </View>
  );
}

interface RoleToggleProps {
  icon: typeof User;
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  activeColor: string;
  inactiveColor: string;
  activeText: string;
}

function RoleToggle({
  icon: Icon,
  label,
  active,
  disabled,
  onPress,
  activeColor,
  inactiveColor,
  activeText,
}: RoleToggleProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-pill h-10 ${
        active ? "bg-ink" : "active:opacity-60"
      }`}
    >
      <Icon size={16} strokeWidth={2} color={active ? activeText : inactiveColor} />
      <AppText
        weight={active ? "semibold" : "medium"}
        className={`text-body-sm ${active ? "text-on-primary" : "text-mute"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
