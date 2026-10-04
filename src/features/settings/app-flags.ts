// Разбор флагов интерфейса с сервера (get_app_flags) — без зависимостей,
// чтобы проверяться тестами отдельно от клиента.

export type FindTilesVariant = "mosaic" | "grid";

export interface AppFlags {
  findTiles: FindTilesVariant;
  /** Сразу просить номер и пароль — без гостевого режима (№202, 0217). */
  requireLogin: boolean;
}

export function parseAppFlags(raw: unknown): AppFlags {
  const r = (raw ?? {}) as { find_tiles?: unknown; require_login?: unknown };
  return {
    findTiles: r.find_tiles === "mosaic" ? "mosaic" : "grid",
    requireLogin: r.require_login === true,
  };
}
