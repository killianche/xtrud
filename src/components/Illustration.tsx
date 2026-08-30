/**
 * <Illustration name="..." size={...} className="..." />
 *
 * Тонкая обёртка над SVG-doodle-иллюстрациями из `assets/illustrations/`.
 * Источник: Open Doodles (https://www.opendoodles.com), лицензия CC0.
 *
 * Темизация: SVG-файлы пропатчены — `fill="#000000"` заменён на
 * `fill="currentColor"`. NativeWind className `text-ink` / `text-mute` /
 * `text-link` и т.п. красит контур, работает в обеих темах. Accent (#FF5678)
 * остаётся статическим розовым — это фирменная палитра Open Doodles.
 *
 * Использование:
 *   <Illustration name="coffee" size={140} className="text-ink" />
 *   <Illustration name="meditating" size={120} />
 *
 * Размер: задаётся width+height = size (квадрат); SVG преserves viewBox
 * (1024×768), поэтому фактически рендерится в квадратной коробке без
 * искажения — пустоты заполняются прозрачностью.
 *
 * Список доступных doodle: coffee, meditating, reading, sitting, plant,
 * levitate, loving, running, dancing.
 */

import { View } from "react-native";

import Coffee from "../../assets/illustrations/coffee.svg";
import Dancing from "../../assets/illustrations/dancing.svg";
import Groovy from "../../assets/illustrations/groovy.svg";
import Levitate from "../../assets/illustrations/levitate.svg";
import Loving from "../../assets/illustrations/loving.svg";
import Meditating from "../../assets/illustrations/meditating.svg";
import Plant from "../../assets/illustrations/plant.svg";
import Reading from "../../assets/illustrations/reading.svg";
import Running from "../../assets/illustrations/running.svg";
import Sitting from "../../assets/illustrations/sitting.svg";
import Strolling from "../../assets/illustrations/strolling.svg";
import Unboxing from "../../assets/illustrations/unboxing.svg";

export type IllustrationName =
  | "coffee"
  | "dancing"
  | "groovy"
  | "levitate"
  | "loving"
  | "meditating"
  | "plant"
  | "reading"
  | "running"
  | "sitting"
  | "strolling"
  | "unboxing";

const COMPONENTS = {
  coffee: Coffee,
  dancing: Dancing,
  groovy: Groovy,
  levitate: Levitate,
  loving: Loving,
  meditating: Meditating,
  plant: Plant,
  reading: Reading,
  running: Running,
  sitting: Sitting,
  strolling: Strolling,
  unboxing: Unboxing,
} as const;

export interface IllustrationProps {
  /** Имя doodle (см. IllustrationName) */
  name: IllustrationName;
  /** Размер в px (квадратный bounding-box). По умолчанию 140. */
  size?: number;
  /** className для контейнера — задаёт цвет контура через currentColor.
   *  Дефолт: text-ink (тёмный на светлой теме, светлый на тёмной). */
  className?: string;
}

export function Illustration({ name, size = 140, className = "text-ink" }: IllustrationProps) {
  const Svg = COMPONENTS[name];
  return (
    <View className={className} style={{ width: size, height: size }}>
      <Svg width={size} height={size} color="currentColor" />
    </View>
  );
}
