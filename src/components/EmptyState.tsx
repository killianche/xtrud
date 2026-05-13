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
import { Illustration, type IllustrationName } from "@/components/Illustration";
import { useThemeColor } from "@/lib/use-theme-color";

export interface EmptyStateProps {
  /** Lucide-иконка для верхнего кружка (legacy fallback, если illustration не задан). */
  icon: LucideIcon;
  /** Doodle-иллюстрация из Open Doodles. Если задана — рендерится вместо icon-кружка. */
  illustration?: IllustrationName;
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
  illustration,
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
      className={`items-center px-6 py-10 ${className ?? "mx-6"}`}
      accessibilityRole="summary"
    >
      {illustration ? (
        <Illustration name={illustration} size={150} className="text-ink" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-full bg-canvas-soft-2">
          <Icon size={24} strokeWidth={1.75} color={mutedSoftColor} />
        </View>
      )}
      <AppText
        weight="semibold"
        className={`text-center text-title-md text-ink ${illustration ? "mt-6" : "mt-4"}`}
      >
        {title}
      </AppText>
      {hint && <AppText className="mt-2 text-center text-body-md text-muted">{hint}</AppText>}
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
