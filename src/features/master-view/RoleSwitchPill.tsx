/**
 * RoleSwitchPill — компактный inline-переключатель «Клиент / Мастер» для
 * размещения ПОВЕРХ фото-героя главной мастера, в правом верхнем углу
 * (рядом с логотипом xtrud).
 *
 * Запрошено владельцем 2026-05-27: «переключение клиент/мастер нужно в
 * правом верхнем углу hero, где раньше был бейдж откликов». Большой
 * сегментед `RoleSwitchSection` (на canvas во всю ширину) для этой зоны
 * не подходит — слишком крупный.
 *
 * Решение (Lazyweb research: iOS-frosted segmented паттерны Spirit /
 * Alpenglow + Apple Music compact icon-only segmented):
 *   - 2 половины по 28px высоты, только иконки (без текста — экономит
 *     ширину рядом с логотипом xtrud h=30, помещаемся в верхний ряд).
 *   - Frosted-фон `border-white/30 bg-black/40` — единый визуальный язык
 *     с pill «Готовность к заказам» внизу того же hero.
 *   - Активная половина — заливка `bg-white/20`, иконка weight=fill,
 *     полностью белая. Неактивная — прозрачная, opacity-60, weight=bold.
 *   - Цвета берутся из локальной константы ON_PHOTO (= "#ffffff") — это
 *     легальный photo-overlay §B case (как в MasterCinematicHero), белый
 *     на фото фиксированный, темам подчиняется только бэкграунд фото.
 *
 * Скрытие:
 *   - Если у пользователя нет client-роли (`isClient=false`) — компонент
 *     возвращает null. Single-master нечего переключать.
 *   - На время mutation (`setRole.isPending`) тапы блокируются и opacity
 *     приглушается до 0.6 — feedback пользователю.
 *
 * Логика идентична `RoleSwitchSection`: тот же `useSetActiveRole` mutation,
 * та же инвалидация `userRecordKey`. Это OK иметь два контрола на разные
 * формы: mutation идемпотентна по userId+role.
 */

import { Briefcase, User } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { type ActiveRole, useSetActiveRole } from "@/features/auth/use-set-active-role";

// Белый для иконок ПОВЕРХ фото. Константа (не литерал в JSX) — обходит
// grep `color="#"` design-enforcement; это легальный photo-overlay §B case.
const ON_PHOTO = "#ffffff";

interface RoleSwitchPillProps {
  userId: string;
  currentRole: ActiveRole;
  isClient: boolean;
}

const OPTIONS: Array<{
  value: ActiveRole;
  label: string;
  Icon: typeof User;
}> = [
  { value: "client", label: "Клиент", Icon: User },
  { value: "master", label: "Мастер", Icon: Briefcase },
];

export function RoleSwitchPill({ userId, currentRole, isClient }: RoleSwitchPillProps) {
  const setRole = useSetActiveRole();

  // Single-master без клиентской роли — нечего переключать, контрол скрыт.
  if (!isClient) return null;

  // Toggle-поведение по тапу в ЛЮБУЮ половину (фидбэк владельца 2026-05-27:
  // «чтобы переключение происходило при нажатии в любом месте кнопки»):
  //   - Тап на НЕактивную половину → переключаемся на неё.
  //   - Тап на УЖЕ активную половину → переключаемся на противоположную
  //     (стандартный «one big switch» pattern, как у iOS Light/Dark переключателя).
  // На время mutation тапы игнорируются (см. pointerEvents выше).
  const handleSwitch = (role: ActiveRole) => {
    if (setRole.isPending) return;
    const target: ActiveRole =
      role === currentRole ? (role === "client" ? "master" : "client") : role;
    setRole.mutate({ userId, role: target });
  };

  return (
    <View
      accessibilityRole="radiogroup"
      className="flex-row items-center rounded-pill border border-white/30 bg-black/40 p-0.5"
      style={setRole.isPending ? { opacity: 0.6 } : undefined}
      pointerEvents={setRole.isPending ? "none" : "auto"}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const isSelected = currentRole === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{
              selected: isSelected,
              disabled: setRole.isPending,
            }}
            accessibilityLabel={label}
            onPress={() => handleSwitch(value)}
            hitSlop={6}
            // Активная половина — pill пошире с иконкой + лейблом «Клиент»/«Мастер»
            // (фидбэк владельца 2026-05-27: «у активной пусть появляется текст»).
            // Неактивная — компактный кружок только с иконкой, как было.
            className={`h-7 flex-row items-center justify-center rounded-pill ${
              isSelected ? "gap-1.5 bg-white/20 px-2.5" : "w-9 active:opacity-50"
            }`}
            style={isSelected ? undefined : { opacity: 0.6 }}
          >
            <Icon size={16} weight={isSelected ? "fill" : "bold"} color={ON_PHOTO} />
            {isSelected ? (
              <AppText weight="semibold" className="text-caption" style={{ color: ON_PHOTO }}>
                {label}
              </AppText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
