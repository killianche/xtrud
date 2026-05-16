// ChatsListContent — переиспользуемый список чатов.
//
// Используется в:
//   - app/(tabs)/chats/index.tsx (mobile / narrow web — full-page)
//   - app/(tabs)/chats/_layout.tsx (desktop web sidebar — variant="sidebar")
//
// На variant="sidebar" подсвечивает выбранный чат и компактнее (без display-заголовка).

import { useRouter } from "expo-router";
import { Briefcase, ChatCircle, User } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusBadge, type OrderStatusValue } from "@/components/OrderStatusBadge";
import { CardListSkeleton } from "@/components/Skeleton";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
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
  const { data: user } = useUserRecord(userId);
  const isMasterRole = user?.active_role === "master";
  const { data: chats, isLoading, error, refetch } = useMyChats(userId);
  const isSidebar = variant === "sidebar";

  // Dual-role filter (фидбэк user 2026-05-16): у пользователей с двумя ролями
  // (Клиент + Мастер) в одном списке смешивались чаты обеих ролей. По
  // умолчанию показываем только чаты текущей active_role; toggle «Все чаты»
  // переключает на полный список с бейджами роли на каждой строке.
  // Toggle отображается только когда чаты есть в обеих ролях — иначе
  // переключатель бесполезен и сбивает с толку.
  const [showAll, setShowAll] = useState(false);

  const { filteredChats, hasChatsInBothRoles } = useMemo(() => {
    const list = chats ?? [];
    const asMaster = list.filter((c) => c.master_id === userId);
    const asClient = list.filter((c) => c.client_id === userId);
    const bothRoles = asMaster.length > 0 && asClient.length > 0;
    if (showAll) return { filteredChats: list, hasChatsInBothRoles: bothRoles };
    const roleFiltered = isMasterRole ? asMaster : asClient;
    return { filteredChats: roleFiltered, hasChatsInBothRoles: bothRoles };
  }, [chats, userId, isMasterRole, showAll]);

  const hasChats = filteredChats.length > 0;

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
        <ScreenHeader title="Чаты" subtitle="Общение с мастерами по вашим задачам." />
      )}

      {isSidebar && (
        <View className="border-hairline border-b px-4 py-4">
          <AppText weight="semibold" className="text-title-sm text-ink">
            Чаты
          </AppText>
        </View>
      )}

      {/* Role-filter toggle. Виден только если у пользователя есть чаты в
          обеих ролях (dual-role с активными диалогами). Левый pill — текущая
          active_role, правый — «Все чаты». В режиме «Все» каждая строка
          получает бейдж роли (см. ChatListRow showRoleBadge). */}
      {hasChatsInBothRoles ? (
        <View className={isSidebar ? "px-3 py-2" : "px-4 pb-2"}>
          <View className="flex-row gap-1 rounded-lg bg-canvas-soft-2 p-1">
            <RoleFilterPill
              icon={isMasterRole ? Briefcase : User}
              label={isMasterRole ? "Как мастер" : "Как клиент"}
              selected={!showAll}
              onPress={() => setShowAll(false)}
            />
            <RoleFilterPill
              label="Все чаты"
              selected={showAll}
              onPress={() => setShowAll(true)}
            />
          </View>
        </View>
      ) : null}

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
        <View className={isSidebar ? "gap-2 p-2" : "mt-2"}>
          {filteredChats.map((c) => (
            <ChatListRow
              key={c.id}
              chat={c}
              userId={userId}
              compact={isSidebar}
              isSelected={isSidebar && selectedChatId === c.id}
              showRoleBadge={showAll && hasChatsInBothRoles}
              onPress={() => router.push(`/(tabs)/chats/${c.id}` as never)}
            />
          ))}
        </View>
      )}

      {!isLoading && !error && !hasChats && (
        <View className={`${isSidebar ? "p-4 pt-12" : "mt-12"}`}>
          <EmptyState
            icon={ChatCircle}
            emoji="💬"
            title="Чатов пока нет"
            hint={
              isMasterRole
                ? "Здесь появятся диалоги, когда клиенты выберут вас по откликам."
                : "Напишите мастеру первым с его страницы — диалог появится здесь."
            }
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
  /** В режиме «Все чаты» (dual-role) показываем бейдж роли возле имени —
   *  чтобы пользователь понимал, в каком контексте идёт разговор. */
  showRoleBadge?: boolean;
}

function ChatListRow({ chat, userId, onPress, compact, isSelected, showRoleBadge }: ChatListRowProps) {
  const partner = chat.client_id === userId ? chat.master : chat.client;
  const partnerName =
    [partner?.first_name, partner?.last_name].filter(Boolean).join(" ") || "Собеседник";
  // В этом чате текущий пользователь — мастер если master_id совпадает.
  const userIsMasterInChat = chat.master_id === userId;
  const lastActivity = chat.last_message_at
    ? new Date(chat.last_message_at).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "short",
      })
    : "Нет сообщений";
  const unread = userId ? isChatUnread(chat, userId) : false;

  // Page-вариант — full-bleed list-row (UI_PATTERNS §3.3 OrderRow): без
  // обводки и rounded, разделитель border-b, padding px-5 py-4.
  // Sidebar-вариант (desktop web) — компактный rounded row для списка слева.
  const baseClasses = compact
    ? "flex-row items-center gap-3 rounded-md p-3 active:opacity-70 hover:bg-surface-2"
    : "flex-row items-center gap-3 border-b border-hairline px-5 py-4 active:bg-canvas-soft hover:bg-canvas-soft";

  let bgClass = "";
  if (!compact) {
    bgClass = unread ? "bg-accent-soft" : "bg-canvas";
  } else if (isSelected) {
    bgClass = "bg-surface-2";
  } else if (unread) {
    bgClass = "bg-accent-soft";
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`${baseClasses} ${bgClass}`}
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
          {showRoleBadge ? (
            <View className="flex-row items-center gap-1 rounded-full bg-canvas-soft-2 px-2 py-0.5">
              {userIsMasterInChat ? (
                <Briefcase size={10} weight="bold" color="currentColor" className="text-mute" />
              ) : (
                <User size={10} weight="bold" color="currentColor" className="text-mute" />
              )}
              <AppText weight="semibold" className="text-caption-xs text-mute">
                {userIsMasterInChat ? "как мастер" : "как клиент"}
              </AppText>
            </View>
          ) : null}
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

// ---------------------------------------------------------------------------
// RoleFilterPill — pill в segmented control над списком. Точная копия паттерна
// TabPill из MasterDashboardOrders (rounded-md, shadow на selected, bg-canvas).
// ---------------------------------------------------------------------------

interface RoleFilterPillProps {
  icon?: typeof Briefcase;
  label: string;
  selected: boolean;
  onPress: () => void;
}

function RoleFilterPill({ icon: Icon, label, selected, onPress }: RoleFilterPillProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      className={`flex-1 h-9 flex-row items-center justify-center gap-1.5 rounded-md px-3 ${
        selected ? "bg-canvas" : "active:opacity-60"
      }`}
      style={
        selected
          ? {
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 3,
              elevation: 2,
            }
          : undefined
      }
    >
      {Icon ? (
        <Icon
          size={14}
          weight="bold"
          color="currentColor"
          className={selected ? "text-ink" : "text-mute"}
        />
      ) : null}
      <AppText
        weight={selected ? "semibold" : "medium"}
        className={`text-body-sm ${selected ? "text-ink" : "text-mute"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
