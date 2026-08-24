/**
 * Стек вкладки «Ваши работы» (cases). Раньше cases был одиночным файлом-листом
 * и открывал детальную работу под сегментом /profile/portfolio — из-за этого
 * активной в нижнем меню становилась «Профиль», а «назад» уводил в профиль
 * (фидбэк владельца 2026-05-24). Сделав cases папкой со своим Stack, детальный
 * экран /cases/[caseId] остаётся внутри вкладки «Ваши работы»: back возвращает
 * в список работ, активная вкладка не меняется.
 */
import { Stack } from "expo-router";

export default function CasesLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />;
}
