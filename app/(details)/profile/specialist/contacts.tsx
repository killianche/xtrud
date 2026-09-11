/**
 * /profile/specialist/contacts — как с вами связываться: телефон для
 * клиентов и WhatsApp. Телефон виден в каталоге и в профиле; можно указать
 * не тот, что в аккаунте.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { normalizeLinkUrl } from "@/features/specialist/link-url";
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
  // Выключен по умолчанию: WhatsApp есть не у всех, а включённый переключатель
  // подставлял номер за человека. Клиент видел кнопку «WhatsApp», которая вела
  // в пустоту (владелец, 2026-09-09). Интерфейс не должен утверждать того, что
  // никто не подтверждал (design-quality §5).
  const [same, setSame] = useState(false);
  // Соцсеть или сайт с работами (0188), по желанию.
  const [link, setLink] = useState("");
  useEffect(() => {
    if (phone === null && user && profile.data !== undefined) {
      setPhone(user.contact_phone ?? "");
      setWa(profile.data?.whatsapp_phone ?? "");
      setLink(profile.data?.link_url ?? "");
      // Восстанавливаем сохранённый ответ, а не выводим его из отсутствия
      // отдельного номера: раньше выключенный переключатель возвращался
      // включённым.
      setSame(profile.data?.whatsapp_same_as_phone === true);
    }
  }, [user, profile.data, phone]);

  const linkUrl = normalizeLinkUrl(link);
  const valid =
    phone !== null &&
    phone.trim().length > 0 &&
    isPhoneAcceptable(phone) &&
    isPhoneAcceptable(wa) &&
    linkUrl !== undefined;
  // Уйти с несохранёнными правками можно только осознанно (QA).
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges:
      phone !== null &&
      (phone !== (user?.contact_phone ?? "") ||
        wa !== (profile.data?.whatsapp_phone ?? "") ||
        link !== (profile.data?.link_url ?? "")),
    isBusy: update.isPending,
  });
  const save = () => {
    if (!userId || phone === null || linkUrl === undefined) return;
    update.mutate(
      {
        userId,
        contactPhone: phone,
        whatsappPhone: same ? "" : wa,
        whatsappSameAsPhone: same,
        linkUrl,
      },
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
      <InsetGroup footer={same ? "Клиенты напишут в WhatsApp на этот же номер." : undefined}>
        <InsetRow
          title="WhatsApp — тот же номер"
          toggle={{ value: same, onChange: setSame }}
          last
        />
      </InsetGroup>
      {same ? null : (
        <ComposerField
          label="Номер WhatsApp"
          value={wa}
          onChangeText={setWa}
          placeholder="+7 928 000-00-00"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          error={isPhoneAcceptable(wa) ? null : PHONE_ERROR}
          accessibilityLabel="Номер WhatsApp"
        />
      )}
      <ComposerField
        label="Ссылка"
        value={link}
        onChangeText={setLink}
        placeholder="instagram.com/ваш_профиль"
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        error={linkUrl === undefined ? "Проверьте ссылку: например, instagram.com/имя" : null}
        hint="Соцсеть или сайт с вашими работами — по желанию."
        accessibilityLabel="Ссылка на соцсеть или сайт"
      />
    </FormScreen>
  );
}
