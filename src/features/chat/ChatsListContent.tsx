// ChatsListContent — переиспользуемый список чатов.
//
// Используется в:
//   - app/(tabs)/chats/index.tsx (mobile / narrow web — full-page)
//   - app/(tabs)/chats/_layout.tsx (desktop web sidebar — variant="sidebar")
//
// На variant="sidebar" подсвечивает выбранный чат и компактнее (без display-заголовка).

import { useRouter } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusBadge, type OrderStatusValue } from "@/components/OrderStatusBadge";
import { CardListSkeleton } from "@/components/Skeleton";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { isChatUnread, type MyChatWithRefs, useMyChats } from "@/features/chat/use-my-chats";
import { scrollViewToTop, useTabScrollResetCounter } from "@/lib/tab-scroll-reset";

interface ChatsListContentProps {
  variant?: "page" | "sidebar";
  selectedChatId?: string | null;
}

export function ChatsListContent({
  variant = "page",
  selectedChatId = null,
}: ChatsListContentProps) {
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id;
  const { data: chats, isLoading, error, refetch } = useMyChats(userId);

  const hasChats = (chats?.length ?? 0) > 0;
  const isSidebar = variant === "sidebar";

  // Tap-on-active-tab → scroll to top. Подписка только в page-режиме
  // (sidebar — отдельный portal, ему scroll-reset не нужен).
  const scrollRef = useRef<ScrollView>(null);
  const resetCounter = useTabScrollResetCounter("chats");
  useEffect(() => {
    if (!isSidebar && resetCounter > 0) scrollViewToTop(scrollRef);
  }, [resetCounter, isSidebar]);

  return (
    <ScrollView
      ref={scrollRef}
      className="flex-1"
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      {!isSidebar && (
        <View className="px-6 pt-6">
          <AppText weight="bold" className="text-display-md tracking-tight text-ink">
            Чаты
          </AppText>
          <AppText className="mt-2 text-body-md text-muted">Общение с мастерами по вашим задачам.</AppText>
        </View>
      )}

      {isSidebar && (
        <View className="border-hairline border-b px-4 py-4">
          <AppText weight="semibold" className="text-title-sm text-ink">
            Чаты
          </AppText>
        </View>
      )}

      {isLoading && (
        <View className={`${isSidebar ? "p-4" : "mt-6 px-6"}`}>
          <CardListSkeleton count={4} />
        </View>
      )}

      {error && (
        <View className={`${isSidebar ? "p-4" : "mt-8 px-6"}`}>
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить чаты. {error.message}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => refetch()}
            className="mt-3 h-10 items-center justify-center rounded-md border border-hairline px-4 active:opacity-70 hover:bg-surface-2"
          >
            <AppText weight="medium" className="text-caption text-ink">
              Повторить
            </AppText>
          </Pressable>
        </View>
      )}

      {!isLoading && !error && hasChats && (
        <View className={`gap-2 ${isSidebar ? "p-2" : "mt-6 px-6"}`}>
          {chats?.map((c) => (
            <ChatListRow
              key={c.id}
              chat={c}
              userId={userId}
              compact={isSidebar}
              isSelected={isSidebar && selectedChatId === c.id}
              onPress={() => router.push(`/(tabs)/chats/${c.id}` as never)}
            />
          ))}
        </View>
      )}

      {!isLoading && !error && !hasChats && (
        <View className={`${isSidebar ? "p-4 pt-12" : "mt-12"}`}>
          <EmptyState
            icon={MessageCircle}
            emoji="💬"
            title="Чатов пока нет"
            hint="Напишите мастеру первым с его страницы — диалог появится здесь."
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
  compact?: boolean;
  isSelected?: boolean;
}

function ChatListRow({ chat, userId, onPress, compact, isSelected }: ChatListRowProps) {
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

  const baseClasses = compact
    ? "flex-row items-center gap-3 rounded-md p-3 active:opacity-70 hover:bg-surface-2"
    : "flex-row items-center gap-3 rounded-lg border p-4 active:opacity-70 hover:bg-surface-2";

  let borderColorClass = "";
  if (!compact) {
    borderColorClass = unread ? "border-accent bg-accent-soft" : "border-hairline bg-canvas";
  } else if (isSelected) {
    borderColorClass = "bg-surface-2";
  } else if (unread) {
    borderColorClass = "bg-accent-soft";
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`${baseClasses} ${borderColorClass}`}
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
