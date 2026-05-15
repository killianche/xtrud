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
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LogIn,
  LogOut,
  MapPin,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  ShieldCheck,
  Smartphone,
  Star,
  Sun,
  UserRound,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { RoleSwitcher } from "@/features/auth/RoleSwitcher";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMyChats, unreadChatsCount } from "@/features/chat/use-my-chats";
import { useMyOrders } from "@/features/orders/use-my-orders";
import type { ThemePreference } from "@/lib/theme";
import { PortfolioGrid } from "@/features/profile/PortfolioGrid";
import { PortfolioLightbox } from "@/features/profile/PortfolioLightbox";
import {
  PORTFOLIO_MAX,
  useAddPortfolioItem,
  useDeletePortfolioItem,
  useMasterPortfolio,
} from "@/features/profile/use-my-portfolio";
import { useRemoveMyAvatar, useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useUploadPortfolioImage } from "@/features/uploads/use-upload-image";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";
import { useSafeBack } from "@/lib/use-safe-back";
import { supabase } from "@/lib/supabase";
import { useThemeColors } from "@/lib/use-theme-color";
import type { Tables } from "@/types/database";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // Tap-on-active-tab → scroll to top.
  const profileScrollRef = useRef<ScrollView>(null);
  const profileResetCounter = useTabScrollResetCounter("profile");
  useEffect(() => {
    if (profileResetCounter > 0) scrollViewToTop(profileScrollRef);
  }, [profileResetCounter]);

  const { data: user, isLoading: userLoading } = useUserRecord(userId);
  const { data: cityName } = useCityName(user?.city_id ?? null);
  const { data: masterProfile } = useMyMasterProfile(userId, user?.is_master === true);
  // Quick stats для клиента (для master есть отдельные экраны со своими счётчиками).
  const { data: myOrders } = useMyOrders(user?.is_master ? undefined : userId);
  const { data: myChats } = useMyChats(user?.is_master ? undefined : userId);
  const ordersTotal = myOrders?.length ?? 0;
  const activeOrders = (myOrders ?? []).filter(
    (o) => o.status === "open" || o.status === "in_progress",
  ).length;
  const chatsTotal = myChats?.length ?? 0;
  const chatsUnread = unreadChatsCount(myChats, userId);

  const updateAvatar = useUpdateMyAvatar(userId);
  const removeAvatar = useRemoveMyAvatar(userId);
  const portfolio = useMasterPortfolio(user?.is_master ? (userId ?? null) : null);
  const uploadPortfolio = useUploadPortfolioImage(userId);
  const addPortfolioItem = useAddPortfolioItem(userId ?? null);
  const deletePortfolioItem = useDeletePortfolioItem(userId ?? null);

  const fullName = useMemo(() => {
    if (!user) return "";
    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  const canAddPortfolio = (portfolio.data?.length ?? 0) < PORTFOLIO_MAX;
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const themeColors = useThemeColors([
    "ink",
    "muted-soft",
    "on-primary",
    "warning",
    "body",
    "error",
  ]);
  const goBack = useSafeBack("/" as const);

  const onChangeAvatar = () => {
    if (updateAvatar.isPending) return;
    updateAvatar.mutate(undefined, {
      onError: (e) => Alert.alert("Не удалось загрузить", e.message),
    });
  };

  const onRemoveAvatar = () => {
    if (!user?.avatar_url) return;
    Alert.alert("Убрать аватар?", "Останутся инициалы.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Убрать",
        style: "destructive",
        onPress: () => removeAvatar.mutate(),
      },
    ]);
  };

  const onAddPortfolio = async () => {
    if (!canAddPortfolio || uploadPortfolio.isPending || addPortfolioItem.isPending) return;
    try {
      const uploaded = await uploadPortfolio.mutateAsync();
      if (!uploaded) return; // отмена
      await addPortfolioItem.mutateAsync({
        url: uploaded.publicUrl,
        storagePath: uploaded.path,
      });
    } catch (e) {
      Alert.alert("Не удалось добавить фото", (e as Error).message);
    }
  };

  // P1-4: confirmAsync вместо Alert.alert — на web Alert.alert no-op
  // (react-native-web известный issue). confirmAsync проксирует на
  // window.confirm на web, на native — на Alert.alert (см. src/lib/confirm.ts).
  const onDeletePortfolio = async (id: string, storagePath: string) => {
    const confirmed = await confirmAsync({
      title: "Удалить фото?",
      message: "Действие нельзя отменить.",
      confirmText: "Удалить",
      cancelText: "Отмена",
      destructive: true,
    });
    if (!confirmed) return;
    deletePortfolioItem.mutate(
      { id, storagePath },
      {
        onError: (e) => {
          // Используем Alert как fallback — для error message нет confirm-flow,
          // на web всё равно покажется через console + ошибка в Alert не критична.
          // TODO: заменить на toast-инфраструктуру когда появится.
          Alert.alert("Не удалось удалить", e.message);
        },
      },
    );
  };

  // Анон (нет userId) → guest-state с CTA «Войти» вместо бесконечного спиннера.
  // Spinner показываем ТОЛЬКО когда есть userId и идёт загрузка user record.
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
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas"
        style={{ paddingTop: insets.top }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  const ratingAvg = user.is_master ? masterProfile?.rating_overall_avg : user.rating_as_client_avg;
  const ratingCount = user.is_master
    ? (masterProfile?.rating_overall_count ?? 0)
    : user.rating_as_client_count;

  const isClient = !user.is_master;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar — минималистичный: back + центр-заголовок + edit-shortcut справа (только клиент) */}
      <View className="flex-row items-center justify-between px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={themeColors.ink} />
        </Pressable>
        <AppText weight="semibold" className="text-title-md text-ink">
          Профиль
        </AppText>
        {isClient ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Редактировать профиль"
            onPress={() => router.push("/(tabs)/profile/edit-client" as never)}
            hitSlop={12}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Pencil size={18} strokeWidth={1.75} color={themeColors.ink} />
          </Pressable>
        ) : (
          <View className="w-10" />
        )}
      </View>

      <ScrollView
        ref={profileScrollRef}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO card — Vercel docs-cover вайб: tinted band сверху, avatar overlap,
            имя+бейдж+rating+локация в плотном стеке. Один visual-anchor страницы. */}
        {isClient ? (
          <View className="mx-5 mt-3 overflow-hidden rounded-xl border border-hairline bg-canvas">
            {/* Decorative tinted band — мини mesh-tint, единственное место в профиле */}
            <View className="h-20 bg-badge-violet relative overflow-hidden">
              <View
                className="absolute rounded-full bg-canvas"
                style={{ top: -28, left: -20, width: 80, height: 80, opacity: 0.35 }}
              />
              <View
                className="absolute rounded-full bg-canvas"
                style={{ bottom: -16, right: 24, width: 56, height: 56, opacity: 0.45 }}
              />
              <View
                className="absolute rounded-md bg-canvas"
                style={{ top: 16, right: 100, width: 16, height: 16, opacity: 0.55, transform: [{ rotate: "18deg" }] }}
              />
            </View>
            {/* Body */}
            <View className="px-5 pt-0 pb-5">
              <View className="-mt-12 flex-row items-end justify-between">
                {/* Avatar with edit-overlay */}
                <View className="relative">
                  <View className="rounded-full border-4 border-canvas">
                    <Avatar url={user.avatar_url} name={fullName} seed={user.id} size="xl" />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Изменить фото"
                    onPress={onChangeAvatar}
                    disabled={updateAvatar.isPending}
                    hitSlop={6}
                    className="absolute bottom-0 right-0 h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-ink active:opacity-80"
                  >
                    {updateAvatar.isPending ? (
                      <ActivityIndicator size="small" color={themeColors["on-primary"]} />
                    ) : (
                      <Pencil size={14} strokeWidth={2} color={themeColors["on-primary"]} />
                    )}
                  </Pressable>
                </View>
                {user.avatar_url ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={onRemoveAvatar}
                    hitSlop={8}
                    className="mb-1 active:opacity-70"
                  >
                    <AppText weight="medium" className="text-caption text-mute">
                      Убрать фото
                    </AppText>
                  </Pressable>
                ) : null}
              </View>

              <AppText weight="display" className="mt-4 text-display-md tracking-tight text-ink">
                {fullName}
              </AppText>

              <View className="mt-2 flex-row items-center gap-2">
                <View className="rounded-full bg-canvas-soft-2 px-2.5 py-0.5">
                  <AppText weight="medium" className="text-caption text-body">
                    Клиент
                  </AppText>
                </View>
                {ratingAvg != null && ratingCount > 0 ? (
                  <View className="flex-row items-center gap-1">
                    <Star
                      size={13}
                      strokeWidth={2}
                      color={themeColors.warning}
                      fill={themeColors.warning}
                    />
                    <AppText weight="mono" className="text-mono-caption text-ink">
                      {ratingAvg.toFixed(1)}
                    </AppText>
                    <AppText weight="mono" className="text-mono-caption text-mute">
                      ({ratingCount})
                    </AppText>
                  </View>
                ) : null}
              </View>

              {cityName ? (
                <View className="mt-2 flex-row items-center gap-1">
                  <MapPin size={13} strokeWidth={1.75} color={themeColors["muted-soft"]} />
                  <AppText className="text-body-sm text-mute">
                    {cityName}
                    {user.district ? ` · ${user.district}` : ""}
                  </AppText>
                </View>
              ) : null}

              {/* P1-8: переключатель ролей для dual-role users.
                  Видим только если у пользователя is_master И is_client. */}
              <View className="mt-4 w-full max-w-xs">
                <RoleSwitcher
                  userId={user.id}
                  currentRole={user.active_role}
                  isMaster={user.is_master}
                  isClient={user.is_client}
                />
              </View>
            </View>
          </View>
        ) : (
          // Master profile — оставляем старый компактный header (его секции редактируются ниже)
          <View className="items-center px-6 pt-2">
            <View className="relative">
              <Avatar url={user.avatar_url} name={fullName} seed={user.id} size="xl" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Изменить фото"
                onPress={onChangeAvatar}
                disabled={updateAvatar.isPending}
                hitSlop={6}
                className="-bottom-1 -right-1 absolute h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-primary active:opacity-80"
              >
                {updateAvatar.isPending ? (
                  <ActivityIndicator size="small" color={themeColors["on-primary"]} />
                ) : (
                  <Pencil size={16} strokeWidth={2} color={themeColors["on-primary"]} />
                )}
              </Pressable>
            </View>

            {user.avatar_url ? (
              <Pressable
                accessibilityRole="button"
                onPress={onRemoveAvatar}
                hitSlop={8}
                className="mt-3 active:opacity-70"
              >
                <AppText weight="medium" className="text-caption text-muted">
                  Убрать фото
                </AppText>
              </Pressable>
            ) : null}

            <AppText weight="bold" className="mt-4 text-display-sm text-ink">
              {fullName}
            </AppText>

            <View className="mt-2 flex-row items-center gap-2">
              <View className="rounded-pill bg-surface-2 px-3 py-1">
                <AppText weight="medium" className="text-caption text-body">
                  Мастер
                </AppText>
              </View>
              {ratingAvg != null && ratingCount > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Star
                    size={14}
                    strokeWidth={2}
                    color={themeColors.warning}
                    fill={themeColors.warning}
                  />
                  <AppText weight="semibold" className="text-caption text-ink">
                    {ratingAvg.toFixed(1)}
                  </AppText>
                  <AppText className="text-caption text-muted">({ratingCount})</AppText>
                </View>
              ) : null}
            </View>

            {cityName ? (
              <AppText className="mt-1 text-body-sm text-muted">
                {cityName}
                {user.district ? `, ${user.district}` : ""}
              </AppText>
            ) : null}

            {/* P1-8: переключатель ролей для dual-role users.
                Видим только если у пользователя is_master И is_client. */}
            <View className="mt-4 w-full max-w-xs">
              <RoleSwitcher
                userId={user.id}
                currentRole={user.active_role}
                isMaster={user.is_master}
                isClient={user.is_client}
              />
            </View>
          </View>
        )}

        {/* Client-only stats trio + edit-row */}
        {isClient ? (
          <>
            <View className="mx-5 mt-4 flex-row gap-2">
              <ClientStatTile
                label="Заказы"
                value={ordersTotal}
                hint={activeOrders > 0 ? `${activeOrders} активных` : "Все закрыты"}
                accent={activeOrders > 0}
                onPress={() => router.push("/(tabs)/orders" as never)}
              />
              <ClientStatTile
                label="Чаты"
                value={chatsTotal}
                hint={
                  chatsUnread > 0
                    ? `${chatsUnread} новых`
                    : chatsTotal > 0
                      ? "Прочитано"
                      : "Пока нет"
                }
                accent={chatsUnread > 0}
                onPress={() => router.push("/(tabs)/chats" as never)}
              />
              <ClientStatTile
                label="Отзывы"
                value={ratingCount ?? 0}
                hint={
                  ratingAvg != null && (ratingCount ?? 0) > 0
                    ? `★ ${ratingAvg.toFixed(1)}`
                    : "Нет"
                }
                onPress={() => router.push("/(tabs)/orders" as never)}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/profile/edit-client" as never)}
              className="mx-5 mt-2 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:bg-canvas-soft"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Редактировать профиль
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-mute">
                  Имя, фамилия, город, район
                </AppText>
              </View>
              <ChevronRight size={20} strokeWidth={1.75} color={themeColors["muted-soft"]} />
            </Pressable>
          </>
        ) : null}

        {/* Master-only sections */}
        {user.is_master && (
          <>
            {/* «Посмотреть как клиент» — Airbnb showcase pattern. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/(tabs)/master/${user.id}` as never)}
              className="mx-6 mt-8 flex-row items-center justify-between rounded-lg border border-ink bg-ink p-4 active:opacity-80"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-on-primary">
                  Посмотреть как клиент
                </AppText>
                <AppText
                  className="mt-0.5 text-body-sm"
                  style={{ color: themeColors["on-primary"], opacity: 0.7 }}
                >
                  Так вашу карточку видят клиенты в каталоге.
                </AppText>
              </View>
              <ChevronRight size={20} strokeWidth={1.75} color={themeColors["on-primary"]} />
            </Pressable>

            {/* Edit master profile shortcut */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/profile/edit-master" as never)}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Редактировать профиль
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-muted">
                  Имя, город, bio, опыт, инструмент и транспорт
                </AppText>
              </View>
              <ChevronRight size={20} strokeWidth={1.75} color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Categories shortcut */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(onboarding)/master-categories")}
              className="mx-6 mt-3 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Категории
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-muted">
                  Выбор L2 услуг, которые вы предлагаете
                </AppText>
              </View>
              <ChevronRight size={20} strokeWidth={1.75} color={themeColors["muted-soft"]} />
            </Pressable>

            {/* Portfolio section */}
            <View className="mt-8 px-6">
              <View className="flex-row items-center justify-between">
                <AppText weight="semibold" className="text-title-lg text-ink">
                  Портфолио
                </AppText>
                <AppText className="text-caption text-muted">
                  {portfolio.data?.length ?? 0}/{PORTFOLIO_MAX}
                </AppText>
              </View>
              <AppText className="mt-1 text-body-sm text-muted">
                Фото работ повышают доверие клиентов.
              </AppText>

              <View className="mt-4">
                <PortfolioGrid
                  items={portfolio.data ?? []}
                  onDelete={onDeletePortfolio}
                  onOpen={(item) => {
                    const idx = (portfolio.data ?? []).findIndex((p) => p.id === item.id);
                    if (idx >= 0) setLightboxIndex(idx);
                  }}
                  isLoading={portfolio.isLoading}
                />
              </View>

              {canAddPortfolio && (
                <Pressable
                  accessibilityRole="button"
                  onPress={onAddPortfolio}
                  disabled={uploadPortfolio.isPending || addPortfolioItem.isPending}
                  className="mt-4 h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
                >
                  {uploadPortfolio.isPending || addPortfolioItem.isPending ? (
                    <ActivityIndicator />
                  ) : (
                    <>
                      <Plus size={18} strokeWidth={2} color="#2563eb" />
                      <AppText weight="semibold" className="text-button text-accent">
                        Добавить фото
                      </AppText>
                    </>
                  )}
                </Pressable>
              )}

              {!canAddPortfolio && (
                <View className="mt-4 rounded-md bg-surface-2 px-4 py-3">
                  <AppText className="text-caption text-muted">
                    Достигнут лимит {PORTFOLIO_MAX} фото. Удалите старые, чтобы добавить новые.
                  </AppText>
                </View>
              )}

              {(deletePortfolioItem.isPending || uploadPortfolio.isPending) && (
                <View className="mt-2 flex-row items-center gap-2">
                  <ActivityIndicator size="small" />
                  <AppText className="text-caption text-muted">
                    {deletePortfolioItem.isPending ? "Удаляем…" : "Загружаем…"}
                  </AppText>
                </View>
              )}
            </View>
          </>
        )}

        {/* Theme — для клиента segmented (3-button row), для мастера старый stacked
            (чтобы не ломать его экран; на нём 3 строки органичнее, т.к. master-секция
            уже длинная). */}
        {isClient ? (
          <View className="mt-8 px-5">
            <AppText weight="medium" className="mb-2 text-caption text-mute uppercase tracking-wider">
              Тема
            </AppText>
            <ClientThemeSegmented />
          </View>
        ) : (
          <View className="mt-10 px-6">
            <AppText weight="semibold" className="mb-3 text-title-md text-ink">
              Тема
            </AppText>
            <ThemeSwitcher />
          </View>
        )}

        {/* Admin entry — видно только админам */}
        {(user as { is_admin?: boolean } | null)?.is_admin && (
          <View className={`mt-8 ${isClient ? "px-5" : "px-6"}`}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/admin" as never)}
              className="h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
            >
              <ShieldCheck size={18} strokeWidth={1.75} color={themeColors.body} />
              <AppText weight="semibold" className="text-button text-body">
                Модерация
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
              className="h-11 flex-row items-center justify-center gap-2 active:opacity-70"
            >
              <LogOut size={16} strokeWidth={1.75} color={themeColors.error} />
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
              className="h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
            >
              <LogOut size={18} strokeWidth={1.75} color={themeColors.body} />
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

interface ClientStatTileProps {
  label: string;
  value: number;
  hint: string;
  accent?: boolean;
  onPress: () => void;
}

function ClientStatTile({ label, value, hint, accent, onPress }: ClientStatTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}, ${hint}`}
      onPress={onPress}
      className="flex-1 rounded-lg border border-hairline bg-canvas px-3 py-3 active:bg-canvas-soft"
    >
      <AppText weight="medium" className="text-caption text-mute">
        {label}
      </AppText>
      <AppText weight="mono" className="mt-2 text-display-md text-ink">
        {value}
      </AppText>
      <View className="mt-1.5 flex-row items-center gap-1.5">
        {accent ? <View className="h-1.5 w-1.5 rounded-full bg-warning" /> : null}
        <AppText
          weight={accent ? "semibold" : "regular"}
          className={`text-caption ${accent ? "text-ink" : "text-mute"}`}
          numberOfLines={1}
        >
          {hint}
        </AppText>
      </View>
    </Pressable>
  );
}

// Сегментированный 3-button-row для темы (Linear/Vercel-стиль).
// В одном «pill»-контейнере 3 равных секции, активная — bg-canvas + shadow, остальные ghost.
function ClientThemeSegmented() {
  const { preference, setPreference } = useColorScheme();
  const tc = useThemeColors(["ink", "mute"]);

  const opts: Array<{ value: ThemePreference; label: string; Icon: typeof Sun }> = [
    { value: "system", label: "Авто", Icon: Smartphone },
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
            <Icon size={14} strokeWidth={1.75} color={isSel ? tc.ink : tc.mute} />
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

interface GuestProfileScreenProps {
  insets: { top: number; bottom: number };
  themeColors: { ink: string; "on-primary": string; body: string };
  onLogin: () => void;
}

function GuestProfileScreen({ insets, themeColors, onLogin }: GuestProfileScreenProps) {
  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — просто заголовок «Профиль», без back-кнопки (это таб). */}
        <View className="flex-row items-center justify-center px-5 py-3">
          <AppText weight="semibold" className="text-title-md text-ink">
            Профиль
          </AppText>
        </View>

        {/* Hero card — Vercel-style: tinted band → иконка-юзер → текст → CTA.
            Воздух mt-6, paddings 6, чтобы выглядело как «приглашение», а не пусто. */}
        <View className="mx-5 mt-6 overflow-hidden rounded-xl border border-hairline bg-canvas">
          <View className="relative h-24 overflow-hidden bg-badge-violet">
            <View
              className="absolute rounded-full bg-canvas"
              style={{ top: -28, left: -20, width: 80, height: 80, opacity: 0.35 }}
            />
            <View
              className="absolute rounded-full bg-canvas"
              style={{ bottom: -16, right: 24, width: 56, height: 56, opacity: 0.45 }}
            />
            <View
              className="absolute rounded-md bg-canvas"
              style={{
                top: 16,
                right: 100,
                width: 16,
                height: 16,
                opacity: 0.55,
                transform: [{ rotate: "18deg" }],
              }}
            />
          </View>
          <View className="-mt-10 items-center px-6 pb-6">
            {/* Icon-cap — заменяет аватар. */}
            <View className="h-20 w-20 items-center justify-center rounded-full border-4 border-canvas bg-canvas-soft">
              <UserRound size={32} strokeWidth={1.5} color={themeColors.ink} />
            </View>

            <AppText
              weight="display"
              className="mt-4 text-display-sm tracking-tight text-ink text-center"
            >
              Войдите в аккаунт
            </AppText>
            <AppText
              className="mt-2 text-body-sm text-mute text-center"
              style={{ lineHeight: 20 }}
            >
              Создавайте заказы, общайтесь с мастерами и оставляйте отзывы.
              Регистрация по номеру телефона — 30 секунд.
            </AppText>

            <Pressable
              accessibilityRole="button"
              onPress={onLogin}
              className="mt-5 h-12 w-full flex-row items-center justify-center gap-2 rounded-pill bg-ink active:opacity-80"
            >
              <LogIn size={16} strokeWidth={2} color={themeColors["on-primary"]} />
              <AppText weight="semibold" className="text-button text-on-primary">
                Войти по телефону
              </AppText>
            </Pressable>
          </View>
        </View>

        {/* Тема — работает и для анона. */}
        <View className="mt-8 px-5">
          <AppText
            weight="medium"
            className="mb-2 text-caption text-mute uppercase tracking-wider"
          >
            Тема
          </AppText>
          <ClientThemeSegmented />
        </View>
      </ScrollView>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Локальные хуки — read-only city name + master_profiles для рейтинга
// ----------------------------------------------------------------------------

function useCityName(cityId: string | null) {
  return useQuery<string | null>({
    queryKey: ["city-name", cityId],
    queryFn: async () => {
      if (!cityId) return null;
      const { data, error } = await supabase
        .from("cities")
        .select("name")
        .eq("id", cityId)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
    enabled: !!cityId,
    staleTime: 60 * 60_000,
  });
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
