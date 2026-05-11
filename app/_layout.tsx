import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

// Минимальный root layout в sprint 1.1.
// В sprint 1.6 здесь будет: QueryClientProvider, theme provider, SplashScreen guard,
// загрузка Inter, redirect на /(auth)/phone при отсутствии сессии.
export default function RootLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </>
  );
}
