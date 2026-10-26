/**
 * Содержимое вкладки «Профиль» (№363, docs/SPECIALIST_PROFILE_REDESIGN_2026-10.md §8):
 * шапка (аватар, имя, переход «Как вас видят клиенты») с индикатором
 * заполненности; часть «Специалист» — «Анкета» (категории, фото профиля, о
 * себе, фото работ, контакты; незаполненное выделено), «Видимость»,
 * «Принимаю задания», «Клиенты», «Дополнительно»; часть «Аккаунт» —
 * «Управление» (staff), «Личные данные» (имя, телефон, пароль),
 * уведомления и настройки, поддержка, выход.
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
  Camera,
  CaretRight,
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
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { InsetGroup, InsetRow } from "@/components/ui";
import { SystemIcon } from "@/components/ui/SystemIcon";
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
import { SPECIALIST_PROFILE_STEP_ROUTE } from "@/features/specialist/profile-completeness";
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
  const tc = useThemeColors(["ink", "mute", "on-accent", "error"]);
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
  const hasBio = !!m?.bio?.trim();
  const photosCount = portfolio.data?.length ?? 0;
  // Один WhatsApp — тоже контакт: так же считает индикатор заполненности.
  const contactsValue = user?.contact_phone
    ? m?.whatsapp_phone
      ? "Телефон · WhatsApp"
      : "Телефон"
    : m?.whatsapp_phone
      ? "WhatsApp"
      : undefined;
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

  // Незаполненная строка анкеты — розовая плитка и «Добавить» вместо серого
  // значения (№363): видно, чего не хватает, без отдельного списка.
  const anketaIcon = (Icon: typeof Camera, missing: boolean) => (
    <Icon size={18} weight="bold" color={missing ? tc["on-accent"] : tc.ink} />
  );
  const route = SPECIALIST_PROFILE_STEP_ROUTE;
  // Только по пришедшим данным: пока запрос идёт, строка не «краснеет».
  const missing = {
    categories: categories.isSuccess && !hasCategories,
    avatar: !!user && !hasAvatar,
    bio: !!m && !hasBio,
    portfolio: portfolio.isSuccess && photosCount === 0,
    contacts: !!user && !!m && !contactsValue,
  };

  return (
    <>
      <View className="mb-7 px-4">
        {/* Вся шапка — переход в свой публичный профиль, как шапка Apple
            Account в «Настройках». Отдельная строка «Как меня видят
            клиенты» с тем же адресом убрана (№363). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fullName}. Как вас видят клиенты`}
          onPress={() => router.push(`/master/${userId}` as never)}
          className="flex-row items-center gap-4 active:opacity-70"
        >
          <Avatar url={user?.avatar_url} name={fullName} seed={userId} size="xl" />
          <View className="min-w-0 flex-1">
            <AppText weight="bold" className="text-ios-title2 text-ink" numberOfLines={1}>
              {fullName}
            </AppText>
            <AppText className="mt-0.5 text-ios-subheadline text-mute">
              Как вас видят клиенты
            </AppText>
          </View>
          <SystemIcon
            sf="chevron.right"
            fallback={CaretRight}
            size={14}
            weight="semibold"
            color={tc.mute}
          />
        </Pressable>
        {completeness.ready && !completeness.isGoodEnough ? (
          <View className="mt-4">
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

      {/* Две части с заголовками: всё о работе специалиста — сверху,
          личные данные и настройки приложения — отдельно ниже (№363). */}
      <SectionHeading title="Специалист" />

      <InsetGroup title="Анкета" footer="Это видят клиенты в вашем профиле">
        <InsetRow
          title="Категории"
          value={hasCategories ? categoriesValue : "Выбрать"}
          attention={missing.categories}
          icon={anketaIcon(SquaresFour, missing.categories)}
          iconAccent={missing.categories}
          navigates
          onPress={() => router.push(route.categories as never)}
        />
        <InsetRow
          title="Фото профиля"
          value={hasAvatar ? "Есть" : "Добавить"}
          attention={missing.avatar}
          icon={anketaIcon(Camera, missing.avatar)}
          iconAccent={missing.avatar}
          navigates
          onPress={() => router.push(route.avatar as never)}
        />
        <InsetRow
          title="О себе"
          value={hasBio ? "Заполнено" : "Добавить"}
          attention={missing.bio}
          icon={anketaIcon(UserCircle, missing.bio)}
          iconAccent={missing.bio}
          navigates
          onPress={() => router.push(route.bio as never)}
        />
        <InsetRow
          title="Фото работ"
          value={photosCount > 0 ? `${photosCount}` : "Добавить"}
          accessibilityLabel={photosCount > 0 ? `Фото работ, ${photosCount}` : undefined}
          attention={missing.portfolio}
          icon={anketaIcon(Images, missing.portfolio)}
          iconAccent={missing.portfolio}
          navigates
          onPress={() => router.push(route.portfolio as never)}
        />
        <InsetRow
          title="Контакты"
          value={contactsValue ?? "Добавить"}
          attention={missing.contacts}
          icon={anketaIcon(Phone, missing.contacts)}
          iconAccent={missing.contacts}
          navigates
          onPress={() => router.push(route.contacts as never)}
          last
        />
      </InsetGroup>

      {/* Видимость и «Принимаю задания» — после анкеты: пока она не
          заполнена, заполнение — главное дело на экране (основной агент,
          2026-10-23). «Принимаю задания» — только у кого есть категория:
          без неё блок заперт и лишь путал (аудит №298, №303). */}
      <SpecialistVisibilityGroup userId={userId} hasCategories={hasCategories} />

      {hasCategories ? <AvailabilityRows userId={userId} /> : null}

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
          last
        />
      </InsetGroup>

      {/* Нишевые настройки — не часть основного пути заполнения, не должны
          конкурировать взглядом с анкетой. */}
      <SpecialistExtraGroup userId={userId} />

      <SectionHeading title="Аккаунт" />

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
          (владелец, 2026-10-04, №218–№220). Имя — здесь, фото профиля — в
          анкете: его считает заполненность (№363). */}
      <InsetGroup title="Личные данные">
        <InsetRow
          title="Имя"
          value={user ? fullName : undefined}
          icon={<PencilSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/edit-client" as never)}
        />
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

      <InsetGroup>
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

/** Заголовок части экрана — «Специалист» / «Аккаунт» (№363). */
function SectionHeading({ title }: { title: string }) {
  return (
    <AppText
      accessibilityRole="header"
      weight="bold"
      className="mb-3 px-4 text-ios-title2 text-ink"
    >
      {title}
    </AppText>
  );
}
