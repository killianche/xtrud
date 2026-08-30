// Generic тип icon-компонента для shared компонентов
// (EmptyState, ScreenHeader, Button, etc), чтобы можно было передавать
// и Lucide, и Phosphor (моно UI icon set) без конфликта типов.
//
// Lucide: `ForwardRefExoticComponent<LucideProps>` (имеет $$typeof из forwardRef).
// Phosphor: `FunctionComponent<IconProps>`. Type-mismatch.
// IconComponent — общий supertype, описывает только используемые props.
//
// См. также `docs/UI_ICONS.md` — Phosphor дефолт для нового кода.

import type { ComponentType } from "react";

export type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
}>;
