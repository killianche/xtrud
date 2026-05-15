// Расширяет IconProps Phosphor — добавляет NativeWind className.
// react-native-css-interop через NativeWind v4 уже мапит className → style
// на SVG-обёртках runtime'но, но Phosphor сам по себе не объявляет className.
// Без этого augmentation tsc ругается на `<House className="text-ink" ... />`.

import "phosphor-react-native";

declare module "phosphor-react-native" {
  interface IconProps {
    className?: string;
  }
}
