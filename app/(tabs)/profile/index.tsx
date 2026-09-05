/**
 * Экран редактирования профиля (доступен и клиенту, и мастеру).
 *
 * Sprint 8.2:
 * - Аватар (опция, через image-picker)
 * - Read-only поля: имя/фамилия/город/роль/рейтинг
 * - Master-only: ссылка на категории + Portfolio grid с add/delete
 *
 * Sprint 9 расширит до full edit формы (bio, опыт, радиус и пр.) — сейчас эти поля
 * заполняются в onboarding wizard и пока нередактируемы.
 */

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Camera,
  CaretRight,
  DeviceMobile,
  Eye,
  Gear,
  Moon,
  ShieldCheck,
  SignIn,
  SignOut,
  Star,
  Sun,
  User,
  Wrench,
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { MasterPublishChecklist } from "@/features/master-view/MasterPublishChecklist";
import { useMasterPublishProgress } from "@/features/master-view/use-master-publish-progress";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { useRemoveMyAvatar, useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";
import { supabase } from "@/lib/supabase";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import type { ThemePreference } from "@/lib/theme";
import { useThemeColors } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const { session, status: authStatus } = useAuthSession();
  const userId = session?.user?.id;

  // Tap-on-active-tab → scroll to top.
  const profileScrollRef = useRef<ScrollView>(null);
  const profileResetCounter = useTabScrollResetCounter("profile");
  useEffect(() => {
    if (profileResetCounter > 0) scrollViewToTop(profileScrollRef);
  }, [profileResetCounter]);

  const { data: user, isLoading: userLoading } = useUserRecord(userId);
  const { data: masterProfile } = useMyMasterProfile(userId, user?.is_master === true);
  // Чек-лист «сделайте профиль ярче» — рекламная подсказка для любого мастера
  // (с 2026-05-20 профиль больше не скрывается автоматически). Карточка
  // самоисчезает, когда publishProgress.isReady=true.
  const { data: publishProgress } = useMasterPublishProgress(userId, user?.is_master === true);
  const updateAvatar = useUpdateMyAvatar(userId);
  const removeAvatar = useRemoveMyAvatar(userId);
  const portfolio = useMasterPortfolio(user?.is_master ? (userId ?? null) : null);

  const fullName = useMemo(() => {
    if (!user) return "";
    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const themeColors = useThemeColors([
    "ink",
    "muted-soft",
    "on-primary",
    "warning",
    "body",
    "error",
  ]);
  const onChangeAvatar = () => {
    if (updateAvatar.isPending) return;
    updateAvatar.mutate(undefined, {
      onError: (e) => Alert.alert("Не удалось загрузить", e.message),
    });
  };

  // Меню по тапу на саму аватарку (как у больших приложений): сменить /
  // добавить фото, удалить (если есть). Текст «Убрать фото» под аватаркой убран.
  //
  // Web-safe: на вебе Alert.alert с кнопками — no-op (react-native-web), поэтому
  // меню смены фото на сайте вообще не открывалось. На вебе разводим через
  // window.confirm: нет фото → сразу открываем выбор файла; есть фото → confirm
  // «удалить текущее?» (ОК — удалить, Отмена — выбрать новое). На native —
  // прежний action-sheet.
  const openAvatarMenu = async () => {
    if (updateAvatar.isPending || removeAvatar.isPending) return;

    if (Platform.OS === "web") {
      if (!user?.avatar_url) {
        onChangeAvatar();
        return;
      }
      const remove = await confirmAsync({
        title: "Фото профиля",
        message: "Удалить текущее фото? Нажмите «Отмена», чтобы выбрать другое.",
        confirmText: "Удалить",
        cancelText: "Выбрать другое",
        destructive: true,
      });
      if (remove) {
        removeAvatar.mutate();
      } else {
        onChangeAvatar();
      }
      return;
    }

    if (user?.avatar_url) {
      Alert.alert("Фото профиля", undefined, [
        { text: "Сменить фото", onPress: onChangeAvatar },
        {
          text: "Удалить фото",
          style: "destructive",
          onPress: () => removeAvatar.mutate(),
        },
        { text: "Отмена", style: "cancel" },
      ]);
    } else {
      Alert.alert("Фото профиля", undefined, [
        { text: "Добавить фото", onPress: onChangeAvatar },
        { text: "Отмена", style: "cancel" },
      ]);
    }
  };

  // Auth-сессия загружается асинхронно (~50-200мс на холодном входе).
  // Пока status === "loading" — не рендерим GuestProfileScreen, иначе виден
  // короткий flash гостевого экрана с CTA «Войти» перед тем как залогиненный
  // user увидит свой профиль. См. диагностику task #5 (2026-05-20).
  if (authStatus === "loading") {
    return <ProfileSkeleton insets={insets} />;
  }

  // Анон (status=unauthenticated, нет userId) → guest-state с CTA «Войти».
  if (!userId) {
    return (
      <GuestProfileScreen
        insets={insets}
        themeColors={themeColors}
        onLogin={() => router.push("/(auth)/phone" as never)}
      />
    );
  }

  if (userLoading || !user) {
    return <ProfileSkeleton insets={insets} />;
  }

  const ratingAvg = user.is_master ? masterProfile?.rating_overall_avg : user.rating_as_client_avg;
  const ratingCount = user.is_master
    ? (masterProfile?.rating_overall_count ?? 0)
    : user.rating_as_client_count;

  // Видимость секций — по active_role (текущий режим), не по is_master
  // (наличие master-профиля в БД). Мастер, переключившийся на «Клиент»
  // через role-switcher, видит только client-секции; обратно — все
  // master-кнопки возвращаются (фидбек user 2026-05-16).
  // Разделы мастера показываются по заполненности профиля, а не по режиму:
  // режимов больше нет (DECISION владельца 2026-09-01). Информация о себе —
  // необязательное дополнение к аккаунту, и если человек её заполнил, он
  // видит соответствующие разделы всегда.
  const isClient = !user.is_master;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Унифицированный ScreenHeader — без back (это таб). Справа всегда
          ⚙ Gear → /settings (приватность, тема, аккаунт, поддержка). Edit
          профиля доступен из body-карточки «Редактировать профиль». */}
      <ScreenHeader
        title="Профиль"
        rightAction={{
          label: "Настройки",
          Icon: Gear,
          onPress: () => router.push("/profile/settings" as never),
          accessibilityLabel: "Настройки",
        }}
      />

      <ScrollView
        ref={profileScrollRef}
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — единый layout для client/master/guest (2026-05-27).
            Раньше было два разных hero: client с декоративным фиолетовым band'ом,
            master без карточки и с другим стилем бейджа. При переключении роли
            через RoleSwitcher визуал перепрыгивал. Сейчас один контейнер,
            одинаковая позиция аватара/имени/бейджа/CTA. Меняется только
            содержимое бейджа и кнопка под ним. См. CLAUDE.md история решений. */}
        <View className="items-center px-6 pt-4">
          {/* Тап по самой аватарке открывает меню (сменить/добавить/удалить) —
              паттерн больших приложений. Значок камеры — подсказка, что фото
              редактируемо. Текст «Убрать фото» убран (фидбэк владельца 2026-05-29). */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Фото профиля — изменить"
            onPress={openAvatarMenu}
            disabled={updateAvatar.isPending || removeAvatar.isPending}
            className="relative active:opacity-90"
          >
            <Avatar url={user.avatar_url} name={fullName} seed={user.id} size="xl" />
            <View className="-bottom-0.5 -right-0.5 absolute h-8 w-8 items-center justify-center rounded-full border-2 border-canvas bg-ink">
              {updateAvatar.isPending || removeAvatar.isPending ? (
                <ActivityIndicator size="small" color={themeColors["on-primary"]} />
              ) : (
                <Camera size={15} weight="fill" color={themeColors["on-primary"]} />
              )}
            </View>
          </Pressable>

          <AppText
            weight="display"
            className="mt-4 text-display-md tracking-tight text-ink text-center"
          >
            {fullName}
          </AppText>

          {user.username ? (
            <AppText weight="mono" className="mt-1 text-body-sm text-mute text-center">
              @{user.username}
            </AppText>
          ) : null}

          <View className="mt-2 flex-row items-center gap-2">
            <View className="rounded-full bg-canvas-soft-2 px-2.5 py-0.5">
              <AppText weight="medium" className="text-caption text-body">
                {isClient ? "Клиент" : "Мастер"}
              </AppText>
            </View>
            {/* Рейтинг показываем ТОЛЬКО мастеру. У клиента рейтинга нет
                (решение владельца 2026-05-29) — жалобы остаются, оценки нет. */}
            {!isClient && ratingAvg != null && ratingCount > 0 ? (
              <View className="flex-row items-center gap-1">
                <Star size={13} weight="fill" color={themeColors.warning} />
                <AppText weight="mono" className="text-mono-caption text-ink">
                  {ratingAvg.toFixed(1)}
                </AppText>
                <AppText weight="mono" className="text-mono-caption text-mute">
                  ({ratingCount})
                </AppText>
              </View>
            ) : null}
          </View>

          {/* Город/район личного юзера НЕ показываем (2026-05-16):
              это «домашняя» точка, не нужна на профиле. Для мастера —
              master_service_areas (отдельный блок «Где работаете»). */}

          {/* P1-8: переключатель ролей для dual-role users.
              Видим только если у пользователя is_master И is_client.
              Позиция identична в обоих режимах — не прыгает при switch. */}
          <View className="mt-5 w-full max-w-xs"></View>

          {/* «Стать мастером» перенесён ниже (под карточку «Редактировать
              профиль») и сделан тихой ghost-ссылкой — фидбэк владельца
              2026-05-29: большая тёмная кнопка под аватаром была слишком
              заметной, на неё случайно нажимали. */}
        </View>

        {/* Client-only: только «Редактировать профиль». Стат-плитки (Заказы/
            Отзывы) и «Сохранённые мастера» убраны по фидбэку владельца
            2026-05-29 — профиль клиента простой. Заказы доступны во вкладке
            «Заказы». */}
        {isClient ? (
          <View className="mt-4">
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/profile/edit-client" as never)}
              className="mx-5 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:bg-canvas-soft"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Редактировать профиль
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-mute">Имя и юзернейм</AppText>
              </View>
              <CaretRight size={20} weight="bold" color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Тихая ссылка «Хочу стать мастером» — низкий visual-weight,
                под карточкой профиля. Только для не-мастеров. */}
            {!user.is_master ? (
              <View className="mt-3 items-center">
                <BecomeMasterButton />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Чек-лист «сделайте профиль ярче» (фидбэк user 2026-05-20). С отказа
            от автоскрытия видим любому мастеру с незаполненным профилем как
            рекламная подсказка — больше фото и категорий = больше откликов.
            Карточка самоисчезает, когда все 3 пункта выполнены (isReady=true). */}
        {/* Sprint 2026-05-20: показываем ТОЛЬКО когда мастер реально в master-режиме.
            Раньше условие user.is_master=true показывало карточку и в client-режиме
            у dual-role пользователей. */}

        {/* Master-only sections — видим только когда active_role='master'.
            Если мастер переключился на client-режим (role-switcher выше) —
            секции скрываются, остаётся client-edit. */}
        {user.is_master && (
          <>
            {/* Edit master profile shortcut */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/profile/edit-master" as never)}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                Редактировать профиль
              </AppText>
              <CaretRight size={20} weight="bold" color={themeColors["muted-soft"]} />
            </Pressable>

            {/* «Как меня видят клиенты» CTA удалён 2026-05-16 (фидбэк user). */}

            {/* Мои отзывы (#163): ведёт на собственную публичную страницу, где
                мастер видит оставленные ему отзывы и может их обжаловать. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/master/${user.id}` as never)}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                Мои отзывы
              </AppText>
              <CaretRight size={20} weight="bold" color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Categories shortcut */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(onboarding)/master-categories")}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                Категории
              </AppText>
              <CaretRight size={20} weight="bold" color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Services from template — Treatwell/Booksy-style чеклист L3 с
                дефолтными ценами. По фидбэку user 2026-05-15: «чтобы были
                подсказки — ремонт унитаза и т.д., не вручную всё забивать». */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/profile/services-suggest" as never)}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <AppText weight="semibold" className="flex-1 text-body-md text-ink">
                Услуги и цены
              </AppText>
              <CaretRight size={20} weight="bold" color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Portfolio убран отсюда 2026-05-20: переехал в нижнее меню как
                отдельная вкладка «Кейсы» (только для мастеров) + таб «Отзывы».
                Старый роут /profile/portfolio оставлен — туда ведут detail-ссылки. */}

            {/* Компактный ghost-link «Посмотреть глазами клиента». Раньше
                был большой card hero CTA — слишком яркий (фидбэк user 2026-05-15:
                «эту кнопку сделай не такой большой, не такой заметной, можешь
                спрятать за тремя точками»). Сейчас — мелкая ghost-row с Eye
                иконкой + caption. Меню «...» избыточно для одной утилитарной
                ссылки; этот компромисс даёт минимальный визуальный вес. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/master/${user.id}` as never)}
              className="mx-6 mt-4 flex-row items-center gap-2 self-start active:opacity-60"
              hitSlop={6}
            >
              <Eye size={14} weight="bold" color={themeColors["muted-soft"]} />
              <AppText weight="medium" className="text-caption text-muted">
                Посмотреть глазами клиента
              </AppText>
            </Pressable>
          </>
        )}

        {/* Подсказка о публикации профиля стоит ПОСЛЕ меню, а не над ним.
            Её данные приходят отдельным запросом позже, чем запись
            пользователя, — а над меню карточка вставлялась уже после того, как
            меню отрисовано, и сдвигала его вниз. Это и была жалоба владельца
            «меню появляется наверху, потом дёргается вниз».

            Скелет-заглушку не делаем: карточка составная (заголовок, прогресс,
            три ряда, сноска), и несовпадающий по высоте скелет дал бы тот же
            рывок меньшего размера — в этом проекте такое уже случалось. */}
        {user.is_master &&
        user.active_role === "master" &&
        publishProgress &&
        !publishProgress.isReady ? (
          <MasterPublishChecklist progress={publishProgress} />
        ) : null}

        {/* Theme — единый segmented (3-button row) для клиента и мастера.
            Раньше у мастера был stacked 3-row ThemeSwitcher (огромный, занимал
            пол-экрана). Фидбэк user 2026-05-15 «тему сделай не такой огромной». */}
        <View className={`mt-8 ${isClient ? "px-5" : "px-6"}`}>
          <AppText weight="medium" className="mb-2 text-caption text-mute uppercase tracking-wider">
            Тема
          </AppText>
          <ClientThemeSegmented />
        </View>

        {/* Admin entry — видно только админам */}
        {(user as { is_admin?: boolean } | null)?.is_admin && (
          <View className={`mt-8 ${isClient ? "px-5" : "px-6"}`}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/admin" as never)}
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
            >
              <ShieldCheck size={18} weight="bold" color={themeColors.body} />
              <AppText weight="semibold" className="text-button text-body">
                Админка
              </AppText>
            </Pressable>
          </View>
        )}

        {/* Sign out — клиенту ghost-destructive строкой, мастеру bordered (как было).
            confirmAsync вместо Alert.alert: на вебе Alert — no-op, и кнопка
            не работала (фидбэк user 2026-05-15). */}
        {isClient ? (
          <View className="mt-8 px-5">
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const ok = await confirmAsync({
                  title: "Выйти из аккаунта?",
                  message: "Можно будет войти заново со своим номером.",
                  confirmText: "Выйти",
                  destructive: true,
                });
                if (ok) await signOut();
              }}
              className="min-h-11 flex-row items-center justify-center gap-2 active:opacity-70"
            >
              <SignOut size={16} weight="bold" color={themeColors.error} />
              <AppText weight="semibold" className="text-button text-error">
                Выйти из аккаунта
              </AppText>
            </Pressable>
          </View>
        ) : (
          <View className="mt-10 px-6">
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const ok = await confirmAsync({
                  title: "Выйти?",
                  message: "Можно будет войти заново со своим номером.",
                  confirmText: "Выйти",
                  destructive: true,
                });
                if (ok) await signOut();
              }}
              className="min-h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
            >
              <SignOut size={18} weight="bold" color={themeColors.body} />
              <AppText weight="semibold" className="text-button text-body">
                Выйти
              </AppText>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <PortfolioLightbox
        items={portfolio.data ?? []}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChangeIndex={setLightboxIndex}
      />
    </View>
  );
}

// ----------------------------------------------------------------------------
// Client-only UI sub-components
// ----------------------------------------------------------------------------
// ClientStatTile удалён 2026-05-29 — стат-плитки убраны с профиля клиента.

// Сегментированный 3-button-row для темы (Linear/Vercel-стиль).
// В одном «pill»-контейнере 3 равных секции, активная — bg-canvas + shadow, остальные ghost.
function ClientThemeSegmented() {
  const { preference, setPreference } = useColorScheme();
  const tc = useThemeColors(["ink", "mute"]);

  const opts: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
    { value: "system", label: "Авто", Icon: DeviceMobile },
    { value: "light", label: "Светлая", Icon: Sun },
    { value: "dark", label: "Тёмная", Icon: Moon },
  ];

  return (
    <View className="flex-row items-center rounded-lg border border-hairline bg-canvas-soft p-1">
      {opts.map(({ value, label, Icon }) => {
        const isSel = preference === value;
        return (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSel }}
            accessibilityLabel={label}
            onPress={() => setPreference(value)}
            className={`flex-1 h-9 flex-row items-center justify-center gap-1.5 rounded-md ${
              isSel ? "bg-canvas" : "active:opacity-60"
            }`}
            style={
              isSel
                ? { boxShadow: "0 1px 2px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)" }
                : undefined
            }
          >
            <Icon size={14} weight="bold" color={isSel ? tc.ink : tc.mute} />
            <AppText
              weight={isSel ? "semibold" : "medium"}
              className={`text-caption ${isSel ? "text-ink" : "text-mute"}`}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ----------------------------------------------------------------------------
// Guest-state — анон видит CTA «Войти» вместо бесконечного спиннера.
//
// Контракт: без auth-session userRecord загрузить нельзя, поэтому раньше
// экран висел в `<ActivityIndicator />`. Это выглядит как баг: пользователь
// тапнул иконку профиля и ничего не происходит (фидбэк user 2026-05-15).
//
// Что показываем гостю:
// - hero-карточка с иконкой + объяснение зачем входить;
// - primary CTA «Войти по телефону» → /(auth)/phone;
// - тема (auto / light / dark) — работает и для анона через useColorScheme.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// ProfileSkeleton — цельный скелет профиля на время загрузки auth/userRecord.
// Раньше показывался голый <ActivityIndicator> по центру белого экрана — это
// и есть «рваная загрузка» (фидбэк владельца 2026-05-27). Теперь — структура
// профиля заглушками (аватар + имя + бейдж + переключатель + строки), потом
// контент появляется на тех же местах.
// ----------------------------------------------------------------------------

function ProfileSkeleton({ insets }: { insets: { top: number; bottom: number } }) {
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Профиль" />
      <View className="items-center px-6 pt-2">
        {/* Аватар */}
        <Skeleton circle size={96} />
        {/* Имя */}
        <View className="mt-4">
          <Skeleton width={160} height={24} style={{ borderRadius: 6 }} />
        </View>
        {/* Бейдж + рейтинг */}
        <View className="mt-3">
          <Skeleton width={90} height={20} style={{ borderRadius: 999 }} />
        </View>
        {/* Переключатель ролей */}
        <View className="mt-4">
          <Skeleton width={220} height={40} style={{ borderRadius: 999 }} />
        </View>
      </View>
      {/* Контент-строки */}
      <View className="px-5 mt-6">
        <Skeleton width="100%" height={56} style={{ borderRadius: 12 }} />
        <View className="mt-3">
          <Skeleton width="100%" height={56} style={{ borderRadius: 12 }} />
        </View>
        <View className="mt-3">
          <Skeleton width="100%" height={56} style={{ borderRadius: 12 }} />
        </View>
      </View>
    </View>
  );
}

interface GuestProfileScreenProps {
  insets: { top: number; bottom: number };
  themeColors: { ink: string; "on-primary": string; body: string };
  onLogin: () => void;
}

function GuestProfileScreen({ insets, themeColors, onLogin }: GuestProfileScreenProps) {
  const tabBarSpace = useTabBarSpace();

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Профиль" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: tabBarSpace }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO — тот же layout что для client/master (см. ProfileScreen).
            Аватар → имя → описание → CTA. Без декоративного band'а, без
            фиолетовой подложки. Vercel/Linear-style: типографика + воздух. */}
        <View className="items-center px-6 pt-4">
          {/* «Аватар» гостя — нейтральный кружок с иконкой User.
              Размер 80×80 = Avatar size="xl", держим то же место в layout'е. */}
          <View className="h-20 w-20 items-center justify-center rounded-full bg-canvas-soft-2">
            <User size={32} weight="bold" color={themeColors.ink} />
          </View>

          <AppText
            weight="display"
            className="mt-4 text-display-md tracking-tight text-ink text-center"
          >
            Войдите в аккаунт
          </AppText>

          <AppText
            className="mt-2 max-w-xs text-body-sm text-mute text-center"
            style={{ lineHeight: 20 }}
          >
            Создавайте заказы, общайтесь с мастерами и оставляйте отзывы. Регистрация по номеру
            телефона — 30 секунд.
          </AppText>

          <View className="mt-5 w-full max-w-xs">
            <Pressable
              accessibilityRole="button"
              onPress={onLogin}
              className="min-h-12 w-full flex-row items-center justify-center gap-2 rounded-pill bg-ink active:opacity-80"
            >
              <SignIn size={16} weight="bold" color={themeColors["on-primary"]} />
              <AppText weight="semibold" className="text-button text-on-primary">
                Войти по телефону
              </AppText>
            </Pressable>
          </View>
        </View>

        {/* Тема — работает и для анона. */}
        <View className="mt-10 px-6">
          <AppText weight="medium" className="mb-2 text-caption text-mute uppercase tracking-wider">
            Тема
          </AppText>
          <ClientThemeSegmented />
        </View>
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Локальные хуки — master_profiles для рейтинга
//
// useCityName удалён 2026-05-16: личный город/район юзера больше не отображаем
// (user request). Где мастер работает — master_service_areas, отдельный блок.
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// BecomeMasterButton — вход в регистрацию исполнителя.
//
// До финального шага wizard не меняем роль пользователя. Профиль и категории
// сохраняются как черновик, а `finalize_master_onboarding` атомарно включает
// роль исполнителя только после успешного завершения всех обязательных шагов.
// ----------------------------------------------------------------------------

function BecomeMasterButton() {
  const router = useRouter();
  const mutedColor = useThemeColors(["mute"]).mute;

  const handlePress = () => {
    router.push({
      pathname: "/(onboarding)/master-profile",
      params: { mode: "onboarding" },
    } as never);
  };

  return (
    <View className="items-center">
      {/* Тихая ghost-ссылка (фидбэк владельца 2026-05-29): низкий visual-weight,
          компактная, по центру — не конкурирует с основными действиями и не
          ловит случайные тапы. Раньше — крупная тёмная кнопка во всю ширину. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Хочу стать исполнителем"
        onPress={handlePress}
        hitSlop={8}
        className="flex-row items-center gap-1.5 px-3 py-2 active:opacity-60"
      >
        <Wrench size={15} weight="bold" color={mutedColor} />
        <AppText weight="medium" className="text-body-sm text-mute">
          Хочу стать исполнителем
        </AppText>
      </Pressable>
    </View>
  );
}

function useMyMasterProfile(userId: string | null | undefined, enabled: boolean) {
  return useQuery<Tables<"master_profiles"> | null>({
    queryKey: ["master-profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("master_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId && enabled,
    staleTime: 5 * 60_000,
  });
}
