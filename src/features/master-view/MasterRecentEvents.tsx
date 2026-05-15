/**
 * MasterRecentEvents — компактная «лента событий» на главной мастера.
 *
 * Why. Раньше под секцией «Готовы работать?» был пустой экран. Мастер должен
 * был идти в таб «Чаты» / «Заказы» чтобы узнать о новых событиях. По фидбэку
 * user 2026-05-15 «давай уведомления на главную».
 *
 * Что показываем — топ-5 свежих **непрочитанных** уведомлений из той же
 * таблицы `notifications`, что и full-screen `/notifications`. Это
 * выжимка, не дубль: тап по строке = deep-link на заказ/чат + auto-mark-read.
 *
 * Если непрочитанных нет — секция скрывается полностью (не плодим empty
 * states; чистый экран — это OK, у мастера и так есть chip-row статуса).
 *
 * Source-of-truth — `useNotifications` hook. Realtime auto-update через
 * `useRealtimeNotifications` (подписка на INSERT) живёт в notifications-screen.
 * Здесь только подключаемся к кэшу — он рефетчится после mark-read.
 */

import { useRouter } from "expo-router";
import { WarningCircle, Bell, CheckCircle, CaretRight, ChatCenteredText, Star, Lightning } from "phosphor-react-native";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  type Notification,
  useMarkNotificationsRead,
  useNotifications,
} from "@/features/notifications/use-notifications";
import { useThemeColors } from "@/lib/use-theme-color";

const MAX_PREVIEW = 5;

/** Один элемент списка. icon-cell 36×36 с tinted-bg по семантике типа.
 *  Это тот же визуальный язык, что и в OrderRow:assigned/responded variants
 *  и AvailabilitySwitcher chips — единый «pill+dot» паттерн. */
function eventVisual(type: Notification["type"]) {
  switch (type) {
    case "order_accepted":
      return { Icon: CheckCircle, bg: "bg-success-soft", color: "success" } as const;
    case "new_message":
      return { Icon: ChatCenteredText, bg: "bg-accent-soft", color: "accent" } as const;
    case "new_response":
      // У мастера такого события не бывает (это для клиента — «мне откликнулись»),
      // но обработаем на случай dual-role.
      return { Icon: Lightning, bg: "bg-accent-soft", color: "accent" } as const;
    case "review_received":
      return { Icon: Star, bg: "bg-warning-soft", color: "warning" } as const;
    case "order_cancelled":
    case "order_expired":
      return { Icon: WarningCircle, bg: "bg-canvas-soft-2", color: "mute" } as const;
    default:
      return { Icon: Bell, bg: "bg-canvas-soft-2", color: "mute" } as const;
  }
}

function timeAgoShort(iso: string): string {
  const created = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - created) / 1000));
  if (diffSec < 60) return "сейчас";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} мин`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ч`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} д`;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

interface MasterRecentEventsProps {
  userId: string;
}

export function MasterRecentEvents({ userId }: MasterRecentEventsProps) {
  const router = useRouter();
  const { data: items, isLoading } = useNotifications(userId);
  const markRead = useMarkNotificationsRead(userId);
  const tc = useThemeColors(["mute", "muted-soft", "ink", "success", "accent", "warning"]);

  // Только непрочитанные, ограничиваем MAX_PREVIEW. Sorted by created_at
  // DESC из хука.
  const unread = useMemo(() => {
    if (!items) return [];
    return items.filter((n) => n.read_at === null).slice(0, MAX_PREVIEW);
  }, [items]);

  // Если ничего непрочитанного — не рендерим (включая loading: показывать
  // skeleton ради всё-равно-пустого блока не нужно, экран без него тоже OK).
  if (isLoading || unread.length === 0) return null;

  const handlePress = (n: Notification) => {
    const data = n.data as Record<string, unknown> | null;
    const orderId = data && typeof data.order_id === "string" ? data.order_id : null;
    const chatId = data && typeof data.chat_id === "string" ? data.chat_id : null;

    // Mark read оптимистично, потом navigate. Если deeplink нет — открываем
    // полный экран уведомлений (мастер увидит контекст). useMarkNotificationsRead
    // принимает массив id (или null для всех).
    markRead.mutate([n.id]);
    if (chatId) {
      router.push(`/(tabs)/chats/${chatId}` as never);
    } else if (orderId) {
      router.push(`/(tabs)/orders/${orderId}` as never);
    } else {
      router.push("/(tabs)/notifications" as never);
    }
  };

  return (
    <View>
      <View className="flex-row items-baseline justify-between">
        <AppText weight="semibold" className="text-title-md text-ink">
          Что нового
        </AppText>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/(tabs)/notifications" as never)}
          hitSlop={8}
          className="flex-row items-center gap-1 active:opacity-60"
        >
          <AppText weight="medium" className="text-caption text-mute">
            Все
          </AppText>
          <CaretRight size={14} weight="bold" color={tc["muted-soft"]} />
        </Pressable>
      </View>

      <View className="mt-3 overflow-hidden rounded-xl border border-hairline bg-canvas">
        {unread.map((n, idx) => {
          const { Icon, bg, color } = eventVisual(n.type);
          const isLast = idx === unread.length - 1;
          const iconColor =
            color === "success"
              ? tc.success
              : color === "accent"
                ? tc.accent
                : color === "warning"
                  ? tc.warning
                  : tc.mute;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="button"
              accessibilityLabel={n.title}
              onPress={() => handlePress(n)}
              className={`flex-row items-center gap-3 px-4 py-3 active:bg-canvas-soft hover:bg-canvas-soft ${
                isLast ? "" : "border-b border-hairline"
              }`}
            >
              <View className={`h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
                <Icon size={18} weight="bold" color={iconColor} />
              </View>
              <View className="flex-1 min-w-0">
                <View className="flex-row items-baseline gap-2">
                  <AppText
                    weight="semibold"
                    className="flex-1 text-body-sm text-ink"
                    numberOfLines={1}
                  >
                    {n.title}
                  </AppText>
                  <AppText weight="mono" className="text-mono-caption text-muted-soft">
                    {timeAgoShort(n.created_at)}
                  </AppText>
                </View>
                {n.body ? (
                  <AppText className="mt-0.5 text-caption text-mute" numberOfLines={1}>
                    {n.body}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
