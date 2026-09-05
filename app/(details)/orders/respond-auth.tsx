/**
 * /orders/respond-auth — auth-wall при отклике гостя (см. RespondAuthSheet).
 * Нативная formSheet-модальность, как у orders/publish-auth. Публичный route:
 * это точка входа гостя в auth-flow, добавлен в PUBLIC_DETAIL_ROUTES.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { RespondAuthSheet } from "@/features/auth/RespondAuthSheet";

export default function RespondAuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = (Array.isArray(params.orderId) ? params.orderId[0] : params.orderId) ?? "";

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <RespondAuthSheet orderId={orderId} onClose={() => router.back()} />
    </>
  );
}
