/**
 * /profile/specialist/experience-badge — заявка на значок «Большой опыт»
 * (0246, №318, docs/BADGE_REQUESTS_2026-10.md). Владелец, 2026-10-08:
 * «чтобы можно было отправить нам запрос на такой значок, мы вручную
 * поговорили, проверили и выдали».
 *
 * Специалист пишет об опыте и оставляет WhatsApp; администратор
 * связывается, смотрит работы и решает. Значок без чисел и бессрочный
 * (0225): годы и объекты человек пишет у себя в «О себе».
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { ExperienceBadge, FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  ABOUT_MAX,
  ABOUT_MIN,
  EXPERIENCE_BADGE_STATUS_TEXT,
  experienceBadgeErrorText,
  useMyExperienceBadge,
  useSubmitExperienceBadge,
} from "@/features/specialist/use-experience-badge";
import { useMySpecialistProfile } from "@/features/specialist/use-specialist";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { hapticSuccess } from "@/lib/haptics";

export default function ExperienceBadgeScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const my = useMyExperienceBadge(!!userId);
  const profile = useMySpecialistProfile(userId);
  const submit = useSubmitExperienceBadge();

  const [about, setAbout] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [filled, setFilled] = useState(false);
  // Заполняем один раз: прошлая заявка, иначе WhatsApp из «Контактов».
  useEffect(() => {
    if (filled || !my.data || profile.isLoading) return;
    setAbout(my.data.about ?? "");
    setWhatsapp(my.data.whatsapp ?? profile.data?.whatsapp_phone ?? "");
    setFilled(true);
  }, [filled, my.data, profile.isLoading, profile.data]);

  const status = my.data?.status ?? "none";
  const aboutTrim = about.trim();
  const aboutOk = aboutTrim.length >= ABOUT_MIN && aboutTrim.length <= ABOUT_MAX;
  const waDigits = whatsapp.replace(/\D/g, "");
  const waOk = waDigits.length >= 10 && waDigits.length <= 15;
  const canSend = status !== "approved" && aboutOk && waOk;

  const send = () =>
    submit.mutate(
      { about: aboutTrim, whatsapp: waDigits },
      {
        onSuccess: () => {
          hapticSuccess();
          router.back();
        },
      },
    );

  const footer =
    status === "approved"
      ? "Значок виден клиентам в вашем профиле и в списке специалистов."
      : status === "pending"
        ? "Заявка у администратора. Он напишет вам в WhatsApp. Можно дополнить текст и отправить снова."
        : status === "rejected"
          ? `Пока не выдан${my.data?.reason ? `: ${my.data.reason}` : ""}. Дополните рассказ и отправьте снова.`
          : "Расскажите об опыте — администратор свяжется с вами, посмотрит работы и решит. Значок бесплатный и бессрочный.";

  return (
    <FormScreen
      title="Значок «Большой опыт»"
      onBack={() => router.back()}
      primaryLabel={status === "approved" ? "Готово" : "Отправить на проверку"}
      onPrimary={status === "approved" ? () => router.back() : send}
      primaryDisabled={status !== "approved" && !canSend}
      busy={submit.isPending}
      error={submit.error ? experienceBadgeErrorText(submit.error) : null}
    >
      <View className="mb-4 items-center px-4">
        <ExperienceBadge />
      </View>
      <InsetGroup footer={footer}>
        <InsetRow
          title="Статус"
          value={my.isLoading ? "…" : EXPERIENCE_BADGE_STATUS_TEXT[status]}
          last
        />
      </InsetGroup>

      {status === "approved" ? null : (
        <>
          <ComposerField
            label="Об опыте"
            value={about}
            onChangeText={setAbout}
            placeholder="Сколько лет работаете, что делали, где посмотреть работы"
            multiline
            maxLength={ABOUT_MAX}
            error={about.length > 0 && !aboutOk ? `Хотя бы ${ABOUT_MIN} символов` : null}
            accessibilityLabel="Об опыте"
          />
          <ComposerField
            label="WhatsApp для связи с администратором"
            value={whatsapp}
            onChangeText={setWhatsapp}
            placeholder="+7 928 000-00-00"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={whatsapp && !waOk ? "Проверьте номер" : null}
            accessibilityLabel="WhatsApp для связи с администратором"
          />
          <View className="px-8 pb-4">
            <AppText className="text-ios-footnote text-mute">
              Рассказ и WhatsApp видит только администратор, клиентам они не показываются.
            </AppText>
          </View>
        </>
      )}
    </FormScreen>
  );
}
