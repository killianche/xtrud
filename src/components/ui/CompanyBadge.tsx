/**
 * CompanyBadge — знак «Компания подтверждена» (0245, №308): заявку компании
 * (Instagram, WhatsApp) проверил администратор. Отдельно от галочки
 * «Личность подтверждена» (паспорт) — две разные проверки, два знака.
 * Рисуется только по факту из базы (company_verified_at).
 *
 * Иконка без подписи (владелец, 2026-10-08, №318: «значок улучши, текст
 * „Компания“ убрать»): здание в акцентном круге — того же размера, что
 * галочка паспорта рядом, и не путается с ней. В профиле по касанию —
 * пояснение, что именно проверено (onPress).
 */

import { BuildingOffice } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import { showAlert } from "@/lib/alert";
import { useThemeColors } from "@/lib/use-theme-color";

const LABEL = "Компания подтверждена";

export function explainCompanyBadge(): void {
  showAlert(LABEL, "Администратор xtrud связался с компанией и проверил её Instagram.");
}

export function CompanyBadge({
  size = 18,
  onPress,
}: {
  /** Диаметр круга — как у VerifiedBadge рядом. */
  size?: number;
  /** По касанию — пояснение (профиль). В строках списка — без касания. */
  onPress?: () => void;
}) {
  const tc = useThemeColors(["on-accent"]);
  const glyph = Math.round(size * 0.62);
  const circle = (
    <View
      className="items-center justify-center rounded-full bg-accent"
      style={{ width: size, height: size }}
    >
      <BuildingOffice size={glyph} weight="fill" color={tc["on-accent"]} />
    </View>
  );
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={LABEL}
        accessibilityHint="Что проверено"
        onPress={onPress}
        hitSlop={Math.max(0, Math.ceil((44 - size) / 2))}
        className="active:opacity-70"
      >
        {circle}
      </Pressable>
    );
  }
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={LABEL}>
      {circle}
    </View>
  );
}
