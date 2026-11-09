// Первый экран входа «Ваш номер» (владелец, 2026-10-04, №202: «при входе
// сразу требуют номер»; 2026-11-09, №380: «полностью убери пароль, вход
// просто по номеру с подтверждением»).
//
// Номер → звонок → вход или регистрация (src/features/auth/PhoneSignInForm).
// Пока включён обязательный вход (флаг require_login, админка → «Настройки»),
// закрыть экран нельзя.

import { useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { View } from "react-native";
import { NavCircleButton } from "@/components/ui/LargeTitle";
import { SystemIcon } from "@/components/ui/SystemIcon";
import { PhoneSignInForm } from "@/features/auth/PhoneSignInForm";
import { setRegisterPrefill } from "@/features/auth/register-prefill";
import { useAppFlags } from "@/features/settings/use-app-flags";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function WelcomeScreen() {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const goBack = useSafeBack("/(tabs)" as const);
  const { requireLogin } = useAppFlags();

  return (
    <PhoneSignInForm
      topBar={(busy) =>
        requireLogin ? (
          <View style={{ height: 44 }} />
        ) : (
          <NavCircleButton label="Назад" onPress={goBack} disabled={busy}>
            <SystemIcon
              sf="chevron.left"
              fallback={CaretLeft}
              size={20}
              weight="semibold"
              color={tc.ink}
            />
          </NavCircleButton>
        )
      }
      // Дальше ведёт AuthGate: онбординг или приложение.
      onSignedIn={() => router.replace("/(tabs)" as never)}
      onNewUser={(phone, token) => {
        setRegisterPrefill(phone, "", token);
        router.push("/(auth)/register" as never);
      }}
      onPasswordNeeded={(phone) =>
        router.push({ pathname: "/(auth)/sign-in", params: { phone } } as never)
      }
    />
  );
}
