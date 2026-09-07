/**
 * ComposerScreen — экран одного вопроса конструктора задания.
 *
 * Как у Apple (iOS 26, docs/TASK_COMPOSER.md), уточнено владельцем
 * 2026-09-07: «поля, кнопки — всё больше, как в iOS Liquid Glass; должна быть
 * отмена выхода на любом шаге»:
 *   - строка навигации без фона: слева круглая стеклянная «назад», справа
 *     круглая «закрыть» (на любом шаге), по центру индикатор шагов —
 *     тонкие капсулы;
 *   - вопрос — Title 1 (28/bold), под ним Subheadline;
 *   - содержимое прокручивается под плавающую кнопку;
 *   - главное действие — выпуклая капсула Liquid Glass 56 pt в фирменном
 *     цвете; второстепенное — текстом над ней;
 *   - клавиатура поднимает кнопку (KeyboardAvoidingView);
 *   - отступ от чёлки обязателен.
 */

import { CaretLeft, X } from "phosphor-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { GLASS_BUTTON_HEIGHT, GlassButton } from "@/components/ui/GlassButton";
import { NAV_BUTTON_SIZE, NAV_ROW_HEIGHT, NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";
import { type ComposerStep, stepPosition } from "./steps";

export const PRIMARY_HEIGHT = GLASS_BUTTON_HEIGHT;

export interface ComposerScreenProps {
  step: ComposerStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** «Назад» слева. Нет — первый шаг (слева пусто). */
  onBack?: () => void;
  /** «Закрыть» справа — на любом шаге; нет — на экранах результата. */
  onClose?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  /** Второстепенное действие текстом над кнопкой («Пропустить»). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Ошибка над кнопкой — коротко и по-русски. */
  error?: string | null;
  /** Скрыть нижнюю кнопку (успех, лимит). */
  hideActions?: boolean;
}

export function ComposerScreen({
  step,
  title,
  subtitle,
  children,
  onBack,
  onClose,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  busy = false,
  secondaryLabel,
  onSecondary,
  error,
  hideActions = false,
}: ComposerScreenProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink"]);
  const { index, total } = stepPosition(step);
  const bottomSpace = insets.bottom + 16;
  const actionsHeight = hideActions
    ? 0
    : PRIMARY_HEIGHT + (secondaryLabel ? 48 : 0) + (error ? 44 : 0);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-page"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-3" style={{ height: NAV_ROW_HEIGHT + 8 }}>
          {onBack ? (
            <NavCircleButton label="Назад" onPress={onBack} disabled={busy}>
              <SystemIcon
                sf="chevron.left"
                fallback={CaretLeft}
                size={20}
                weight="semibold"
                color={tc.ink}
              />
            </NavCircleButton>
          ) : (
            <View style={{ width: NAV_BUTTON_SIZE }} />
          )}
          <View
            className="flex-1 flex-row items-center justify-center gap-1"
            accessibilityRole="progressbar"
            accessibilityLabel={`Шаг ${index} из ${total}`}
            accessibilityValue={{ min: 1, max: total, now: index }}
          >
            {Array.from({ length: total }, (_, i) => (
              <View
                // biome-ignore lint/suspicious/noArrayIndexKey: фиксированный набор сегментов
                key={i}
                className={`h-1 rounded-full ${i < index ? "bg-accent" : "bg-hairline-strong"}`}
                style={{ width: 16 }}
              />
            ))}
          </View>
          {onClose ? (
            <NavCircleButton label="Закрыть" onPress={onClose} disabled={busy}>
              <SystemIcon sf="xmark" fallback={X} size={18} weight="semibold" color={tc.ink} />
            </NavCircleButton>
          ) : (
            <View style={{ width: NAV_BUTTON_SIZE }} />
          )}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingBottom: actionsHeight + bottomSpace + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-5 pt-3 pb-5">
          <AppText weight="bold" className="text-ios-title1 text-ink">
            {title}
          </AppText>
          {subtitle ? (
            <AppText className="mt-1.5 text-ios-body text-mute">{subtitle}</AppText>
          ) : null}
        </View>
        {children}
      </ScrollView>

      {hideActions ? null : (
        <View
          pointerEvents="box-none"
          className="absolute left-0 right-0 px-5"
          style={{ bottom: bottomSpace }}
        >
          {error ? (
            <AppText
              accessibilityRole="alert"
              className="mb-2 text-center text-ios-subheadline text-error"
            >
              {error}
            </AppText>
          ) : null}
          {secondaryLabel && onSecondary ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
              onPress={onSecondary}
              disabled={busy}
              className="mb-1 min-h-12 items-center justify-center active:opacity-60"
            >
              <AppText weight="medium" className="text-ios-body text-accent">
                {secondaryLabel}
              </AppText>
            </Pressable>
          ) : null}
          <GlassButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled}
            busy={busy}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
