/**
 * Содержимое вкладки «Профиль»: шапка (аватар + имя) с индикатором
 * заполненности, «Видимость», «Принимаю задания», «Профиль» (категории, имя
 * и фото, о себе, фото работ, контакты), «Дополнительно», «Клиенты»,
 * «Управление» (staff), «Личные данные», «Аккаунт», «Написать в поддержку»,
 * «Выйти».
 *
 * Слияние 2026-10-23 (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md): раньше
 * вкладка открывала общий «Аккаунт», а настройки специалиста жили отдельным
 * экраном-хабом (`SpecialistHubBody`, удалён) за лишним переходом. Теперь
 * вкладка профиля сразу и есть настройки специалиста — владелец прямо просил
 * убрать путь «вкладка → Аккаунт → карточка → хаб».
 *
 * Один экран на два входа: вкладка /(tabs)/profile и /account (старые
 * диплинки и переходы из уведомлений/настроек) показывают это одно и то же.
 */

import { useRouter } from "expo-router";
import {
  BellSimple,
  ChatCircleText,
  Gear,
  Headset,
  Images,
  LockKey,
  PencilSimple,
  Phone,
  ShieldCheck,
  SignOut,
  SquaresFour,
  Star,
  Tag,
  UserCircle,
} from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { InsetGroup, InsetRow } from "@/components/ui";
import { SpecialistExtraGroup } from "@/features/account/SpecialistExtraGroup";
import { SpecialistVisibilityGroup } from "@/features/account/SpecialistVisibilityGroup";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyMasterCategories } from "@/features/master-categories/use-my-categories";
import { useUnreadReviewsCount } from "@/features/notifications/use-notifications";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { AvailabilityRows } from "@/features/specialist/AvailabilityRows";
import { ProfileProgressBar } from "@/features/specialist/ProfileProgressBar";
import {
  useEnableSpecialistMode,
  useMySpecialistProfile,
} from "@/features/specialist/use-specialist";
import { useSpecialistProfileCompleteness } from "@/features/specialist/use-specialist-profile-completeness";
import { useStaffRole } from "@/features/staff/use-staff";
import { showAlert } from "@/lib/alert";
import { signOut } from "@/lib/auth";
import { realAvatarUrl } from "@/lib/avatar";
import { confirmAsync } from "@/lib/confirm";
import { openExternalUrl } from "@/lib/open-link";
import { useThemeColors } from "@/lib/use-theme-color";

