/**
 * /profile/portfolio/[caseId] — LEGACY-роут детальной работы портфолио.
 *
 * Основной роут теперь /(tabs)/cases/[caseId] (вкладка «Ваши работы», сохраняет
 * активную вкладку + back в список). Этот старый путь оставлен для совместимости
 * (старый список /profile/portfolio, deep-link). Рендерит тот же общий экран
 * OwnerCaseDetailScreen — без дублирования кода.
 */
export { default } from "@/features/profile/OwnerCaseDetailScreen";
