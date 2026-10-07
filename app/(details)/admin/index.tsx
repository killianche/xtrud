/**
 * /admin — хаб «Управление» для админа и управляющего (№286,
 * docs/STAFF_ROLES_2026-10.md).
 *
 * Точка входа: «Управление» в профиле. Разделы:
 *   - Без категории → /admin/uncategorized (админ и управляющий)
 *   - Жалобы и модерация → /admin/reports (админ и управляющий)
 *   - Рейтинг специалистов → /admin/ratings (только админ)
 *   - Паспорта → /admin/verifications (только админ: персональные данные)
 *
 * Раньше /admin был сразу экраном модерации; 2026-05-22 стал хабом, модерация
 * переехала в /admin/reports — чтобы добавлять новые админ-разделы.
 */

import { useRouter } from "expo-router";
import {
  CaretLeft,
  CaretRight,
  ChartBar,
  IdentificationCard,
  ShieldCheck,
  Tag,
  Warning,
} from "phosphor-react-native";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useStaffRole } from "@/features/staff/use-staff";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

interface HubCardProps {
  icon: IconComponent;
  title: string;
  hint: string;
  onPress: () => void;
}

function HubCard({ icon: Icon, title, hint, onPress }: HubCardProps) {
  const tc = useThemeColors(["ink", "muted-soft"]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-xl border border-hairline bg-canvas-soft p-4 active:opacity-80"
    >
      <View className="h-11 w-11 items-center justify-center rounded-full bg-surface-2">
        <Icon size={22} weight="bold" color={tc.ink} />
      </View>
      <View className="flex-1 min-w-0">
        <AppText weight="semibold" className="text-body-md text-ink">
          {title}
        </AppText>
        <AppText className="mt-0.5 text-caption text-mute" numberOfLines={2}>
          {hint}
        </AppText>
      </View>
      <CaretRight size={18} weight="bold" color={tc["muted-soft"]} />
    </Pressable>
  );
}

export default function AdminHubScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const role = useStaffRole(userId);
  const isAdmin = role === "admin";
  const tc = useThemeColors(["ink", "mute"]);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  // Пока роль уточняется — пусто, а не меню: не-сотрудник не должен видеть
  // разделы даже на кадр (ревью xtrud-security 2026-10-07, M5).
  if (role === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={tc.mute} />
      </View>
    );
  }

  if (role === null) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top }}
      >
        <EmptyState
          icon={Warning}
          title="Доступ запрещён"
          hint="Эта страница только для администраторов и управляющих."
        />
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="mt-4 min-h-11 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
        >
          <AppText weight="medium" className="text-caption text-ink">
            Назад
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={28} weight="bold" color={tc.ink} />
        </Pressable>
        <AppText weight="bold" className="flex-1 text-title-lg text-ink">
          Управление
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3 px-6 pt-2">
          <HubCard
            icon={Tag}
            title="Без категории"
            hint="Задания, которым нейросеть не подобрала категорию."
            onPress={() => router.push("/admin/uncategorized" as never)}
          />
          <HubCard
            icon={ShieldCheck}
            title="Жалобы и модерация"
            hint="Очередь жалоб: скрыть отзыв, приостановить пользователя."
            onPress={() => router.push("/admin/reports" as never)}
          />
          {isAdmin ? (
            <>
              <HubCard
                icon={ChartBar}
                title="Рейтинг специалистов"
                hint="Внутренний балл специалистов по категориям — кто выше в выдаче."
                onPress={() => router.push("/admin/ratings" as never)}
              />
              <HubCard
                icon={IdentificationCard}
                title="Паспорта"
                hint="Подтверждение личности специалистов: фото, решение, значок."
                onPress={() => router.push("/admin/verifications" as never)}
              />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}
