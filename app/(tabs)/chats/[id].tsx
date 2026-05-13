import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, MessageSquare, Send } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { EmptyState } from "@/components/EmptyState";
import { OrderStatusBadge, type OrderStatusValue } from "@/components/OrderStatusBadge";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { maskContactsInText } from "@/features/chat/mask-contacts";
import { QuickReplyChips } from "@/features/chat/QuickReplyChips";
import { ReportModal } from "@/features/reports/ReportModal";
import {
  type ChatMessage,
  useChatMessages,
  useRealtimeChatMessages,
} from "@/features/chat/use-chat-messages";
import { useMarkChatRead } from "@/features/chat/use-mark-chat-read";
import { useMyChats } from "@/features/chat/use-my-chats";
import { useSendMessage } from "@/features/chat/use-send-message";
import { useThemeColors } from "@/lib/use-theme-color";

export default function ChatThreadScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuthSession();
  const userId = session?.user?.id;

  // Получаем чат-meta из my-chats кэша (без отдельного запроса)
  const { data: myChats } = useMyChats(userId);
  const chat = myChats?.find((c) => c.id === id);

  const { data: messages, isLoading, error } = useChatMessages(id);
  useRealtimeChatMessages(id);
  const sendMessage = useSendMessage();
  const markRead = useMarkChatRead(userId);
  const markReadMutate = markRead.mutate;
  const tc = useThemeColors(["ink", "muted-soft", "on-primary"]);

  // Помечаем чат прочитанным при открытии thread и при появлении новых сообщений.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages?.length — намеренный trigger.
  useEffect(() => {
    if (!id || !userId) return;
    markReadMutate(id);
  }, [id, userId, messages?.length, markReadMutate]);

  const [text, setText] = useState("");
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Автоскролл вниз при появлении новых сообщений
  useEffect(() => {
    if (messages && messages.length > 0) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [messages]);

  const partner = chat?.client_id === userId ? chat?.master : chat?.client;
  const partnerName =
    [partner?.first_name, partner?.last_name].filter(Boolean).join(" ") || "Собеседник";
  // Если userId === client → partner = master → /master/[id].
  // Иначе userId === master → partner = client → /client/[id] (Sprint 9.2).
  const partnerIsMaster = !!chat && chat.client_id === userId;
  const partnerHref =
    chat && (partnerIsMaster ? `/master/${chat.master_id}` : `/client/${chat.client_id}`);

  const canSend = text.trim().length > 0 && !sendMessage.isPending && !!userId && !!id;

  const onSend = async () => {
    if (!canSend || !id || !userId) return;
    const messageText = text.trim();
    setText("");
    try {
      await sendMessage.mutateAsync({
        chatId: id,
        senderId: userId,
        text: messageText,
      });
    } catch (_e) {
      // ошибка отрендерится через sendMessage.error; вернём текст обратно
      setText(messageText);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Header */}
      <View className="flex-row items-center gap-2 border-hairline-soft border-b px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => router.back()}
          hitSlop={12}
          className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={tc.ink} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!partnerHref}
          onPress={() => {
            if (partnerHref) router.push(partnerHref as never);
          }}
          className="flex-1 active:opacity-70"
        >
          <AppText
            weight="semibold"
            className={`text-body-md ${partnerHref ? "text-accent" : "text-ink"}`}
            numberOfLines={1}
          >
            {partnerName}
          </AppText>
          <View className="mt-0.5 flex-row items-center gap-2">
            {chat?.order?.status && (
              <OrderStatusBadge status={chat.order.status as OrderStatusValue} />
            )}
            {chat?.order?.title && (
              <AppText className="flex-1 text-caption text-muted" numberOfLines={1}>
                {chat.order.title}
              </AppText>
            )}
          </View>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {isLoading && (
          <View className="mt-8 items-center">
            <ActivityIndicator />
          </View>
        )}

        {error && (
          <AppText weight="medium" className="text-caption text-error">
            Не удалось загрузить чат. {error.message}
          </AppText>
        )}

        {!isLoading && !error && messages?.length === 0 && (
          <View className="mt-8">
            <EmptyState
              icon={MessageSquare}
              title="Начните диалог"
              hint="Поздоровайтесь и уточните детали — подсказки внизу помогут."
            />
          </View>
        )}

        {messages &&
          renderMessagesWithSeparators(messages, userId, partner, setReportMessageId)}

        {sendMessage.error && (
          <AppText weight="medium" className="mt-2 text-caption text-error">
            Не удалось отправить. {sendMessage.error.message}
          </AppText>
        )}
      </ScrollView>

      {/* Quick reply chips. role: я client → отвечаю в роли client; я master → master. */}
      <QuickReplyChips
        role={chat?.client_id === userId ? "client" : "master"}
        onSelect={(template) => setText((prev) => (prev ? `${prev} ${template}` : template))}
        className="border-hairline-soft border-t py-2"
      />

      {/* Input */}
      <View
        className="flex-row items-end gap-2 border-hairline-soft border-t px-3 py-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Сообщение"
          placeholderTextColor={tc["muted-soft"]}
          multiline
          maxLength={4000}
          maxFontSizeMultiplier={1.3}
          className="max-h-32 min-h-12 flex-1 rounded-2xl border border-hairline bg-surface-2 px-4 py-3 text-body-md text-ink"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Отправить"
          disabled={!canSend}
          onPress={onSend}
          className={`h-12 w-12 items-center justify-center rounded-full ${
            canSend ? "bg-primary active:opacity-80" : "bg-surface-3"
          }`}
        >
          <Send size={20} strokeWidth={2} color={canSend ? tc["on-primary"] : tc["muted-soft"]} />
        </Pressable>
      </View>

      {reportMessageId && (
        <ReportModal
          visible={!!reportMessageId}
          targetType="message"
          targetId={reportMessageId}
          onClose={() => setReportMessageId(null)}
        />
      )}
    </KeyboardAvoidingView>
  );
}

