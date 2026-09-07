/**
 * /orders/respond-auth — auth-wall при отклике гостя (см. RespondAuthSheet).
 * Нативная formSheet-модальность, как у orders/publish-auth. Публичный route:
 * это точка входа гостя в auth-flow, добавлен в PUBLIC_DETAIL_ROUTES.
 */

import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { RespondAuthSheet } from "@/features/auth/RespondAuthSheet";

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
};

export default function RespondAuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderId?: string | string[] }>();
  const orderId = (Array.isArray(params.orderId) ? params.orderId[0] : params.orderId) ?? "";

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <RespondAuthSheet orderId={orderId} onClose={() => router.back()} />
    </>
  );
}
