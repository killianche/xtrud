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

import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useThemeColor } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

export interface EmptyStateProps {
  /** Иконка (Phosphor / Lucide — generic). Fallback если emoji не задан. */
  icon: IconComponent;
  /** Большой emoji-стикер (приоритетен над icon). Используется как
   *  цветная объёмная «иллюстрация» без doodle-человечков. */
  emoji?: string;
  /** @deprecated больше не используется. */
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
  icon: _icon,
  emoji: _emoji,
  illustration: _unused,
  title,
  hint,
  ctaLabel,
  onCtaPress,
  className,
}: EmptyStateProps) {
  void _icon;
  void _emoji;
  void _unused;
  const onPrimaryColor = useThemeColor("on-primary");

  return (
    <View
      className={`items-center px-6 py-10 ${className ?? "mx-6"}`}
      accessibilityRole="summary"
    >
      {/* По запросу — без emoji/иконок. Чистый минимализм Vercel. */}
      <AppText weight="bold" className="text-center text-title-lg text-ink">
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
