/**
 * SearchBar — поисковая строка под главную и full-screen search.
 *
 * Использует Input + Lucide MagnifyingGlass icon слева + опциональный clear-button справа.
 *
 * Варианты использования:
 *   1. Inline (на главной): tap открывает full-screen search.
 *      → передаём `onFocus={() => router.push('/search')}` и не редактируем значение.
 *   2. Full-screen search: autoFocus + onChangeText + onSubmitEditing.
 *      → отдельный route с autoFocus.
 *
 * Дефолтный размер — lg (48px), Vercel form-input-lg.
 */

import { MagnifyingGlass, X } from "phosphor-react-native";
import { forwardRef } from "react";
import { Pressable, type TextInput } from "react-native";
import { Input, type InputProps } from "@/components/ui/Input";
import { useThemeColor } from "@/lib/use-theme-color";

export interface SearchBarProps extends Omit<InputProps, "leftIcon" | "rightIcon" | "size"> {
  /** Размер строки — по умолчанию lg (48px). */
  size?: InputProps["size"];
  /** Показывать ли clear-button когда есть значение. По умолчанию true. */
  clearable?: boolean;
  /** Колбек на clear. Если не задан и clearable=true — onChangeText('') . */
  onClear?: () => void;
}

export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar(
  { size = "lg", clearable = true, onClear, value, onChangeText, placeholder = "Что нужно сделать?", ...props },
  ref,
) {
  const mute = useThemeColor("mute");
  const showClear = clearable && !!value && value.length > 0;

  const iconSize = size === "sm" ? 14 : size === "md" ? 16 : 18;

  return (
    <Input
      ref={ref}
      size={size}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      leftIcon={<MagnifyingGlass size={iconSize} weight="bold" color={mute} />}
      rightIcon={
        showClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Очистить поиск"
            onPress={() => (onClear ? onClear() : onChangeText?.(""))}
            hitSlop={8}
          >
            <X size={iconSize} weight="bold" color={mute} />
          </Pressable>
        ) : undefined
      }
      {...props}
    />
  );
});
