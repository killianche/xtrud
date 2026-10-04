/**
 * Содержимое экрана «Аккаунт»: шапка с аватаром и именем, «Я специалист»,
 * «Принимаю задания», админ-панель (если есть), «Аккаунт» (уведомления, имя
 * и фото, мой профиль, настройки), «Выйти».
 *
 * Один экран на два входа (владелец, 2026-10-03: вкладка «Профиль»
 * открывала «суперстарую версию», а аватар на Главной — правильную):
 * вкладка /(tabs)/profile и /account показывают это одно и то же.
 */

import { useRouter } from "expo-router";
import {
  BellSimple,
  Gear,
  Headset,
  LockKey,
  PencilSimple,
  Phone,
  ShieldCheck,
  SignOut,
  UserCircle,
  Wrench,
} from "phosphor-react-native";
import { Alert, Linking, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { InsetGroup, InsetRow } from "@/components/ui";
import { SUPPORT_URL } from "@/features/auth/BannedScreen";
import { formatRuPhone } from "@/features/auth/RegisterFormFields";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useUnreadReviewsCount } from "@/features/notifications/use-notifications";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { AvailabilityRows } from "@/features/specialist/AvailabilityRows";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";
import { pluralizeRu } from "@/lib/pluralize";
import { useThemeColors } from "@/lib/use-theme-color";

export function AccountBody({ userId }: { userId: string }) {
  const router = useRouter();
  const { data: user } = useUserRecord(userId);
  const { data: userPrivate } = useUserPrivate(userId);
  // Номер входа — маской, как в «Настройках» iOS у Apple ID.
  const phoneDigits = (userPrivate?.phone ?? "").replace(/\D/g, "").slice(-10);
  const phoneValue = phoneDigits.length === 10 ? `+7 ${formatRuPhone(phoneDigits)}` : undefined;
  const tc = useThemeColors(["ink", "on-accent", "error"]);
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Вы";

  // Каждый аккаунт — специалист (DECISION владельца 2026-09-11): «Я
  // специалист» есть у всех; профиль создаёт сам экран, если его нет.
  const openSpecialist = () => router.push("/profile/specialist" as never);
  // Новые отзывы — сюда ведёт счётчик на вкладке профиля.
  const unreadReviews = useUnreadReviewsCount(userId).data ?? 0;
  const reviewsValue =
    unreadReviews > 0
      ? `${unreadReviews} ${pluralizeRu(unreadReviews, {
          one: "новый отзыв",
          few: "новых отзыва",
          many: "новых отзывов",
        })}`
      : undefined;
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
    else Alert.alert("Не удалось выйти", result.error);
  };

  return (
    <>
      <View className="mb-7 flex-row items-center gap-4 px-4">
        <Avatar url={user?.avatar_url} name={fullName} seed={userId} size="xl" />
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-ios-title2 text-ink" numberOfLines={1}>
            {fullName}
          </AppText>
        </View>
      </View>

      <InsetGroup title="Специалист">
        <InsetRow
          title="Я специалист"
          icon={<Wrench size={18} weight="bold" color={tc["on-accent"]} />}
          iconAccent
          value={reviewsValue}
          navigates
          onPress={openSpecialist}
          last
        />
      </InsetGroup>

      <AvailabilityRows userId={userId} />

      {user?.is_admin ? (
        <InsetGroup title="Администратор">
          <InsetRow
            title="Панель администратора"
            icon={<ShieldCheck size={18} weight="bold" color={tc["on-accent"]} />}
            iconAccent
            navigates
            onPress={() => router.push("/admin" as never)}
            last
          />
        </InsetGroup>
      ) : null}

      {/* Личные данные — как «Имя, телефон, пароль» у Apple ID и банков
          (владелец, 2026-10-04, №218–№220). */}
      <InsetGroup title="Личные данные">
        <InsetRow
          title="Имя и фото"
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

      <InsetGroup title="Аккаунт">
        <InsetRow
          title="Уведомления"
          icon={<BellSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/notifications" as never)}
        />
        <InsetRow
          title="Мой профиль"
          icon={<UserCircle size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push(`/master/${userId}` as never)}
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
          onPress={() => void Linking.openURL(SUPPORT_URL)}
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
