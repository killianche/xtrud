// Разбор ответа can_respond_to_order (0217) — без зависимостей, для тестов.

export interface RespondEligibility {
  allowed: boolean;
  /** Подкатегория, которую нужно добавить в профиль. */
  categoryId: string | null;
  categoryName: string | null;
}

export function parseEligibility(raw: unknown): RespondEligibility {
  const r = (raw ?? {}) as { allowed?: unknown; l2_id?: unknown; l2_name?: unknown };
  return {
    allowed: r.allowed !== false,
    categoryId: typeof r.l2_id === "string" ? r.l2_id : null,
    categoryName: typeof r.l2_name === "string" ? r.l2_name : null,
  };
}
