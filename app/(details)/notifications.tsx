/**
 * /notifications — последние уведомления: отклики, изменения по заданиям,
 * новые задания по моим категориям. Экран в стиле Настроек: строки с
 * заголовком, текстом и временем; непрочитанные — с точкой. Открытие
 * экрана отмечает всё прочитанным.
 */

import { Redirect, useRouter } from "expo-router";
import { BellSimple } from "phosphor-react-native";
import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { FormScreen, InsetGroup } from "@/components/ui";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  formatNotificationTime,
  notificationTarget,
  useMarkNotificationsRead,
  useNotifications,
} from "@/features/notifications/use-notifications";
import { useThemeColors } from "@/lib/use-theme-color";

export default function NotificationsScreen() {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const list = useNotifications(userId);
  const markRead = useMarkNotificationsRead(userId);
  const tc = useThemeColors(["mute", "accent"]);

  const hasUnread = (list.data ?? []).some((n) => !n.read_at);
  const markMutate = markRead.mutate;
  useEffect(() => {
    if (hasUnread) markMutate();
  }, [hasUnread, markMutate]);

  if (!userId) return <Redirect href="/(auth)/phone" />;

  const items = list.data ?? [];
  return (
    <FormScreen title="Уведомления" onBack={() => router.back()}>
      {list.isLoading ? (
        <View className="mx-4 overflow-hidden rounded-2xl bg-canvas">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="gap-2 px-4 py-3.5">
              <Skeleton height={17} className="w-2/3 rounded" />
              <Skeleton height={14} className="w-full rounded" />
            </View>
          ))}
        </View>
      ) : list.error ? (
        <InsetGroup footer="Не удалось загрузить уведомления. Потяните, чтобы повторить, или зайдите позже.">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Повторить"
            onPress={() => void list.refetch()}
            className="min-h-14 items-center justify-center active:bg-canvas-soft"
          >
            <AppText weight="semibold" className="text-ios-body text-accent">
              Повторить
            </AppText>
          </Pressable>
        </InsetGroup>
      ) : items.length === 0 ? (
        <View className="items-center px-8 pt-10">
          <BellSimple size={44} weight="regular" color={tc.mute} />
          <AppText weight="semibold" className="mt-4 text-center text-ios-title2 text-ink">
            Пока тихо
          </AppText>
          <AppText className="mt-1.5 text-center text-ios-subheadline text-mute">
            Здесь появятся отклики на ваши задания и новости по ним.
          </AppText>
        </View>
      ) : (
        <InsetGroup>
          {items.map((n, i) => {
            const target = notificationTarget(n);
            const unread = !n.read_at;
            return (
              <Pressable
                key={n.id}
                accessibilityRole={target ? "button" : "text"}
                accessibilityLabel={`${unread ? "Новое. " : ""}${n.title}. ${n.body}`}
                disabled={!target}
                onPress={() => target && router.push(target as never)}
                className={`flex-row items-start gap-3 px-4 ${target ? "active:bg-canvas-soft" : ""}`}
              >
                <View
                  className="mt-5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: unread ? tc.accent : "transparent" }}
                />
                <View
                  className={`min-w-0 flex-1 py-3.5 pr-4 ${i === items.length - 1 ? "" : "border-b border-hairline"}`}
                >
                  <View className="flex-row items-baseline justify-between gap-3">
                    <AppText
                      weight={unread ? "semibold" : "regular"}
                      className="min-w-0 flex-1 text-ios-body text-ink"
                      numberOfLines={2}
                    >
                      {n.title}
                    </AppText>
                    <AppText className="text-ios-footnote text-mute">
                      {formatNotificationTime(n.created_at)}
                    </AppText>
                  </View>
                  {n.body ? (
                    <AppText className="mt-0.5 text-ios-subheadline text-mute" numberOfLines={3}>
                      {n.body}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </InsetGroup>
      )}
    </FormScreen>
  );
}