type ChatPartner =
  | {
      id: string;
      first_name: string | null;
      last_name: string | null;
      avatar_url: string | null;
    }
  | null
  | undefined;

function MessageBubble({
  message,
  isMine,
  partner,
  onLongPress,
}: {
  message: ChatMessage;
  isMine: boolean;
  partner: ChatPartner;
  onLongPress?: (messageId: string) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const partnerName = partner
    ? [partner.first_name, partner.last_name].filter(Boolean).join(" ") || "Собеседник"
    : "Собеседник";

  const displayText = maskContactsInText(message.text);
  const handleLongPress = () => {
    if (!isMine && onLongPress) onLongPress(message.id);
  };

  if (isMine) {
    return (
      <View className="max-w-[80%] self-end">
        <View className="rounded-2xl bg-primary px-4 py-2">
          <AppText className="text-body-md text-on-primary">{displayText}</AppText>
        </View>
        <AppText className="mt-1 text-right text-caption-xs text-muted-soft">{time}</AppText>
      </View>
    );
  }

  // Чужие — с аватаром слева. Long-press → report (если callback задан).
  return (
    <View className="max-w-[85%] flex-row items-end gap-2 self-start">
      <Avatar
        url={partner?.avatar_url ?? null}
        name={partnerName}
        seed={partner?.id ?? null}
        size="sm"
      />
      <View className="flex-shrink">
        <Pressable
          onLongPress={handleLongPress}
          accessibilityHint="Долгое нажатие — пожаловаться на сообщение"
          delayLongPress={400}
        >
          <View className="rounded-2xl bg-surface-2 px-4 py-2">
            <AppText className="text-body-md text-ink">{displayText}</AppText>
          </View>
        </Pressable>
        <AppText className="mt-1 text-caption-xs text-muted-soft">{time}</AppText>
      </View>
    </View>
  );
}

// Рендерит сообщения с date-separators между группами по дням.
function renderMessagesWithSeparators(
  messages: ChatMessage[],
  userId: string | undefined,
  partner: ChatPartner,
  onLongPress: (messageId: string) => void,
): React.ReactNode[] {
  let lastDateKey: string | null = null;
  const items: React.ReactNode[] = [];
  for (const m of messages) {
    const d = new Date(m.created_at);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateKey !== lastDateKey) {
      items.push(<DateSeparator key={`d:${dateKey}:${m.id}`} date={d} />);
      lastDateKey = dateKey;
    }
    items.push(
      <MessageBubble
        key={m.id}
        message={m}
        isMine={m.sender_id === userId}
        partner={partner}
        onLongPress={onLongPress}
      />,
    );
  }
  return items;
}

function DateSeparator({ date }: { date: Date }) {
  const label = formatDateLabel(date);
  return (
    <View className="my-3 flex-row items-center gap-3 self-center">
      <View className="h-px w-12 bg-hairline" />
      <AppText weight="medium" className="text-caption-xs text-muted-soft">
        {label}
      </AppText>
      <View className="h-px w-12 bg-hairline" />
    </View>
  );
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Сегодня";
  if (isSameDay(date, yesterday)) return "Вчера";
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  }
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
