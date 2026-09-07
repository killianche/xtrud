/**
 * FormScreen — экран одного вопроса или настройки вне конструктора задания
 * (профиль специалиста и т.п.): строка навигации без фона с круглой
 * стеклянной «назад», Title 1, содержимое под плавающую капсулу главного
 * действия, клавиатура поднимает кнопку. Отступ от чёлки обязателен.
 */

import { CaretLeft } from "phosphor-react-native";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";
import { GLASS_BUTTON_HEIGHT, GlassButton } from "./GlassButton";
import { NAV_BUTTON_SIZE, NAV_ROW_HEIGHT, NavCircleButton } from "./LargeTitle";
import { SystemIcon } from "./SystemIcon";

export interface FormScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onBack: () => void;
  /** Действие справа в строке навигации (круглая кнопка). */
  rightAction?: { label: string; icon: ReactNode; onPress: () => void };
  /** Главное действие внизу. Нет — экран без кнопки (список настроек). */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  error?: string | null;
  /** Отступ снизу под плавающие кнопки, если primary нет (например, нижнее меню). */
  bottomInset?: number;
}

export function FormScreen({
  title,
  subtitle,
  children,
  onBack,
  rightAction,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  busy = false,
  secondaryLabel,
  onSecondary,
  error,
  bottomInset = 0,
}: FormScreenProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "error"]);
  const hasPrimary = !!primaryLabel && !!onPrimary;
  const bottomSpace = insets.bottom + 16;
  const actionsHeight = hasPrimary
    ? GLASS_BUTTON_HEIGHT + (secondaryLabel ? 48 : 0) + (error ? 44 : 0)
    : 0;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-page"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <View
          className="flex-row items-center justify-between px-3"
          style={{ height: NAV_ROW_HEIGHT + 8 }}
        >
          <NavCircleButton label="Назад" onPress={onBack} disabled={busy}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
          {rightAction ? (
            <NavCircleButton
              label={rightAction.label}
              onPress={rightAction.onPress}
              disabled={busy}
            >
              {rightAction.icon}
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
        contentContainerStyle={{ paddingBottom: actionsHeight + bottomSpace + bottomInset + 24 }}
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

      {hasPrimary ? (
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
            label={primaryLabel ?? ""}
            onPress={onPrimary ?? (() => undefined)}
            disabled={primaryDisabled}
            busy={busy}
          />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