export function AccountBody({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: user } = useUserRecord(userId);
  const staffRole = useStaffRole(userId);
  const { data: userPrivate } = useUserPrivate(userId);
  // Номер входа — маской, как в «Настройках» iOS у Apple ID.
  const phoneDigits = (userPrivate?.phone ?? "").replace(/\D/g, "").slice(-10);
  const phoneValue = phoneDigits.length === 10 ? `+7 ${formatRuPhone(phoneDigits)}` : undefined;
  const tc = useThemeColors(["ink", "on-accent", "error"]);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Вы";

  // Каждый аккаунт — специалист (DECISION владельца 2026-09-11): «Я
  // специалист» есть у всех; профиль создаёт сам экран, если его нет.
  const profile = useMySpecialistProfile(userId);
  const categories = useMyMasterCategories(userId);
  const hasCategories = (categories.data ?? []).length > 0;
  const portfolio = useMasterPortfolio(userId ?? null);

  // Профиль создаётся при регистрации (0186); если его всё же нет — сбой или
  // старая запись, — создаём тихо и один раз, без кнопки «Стать специалистом».
  const ensureProfile = useEnableSpecialistMode().mutate;
  const ensured = useRef(false);
  useEffect(() => {
    if (ensured.current || !profile.isFetched || profile.data !== null) return;
    ensured.current = true;
    ensureProfile({ userId });
  }, [profile.isFetched, profile.data, ensureProfile, userId]);

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
  const hasAvatar = !!realAvatarUrl(user?.avatar_url);
  const aboutValue = m?.bio?.trim() ? "Заполнено" : "Не заполнено";
  const photosCount = portfolio.data?.length ?? 0;
  // Один WhatsApp — тоже контакт: так же считает индикатор заполненности.
  const contactsValue = user?.contact_phone
    ? m?.whatsapp_phone
      ? "Телефон · WhatsApp"
      : "Телефон"
    : m?.whatsapp_phone
      ? "WhatsApp"
      : "Не указаны";
  const rating = m?.rating_overall_count
    ? `${Number(m.rating_overall_avg ?? 0).toFixed(1)} · ${m.rating_overall_count}`
    : "Пока нет";
  // Новый отзыв виден здесь, пока человек не открыл свой профиль.
  const unreadReviews = useUnreadReviewsCount(userId).data ?? 0;
  const reviewsValue =
    unreadReviews === 0 ? rating : unreadReviews === 1 ? "Новый отзыв" : `Новых: ${unreadReviews}`;

  // Индикатор заполненности под шапкой — общий с карточкой на Главной, пока
  // профиль не заполнен достаточно (docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §4.3 п.1).
  const completeness = useSpecialistProfileCompleteness(userId);

  const logout = async () => {
    const ok = await confirmAsync({
      title: "Выйти из аккаунта?",
      confirmText: "Выйти",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!ok) return;
    const result = await signOut();
    if (result.ok) router.replace("/(tabs)" as never);
    else showAlert("Не удалось выйти", result.error);
  };

  return (
    <>
      <View className="mb-7 px-4">
        <View className="flex-row items-center gap-4">
          <Avatar url={user?.avatar_url} name={fullName} seed={userId} size="xl" />
          <View className="min-w-0 flex-1">
            <AppText weight="bold" className="text-ios-title2 text-ink" numberOfLines={1}>
              {fullName}
            </AppText>
          </View>
        </View>
        {completeness.ready && !completeness.isGoodEnough ? (
          <View className="mt-3">
            <AppText className="text-ios-subheadline text-mute">
              {completeness.hasCategories
                ? `Профиль заполнен на ${completeness.doneCount} из ${completeness.total}`
                : "Выберите категории, чтобы клиенты нашли вас"}
            </AppText>
            {completeness.hasCategories ? (
              <View className="mt-2">
                <ProfileProgressBar doneCount={completeness.doneCount} total={completeness.total} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

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
          title="Имя и фото"
          value={hasAvatar ? "Есть фото" : "Нет фото"}
          icon={<PencilSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/edit-client" as never)}
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
          last
        />
      </InsetGroup>

      {/* Видимость и «Принимаю задания» — после «Профиля»: пока он не
          заполнен, заполнение — главное дело на экране (основной агент,
          2026-10-23). «Принимаю задания» — только у кого есть категория:
          без неё блок заперт и лишь путал (аудит №298, №303). */}
      <SpecialistVisibilityGroup userId={userId} hasCategories={hasCategories} />

      {hasCategories ? <AvailabilityRows userId={userId} /> : null}

      {/* Нишевые настройки — не часть основного пути заполнения, не должны
          конкурировать взглядом с «О себе»/«Фото работ». */}
      <SpecialistExtraGroup userId={userId} />

      <InsetGroup title="Клиенты">
        <InsetRow
          title="Отзывы"
          value={reviewsValue}
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

      {staffRole ? (
        <InsetGroup title={staffRole === "admin" ? "Администратор" : "Управляющий"}>
          <InsetRow
            title="Управление"
            icon={<ShieldCheck size={18} weight="bold" color={tc["on-accent"]} />}
            iconAccent
            navigates
            onPress={() => router.push("/admin" as never)}
            last
          />
        </InsetGroup>
      ) : null}

      {/* Личные данные — как «Имя, телефон, пароль» у Apple ID и банков
          (владелец, 2026-10-04, №218–№220). «Имя и фото» — в группе
          «Профиль» выше, здесь не повторяем. */}
      <InsetGroup title="Личные данные">
        <InsetRow
          title="Телефон"
          value={phoneValue}
          icon={<Phone size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/change-phone" as never)}
        />
        <InsetRow
          title="Пароль"
          icon={<LockKey size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/change-password" as never)}
          last
        />
      </InsetGroup>

      <InsetGroup title="Аккаунт">
        <InsetRow
          title="Уведомления"
          icon={<BellSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/notifications" as never)}
        />
        <InsetRow
          title="Настройки"
          icon={<Gear size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/settings" as never)}
          last
        />
      </InsetGroup>

      <InsetGroup>
        <InsetRow
          title="Написать в поддержку"
          icon={<Headset size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => openExternalUrl(SUPPORT_URL)}
          last
        />
      </InsetGroup>

      <InsetGroup>
        <InsetRow
          title="Выйти из аккаунта"
          icon={<SignOut size={18} weight="bold" color={tc.error} />}
          destructive
          onPress={() => void logout()}
          last
        />
      </InsetGroup>
    </>
  );
}
