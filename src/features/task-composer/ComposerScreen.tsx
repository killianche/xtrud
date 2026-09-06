/**
 * ComposerScreen — экран одного вопроса конструктора задания.
 *
 * Как у Apple (HIG iOS 26, docs/TASK_COMPOSER.md):
 *   - строка навигации 44 pt: слева «назад» (chevron.left) или «закрыть»
 *     (xmark.circle.fill) на первом шаге; по центру индикатор шагов —
 *     тонкие капсулы, как точки страниц; справа пусто (действие — внизу);
 *   - вопрос — Title 1 (28/bold) слева, под ним Subheadline;
 *   - содержимое прокручивается под плавающую кнопку;
 *   - главное действие — одна выпуклая капсула Liquid Glass в фирменном
 *     цвете внизу («Далее», «Опубликовать»); второстепенное — текстом над ней;
 *   - клавиатура поднимает кнопку (KeyboardAvoidingView), а не закрывает её;
 *   - отступ от чёлки — обязателен (DECISION владельца 2026-09-06).
 */

import { GlassView } from "expo-glass-effect";
import { CaretLeft, XCircle } from "phosphor-react-native";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { LIQUID_GLASS } from "@/components/ui/GlassSurface";
import { NAV_ROW_HEIGHT } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { useThemeColors } from "@/lib/use-theme-color";
import { type ComposerStep, stepPosition } from "./steps";

const PRIMARY_HEIGHT = 52;

export interface ComposerScreenProps {
  step: ComposerStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** «Закрыть» на первом шаге, «назад» на остальных. */
  onBack: () => void;
  closeInsteadOfBack?: boolean;
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
  scrollRef?: React.Ref<ScrollView>;
}

export function ComposerScreen({
  step,
  title,
  subtitle,
  children,
  onBack,
  closeInsteadOfBack = false,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  busy = false,
  secondaryLabel,
  onSecondary,
  error,
  hideActions = false,
  scrollRef,
}: ComposerScreenProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["ink", "mute", "accent", "on-accent", "hairline-strong", "error"]);
  const { index, total } = stepPosition(step);
  const bottomSpace = insets.bottom + 16;
  const actionsHeight = hideActions
    ? 0
    : PRIMARY_HEIGHT + (secondaryLabel ? 44 : 0) + (error ? 40 : 0);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-surface-page"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center px-2" style={{ height: NAV_ROW_HEIGHT }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeInsteadOfBack ? "Закрыть" : "Назад"}
            onPress={onBack}
            disabled={busy}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center active:opacity-50"
          >
            {closeInsteadOfBack ? (
              <SystemIcon
                sf="xmark.circle.fill"
                fallback={XCircle}
                size={28}
                weight="regular"
                hierarchical
                color={tc.mute}
              />
            ) : (
              <SystemIcon
                sf="chevron.left"
                fallback={CaretLeft}
                size={22}
                weight="semibold"
                color={tc.accent}
              />
            )}
          </Pressable>
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
                style={{ width: 18 }}
              />
            ))}
          </View>
          <View className="w-11" />
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
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
            <AppText className="mt-1.5 text-ios-subheadline text-mute">{subtitle}</AppText>
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
              className="mb-2 text-center text-ios-footnote text-error"
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
              className="mb-1 min-h-11 items-center justify-center active:opacity-60"
            >
              <AppText className="text-ios-body text-accent">{secondaryLabel}</AppText>
            </Pressable>
          ) : null}
          <PrimaryGlassButton
            label={primaryLabel}
            onPress={onPrimary}
            disabled={primaryDisabled || busy}
            busy={busy}
            accent={tc.accent}
            onAccent={tc["on-accent"]}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/**
 * Выпуклая капсула главного действия. На iOS 26 — Liquid Glass с фирменным
 * оттенком (prominent glass button); без стекла — сплошная заливка с тенью.
 */
function PrimaryGlassButton({
  label,
  onPress,
  disabled,
  busy,
  accent,
  onAccent,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
  accent: string;
  onAccent: string;
}) {
  const content = busy ? (
    <ActivityIndicator color={onAccent} />
  ) : (
    <AppText weight="semibold" className="text-ios-body" style={{ color: onAccent }}>
      {label}
    </AppText>
  );
  const shape = {
    height: PRIMARY_HEIGHT,
    borderRadius: PRIMARY_HEIGHT / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    overflow: "hidden" as const,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      onPress={onPress}
      disabled={disabled}
      className="active:opacity-80"
      style={{ opacity: disabled && !busy ? 0.45 : 1 }}
    >
      {LIQUID_GLASS ? (
        <GlassView glassEffectStyle="regular" tintColor={accent} isInteractive style={shape}>
          {content}
        </GlassView>
      ) : (
        <View
          style={[
            shape,
            {
              backgroundColor: accent,
              shadowColor: "#000",
              shadowOpacity: 0.16,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}
