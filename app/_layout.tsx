import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import "react-native-reanimated";

// Root layout sprint 1.3.
// Добавлен QueryClientProvider для TanStack Query.
// В sprint 1.6 здесь будет: SplashScreen guard, загрузка Inter, redirect на /(auth)/phone.

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Дефолты под mobile network — Ингушетия (медленные сети, флапы).
            staleTime: 30_000, // 30 сек — данные считаются свежими
            gcTime: 5 * 60_000, // 5 мин — потом GC
            retry: 2,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false, // на mobile это бесполезно, на web — навязчиво
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0, // мутации НЕ повторяем автоматически (риск дублей)
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
