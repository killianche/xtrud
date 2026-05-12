import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useSendOtp } from "@/features/auth/use-auth-mutations";
import {
  formatPhoneMask,
  normalizePhone,
  type PhoneFormValues,
  phoneFormSchema,
} from "@/features/auth/validation";

export default function PhoneScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const sendOtp = useSendOtp();

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<PhoneFormValues>({
    resolver: zodResolver(phoneFormSchema),
    defaultValues: { phone: "" },
    mode: "onChange",
  });

  const onSubmit = handleSubmit(async (values) => {
    const phone = normalizePhone(values.phone);
    try {
      await sendOtp.mutateAsync({ phone });
      router.push({ pathname: "/(auth)/verify", params: { phone } });
    } catch (_e) {
      // Sprint 1: симуляция, ошибок не будет. Sprint 2 — добавим toast.
    }
  });

  const isBusy = sendOtp.isPending;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-1 justify-between px-6 pt-12 pb-8">
        <View>
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Вход в xtrud
          </AppText>
          <AppText className="mt-3 text-body-md text-body">
            Введите номер телефона — пришлём код подтверждения.
          </AppText>

          <View className="mt-10">
            <AppText weight="medium" className="text-caption text-muted">
              Номер телефона
            </AppText>
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  value={value}
                  onBlur={onBlur}
                  onChangeText={(raw) => onChange(formatPhoneMask(raw))}
                  placeholder="+7 ___ ___-__-__"
                  placeholderTextColor="#71717a"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  inputMode="tel"
                  maxFontSizeMultiplier={1.3}
                  className={`mt-2 h-12 rounded-md border bg-canvas px-3 text-body-md text-ink ${
                    errors.phone ? "border-error" : "border-hairline focus:border-ink"
                  }`}
                  // RN doesn't apply :focus via NativeWind on native; web only.
                  // Платформенно-нейтральный focus state — добавим в sprint 2 через onFocus state.
                  editable={!isBusy}
                />
              )}
            />
            {errors.phone && (
              <AppText weight="medium" className="mt-2 text-caption text-error">
                {errors.phone.message}
              </AppText>
            )}
          </View>
        </View>

        <View>
          <Pressable
            accessibilityRole="button"
            disabled={!isValid || isBusy}
            onPress={onSubmit}
            className={`h-12 items-center justify-center rounded-md ${
              isValid && !isBusy ? "bg-primary active:opacity-80" : "bg-surface-3"
            }`}
          >
            <AppText weight="semibold" className="text-button text-on-primary">
              {isBusy ? "Отправляем..." : "Получить код"}
            </AppText>
          </Pressable>

          <AppText className="mt-4 text-center text-caption-xs text-muted-soft">
            Продолжая, вы соглашаетесь с Условиями использования и Политикой конфиденциальности.
          </AppText>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
