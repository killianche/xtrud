/**
 * /admin — хаб админки (видно только users.is_admin).
 *
 * Точка входа: «Админка» в профиле. Отсюда — разделы:
 *   - Рейтинг мастеров (по категориям, внутренний балл) → /admin/ratings
 *   - Жалобы и модерация → /admin/reports
 *
 * Раньше /admin был сразу экраном модерации; 2026-05-22 стал хабом, модерация
 * переехала в /admin/reports — чтобы добавлять новые админ-разделы.
 */

import { useRouter } from "expo-router";
import { CaretLeft, CaretRight, ChartBar, ShieldCheck, Warning } from "phosphor-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
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
  const { data: user } = useUserRecord(userId);
  const isAdmin = (user as { is_admin?: boolean } | null)?.is_admin === true;
  const tc = useThemeColors(["ink"]);
  const goBack = useSafeBack("/(tabs)/profile" as const);

  if (user && !isAdmin) {
    return (
      <View
        className="flex-1 items-center justify-center bg-canvas px-6"
        style={{ paddingTop: insets.top }}
      >
        <EmptyState
          icon={Warning}
          title="Доступ запрещён"
          hint="Эта страница только для админов."
        />
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="mt-4 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
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
          Админка
        </AppText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-3 px-6 pt-2">
          <HubCard
            icon={ChartBar}
            title="Рейтинг мастеров"
            hint="Внутренний балл мастеров по категориям — кто выше в выдаче."
            onPress={() => router.push("/admin/ratings" as never)}
          />
          <HubCard
            icon={ShieldCheck}
            title="Жалобы и модерация"
            hint="Очередь жалоб: скрыть отзыв, приостановить пользователя."
            onPress={() => router.push("/admin/reports" as never)}
          />
        </View>
      </ScrollView>
    </View>
  );
}
