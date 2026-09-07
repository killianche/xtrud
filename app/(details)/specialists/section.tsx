/**
 * /specialists/section?l1=&l2= — список специалистов раздела или категории.
 * Экран стека: «назад» и свайп от края возвращают к списку категорий или на
 * главную (DECISION владельца 2026-09-07: «свайп назад не работает»).
 */

import { SpecialistsListScreen } from "@/features/master-view/SpecialistsListScreen";

export default function SpecialistsSectionRoute() {
  return <SpecialistsListScreen />;
}
