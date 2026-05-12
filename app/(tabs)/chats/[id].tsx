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
import { useMyChats } from "@/features/chat/use-my-chats";
import { useSendMessage } from "@/features/chat/use-send-message";

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
          <ChevronLeft size={24} strokeWidth={1.75} color="#0a0a0a" />
        </Pressable>
        <View className="flex-1">
          <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={1}>
            {partnerName}
          </AppText>
          {chat?.order?.title && (
            <AppText className="text-caption text-muted" numberOfLines={1}>
              {chat.order.title}
            </AppText>
          )}
        </View>
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
          placeholderTextColor="#71717a"
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
          <Send size={20} strokeWidth={2} color={canSend ? "#ffffff" : "#71717a"} />
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
