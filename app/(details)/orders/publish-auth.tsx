/**
 * /orders/publish-auth — auth-wall при публикации задания гостем.
 *
 * Открывается из `orders/new.tsx`, когда неавторизованный пользователь
 * нажимает «Опубликовать». Раньше был `BottomSheet`; теперь — отдельный
 * route с нативной iOS `formSheet`-модальностью (`docs/IOS_FOUNDATION.md`
 * §2.4): самостоятельная карточка (текст + две кнопки) → `fitToContents`.
 *
 * Публичный route: это и есть точка входа неавторизованного гостя в auth-flow
 * (родительский `orders/new` тоже публичный), поэтому добавлен в
 * `PUBLIC_DETAIL_ROUTES`.
 */

import { Stack, useRouter } from "expo-router";
import { PublishAuthSheet } from "@/features/auth/PublishAuthSheet";

export default function PublishAuthScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: "fitToContents",
          sheetGrabberVisible: true,
        }}
      />
      <PublishAuthSheet onClose={() => router.back()} />
    </>
  );
}
