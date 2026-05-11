import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useSendOtp, useVerifyOtp } from "@/features/auth/use-auth-mutations";
import { type OtpFormValues, otpFormSchema } from "@/features/auth/validation";

const COOLDOWN_SEC = 60;

export default function VerifyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const inputRef = useRef<TextInput>(null);
  const [cooldown, setCooldown] = useState(COOLDOWN_SEC);

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();

  const {
    control,
    handleSubmit,
    setValue,
    formState: { isValid },
  } = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: { code: "" },
    mode: "onChange",
  });

  // Автофокус на инпут при входе на экран
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, []);

  // Cooldown-таймер для "Отправить повторно"
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onSubmit = handleSubmit(async (values) => {
    if (!phone) return;
    try {
      await verifyOtp.mutateAsync({ phone, code: values.code });
      // После успеха — onAuthStateChange сработает, protected route в _layout
      // редиректнет на /(tabs)/. Дополнительно делать router.replace не нужно.
    } catch (_e) {
      // Ошибка показывается через verifyOtp.error в UI ниже
    }
  });

  const onResend = async () => {
    if (!phone || cooldown > 0) return;
    try {
      await sendOtp.mutateAsync({ phone });
      setCooldown(COOLDOWN_SEC);
      setValue("code", "");
      inputRef.current?.focus();
    } catch (_e) {
      // ignore — sprint 1 симуляция всегда успешна
    }
  };

  const isBusy = verifyOtp.isPending;
  const error = verifyOtp.error?.message;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-1 justify-between px-6 pt-12 pb-8">
        <View>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            hitSlop={12}
            className="mb-6 self-start"
          >
            <AppText weight="medium" className="text-body-md text-muted">
              ← Назад
            </AppText>
          </Pressable>

          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Введите код
          </AppText>
          <AppText className="mt-3 text-body-md text-body">
            Отправили код на номер{"\n"}
            <AppText weight="semibold" className="text-body-md text-ink">
              {phone}
            </AppText>
          </AppText>

          <View className="mt-10">
            <AppText weight="medium" className="text-caption text-muted">
              Код из СМС
            </AppText>
            <Controller
              control={control}
              name="code"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  ref={inputRef}
                  value={value}
                  onBlur={onBlur}
                  onChangeText={(raw) => onChange(raw.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  placeholderTextColor="#71717a"
                  keyboardType="number-pad"
                  autoComplete="sms-otp"
                  textContentType="oneTimeCode"
                  inputMode="numeric"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 h-14 rounded-md border bg-canvas px-3 text-center text-2xl tracking-[8px] text-ink ${
                    error ? "border-error" : "border-hairline"
                  }`}
                  editable={!isBusy}
                />
              )}
            />
            {error && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {error}
              </AppText>
            )}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onResend}
            disabled={cooldown > 0 || sendOtp.isPending}
            className="mt-6 self-start"
            hitSlop={8}
          >
            <AppText
              weight="medium"
              className={`text-caption ${cooldown > 0 ? "text-muted-soft" : "text-accent"}`}
            >
              {cooldown > 0 ? `Отправить повторно через ${cooldown}с` : "Отправить повторно"}
            </AppText>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!isValid || isBusy}
          onPress={onSubmit}
          className={`h-12 items-center justify-center rounded-md ${
            isValid && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <AppText weight="semibold" className="text-button text-on-primary">
            {isBusy ? "Проверяем..." : "Подтвердить"}
          </AppText>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
