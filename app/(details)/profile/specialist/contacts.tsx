/**
 * /profile/specialist/contacts — как с вами связываться: телефон для
 * клиентов и WhatsApp. Телефон виден в каталоге и в профиле; можно указать
 * не тот, что в аккаунте.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import {
  useMySpecialistProfile,
  useUpdateSpecialistContacts,
} from "@/features/specialist/use-specialist";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { isPhoneAcceptable } from "@/features/task-composer/steps";
import { useUnsavedChangesGuard } from "@/lib/use-unsaved-changes-guard";

const PHONE_ERROR = "Введите номер полностью";

export default function SpecialistContactsScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const profile = useMySpecialistProfile(userId);
  const update = useUpdateSpecialistContacts();
  const [phone, setPhone] = useState<string | null>(null);
  const [wa, setWa] = useState("");
  useEffect(() => {
    if (phone === null && user && profile.data !== undefined) {
      setPhone(user.contact_phone ?? "");
      setWa(profile.data?.whatsapp_phone ?? "");
    }
  }, [user, profile.data, phone]);

  const valid =
    phone !== null && phone.trim().length > 0 && isPhoneAcceptable(phone) && isPhoneAcceptable(wa);
  // Уйти с несохранёнными правками можно только осознанно (QA).
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges:
      phone !== null &&
      (phone !== (user?.contact_phone ?? "") || wa !== (profile.data?.whatsapp_phone ?? "")),
    isBusy: update.isPending,
  });
  const save = () => {
    if (!userId || phone === null) return;
    update.mutate(
      { userId, contactPhone: phone, whatsappPhone: wa },
      {
        onSuccess: () => {
          allowLeave();
          router.back();
        },
      },
    );
  };

  return (
    <FormScreen
      title="Как с вами связаться?"
      subtitle="Клиенты звонят и пишут напрямую — номер виден в профиле."
      onBack={() => router.back()}
      primaryLabel="Готово"
      onPrimary={save}
      primaryDisabled={!valid}
      busy={update.isPending}
      error={update.error ? "Не удалось сохранить. Попробуйте ещё раз." : null}
    >
      <ComposerField
        label="Телефон"
        value={phone ?? ""}
        onChangeText={setPhone}
        placeholder="+7 928 000-00-00"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        error={phone !== null && !isPhoneAcceptable(phone) ? PHONE_ERROR : null}
        hint="Можно указать не тот номер, что в аккаунте."
        accessibilityLabel="Телефон для клиентов"
      />
      <ComposerField
        label="WhatsApp"
        value={wa}
        onChangeText={setWa}
        placeholder="Если отличается от телефона"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        error={isPhoneAcceptable(wa) ? null : PHONE_ERROR}
        accessibilityLabel="Номер WhatsApp"
      />
    </FormScreen>
  );
}
