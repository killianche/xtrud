/**
 * SpecialistHubBody — настройки «Я специалист»: категории, о себе, фото
 * работ, контакты, где работаете, подтверждение личности, показ в каталоге.
 * Одно тело для двух мест: экран /profile/specialist (из аккаунта) и вторая
 * вкладка «Я специалист» на «Специалистах» (DECISION владельца 2026-09-08).
 */

import { useRouter } from "expo-router";
import {
  ChatCircleText,
  IdentificationCard,
  Images,
  MapPin,
  Phone,
  SquaresFour,
  Star,
  Tag,
  UserCircle,
} from "phosphor-react-native";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { InsetGroup, InsetRow } from "@/components/ui";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useMasterServiceAreas } from "@/features/master-profile/use-service-areas";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { useMySpecialistProfile, useSetShownInCatalog } from "@/features/specialist/use-specialist";
import { useMyVerification, VERIFICATION_LABEL } from "@/features/specialist/use-verification";
import { DISTRICTS, getCityName } from "@/lib/location-config";
import { useThemeColors } from "@/lib/use-theme-color";

export function SpecialistHubBody({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: user } = useUserRecord(userId);
  const profile = useMySpecialistProfile(userId);
  const categories = useMyMasterCategories(userId);
  const verification = useMyVerification(userId);
  const setShown = useSetShownInCatalog(userId);
  const portfolio = useMasterPortfolio(userId ?? null);
  const areas = useMasterServiceAreas(userId ?? null);
  const tc = useThemeColors(["ink", "accent", "on-accent"]);

  const m = profile.data;
  const categoryNames = (categories.data ?? [])
    .map((c) => c.l2?.name_ru)
    .filter(Boolean) as string[];
  const categoriesValue =
    categoryNames.length === 0
      ? "Не выбраны"
      : categoryNames.length <= 2
        ? categoryNames.join(", ")
        : `${categoryNames[0]} +${categoryNames.length - 1}`;
  const aboutValue = m?.bio?.trim() ? "Заполнено" : "Не заполнено";
  const photosCount = portfolio.data?.length ?? 0;
  const contactsValue = user?.contact_phone
    ? m?.whatsapp_phone
      ? "Телефон · WhatsApp"
      : "Телефон"
    : "Не указаны";
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
  // Видим в каталоге: есть категория (status active) и человек не снял
  // галочку «Показывать меня среди специалистов».
  const canBeShown = m?.status === "active" && !m?.is_hidden_from_search;
  const shown = !m?.hidden_by_owner;
  const visible = canBeShown && shown;
  const verificationValue = VERIFICATION_LABEL[verification.data?.status ?? "none"];
  const rating = m?.rating_overall_count
    ? `${Number(m.rating_overall_avg ?? 0).toFixed(1)} · ${m.rating_overall_count}`
    : "Пока нет";

  const statusText = visible
    ? "Профиль виден в каталоге. Чем полнее он заполнен, тем чаще к вам обращаются."
    : canBeShown
      ? "Вы скрыли профиль из каталога. Включите «Показывать меня среди специалистов», чтобы вас находили."
      : "Выберите хотя бы одну категорию — и профиль появится в каталоге.";

  return (
    <>
      <View className="mb-5 px-5">
        <AppText className="text-ios-subheadline text-mute">{statusText}</AppText>
      </View>
      <View className="mb-7 flex-row items-center gap-4 px-5">
        <Avatar url={user?.avatar_url} name={user?.first_name} seed={userId} size="lg" />
        <View className="min-w-0 flex-1">
          <AppText weight="semibold" className="text-ios-title2 text-ink" numberOfLines={1}>
            {user?.first_name ?? "Специалист"}
          </AppText>
          <AppText className="mt-0.5 text-ios-subheadline text-mute">
            {visible ? "В каталоге" : "Скрыт из каталога"}
          </AppText>
        </View>
      </View>

      {canBeShown ? (
        <InsetGroup
          footer={
            shown
              ? "Клиенты находят вас во вкладке «Специалисты»."
              : "Профиль не показывается в каталоге, но открывается по ссылке."
          }
        >
          <InsetRow
            title="Показывать меня среди специалистов"
            toggle={{ value: shown, onChange: (next) => setShown.mutate(next) }}
            last
          />
        </InsetGroup>
      ) : null}

      <InsetGroup title="Профиль">
        <InsetRow
          title="Категории"
          value={categoriesValue}
          icon={<SquaresFour size={18} weight="bold" color={tc["on-accent"]} />}
          iconAccent
          navigates
          onPress={() => router.push("/profile/specialist/categories" as never)}
        />
        <InsetRow
          title="О себе"
          value={aboutValue}
          icon={<UserCircle size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/about" as never)}
        />
        <InsetRow
          title="Фото работ"
          value={photosCount > 0 ? `${photosCount}` : "Нет"}
          icon={<Images size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/photos" as never)}
        />
        <InsetRow
          title="Контакты"
          value={contactsValue}
          icon={<Phone size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/contacts" as never)}
        />
        <InsetRow
          title="Где работаете"
          value={areasValue}
          icon={<MapPin size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/areas" as never)}
        />
        <InsetRow
          title="Подтверждение личности"
          value={verificationValue}
          icon={<IdentificationCard size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/specialist/verify" as never)}
          last
        />
      </InsetGroup>

      <InsetGroup title="Клиенты">
        <InsetRow
          title="Отзывы"
          value={rating}
          icon={<Star size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push(`/master/${userId}` as never)}
        />
        <InsetRow
          title="Услуги и цены"
          icon={<Tag size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/services-suggest" as never)}
        />
        <InsetRow
          title="Как меня видят клиенты"
          icon={<ChatCircleText size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push(`/master/${userId}` as never)}
          last
        />
      </InsetGroup>
    </>
  );
}
