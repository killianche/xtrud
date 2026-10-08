/**
 * /profile/specialist/company — «Как вас показывать» и подтверждение
 * компании (0245, №308, docs/COMPANY_VERIFICATION_2026-10.md). ИНН не
 * спрашиваем (владелец, 2026-10-08: «ИНН не надо»).
 *
 * «Частный мастер» — в каталоге имя. «Компания» — название вместо имени;
 * значок «Компания подтверждена» — после заявки (Instagram, WhatsApp) и
 * проверки администратором. Смена названия снимает значок до новой проверки.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  companyErrorText,
  useMyCompany,
  useSetAccountType,
  useSubmitCompany,
} from "@/features/specialist/use-company";
import { isInstagramValid, normalizeInstagram } from "@/features/specialist/use-my-instagram";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { hapticSuccess } from "@/lib/haptics";

const STATUS_TEXT = {
  none: "Не подтверждена",
  pending: "На проверке",
  approved: "Подтверждена",
  rejected: "Не подтверждена",
} as const;

export default function CompanyScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const my = useMyCompany(!!userId);
  const setType = useSetAccountType();
  const submit = useSubmitCompany();

  const [isCompany, setIsCompany] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  useEffect(() => {
    if (isCompany !== null || !my.data) return;
    setIsCompany(my.data.account_type === "company");
    setName(my.data.legal_name ?? "");
    setInstagram(my.data.instagram ?? "");
    setWhatsapp(my.data.whatsapp ?? "");
  }, [my.data, isCompany]);

  const status = my.data?.status ?? "none";
  const trimmed = name.trim().replace(/\s+/g, " ");
  const nameOk = trimmed.length >= 2 && trimmed.length <= 80;
  const insta = normalizeInstagram(instagram);
  const waDigits = whatsapp.replace(/\D/g, "");
  const formOk =
    nameOk &&
    insta.length > 0 &&
    isInstagramValid(insta) &&
    waDigits.length >= 10 &&
    waDigits.length <= 15;
  const nameChanged = trimmed !== (my.data?.legal_name ?? "");
  const busy = setType.isPending || submit.isPending;
  const error =
    setType.error || submit.error ? companyErrorText(setType.error ?? submit.error) : null;

  // Частный мастер — сохранить тип; компания — сохранить название (без
  // заявки) или подать заявку, если заполнены Instagram и WhatsApp.
  const save = () => {
    if (isCompany === false) {
      setType.mutate({ type: "solo", legalName: null }, { onSuccess: () => router.back() });
      return;
    }
    if (formOk && status !== "approved" && status !== "pending") {
      submit.mutate(
        { legalName: trimmed, instagram: insta, whatsapp: waDigits, inn: null },
        {
          onSuccess: () => {
            hapticSuccess();
            router.back();
          },
        },
      );
      return;
    }
    if (formOk && (nameChanged || insta !== (my.data?.instagram ?? ""))) {
      submit.mutate(
        { legalName: trimmed, instagram: insta, whatsapp: waDigits, inn: null },
        { onSuccess: () => router.back() },
      );
      return;
    }
    setType.mutate({ type: "company", legalName: trimmed }, { onSuccess: () => router.back() });
  };

  const primaryLabel =
    isCompany && formOk && (status === "none" || status === "rejected")
      ? "Отправить на проверку"
      : "Готово";

  return (
    <FormScreen
      title="Как вас показывать?"
      onBack={() => router.back()}
      primaryLabel={primaryLabel}
      onPrimary={save}
      primaryDisabled={isCompany === null || (isCompany === true && !nameOk)}
      busy={busy}
      error={error}
    >
      <InsetGroup>
        <InsetRow
          title="Частный мастер"
          subtitle="В каталоге — ваше имя"
          checked={isCompany === false}
          onPress={() => setIsCompany(false)}
        />
        <InsetRow
          title="Компания"
          subtitle="В каталоге — название компании"
          checked={isCompany === true}
          onPress={() => setIsCompany(true)}
          last
        />
      </InsetGroup>

      {isCompany ? (
        <>
          <ComposerField
            label="Название компании"
            value={name}
            onChangeText={setName}
            placeholder="Например, «Крутые семечки»"
            maxLength={80}
            error={name.length > 0 && !nameOk ? "От 2 до 80 символов" : null}
            accessibilityLabel="Название компании"
          />

          <InsetGroup
            title="Значок «Компания подтверждена»"
            footer={
              status === "approved"
                ? "Значок стоит рядом с названием, Instagram — в профиле. Смена названия или Instagram отправит компанию на новую проверку."
                : status === "pending"
                  ? "Заявка у администратора. Он может написать вам в WhatsApp."
                  : status === "rejected"
                    ? `Не подтверждена${my.data?.reason ? `: ${my.data.reason}` : ""}. Исправьте и отправьте снова.`
                    : "Заполните Instagram и WhatsApp — администратор проверит компанию, и рядом с названием появится значок."
            }
          >
            <InsetRow title="Статус" value={STATUS_TEXT[status]} last />
          </InsetGroup>

          <ComposerField
            label="Instagram компании*"
            value={instagram}
            onChangeText={setInstagram}
            placeholder="@ваша_компания"
            autoCapitalize="none"
            autoCorrect={false}
            error={insta && !isInstagramValid(insta) ? "Только латиница, цифры, точка и «_»" : null}
            hint="*Instagram принадлежит Meta — организация признана экстремистской и запрещена в России."
            accessibilityLabel="Instagram компании"
          />
          <ComposerField
            label="WhatsApp для связи с администратором"
            value={whatsapp}
            onChangeText={setWhatsapp}
            placeholder="+7 928 000-00-00"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={
              whatsapp && (waDigits.length < 10 || waDigits.length > 15) ? "Проверьте номер" : null
            }
            accessibilityLabel="WhatsApp для связи с администратором"
          />
          <View className="px-8 pb-4">
            <AppText className="text-ios-footnote text-mute">
              WhatsApp видит только администратор, клиентам он не показывается.
            </AppText>
          </View>
        </>
      ) : null}
    </FormScreen>
  );
}
