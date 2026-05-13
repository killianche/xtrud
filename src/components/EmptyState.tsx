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
  /** Lucide-иконка для большого soft-круга вверху. */
  icon: LucideIcon;
  /** @deprecated не используется — оставлен для обратной совместимости. */
  illustration?: string;
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
  illustration: _unused,
  title,
  hint,
  ctaLabel,
  onCtaPress,
  className,
}: EmptyStateProps) {
  void _unused;
  const onPrimaryColor = useThemeColor("on-primary");

  return (
    <View
      className={`items-center px-6 py-10 ${className ?? "mx-6"}`}
      accessibilityRole="summary"
    >
      {/* Большая тематичная Lucide-иконка в soft-круге.
          Раньше тут были doodle-человечки (Open Doodles), но user попросил
          без людей/живых существ — заменено на чистые object-иконки. */}
      <View className="h-24 w-24 items-center justify-center rounded-full bg-canvas-soft text-ink">
        <Icon size={44} strokeWidth={1.25} color="currentColor" />
      </View>
      <AppText weight="semibold" className="mt-6 text-center text-title-md text-ink">
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
