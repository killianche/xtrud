// Разбор флагов интерфейса с сервера (get_app_flags) — без зависимостей,
// чтобы проверяться тестами отдельно от клиента.

export type FindTilesVariant = "mosaic" | "grid";
/** Первый экран создания задания (0228, №242): со слов или из каталога. */
export type ComposerStartVariant = "quick" | "catalog";
/**
 * Шаги 2+ создания задания (0229, №249): все пункты на одном экране
 * (`review.tsx` становится формой) или прежний один вопрос на экран.
 */
export type ComposerFormVariant = "steps" | "single";

export interface AppFlags {
  findTiles: FindTilesVariant;
  /** Сразу просить номер и пароль — без гостевого режима (№202, 0217). */
  requireLogin: boolean;
  /** Откат нового пути — "catalog" из админки; нет ключа — новый путь. */
  composerStart: ComposerStartVariant;
  /** Откат на пошаговые экраны — "steps" из админки; нет ключа — форма. */
  composerForm: ComposerFormVariant;
}

export function parseAppFlags(raw: unknown): AppFlags {
  const r = (raw ?? {}) as {
    find_tiles?: unknown;
    require_login?: unknown;
    composer_start?: unknown;
    composer_form?: unknown;
  };
  return {
    findTiles: r.find_tiles === "mosaic" ? "mosaic" : "grid",
    requireLogin: r.require_login === true,
    composerStart: r.composer_start === "catalog" ? "catalog" : "quick",
    composerForm: r.composer_form === "steps" ? "steps" : "single",
  };
}
