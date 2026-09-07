/**
 * /profile/specialist/about — «Расскажите о себе»: короткий текст и опыт.
 * Как «About me» и «Skills & Experience» у TaskRabbit, но одним экраном.
 */

import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  useMySpecialistProfile,
  useUpdateSpecialistAbout,
} from "@/features/specialist/use-specialist";
import { ComposerField } from "@/features/task-composer/ComposerFields";

const BIO_MAX = 500;
const EXPERIENCE: Array<{ years: number; label: string }> = [
  { years: 1, label: "Меньше года" },
  { years: 2, label: "1–3 года" },
  { years: 5, label: "3–7 лет" },
  { years: 10, label: "Больше 7 лет" },
];

export default function SpecialistAboutScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const profile = useMySpecialistProfile(userId);
  const update = useUpdateSpecialistAbout();
  const [bio, setBio] = useState<string | null>(null);
  const [years, setYears] = useState<number | null>(null);
  useEffect(() => {
    if (bio === null && profile.data) {
      setBio(profile.data.bio ?? "");
      setYears(profile.data.experience_years ?? null);
    }
  }, [profile.data, bio]);

  const save = () => {
    if (!userId || bio === null) return;
    update.mutate({ userId, bio, experienceYears: years }, { onSuccess: () => router.back() });
  };

  return (
    <FormScreen
      title="Расскажите о себе"
      subtitle="Что делаете, с чем приходить, что важно знать клиенту."
      onBack={() => router.back()}
      primaryLabel="Готово"
      onPrimary={save}
      primaryDisabled={bio === null}
      busy={update.isPending}
      error={update.error ? "Не удалось сохранить. Попробуйте ещё раз." : null}
    >
      <ComposerField
        label="О себе"
        multiline
        value={bio ?? ""}
        onChangeText={(t) => setBio(t.slice(0, BIO_MAX))}
        placeholder="Например: делаю электрику в квартирах и домах — розетки, щитки, освещение. Свой инструмент, приезжаю в день обращения."
        hint={(bio?.length ?? 0) > BIO_MAX - 100 ? `${bio?.length ?? 0} из ${BIO_MAX}` : undefined}
        accessibilityLabel="О себе"
      />
      <InsetGroup title="Опыт">
        {EXPERIENCE.map((e, i) => (
          <InsetRow
            key={e.years}
            title={e.label}
            selected={years === e.years}
            onPress={() => setYears(e.years)}
            last={i === EXPERIENCE.length - 1}
          />
        ))}
      </InsetGroup>
    </FormScreen>
  );
}
