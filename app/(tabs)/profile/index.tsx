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
import { ChevronLeft, ChevronRight, LogOut, Pencil, Plus, Star } from "lucide-react-native";
import { useMemo } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { PortfolioGrid } from "@/features/profile/PortfolioGrid";
import {
  PORTFOLIO_MAX,
  useAddPortfolioItem,
  useDeletePortfolioItem,
  useMasterPortfolio,
} from "@/features/profile/use-my-portfolio";
import { useRemoveMyAvatar, useUpdateMyAvatar } from "@/features/profile/use-update-my-avatar";
import { useUploadPortfolioImage } from "@/features/uploads/use-upload-image";
import { signOut } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Tables } from "@/types/database";

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  const { data: user, isLoading: userLoading } = useUserRecord(userId);
  const { data: cityName } = useCityName(user?.city_id ?? null);
  const { data: masterProfile } = useMyMasterProfile(userId, user?.is_master === true);

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

  const onDeletePortfolio = (id: string, storagePath: string) => {
    Alert.alert("Удалить фото?", "Действие нельзя отменить.", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Удалить",
        style: "destructive",
        onPress: () => {
          deletePortfolioItem.mutate(
            { id, storagePath },
            { onError: (e) => Alert.alert("Не удалось удалить", e.message) },
          );
        },
      },
    ]);
  };

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

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      {/* Top bar */}
      <View className="flex-row items-center justify-between px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
        <AppText weight="semibold" className="text-title-md text-ink">
          Профиль
        </AppText>
        <View className="w-10" />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar block */}
        <View className="items-center px-6 pt-2">
          <View className="relative">
            <Avatar url={user.avatar_url} name={fullName} seed={user.id} size="xl" />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Изменить фото"
              onPress={onChangeAvatar}
              disabled={updateAvatar.isPending}
              hitSlop={6}
              className="-bottom-1 -right-1 absolute h-9 w-9 items-center justify-center rounded-full border-2 border-canvas bg-accent active:opacity-80"
            >
              {updateAvatar.isPending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Pencil size={16} strokeWidth={2} color="#ffffff" />
              )}
            </Pressable>
          </View>

          {user.avatar_url && (
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
          )}

          <AppText weight="bold" className="mt-4 text-display-sm text-ink">
            {fullName}
          </AppText>

          <View className="mt-2 flex-row items-center gap-2">
            <View className="rounded-pill bg-surface-2 px-3 py-1">
              <AppText weight="medium" className="text-caption text-body">
                {user.is_master ? "Мастер" : "Клиент"}
              </AppText>
            </View>
            {ratingAvg != null && ratingCount > 0 && (
              <View className="flex-row items-center gap-1">
                <Star size={14} strokeWidth={2} color="#f59e0b" fill="#f59e0b" />
                <AppText weight="semibold" className="text-caption text-ink">
                  {ratingAvg.toFixed(1)}
                </AppText>
                <AppText className="text-caption text-muted">({ratingCount})</AppText>
              </View>
            )}
          </View>

          {cityName && (
            <AppText className="mt-1 text-body-sm text-muted">
              {cityName}
              {user.district ? `, ${user.district}` : ""}
            </AppText>
          )}
        </View>

        {/* Master-only sections */}
        {user.is_master && (
          <>
            {/* Edit master profile shortcut */}
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/(tabs)/profile/edit-master" as never)}
              className="mx-6 mt-8 flex-row items-center justify-between rounded-lg border border-hairline bg-canvas p-4 active:opacity-70"
            >
              <View className="flex-1">
                <AppText weight="semibold" className="text-body-md text-ink">
                  Редактировать профиль
                </AppText>
                <AppText className="mt-0.5 text-body-sm text-muted">
                  Имя, город, bio, опыт, инструмент и транспорт
                </AppText>
              </View>
              <ChevronRight size={20} strokeWidth={1.75} color="#71717a" />
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
              <ChevronRight size={20} strokeWidth={1.75} color="#71717a" />
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

        {/* Sign out */}
        <View className="mt-12 px-6">
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              Alert.alert("Выйти?", "Можно будет войти заново со своим номером.", [
                { text: "Отмена", style: "cancel" },
                { text: "Выйти", style: "destructive", onPress: () => signOut() },
              ])
            }
            className="h-12 flex-row items-center justify-center gap-2 rounded-md border border-hairline bg-canvas active:opacity-70"
          >
            <LogOut size={18} strokeWidth={1.75} color="#374151" />
            <AppText weight="semibold" className="text-button text-body">
              Выйти
            </AppText>
          </Pressable>
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
