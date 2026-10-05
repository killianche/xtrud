/**
 * /profile/settings — «Настройки»: то, чего нет в «Аккаунте».
 *
 * Аудит 2026-10-05 (docs/UX_AUDIT_2026-10-05.md §7), владелец: «если везде
 * дубли — сделай, чтобы дублей не было». «Выйти», «Написать в поддержку» и
 * номер телефона живут только в «Аккаунте» (там же личные данные). Здесь —
 * блокировки, тема, сведения о приложении и удаление аккаунта (последним,
 * красным, как в Настройках iOS).
 *
 * Строки — канонические InsetGroup/InsetRow (как «Аккаунт» и профиль
 * специалиста), а не локальная копия.
 * Email НЕ показываем — auth.users.email синтетический (см. CLAUDE.md).
 */

import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { FileText, ProhibitInset, ShieldCheck, Trash } from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { InsetGroup, InsetRow, ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useBlockedUsers } from "@/features/blocking/use-user-blocks";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["ink", "error"]);
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: user } = useUserRecord(userId);
  const goBack = useSafeBack("/(tabs)/profile" as const);
  const isMaster = user?.is_master === true;
  // Блокировка доступна всем вошедшим (App Store Guideline 1.2 — UGC safety).
  const blockedUsers = useBlockedUsers();
  const blockedCount = blockedUsers.data?.length ?? 0;
  const version =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? "—";

  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Настройки" onBack={goBack} />
      <ScrollView
        contentContainerStyle={{ paddingTop: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {userId ? (
          <InsetGroup title="Приватность">
            <InsetRow
              title="Заблокированные пользователи"
              icon={<ProhibitInset size={18} weight="bold" color={tc.ink} />}
              value={blockedCount > 0 ? String(blockedCount) : undefined}
              accessibilityLabel={
                blockedCount > 0
                  ? `Заблокированные пользователи: ${blockedCount}`
                  : "Заблокированные пользователи"
              }
              navigates
              onPress={() => router.push("/profile/blocked-users" as never)}
              last
            />
          </InsetGroup>
        ) : null}

        <InsetGroup title="Тема приложения">
          <View className="px-4 py-3">
            <ThemeSwitcher />
          </View>
        </InsetGroup>

        <InsetGroup title="О приложении">
          <InsetRow title="Версия" value={version} />
          <InsetRow
            title="Условия использования"
            icon={<FileText size={18} weight="bold" color={tc.ink} />}
            navigates
            onPress={() => router.push("/legal/terms" as never)}
          />
          <InsetRow
            title="Политика конфиденциальности"
            icon={<ShieldCheck size={18} weight="bold" color={tc.ink} />}
            navigates
            onPress={() => router.push("/legal/privacy" as never)}
            last
          />
        </InsetGroup>

        {userId ? (
          <InsetGroup footer="Аккаунт и данные будут удалены. Отзывы останутся без имени.">
            <InsetRow
              title="Удалить аккаунт"
              icon={<Trash size={18} weight="bold" color={tc.error} />}
              destructive
              onPress={() =>
                router.push({
                  pathname: "/profile/delete-account",
                  params: { isMaster: isMaster ? "true" : "false" },
                } as never)
              }
              last
            />
          </InsetGroup>
        ) : null}
      </ScrollView>
    </View>
  );
}
