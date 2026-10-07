// Роль текущего входа (0239, №286, docs/STAFF_ROLES_2026-10.md §4): меню и
// кнопки показываются по роли, но защита — в базе. Прямой адрес закрытого
// раздела показывает «Нет доступа», а не пустую страницу с ошибками.

import { createContext, useContext } from "react";
import type { StaffRole } from "./api";

// По умолчанию — меньшие права: компонент вне провайдера не покажет
// управляющему админское (ревью xtrud-security 2026-10-07, M3).
export const StaffRoleContext = createContext<StaffRole>("manager");

export function useStaffRole(): StaffRole {
  return useContext(StaffRoleContext);
}
