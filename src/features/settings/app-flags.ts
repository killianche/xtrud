// Разбор флагов интерфейса с сервера (get_app_flags) — без зависимостей,
// чтобы проверяться тестами отдельно от клиента.

export type FindTilesVariant = "mosaic" | "grid";
/** Первый экран создания задания (0228, №242): со слов или из каталога. */
export type ComposerStartVariant = "quick" | "catalog";

export interface AppFlags {
  findTiles: FindTilesVariant;
  /** Сразу просить номер и пароль — без гостевого режима (№202, 0217). */
  requireLogin: boolean;
  /** Откат нового пути — "catalog" из админки; нет ключа — новый путь. */
  composerStart: ComposerStartVariant;
}

export function parseAppFlags(raw: unknown): AppFlags {
  const r = (raw ?? {}) as {
    find_tiles?: unknown;
    require_login?: unknown;
    composer_start?: unknown;
  };
  return {
    findTiles: r.find_tiles === "mosaic" ? "mosaic" : "grid",
    requireLogin: r.require_login === true,
    composerStart: r.composer_start === "catalog" ? "catalog" : "quick",
  };
}
