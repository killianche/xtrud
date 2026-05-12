// OtpInput — 6-боксовый OTP с iOS/Android autofill из SMS.
//
// Паттерн: один скрытый TextInput ловит ввод (touch/keyboard/oneTimeCode autofill),
// 6 видимых боксов рендерятся как отображение текущего value. Это стандартный
// RN-подход — единственный, который надёжно работает с iOS textContentType="oneTimeCode"
// (iOS заполняет single-field, не несколько inputs).
//
// API:
//   <OtpInput value={code} onChangeText={setCode} hasError={!!error} autoFocus />
//
// Совместим с react-hook-form Controller — value/onChangeText форма обычная.

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { AppText } from "@/components/AppText";

const LENGTH = 6;

export interface OtpInputProps {
  value: string;
  onChangeText: (next: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export interface OtpInputHandle {
  focus: () => void;
  blur: () => void;
}

export const OtpInput = forwardRef<OtpInputHandle, OtpInputProps>(function OtpInput(
  { value, onChangeText, hasError = false, disabled = false, autoFocus = false },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
    }),
    [],
  );

  const handleChange = (raw: string) => {
    // Только цифры, максимум LENGTH символов.
    const digits = raw.replace(/\D/g, "").slice(0, LENGTH);
    onChangeText(digits);
  };

  // Какой бокс «активен» (получит следующую цифру) — равен длине value,
  // но не больше LENGTH-1.
  const activeIndex = Math.min(value.length, LENGTH - 1);

  return (
    <View className="relative">
      {/* Видимая «сетка» из 6 боксов */}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        disabled={disabled}
        className="flex-row justify-between"
        accessibilityRole="none"
      >
        {Array.from({ length: LENGTH }).map((_, i) => {
          const digit = value[i] ?? "";
          const isCursor = focused && i === activeIndex && !disabled;
          const boxBorder = hasError ? "border-error" : isCursor ? "border-ink" : "border-hairline";
          return (
            <View
              // Индекс позиции, не идентичность цифры — порядок боксов фиксирован.
              // biome-ignore lint/suspicious/noArrayIndexKey: stable position-based key
              key={i}
              className={`h-14 w-12 items-center justify-center rounded-md border bg-canvas ${boxBorder}`}
            >
              <AppText weight="semibold" className="text-2xl text-ink">
                {digit}
              </AppText>
            </View>
          );
        })}
      </Pressable>

      {/* Скрытый capture-input. opacity=0, но физически присутствует, чтобы
          iOS отдал в него oneTimeCode autofill. height=0 ломает iOS, поэтому
          делаем full-size, но абсолютно за гридом и невидимо. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={LENGTH}
        autoFocus={autoFocus}
        editable={!disabled}
        // Делаем поле физически на том же месте, что и сетка, но прозрачным.
        // caretHidden — каретку рисует не TextInput, а активный бокс выше.
        caretHidden
        selectionColor="transparent"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0,
          fontSize: 1,
        }}
        accessibilityLabel="Код из SMS"
        accessibilityHint="Введите шестизначный код подтверждения"
      />
    </View>
  );
});
