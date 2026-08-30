/**
 * Pure: расчёт ресайз-параметров перед клиентским сжатием фото.
 *
 * Вынесено из `image-upload.ts` отдельно, чтобы покрывать unit-тестами
 * в Node-среде без expo-image-manipulator (Flow-исходники не парсятся Vitest'ом).
 * Тот же паттерн, что и `sort-responses.ts` / `unread-helpers.ts`.
 *
 * Контракт:
 *  - если максимальная сторона уже ≤ maxDimension → возвращаем null
 *    (ImageManipulator получит пустой actions[] и просто пережмёт JPEG).
 *  - иначе → возвращаем округлённые целые размеры с сохранением aspect ratio.
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ResizeBounds {
  maxDimension: number;
}

/**
 * Считаем целевые размеры для resize-action. Null = пропускаем resize.
 *
 * Round по правилам Math.round — для квадратов и кратных пикселей даёт
 * идентичный output к scale*dim. Расхождение ≤ 1px на крайних значениях,
 * что для UI-аватаров несущественно.
 */
export function calcResizedDimensions(
  source: ImageDimensions,
  bounds: ResizeBounds,
): ImageDimensions | null {
  const largest = Math.max(source.width, source.height);
  if (largest <= bounds.maxDimension) return null;

  const scale = bounds.maxDimension / largest;
  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}
