import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Info } from "lucide-react-native";
import { ImageSquare, ChatCenteredText, PaperPlaneTilt, X } from "phosphor-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
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
import { useSafeBack } from "@/lib/use-safe-back";
import { useTabBarVisibility } from "@/lib/tabbar-visibility";
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
  const goBack = useSafeBack("/(tabs)/chats" as const);
  const markReadMutate = markRead.mutate;
  const tc = useThemeColors(["ink", "muted-soft", "on-primary"]);

  // Скрываем нижний TabBar внутри треда — full-screen chat-experience, как
  // WhatsApp/Telegram. При возврате назад на /chats bar снова появится.
  // Тот же паттерн, что в orders/new (Zustand-флаг, т.к. custom TabBar не
  // читает navigation.setOptions({tabBarStyle})).
  const setTabBarHidden = useTabBarVisibility((s) => s.setHidden);
  useFocusEffect(
    useCallback(() => {
      setTabBarHidden(true);
      return () => setTabBarHidden(false);
    }, [setTabBarHidden]),
  );

  // Помечаем чат прочитанным при открытии thread и при появлении новых сообщений.
  // biome-ignore lint/correctness/useExhaustiveDependencies: messages?.length — намеренный trigger.
  useEffect(() => {
    if (!id || !userId) return;
    markReadMutate(id);
  }, [id, userId, messages?.length, markReadMutate]);

  const [text, setText] = useState("");
  // P0-6: локальный URI выбранной картинки до отправки. Picker запускается
  // при тапе на Image, после выбора — preview над input + send отправит
  // в Storage через useSendMessage.
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  // Lightbox: тап на изображение-сообщение → fullscreen Modal с image.
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const onPickImage = async () => {
    try {
      // На web разрешения не нужны; на native — auto-prompt.
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
        exif: false,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch {
      // ignore — пользователь мог отменить или картинка большая
    }
  };

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

  const canSend =
    (text.trim().length > 0 || !!pendingImageUri) &&
    !sendMessage.isPending &&
    !!userId &&
    !!id;

  const onSend = async () => {
    if (!canSend || !id || !userId) return;
    const messageText = text.trim();
    const imageUri = pendingImageUri;
    setText("");
    setPendingImageUri(null);
    try {
      await sendMessage.mutateAsync({
        chatId: id,
        senderId: userId,
        text: messageText,
        imageUri,
      });
    } catch (_e) {
      // ошибка отрендерится через sendMessage.error; вернём текст и картинку обратно
      setText(messageText);
      setPendingImageUri(imageUri);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      className="flex-1 bg-canvas"
      style={{ paddingTop: insets.top }}
    >
      {/* Header — ScreenHeader-стандарт: height 64, h-12 w-12 back с lucide
          ChevronLeft 28px strokeWidth 2.25, gap-2 (8), px-3. Middle slot:
          tap по имени/аватару → профиль собеседника. Right: info-кнопка
          (h-10 w-10) → деталь заказа.
          (Раньше был самописный py-3 / h-10 back с phosphor CaretLeft fill
          weight=bold — выбивалось из стандарта, фидбэк user 2026-05-15.) */}
      <View
        className="flex-row items-center gap-2 border-hairline-soft border-b px-3"
        style={{ height: 64 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={8}
          className="h-12 w-12 items-center justify-center rounded-full active:bg-canvas-soft"
        >
          <ChevronLeft size={28} strokeWidth={2.25} color={tc.ink} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={partner ? `Открыть профиль ${partnerName}` : partnerName}
          disabled={!partnerHref}
          onPress={() => {
            if (partnerHref) router.push(partnerHref as never);
          }}
          className="flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <Avatar
            url={partner?.avatar_url ?? null}
            name={partnerName}
            seed={partner?.id ?? null}
            size="sm"
          />
          {/* Только имя собеседника. Статус заказа + заголовок переехали в
              floating-чип ниже. Avatar sm (32px) + title-md (~18px) — имя
              крупнее аватара (фидбэк user 2026-05-16). */}
          <View className="flex-1 min-w-0">
            <AppText
              weight="semibold"
              className="text-title-lg text-ink"
              numberOfLines={1}
            >
              {partnerName}
            </AppText>
          </View>
        </Pressable>

        {chat?.order_id ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть заказ"
            onPress={() => router.push(`/(tabs)/orders/${chat.order_id}` as never)}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            <Info size={20} strokeWidth={2} color={tc["muted-soft"]} />
          </Pressable>
        ) : null}
      </View>

      {/* Floating order chip — плавающий «остров» с контекстом заказа над
          лентой сообщений. Tap → деталь заказа. Why: разгружает header
          (фидбэк user 2026-05-15), но не теряет связь чата с заказом. */}
      {chat?.order_id && (chat.order?.status || chat.order?.title) ? (
        <View className="items-center pt-3 pb-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть заказ"
            onPress={() => router.push(`/(tabs)/orders/${chat.order_id}` as never)}
            className="flex-row items-center gap-2 rounded-pill border border-hairline bg-canvas px-3 py-1.5 active:opacity-70"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 2,
              maxWidth: "92%",
            }}
          >
            {chat.order?.status ? (
              <OrderStatusBadge status={chat.order.status as OrderStatusValue} />
            ) : null}
            {chat.order?.title ? (
              <AppText
                className="text-caption text-mute"
                numberOfLines={1}
                style={{ flexShrink: 1 }}
              >
                {chat.order.title}
              </AppText>
            ) : null}
          </Pressable>
        </View>
      ) : null}

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
              icon={ChatCenteredText}
              title="Начните диалог"
              hint="Поздоровайтесь и уточните детали — подсказки внизу помогут."
            />
          </View>
        )}

        {messages &&
          renderMessagesWithSeparators(
            messages,
            userId,
            partner,
            setReportMessageId,
            setPreviewImageUrl,
          )}

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

      {/* P0-6: preview прикреплённой картинки до отправки */}
      {pendingImageUri ? (
        <View className="border-hairline-soft border-t px-3 py-2">
          <View className="self-start">
            <Image
              source={{ uri: pendingImageUri }}
              style={{ width: 96, height: 96, borderRadius: 12 }}
              resizeMode="cover"
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Убрать фото"
              onPress={() => setPendingImageUri(null)}
              hitSlop={6}
              style={{ position: "absolute", top: -8, right: -8 }}
              className="h-7 w-7 items-center justify-center rounded-full bg-ink active:opacity-80"
            >
              <X size={14} weight="bold" color={tc["on-primary"]} />
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Input */}
      <View
        className="flex-row items-end gap-2 border-hairline-soft border-t px-3 py-2"
        style={{ paddingBottom: insets.bottom + 8 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Прикрепить фото"
          onPress={onPickImage}
          disabled={sendMessage.isPending}
          hitSlop={6}
          className="h-12 w-12 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
        >
          <ImageSquare size={20} weight="bold" color={tc.ink} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={pendingImageUri ? "Подпись (опц.)" : "Сообщение"}
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
          <PaperPlaneTilt size={20} weight="bold" color={canSend ? tc["on-primary"] : tc["muted-soft"]} />
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

      {/* Lightbox: тап на фото-сообщение открывает fullscreen Modal.
          Tap куда угодно по экрану — закрывает. */}
      <ImageLightbox
        url={previewImageUrl}
        onClose={() => setPreviewImageUrl(null)}
      />
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
  onImagePress,
}: {
  message: ChatMessage;
  isMine: boolean;
  partner: ChatPartner;
  onLongPress?: (messageId: string) => void;
  /** Тап на image-сообщение → lightbox. */
  onImagePress?: (url: string) => void;
}) {
  const time = new Date(message.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const partnerName = partner
    ? [partner.first_name, partner.last_name].filter(Boolean).join(" ") || "Собеседник"
    : "Собеседник";

  // P0-6: text может быть null если только фото. maskContacts падает на null —
  // вызываем только если есть текст.
  const displayText = message.text ? maskContactsInText(message.text) : null;
  const imageUrl = message.image_url ?? null;
  const handleLongPress = () => {
    if (!isMine && onLongPress) onLongPress(message.id);
  };

  if (isMine) {
    return (
      <View className="max-w-[80%] self-end">
        {imageUrl ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Открыть фото"
            onPress={() => onImagePress?.(imageUrl)}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          >
            <Image
              source={{ uri: imageUrl }}
              style={{ width: 220, height: 220, borderRadius: 16, marginBottom: displayText ? 4 : 0 }}
              resizeMode="cover"
            />
          </Pressable>
        ) : null}
        {displayText ? (
          // Outgoing bubble: bg-accent-soft (Telegram-style tinted blue).
          // bg-primary раньше делал bubble белым в dark theme — слишком яркий
          // для длинных сообщений (фидбек user 2026-05-16). accent-soft
          // адаптивен: light = #d3e5ff (пастельно-голубой), dark = #1a3a5c
          // (deep dark-blue). text-ink тоже адаптивен (ink/white) — контраст
          // сохраняется в обеих темах.
          <View className="rounded-2xl bg-accent-soft px-4 py-2">
            <AppText className="text-body-md text-ink">{displayText}</AppText>
          </View>
        ) : null}
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
          onPress={() => {
            if (imageUrl) onImagePress?.(imageUrl);
          }}
          accessibilityHint="Долгое нажатие — пожаловаться на сообщение"
          delayLongPress={400}
        >
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: 220, height: 220, borderRadius: 16, marginBottom: displayText ? 4 : 0 }}
              resizeMode="cover"
            />
          ) : null}
          {displayText ? (
            <View className="rounded-2xl bg-surface-2 px-4 py-2">
              <AppText className="text-body-md text-ink">{displayText}</AppText>
            </View>
          ) : null}
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
  onImagePress: (url: string) => void,
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
        onImagePress={onImagePress}
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

/**
 * ImageLightbox — fullscreen-preview одной картинки. Tap by-area закрывает.
 * Простая реализация без zoom/pan (этого достаточно для chat-фото).
 */
function ImageLightbox({ url, onClose }: { url: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const visible = !!url;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть фото"
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.95)",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {url ? (
          <Image
            source={{ uri: url }}
            style={{ width, height: height - insets.top - insets.bottom }}
            resizeMode="contain"
          />
        ) : null}
      </Pressable>
    </Modal>
  );
}
