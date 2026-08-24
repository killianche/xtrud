/**
 * DescribeTaskIllustration — иллюстрация для CTA «Создайте заказ» на главной.
 *
 * Заменяет тяжёлую Lottie `candidate-list.json` (388 КБ JSON). Inline SVG через
 * react-native-svg, theme-aware.
 *
 * Метафора: чертёж/бриф задачи на ремонт. Лист бумаги (план) с галочками-пунктами
 * + карандаш / линейка-угольник. Соответствует CTA «опишите задачу — мастера
 * откликнутся». БЕЗ людей (явное требование 2026-05-21).
 *
 * Стиль:
 *   - Pure outline, stroke-only, stroke-width 1.5px.
 *   - Один accent на checkmark-галочках («задача описана, готова к отправке»).
 *   - Vercel/Linear/Stripe-density: чёткие линии, плотность инфо высокая, но без шума.
 *
 * Вес: ~2 КБ компилированного JS против 388 КБ Lottie.
 *
 * Референс: DoorDash empty state + Linear task-list iconography.
 */

import { Circle, G, Line, Path, Rect, Svg } from "react-native-svg";
import { useThemeColors } from "@/lib/use-theme-color";

interface DescribeTaskIllustrationProps {
  /** Размер по большей стороне (квадрат). Default 220. */
  size?: number;
}

export function DescribeTaskIllustration({ size = 220 }: DescribeTaskIllustrationProps) {
  const {
    ink,
    link,
    "hairline-strong": hairlineStrong,
  } = useThemeColors(["ink", "link", "hairline-strong"]);

  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      {/* Подложка-stand — тонкая горизонталь, как стол */}
      <Line
        x1="20"
        y1="172"
        x2="180"
        y2="172"
        stroke={hairlineStrong}
        strokeWidth={1}
        strokeLinecap="round"
      />

      {/* === Лист бумаги (бриф задачи) === */}
      <G stroke={ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Контур листа — слегка наклонён, как лежит на столе */}
        <Path d="M 60 36 L 145 36 L 145 158 L 60 158 Z" transform="rotate(-3 102 97)" />
        {/* Загнутый уголок — деталь, делает лист «бумажным» */}
        <Path d="M 135 36 L 145 46 L 135 46 Z" transform="rotate(-3 102 97)" />
      </G>

      {/* === Заголовок задачи (3 коротких штриха-текстовых строки) === */}
      <G stroke={hairlineStrong} strokeWidth={1.5} strokeLinecap="round">
        <Line x1="72" y1="55" x2="125" y2="52" />
        <Line x1="72" y1="64" x2="115" y2="62" />
      </G>

      {/* === Чек-лист задачи (3 пункта с галочками) === */}
      {/* Пункт 1 — выполнен (accent checkmark) */}
      <G stroke={link} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 70 84 L 74 88 L 82 80" transform="rotate(-3 102 97)" />
      </G>
      <Line x1="88" y1="83" x2="135" y2="80" stroke={ink} strokeWidth={1.5} strokeLinecap="round" />

      {/* Пункт 2 — выполнен (accent checkmark) */}
      <G stroke={link} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 70 105 L 74 109 L 82 101" transform="rotate(-3 102 97)" />
      </G>
      <Line
        x1="88"
        y1="104"
        x2="138"
        y2="101"
        stroke={ink}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* Пункт 3 — пустой чек-бокс (ещё не отмечен) */}
      <G stroke={ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Rect x="68" y="119" width="10" height="10" rx="1.5" transform="rotate(-3 102 97)" />
      </G>
      <Line
        x1="88"
        y1="126"
        x2="128"
        y2="123"
        stroke={hairlineStrong}
        strokeWidth={1.5}
        strokeLinecap="round"
      />

      {/* === Карандаш — справа сверху над листом === */}
      {/* Корпус карандаша */}
      <G stroke={ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M 152 28 L 168 12 L 178 22 L 162 38 Z" />
        {/* Грифель */}
        <Path d="M 152 28 L 148 42 L 162 38" />
        <Line x1="152" y1="28" x2="162" y2="38" />
        {/* Ластик-капсула на конце */}
        <Path d="M 168 12 L 173 7 L 183 17 L 178 22" />
      </G>

      {/* === Линейка-угольник — слева снизу, под листом === */}
      <G stroke={ink} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Треугольный угольник 90° */}
        <Path d="M 28 130 L 58 130 L 28 168 Z" />
        {/* Деления на длинной стороне */}
        <Line x1="34" y1="130" x2="34" y2="134" />
        <Line x1="40" y1="130" x2="40" y2="134" />
        <Line x1="46" y1="130" x2="46" y2="134" />
        <Line x1="52" y1="130" x2="52" y2="134" />
        {/* Внутренний угол 90° */}
        <Path d="M 33 130 L 33 135 L 28 135" />
      </G>

      {/* === Маленькая «искра» — accent, символизирует «отклик мастера» === */}
      <G stroke={link} strokeWidth={1.5} strokeLinecap="round">
        <Circle cx="170" cy="148" r="2" fill={link} stroke="none" />
        <Line x1="170" y1="140" x2="170" y2="143" />
        <Line x1="170" y1="153" x2="170" y2="156" />
        <Line x1="162" y1="148" x2="165" y2="148" />
        <Line x1="175" y1="148" x2="178" y2="148" />
      </G>
    </Svg>
  );
}
