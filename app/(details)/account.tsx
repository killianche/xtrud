/**
 * /account — страница аккаунта, открывается с главной (тап по имени и
 * аватару). DECISION владельца 2026-09-07: «при нажатии открывается страница
 * аккаунта, можно вернуться назад, и там же заполнять профиль специалиста:
 * чем занимаюсь, фото работ». Экран в стиле Настроек iOS: шапка с аватаром,
 * группы строк.
 */

import { Redirect, useRouter } from "expo-router";
import {
  BellSimple,
  Gear,
  PencilSimple,
  ShieldCheck,
  SignOut,
  UserCircle,
  Wrench,
} from "phosphor-react-native";
import { Alert, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { FormScreen, InsetGroup, InsetRow } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { AvailabilityRows } from "@/features/specialist/AvailabilityRows";
import { signOut } from "@/lib/auth";
import { confirmAsync } from "@/lib/confirm";
import { useThemeColors } from "@/lib/use-theme-color";

export default function AccountScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const tc = useThemeColors(["ink", "on-accent", "error"]);

  if (!userId) return <Redirect href="/(auth)/phone" />;

  // Каждый аккаунт — специалист (DECISION владельца 2026-09-11): «Стать
  // специалистом» убрано, «Я специалист» есть у всех. Профиль создаётся при
  // регистрации (0186), а если его нет — его тихо создаёт сам экран.
  const openSpecialist = () => router.push("/profile/specialist" as never);
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
    <FormScreen title="Аккаунт" onBack={() => router.back()}>
      <View className="mb-7 flex-row items-center gap-4 px-5">
        <Avatar url={user?.avatar_url} name={user?.first_name} seed={userId} size="xl" />
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-ios-title2 text-ink" numberOfLines={1}>
            {user?.first_name ?? "Вы"}
          </AppText>
        </View>
      </View>

      <InsetGroup title="Специалист">
        <InsetRow
          title="Я специалист"
          subtitle="Категории, о себе, фото работ, контакты"
          icon={<Wrench size={18} weight="bold" color={tc["on-accent"]} />}
          iconAccent
          navigates
          onPress={openSpecialist}
          last
        />
      </InsetGroup>

      <AvailabilityRows userId={userId} />

      {user?.is_admin ? (
        <InsetGroup
          title="Администратор"
          footer="Жалобы, паспорта, рейтинг. Блокировка и скрытие — в меню «⋯» на страницах людей и заданий."
        >
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

      <InsetGroup title="Аккаунт">
        <InsetRow
          title="Уведомления"
          subtitle="Отклики и новости по заданиям"
          icon={<BellSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/notifications" as never)}
        />
        <InsetRow
          title="Имя и фото"
          icon={<PencilSimple size={18} weight="bold" color={tc.ink} />}
          navigates
          onPress={() => router.push("/profile/edit-client" as never)}
        />
        <InsetRow
          title="Мой профиль"
          subtitle="Как меня видят другие"
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
          title="Выйти из аккаунта"
          icon={<SignOut size={18} weight="bold" color={tc.error} />}
          destructive
          onPress={() => void logout()}
          last
        />
      </InsetGroup>
    </FormScreen>
  );
}
