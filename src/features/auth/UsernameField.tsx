/**
 * UsernameField — поле выбора юзернейма (@ingush) при регистрации.
 *
 * Контролируемое: родитель владеет `value` (без @) и `onChange`. Компонент сам:
 *   - нормализует ввод (нижний регистр, только a-z 0-9 _ .),
 *   - живо проверяет доступность через RPC (с задержкой),
 *   - показывает статус: проверяем / свободно / занято / коротко,
 *   - сообщает родителю готовность через onValidityChange (формат ок + свободно).
 *
 * Дизайн: токены NativeWind, Phosphor-иконки, без inline-hex (design-quality §B/§D).
 */

import { Check, X } from "phosphor-react-native";
import { useEffect } from "react";
import { ActivityIndicator, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  isUsernameFormatValid,
  normalizeUsername,
  USERNAME_MIN,
  useUsernameAvailability,
} from "@/features/auth/use-username";
import { useThemeColors } from "@/lib/use-theme-color";

interface UsernameFieldProps {
  value: string;
  onChange: (next: string) => void;
  /** Сообщает родителю: формат корректен И юзернейм свободен (или это свой текущий). */
  onValidityChange?: (valid: boolean) => void;
  editable?: boolean;
  /** Текущий сохранённый юзернейм (режим редактирования) — если value равен ему,
   *  считаем валидным без проверки и показываем нейтральную подсказку. */
  currentUsername?: string | null;
}

export function UsernameField({
  value,
  onChange,
  onValidityChange,
  editable = true,
  currentUsername,
}: UsernameFieldProps) {
  const tc = useThemeColors(["success", "error", "mute"]);
  const formatValid = isUsernameFormatValid(value);
  // value не изменился относительно текущего сохранённого — это «ваш юзернейм».
  const isUnchanged =
    !!currentUsername && normalizeUsername(value) === normalizeUsername(currentUsername);
  const { available, isChecking } = useUsernameAvailability(value);

  const isFree = !isUnchanged && formatValid && available === true;
  const isTaken = !isUnchanged && formatValid && available === false && !isChecking;
  // Валидно для родителя: либо это свой текущий, либо новый свободный.
  const isValidForParent = isUnchanged || isFree;

  useEffect(() => {
    onValidityChange?.(isValidForParent);
  }, [isValidForParent, onValidityChange]);

  // Состояние подсказки под полем.
  let hint: { text: string; tone: "mute" | "success" | "error" } | null = null;
  if (isUnchanged) {
    hint = { text: "Это ваш текущий юзернейм", tone: "mute" };
  } else if (value.length > 0 && !formatValid) {
    hint = {
      text: `Минимум ${USERNAME_MIN} символа. Можно латиницу, цифры, точку и _`,
      tone: "mute",
    };
  } else if (formatValid && isChecking) {
    hint = { text: "Проверяем…", tone: "mute" };
  } else if (isFree) {
    hint = { text: "Свободно", tone: "success" };
  } else if (isTaken) {
    hint = { text: "Уже занято — попробуйте другой", tone: "error" };
  }

  const hintColorClass =
    hint?.tone === "success"
      ? "text-success"
      : hint?.tone === "error"
        ? "text-error"
        : "text-mute";

  // Цвет рамки: нейтральная / зелёная (свободно) / красная (занято).
  const borderClass = isFree
    ? "border-success"
    : isTaken
      ? "border-error"
      : "border-hairline";

  return (
    <View>
      <AppText weight="semibold" className="text-body-sm text-ink">
        Юзернейм
      </AppText>
      <View
        className={`mt-2 h-12 flex-row items-center rounded-md border ${borderClass} bg-canvas px-3`}
      >
        <AppText weight="medium" className="text-body-md text-mute">
          @
        </AppText>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(normalizeUsername(t))}
          placeholder="ingush"
          placeholderTextColor="rgb(var(--muted-soft))"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          returnKeyType="done"
          editable={editable}
          maxFontSizeMultiplier={1.3}
          className="ml-1 h-12 flex-1 text-body-md text-ink"
        />
        {/* Статус-иконка справа. */}
        {!isUnchanged && formatValid && isChecking ? (
          <ActivityIndicator size="small" color={tc.mute} />
        ) : isFree ? (
          <Check size={18} weight="bold" color={tc.success} />
        ) : isTaken ? (
          <X size={18} weight="bold" color={tc.error} />
        ) : null}
      </View>
      {hint ? (
        <AppText weight="medium" className={`mt-2 text-caption ${hintColorClass}`}>
          {hint.text}
        </AppText>
      ) : null}
    </View>
  );
}
