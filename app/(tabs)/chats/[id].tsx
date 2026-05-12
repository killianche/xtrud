import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Send } from "lucide-react-native";
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
import { useAuthSession } from "@/features/auth/use-auth-session";
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
          {chat?.order?.title && (
            <AppText className="text-caption text-muted" numberOfLines={1}>
              {chat.order.title}
            </AppText>
          )}
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
          <View className="mt-8 items-center">
            <AppText className="text-center text-body-sm text-muted">
              Напишите первое сообщение — поздоровайтесь, уточните детали.
            </AppText>
          </View>
        )}

        {messages?.map((m) => (
          <MessageBubble key={m.id} message={m} isMine={m.sender_id === userId} />
        ))}

        {sendMessage.error && (
          <AppText weight="medium" className="mt-2 text-caption text-error">
            Не удалось отправить. {sendMessage.error.message}
          </AppText>
        )}
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message, isMine }: { message: ChatMessage; isMine: boolean }) {
  const time = new Date(message.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View className={`max-w-[80%] ${isMine ? "self-end" : "self-start"}`}>
      <View className={`rounded-2xl px-4 py-2 ${isMine ? "bg-primary" : "bg-surface-2"}`}>
        <AppText className={`text-body-md ${isMine ? "text-on-primary" : "text-ink"}`}>
          {message.text}
        </AppText>
      </View>
      <AppText className={`mt-1 text-caption-xs text-muted-soft ${isMine ? "text-right" : ""}`}>
        {time}
      </AppText>
    </View>
  );
}
