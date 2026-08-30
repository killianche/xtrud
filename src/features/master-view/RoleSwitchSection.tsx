/**
 * RoleSwitchSection — крупный переключатель «Клиент / Мастер» на главной
 * мастера, под фото-героем.
 *
 * Запрошено владельцем 2026-05-27: перенести переключатель ролей из
 * /profile (где он живёт в шапке как маленький segmented) в основное
 * визуальное место на главной мастера — на место бывшей секции «Ваши
 * отклики» (которая в этом же редизайне удаляется как избыточная).
 *
 * Зачем это нужно (бизнес-контекст): у dual-role пользователей (есть и
 * профиль клиента, и профиль мастера) сейчас единственный способ
 * вернуться в режим клиента — зайти в /profile и найти там переключатель.
 * Это нерационально: они часто перескакивают между ролями (положил заказ
 * как клиент → переключился в мастера, чтобы ответить на свой же лид и
 * т.п.). Кладём контрол на главную, чтобы он был заметен сразу.
 *
 * Принципы дизайна:
 *   - **Single-role users скрыты.** Если у пользователя нет роли клиента
 *     (`is_client=false`) — секция не рендерится. Single-master не нужен
 *     toggle, ему не во что переключаться.
 *   - **Без subtitle / помогающего текста** (design-quality §G). Сам
 *     сегментед очевиден: активная половина с тенью и темным текстом =
 *     текущая роль; вторая половина приглушённая. Никаких «Сейчас вы
 *     работаете как мастер» сверху — это шум.
 *   - **Крупнее чем в /profile.** В шапке профиля сегментед был h-9
 *     (компактный, потому что туда же помещаются аватар, имя, статы).
 *     Здесь он самостоятельная секция на canvas — h-14 + увеличенные
 *     padding/типография, чтобы попадание было удобным и контрол читался
 *     как primary visual-anchor секции.
 *   - **Vercel/Linear эстетика.** Pill-контейнер `bg-canvas-soft + border-hairline`,
 *     активная половина `bg-canvas` с тонкой тенью (1px shadow + 1px
 *     hairline-glow). Иконки Phosphor weight bold (inactive) / fill (active),
 *     цвета через `useThemeColors` — обе темы работают.
 *
 * Логика переключения:
 *   - Использует `useSetActiveRole` (та же mutation, что в шапке /profile —
 *     контракт один, но контролов два; это OK, mutation идемпотентна
 *     относительно `userId+role`).
 *   - При успешном переключении `active_role` инвалидируется
 *     `userRecordKey`, root layout (`app/(tabs)/index.tsx`) видит новую
 *     роль и перерендеривает главную клиента вместо мастера. Никаких
 *     ручных redirects.
 *   - На время mutation секция disabled (`pointer-events` гасит тапы) +
 *     opacity-60 — feedback пользователю что что-то происходит.
 */

import { Briefcase, User } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { type ActiveRole, useSetActiveRole } from "@/features/auth/use-set-active-role";
import { useThemeColors } from "@/lib/use-theme-color";

interface RoleSwitchSectionProps {
  userId: string;
  currentRole: ActiveRole;
  isClient: boolean;
}

const OPTIONS: Array<{ value: ActiveRole; label: string; Icon: typeof User }> = [
  { value: "client", label: "Клиент", Icon: User },
  { value: "master", label: "Мастер", Icon: Briefcase },
];

export function RoleSwitchSection({ userId, currentRole, isClient }: RoleSwitchSectionProps) {
  const setRole = useSetActiveRole();
  const tc = useThemeColors(["ink", "mute"]);

  // Single-master без клиентской роли — нечего переключать, секция скрыта.
  if (!isClient) return null;

  const handleSwitch = (role: ActiveRole) => {
    if (role === currentRole || setRole.isPending) return;
    setRole.mutate({ userId, role });
  };

  return (
    <View className="px-4">
      <View
        accessibilityRole="radiogroup"
        className="flex-row items-center rounded-pill border border-hairline bg-canvas-soft p-1.5"
        style={setRole.isPending ? { opacity: 0.6 } : undefined}
        pointerEvents={setRole.isPending ? "none" : "auto"}
      >
        {OPTIONS.map(({ value, label, Icon }) => {
          const isSelected = currentRole === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: setRole.isPending }}
              accessibilityLabel={label}
              onPress={() => handleSwitch(value)}
              className={`h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill ${
                isSelected ? "bg-canvas" : "active:opacity-60"
              }`}
              style={
                isSelected
                  ? {
                      boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
                    }
                  : undefined
              }
            >
              <Icon
                size={18}
                weight={isSelected ? "fill" : "bold"}
                color={isSelected ? tc.ink : tc.mute}
              />
              <AppText
                weight={isSelected ? "semibold" : "medium"}
                className={`text-body-md ${isSelected ? "text-ink" : "text-mute"}`}
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
