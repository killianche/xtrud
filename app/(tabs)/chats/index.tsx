import { useRouter } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusBadge, type OrderStatusValue } from "@/components/OrderStatusBadge";
import { CardListSkeleton } from "@/components/Skeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { isChatUnread, type MyChatWithRefs, useMyChats } from "@/features/chat/use-my-chats";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

export default function ChatsListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: chats, isLoading, error, refetch } = useMyChats(userId);

  const hasChats = (chats?.length ?? 0) > 0;
  const refresh = usePullToRefresh();

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }}
      showsVerticalScrollIndicator={false}
      refreshControl={refresh.control}
    >
      <View className="px-6">
        <AppText weight="bold" className="text-display-md tracking-tight text-ink">
          Чаты
        </AppText>
        <AppText className="mt-2 text-body-md text-muted">Общение по принятым заявкам.</AppText>
      </View>

      {isLoading && (
        <View className="mt-6 px-6">
          <CardListSkeleton count={4} />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить чаты. {error.message}
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

      {!isLoading && !error && hasChats && (
        <View className="mt-6 gap-2 px-6">
          {chats?.map((c) => (
            <ChatListRow
              key={c.id}
              chat={c}
              userId={userId}
              onPress={() => router.push(`/(tabs)/chats/${c.id}` as never)}
            />
          ))}
        </View>
      )}

      {!isLoading && !error && !hasChats && (
        <View className="mt-12">
          <EmptyState
            icon={MessageCircle}
            title="Чатов пока нет"
            hint="Чат появится автоматически, когда вы примете отклик мастера или клиент выберет вас."
          />
        </View>
      )}
    </ScrollView>
  );
}

interface ChatListRowProps {
  chat: MyChatWithRefs;
  userId: string | undefined;
  onPress: () => void;
}

function ChatListRow({ chat, userId, onPress }: ChatListRowProps) {
  // Партнёр в чате — тот, кто НЕ ты
  const partner = chat.client_id === userId ? chat.master : chat.client;
  const partnerName =
    [partner?.first_name, partner?.last_name].filter(Boolean).join(" ") || "Собеседник";
  const lastActivity = chat.last_message_at
    ? new Date(chat.last_message_at).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "short",
      })
    : "Нет сообщений";
  const unread = userId ? isChatUnread(chat, userId) : false;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-lg border p-4 active:opacity-70 ${
        unread ? "border-accent bg-accent-soft" : "border-hairline bg-canvas"
      }`}
    >
      <Avatar
        url={partner?.avatar_url ?? null}
        name={partnerName}
        seed={partner?.id ?? null}
        size="md"
      />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <AppText
            weight={unread ? "bold" : "semibold"}
            className="flex-shrink text-body-md text-ink"
            numberOfLines={1}
          >
            {partnerName}
          </AppText>
          {unread && <View className="h-2 w-2 rounded-full bg-accent" />}
        </View>
        <View className="mt-1 flex-row items-center gap-2">
          {chat.order?.status && (
            <OrderStatusBadge status={chat.order.status as OrderStatusValue} />
          )}
          <AppText
            className={`flex-1 text-caption ${unread ? "text-ink" : "text-muted"}`}
            weight={unread ? "medium" : "regular"}
            numberOfLines={1}
          >
            {chat.order?.title ?? "Заказ"}
          </AppText>
        </View>
      </View>
      <AppText
        className={`text-caption-xs ${unread ? "text-accent" : "text-muted-soft"}`}
        weight={unread ? "semibold" : "regular"}
      >
        {lastActivity}
      </AppText>
    </Pressable>
  );
}
