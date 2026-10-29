/**
 * Группа «Проверка» на вкладке профиля — тип аккаунта («Кто вы») и
 * подтверждение рядом друг с другом, сразу после «Анкеты» (№368). Раньше обе
 * строки жили в «Дополнительно» вперемешку с «Где работаете» и не зависели
 * от типа — человек с типом «Компания» отправил в «Паспорт» логотип фирмы,
 * перепутав его с заявкой компании.
 *
 * Частному мастеру — паспорт («Подтверждение личности», по желанию).
 * Компании — заявка компании (название, Instagram, WhatsApp); паспорт
 * компании — тоже по желанию, отдельной строкой ниже.
 */

import { useRouter } from "expo-router";
import { BuildingOffice, IdentificationCard, ShieldCheck } from "phosphor-react-native";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useMyCompany } from "@/features/specialist/use-company";
import { useMyVerification, VERIFICATION_LABEL } from "@/features/specialist/use-verification";
import { useThemeColors } from "@/lib/use-theme-color";

// Статус компании — все четыре значения разные (в отличие от экрана
// company.tsx, где «не подтверждена» и «отклонена» слиты): здесь строка
// короткая и причина отклонения ушла в сам экран.
const COMPANY_STATUS_LABEL = {
  none: "Не подтверждена",
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Отклонена",
} as const;

export function SpecialistVerificationGroup({ userId }: { userId: string }) {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const company = useMyCompany(!!userId);
  const verification = useMyVerification(userId);

  // Пока тип не загружен — строки не рисуются вовсе: мигнуть «Частный
  // мастер» и тут же смениться на «Компания» хуже короткой паузы (№368).
  if (!company.isSuccess) return null;

  const isCompany = company.data.account_type === "company";
  const verificationValue = VERIFICATION_LABEL[verification.data?.status ?? "none"];

  return (
    <InsetGroup title="Проверка" footer="Значок рядом с именем — клиенты больше доверяют">
      <InsetRow
        title="Кто вы"
        value={isCompany ? "Компания" : "Частный мастер"}
        icon={<BuildingOffice size={18} weight="bold" color={tc.ink} />}
        navigates
        onPress={() => router.push("/profile/specialist/company" as never)}
      />
      {isCompany ? (
        <InsetRow
          title="Компания"
          value={COMPANY_STATUS_LABEL[company.data.status]}
          icon={<ShieldCheck size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/company" as never)}
        />
      ) : null}
      <InsetRow
        title={isCompany ? "Паспорт · по желанию" : "Паспорт"}
        value={verificationValue}
        icon={<IdentificationCard size={18} weight="bold" color={tc.ink} />}
        navigates
        onPress={() => router.push("/profile/specialist/verify" as never)}
        last
      />
    </InsetGroup>
  );
}
