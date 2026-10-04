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
  isInstagramValid,
  normalizeInstagram,
  useMyInstagram,
  useSubmitInstagram,
} from "@/features/specialist/use-my-instagram";
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
  // Instagram — отдельно, с проверкой админом (0218, №207).
  const insta = useMyInstagram(!!userId);
  const submitInsta = useSubmitInstagram();
  const [instagram, setInstagram] = useState<string | null>(null);
  useEffect(() => {
    if (instagram === null && insta.data) setInstagram(insta.data.handle ?? "");
  }, [insta.data, instagram]);
  const instaHandle = normalizeInstagram(instagram ?? "");
  const instaChanged = instagram !== null && instaHandle !== (insta.data?.handle ?? "");
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
    linkUrl !== undefined &&
    isInstagramValid(instaHandle);
  // Уйти с несохранёнными правками можно только осознанно (QA).
  const allowLeave = useUnsavedChangesGuard({
    hasUnsavedChanges:
      phone !== null &&
      (phone !== (user?.contact_phone ?? "") ||
        wa !== (profile.data?.whatsapp_phone ?? "") ||
        link !== (profile.data?.link_url ?? "") ||
        instaChanged),
    isBusy: update.isPending || submitInsta.isPending,
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
        onSuccess: async () => {
          if (instaChanged) {
            try {
              await submitInsta.mutateAsync(instaHandle);
            } catch {
              return; // ошибку покажет экран — остаёмся на нём
            }
          }
          allowLeave();
          router.back();
        },
      },
    );
  };

  return (
    <FormScreen
      title="Как с вами связаться?"
      onBack={() => router.back()}
      primaryLabel="Готово"
      onPrimary={save}
      primaryDisabled={!valid}
      busy={update.isPending || submitInsta.isPending}
      error={update.error || submitInsta.error ? "Не удалось сохранить. Попробуйте ещё раз." : null}
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
        accessibilityLabel="Телефон для клиентов"
      />
      <InsetGroup>
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
        label="Instagram*"
        value={instagram ?? ""}
        onChangeText={setInstagram}
        placeholder="@ваш_профиль"
        autoCapitalize="none"
        autoCorrect={false}
        error={isInstagramValid(instaHandle) ? null : "Только латиница, цифры, точка и «_»"}
        hint={instagramHint(insta.data?.status, insta.data?.reason ?? null, instaChanged)}
        accessibilityLabel="Instagram"
      />
      <ComposerField
        label="Ссылка"
        value={link}
        onChangeText={setLink}
        placeholder="сайт с вашими работами"
        keyboardType="url"
        textContentType="URL"
        autoCapitalize="none"
        autoCorrect={false}
        error={linkUrl === undefined ? "Проверьте ссылку: например, site.ru" : null}
        accessibilityLabel="Ссылка на соцсеть или сайт"
      />
    </FormScreen>
  );
}

/** Статус проверки Instagram под полем; плюс обязательная пометка о Meta. */
function instagramHint(
  status: string | undefined,
  reason: string | null,
  changed: boolean,
): string {
  const meta =
    "*Instagram принадлежит Meta — организация признана экстремистской и запрещена в России.";
  if (changed) return `Покажем в профиле после проверки. ${meta}`;
  if (status === "pending") return `На проверке — появится в профиле после неё. ${meta}`;
  if (status === "approved") return `Проверен и показан в профиле. ${meta}`;
  if (status === "rejected") return `Не прошёл проверку${reason ? `: ${reason}` : ""}. ${meta}`;
  return `Добавьте — покажем в профиле, когда проверим. ${meta}`;
}
