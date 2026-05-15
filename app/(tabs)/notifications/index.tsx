/**
 * Notification Center — экран in-app inbox уведомлений (Sprint I.2).
 *
 * Точка входа: bell-иконка в шапке главной. Push на этот route.
 * Контракт:
 *   - При mount: автоматически пометить все непрочитанные как read.
 *   - Группировка: визуально выделяем непрочитанные (точкой / фоном).
 *   - Tap по карточке: deep-link в data (order_id → /orders/[id], chat_id → /chats/[id]).
 *   - Long-press / свайп: удалить.
 */

import { useRouter } from "expo-router";
import { Bell, CheckCheck, ChevronLeft, Trash2 } from "lucide-react-native";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { EmptyState } from "@/components/EmptyState";
import { useAuthSession } from "@/features/auth/use-auth-session";
import {
  type Notification,
  useDeleteNotification,
  useMarkNotificationsRead,
  useNotifications,
  useRealtimeNotifications,
} from "@/features/notifications/use-notifications";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

function timeAgo(iso: string): string {
  const created = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - created) / 1000));
  if (diffSec < 60) return "только что";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ч`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay} д`;
}

function NotificationCard({
  item,
  onPress,
  onDelete,
}: {
  item: Notification;
  onPress: () => void;
  onDelete: () => void;
}) {
  const isUnread = item.read_at === null;
  const muted = useThemeColor("muted-soft");

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-start gap-3 rounded-lg border p-4 active:opacity-70 ${
        isUnread
          ? "border-accent/30 bg-accent-soft"
          : "border-hairline bg-canvas"
      }`}
    >
      <View
        className={`h-2 w-2 mt-2 rounded-full ${
          isUnread ? "bg-accent" : "bg-transparent"
        }`}
      />
      <View className="flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <AppText
            weight={isUnread ? "semibold" : "medium"}
            className="flex-1 text-body-md text-ink"
            numberOfLines={2}
          >
            {item.title}
          </AppText>
          <AppText className="text-caption-xs text-muted-soft">
            {timeAgo(item.created_at)}
          </AppText>
        </View>
        {item.body && item.body.length > 0 && (
          <AppText
            className="mt-1 text-caption text-muted"
            numberOfLines={3}
          >
            {item.body}
          </AppText>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Удалить"
        onPress={onDelete}
        hitSlop={8}
        className="active:opacity-60"
      >
        <Trash2 size={16} strokeWidth={1.75} color={muted} />
      </Pressable>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const tc = useThemeColors(["ink", "muted-soft"]);

  useRealtimeNotifications(userId);
  const { data: items = [], isLoading, error, refetch } = useNotifications(userId);
  const markRead = useMarkNotificationsRead(userId);
  const deleteOne = useDeleteNotification(userId);
  const goBack = useSafeBack("/" as const);

  // Авто-mark-as-read при mount (если есть непрочитанные)
  useEffect(() => {
    if (!userId) return;
    const hasUnread = items.some((n) => n.read_at === null);
    if (hasUnread && !markRead.isPending) {
      markRead.mutate(null); // null = все непрочитанные
    }
  }, [userId, items, markRead]);

  const handlePress = (n: Notification) => {
    // deep-link по data
    const data = n.data as Record<string, unknown> | null;
    if (!data) return;

    const orderId = typeof data.order_id === "string" ? data.order_id : null;
    const chatId = typeof data.chat_id === "string" ? data.chat_id : null;

    if (chatId) {
      router.push(`/(tabs)/chats/${chatId}` as never);
    } else if (orderId) {
      router.push(`/(tabs)/orders/${orderId}` as never);
    }
  };

  return (
    <View
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Top bar */}
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
        <AppText weight="bold" className="flex-1 text-title-lg text-ink">
          Уведомления
        </AppText>
        {items.length > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Прочитать всё"
            onPress={() => markRead.mutate(null)}
            disabled={markRead.isPending}
            hitSlop={8}
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <CheckCheck size={18} strokeWidth={1.75} color={tc["muted-soft"]} />
            <AppText weight="medium" className="text-caption text-muted">
              Всё прочитано
            </AppText>
          </Pressable>
        )}
      </View>

      {isLoading && (
        <View className="mt-8 items-center">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить уведомления. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && items.length === 0 && (
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState
            icon={Bell}
            title="Пусто"
            hint="Уведомления о новых откликах, сообщениях и отзывах появятся здесь."
          />
        </View>
      )}

      {!isLoading && items.length > 0 && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-3 px-6 pt-2 pb-4">
            {items.map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                onPress={() => handlePress(item)}
                onDelete={() => deleteOne.mutate(item.id)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
