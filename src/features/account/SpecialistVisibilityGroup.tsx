/**
 * Группа «Видимость» на вкладке профиля — одна строка-переключатель
 * «Показывать профиль клиентам» вместо прежних «Статус» + ⓘ + тумблер
 * (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.3 п.3). Экран-объяснение
 * статусов (`/profile/specialist/statuses`) больше не нужен — весь смысл в
 * footer этой группы.
 */

import { useRouter } from "expo-router";
import { InsetGroup, InsetRow } from "@/components/ui";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { useUserRecord } from "@/features/auth/use-user-record";
import { promptChooseCategory } from "@/features/specialist/category-required";
import { useMySpecialistProfile, useSetShownInCatalog } from "@/features/specialist/use-specialist";
import { openExternalUrl } from "@/lib/open-link";

export function SpecialistVisibilityGroup({
  userId,
  hasCategories,
}: {
  userId: string;
  hasCategories: boolean;
}) {
  const router = useRouter();
  const { data: user } = useUserRecord(userId);
  const profile = useMySpecialistProfile(userId);
  const setShown = useSetShownInCatalog(userId);
  const m = profile.data;

  // Видим в каталоге: есть категория (status active) и человек не снял
  // галочку «Показывать меня среди специалистов».
  const canBeShown = m?.status === "active" && !m?.is_hidden_from_search;
  const shown = !m?.hidden_by_owner;
  const suspended = m?.status === "suspended";
  const bannedOrDeleted = user?.status === "banned" || user?.status === "deleted";

  const footer =
    suspended || bannedOrDeleted
      ? "Профиль скрыт администратором. Напишите в поддержку."
      : !hasCategories
        ? "Выберите категорию — и профиль появится в поиске"
        : !shown
          ? "Профиль скрыт. Включите — и клиенты снова будут находить вас"
          : "Клиенты находят вас во вкладке «Специалисты»";

  return (
    <InsetGroup title="Видимость" footer={footer}>
      <InsetRow
        title="Показывать профиль клиентам"
        toggle={{
          // Безопасный fallback: даже если забаненного/скрытого человека
          // сюда занесла гонка данных, тумблер визуально выключен.
          value: suspended || bannedOrDeleted ? false : canBeShown && shown,
          onChange: (next) => {
            if (suspended || bannedOrDeleted) {
              // Тап — в поддержку, тумблер не меняется.
              void openExternalUrl(SUPPORT_URL);
              return;
            }
            if (canBeShown) {
              setShown.mutate(next);
            } else {
              promptChooseCategory(() => router.push("/profile/specialist/categories" as never));
            }
          },
        }}
        last
      />
    </InsetGroup>
  );
}
