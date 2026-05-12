// EmptyState — единый шаблон для пустых состояний по всему приложению.
//
// Pattern: icon + title + hint + optional CTA. Реф: Notion, Linear, Profi.ru.
// Принципы №3 (удобство) и №6 (функциональность): empty state должен давать
// чёткий next step, не быть тупиком.
//
// Использование:
//   <EmptyState
//     icon={ClipboardList}
//     title="Заказов пока нет"
//     hint="Создайте первую заявку — мастера откликнутся."
//     ctaLabel="Создать заказ"
//     onCtaPress={() => router.push("/orders/new")}
//   />

import type { LucideIcon } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";

export interface EmptyStateProps {
  /** Lucide-иконка для верхнего кружка. */
  icon: LucideIcon;
  /** Заголовок одной строкой (semibold, title-md). */
  title: string;
  /** Подсказка-описание (2-3 строки максимум). */
  hint?: string;
  /** Текст CTA-кнопки. Если задан — рендерим primary button. */
  ctaLabel?: string;
  /** Обработчик CTA. Обязателен если задан ctaLabel. */
  onCtaPress?: () => void;
  /** Доп. отступы вокруг блока — по умолчанию `mx-6`. */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  ctaLabel,
  onCtaPress,
  className,
}: EmptyStateProps) {
  const mutedSoftColor = useThemeColor("muted-soft");
  const onPrimaryColor = useThemeColor("on-primary");

  return (
    <View
      className={`items-center rounded-lg bg-surface-2 px-6 py-10 ${className ?? "mx-6"}`}
      accessibilityRole="summary"
    >
      <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-3">
        <Icon size={24} strokeWidth={1.75} color={mutedSoftColor} />
      </View>
      <AppText weight="semibold" className="mt-4 text-center text-title-md text-ink">
        {title}
      </AppText>
      {hint && <AppText className="mt-2 text-center text-body-sm text-muted">{hint}</AppText>}
      {ctaLabel && onCtaPress && (
        <Pressable
          accessibilityRole="button"
          onPress={onCtaPress}
          className="mt-5 h-11 items-center justify-center rounded-md bg-primary px-5 active:opacity-80"
        >
          <AppText weight="semibold" style={{ color: onPrimaryColor }} className="text-button">
            {ctaLabel}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}
