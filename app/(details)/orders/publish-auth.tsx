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

// Параметры шторки — константа модуля. Объект, создаваемый заново при каждом
// рендере, заставлял систему переоткрывать шторку и сбрасывать выбор
// (владелец, 2026-09-07: «нажимаю категорию — не выбирается, шторка
// открывается повторно»).
const SHEET_OPTIONS = {
  presentation: "formSheet" as const,
  sheetAllowedDetents: "fitToContents" as const,
  sheetGrabberVisible: true,
};

export default function PublishAuthScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={SHEET_OPTIONS} />
      <PublishAuthSheet onClose={() => router.back()} />
    </>
  );
}
