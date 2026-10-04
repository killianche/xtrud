/**
 * Поле пароля с кнопкой «Показать» — для нового пароля («Забыли пароль?»,
 * смена пароля; №215, №219) и текущего (смена пароля).
 *
 * `kind="new"` — iOS предлагает надёжный пароль и сохраняет его в «Пароли»
 * (textContentType newPassword), `kind="current"` — подставляет сохранённый.
 */

import { Eye, EyeSlash } from "phosphor-react-native";
import { useState } from "react";
import { Pressable } from "react-native";
import { Input } from "@/components/ui";
import { useThemeColors } from "@/lib/use-theme-color";

export function PasswordField({
  kind,
  value,
  onChangeText,
  label,
  placeholder,
  error,
  editable = true,
  autoFocus = false,
  onSubmitEditing,
}: {
  kind: "new" | "current";
  value: string;
  onChangeText: (v: string) => void;
  label: string;
  placeholder: string;
  error?: string;
  editable?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
}) {
  const tc = useThemeColors(["mute"]);
  const [show, setShow] = useState(false);
  return (
    <Input
      size="lg"
      label={label}
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={kind === "new" ? "new-password" : "current-password"}
      textContentType={kind === "new" ? "newPassword" : "password"}
      passwordRules={kind === "new" ? "minlength: 8;" : undefined}
      editable={editable}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      returnKeyType={onSubmitEditing ? "done" : undefined}
      error={error}
      rightIcon={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={show ? "Скрыть пароль" : "Показать пароль"}
          onPress={() => setShow((v) => !v)}
          hitSlop={12}
          className="h-11 w-11 items-center justify-center"
        >
          {show ? (
            <EyeSlash size={22} weight="bold" color={tc.mute} />
          ) : (
            <Eye size={22} weight="bold" color={tc.mute} />
          )}
        </Pressable>
      }
    />
  );
}
