// SVG-как-React-компонент через react-native-svg-transformer.
// Импорт: `import Wallet from "@/assets/illustrations/wallet.svg"`
// Использование: <Wallet width={120} height={120} color="currentColor" />
declare module "*.svg" {
  import type { FC } from "react";
  import type { SvgProps } from "react-native-svg";
  const content: FC<SvgProps>;
  export default content;
}
