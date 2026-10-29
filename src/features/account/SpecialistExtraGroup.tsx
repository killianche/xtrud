/**
 * Группа «Дополнительно» на вкладке профиля — нишевые настройки специалиста
 * (район работы, значок «Большой опыт»), вынесенные из «Профиля», чтобы не
 * конкурировать взглядом с «О себе»/«Фото работ»
 * (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.3 п.6). Тип аккаунта и
 * подтверждение личности/компании переехали в группу «Проверка» сразу после
 * «Анкеты» — см. `SpecialistVerificationGroup` (№368).
 */

import { useRouter } from "expo-router";
import { MapPin, Medal } from "phosphor-react-native";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useMasterServiceAreas } from "@/features/master-profile/use-service-areas";
import {
  EXPERIENCE_BADGE_STATUS_TEXT,
  useMyExperienceBadge,
} from "@/features/specialist/use-experience-badge";
import { DISTRICTS, getCityName } from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export function SpecialistExtraGroup({ userId }: { userId: string }) {
  const router = useRouter();
  const tc = useThemeColors(["ink"]);
  const experienceBadge = useMyExperienceBadge(!!userId);
  const areas = useMasterServiceAreas(userId ?? null);
  const areasValue = (() => {
    const list = areas.data ?? [];
    if (list.length === 0) return "Вся Ингушетия";
    const names = list.map((a) =>
      a.kind === "city"
        ? getCityName(a.location_id)
        : (DISTRICTS.find((d) => d.id === a.location_id)?.name ?? a.location_id),
    );
    return names.length <= 2 ? names.join(", ") : `${names[0]} +${names.length - 1}`;
  })();

  return (
    <InsetGroup title="Дополнительно">
      <InsetRow
        title="Где работаете"
        value={areasValue}
        icon={<MapPin size={18} weight="bold" color={tc.ink} />}
        navigates
        onPress={() => router.push("/profile/specialist/areas" as never)}
        last={!experienceBadge.isSuccess}
      />
      {/* Заявка на значок: администратор связывается и проверяет (0246,
          №318). Строка — только когда сервер отвечает: пока функция не
          открыта, человек не должен упираться в ошибку. */}
      {experienceBadge.isSuccess ? (
        <InsetRow
          title="Значок «Большой опыт»"
          value={EXPERIENCE_BADGE_STATUS_TEXT[experienceBadge.data?.status ?? "none"]}
          icon={<Medal size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/experience-badge" as never)}
          last
        />
      ) : null}
    </InsetGroup>
  );
}
