// RoleSwitcher — UI компонент переключения активной роли (P1-8).
//
// Видим только для dual-role users (is_master=true AND is_client=true).
// Single-role пользователи (только клиент или только мастер) не видят
// переключатель — у них всегда одна роль.
//
// Стиль — Linear/Vercel-segmented toggle в едином pill-контейнере:
// `border-hairline bg-canvas-soft p-1`, активная половина — `bg-canvas` +
// subtle shadow, неактивная — `bg-canvas-soft` без бордера. Совпадает с
// `ClientThemeSegmented` на этой же странице. Фидбэк user 2026-05-16:
// «эти две кнопки сделай переключателями между собой» — раньше были два
// раздельных pill-chip'а, сейчас один сегментированный switch.
//
// Размещение: src/features/auth/ (рядом с use-set-active-role.ts).
// Используется в app/(tabs)/profile/index.tsx.

import { Briefcase, User } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { type ActiveRole, useSetActiveRole } from "@/features/auth/use-set-active-role";
import { hapticSelection } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

interface RoleSwitcherProps {
  userId: string;
  currentRole: ActiveRole;
  isMaster: boolean;
  isClient: boolean;
}

const OPTS: Array<{ value: ActiveRole; label: string; Icon: typeof User }> = [
  { value: "client", label: "Клиент", Icon: User },
  { value: "master", label: "Мастер", Icon: Briefcase },
];

export function RoleSwitcher({ userId, currentRole, isMaster, isClient }: RoleSwitcherProps) {
  const setRole = useSetActiveRole();
  const tc = useThemeColors(["ink", "mute"]);

  // Скрываем переключатель если пользователь single-role.
  if (!isMaster || !isClient) return null;

  const handleSwitch = (role: ActiveRole) => {
    if (role === currentRole || setRole.isPending) return;
    // Сегментированный переключатель — отклик как у смены таба, сразу на тапе.
    hapticSelection();
    setRole.mutate({ userId, role });
  };

  return (
    <View className="items-center">
      <View className="flex-row items-center rounded-pill border border-hairline bg-canvas-soft p-1">
        {OPTS.map(({ value, label, Icon }) => {
          const isSel = currentRole === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSel, disabled: setRole.isPending }}
              accessibilityLabel={label}
              disabled={setRole.isPending}
              onPress={() => handleSwitch(value)}
              className={`h-9 flex-row items-center justify-center gap-1.5 rounded-pill px-4 ${
                isSel ? "bg-canvas" : "active:opacity-60"
              }`}
              style={
                isSel
                  ? {
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
                    }
                  : undefined
              }
            >
              <Icon size={14} weight="bold" color={isSel ? tc.ink : tc.mute} />
              <AppText
                weight={isSel ? "semibold" : "medium"}
                className={`text-body-sm ${isSel ? "text-ink" : "text-mute"}`}
              >
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {setRole.error ? (
        <AppText weight="medium" className="mt-2 text-caption text-error">
          Не удалось переключить роль. {setRole.error.message}
        </AppText>
      ) : null}
    </View>
  );
}
