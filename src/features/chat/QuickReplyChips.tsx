// QuickReplyChips — горизонтальная лента быстрых ответов над клавиатурой.
//
// Самый высокий ROI в marketplace-чате (Airbnb, Thumbtack паттерн). Мастер
// на выезде печатает одно и то же 10 раз в день — сократить до тапа.
//
// При тапе текст подставляется в input (НЕ отправляется сразу) — пользователь
// может отредактировать перед send.
//
// Templates статичные по ролям (master vs client). В будущем — user-defined
// templates через master_profiles.chat_templates jsonb.

import { FlatList, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";

const MASTER_TEMPLATES = [
  "Когда удобно подъехать?",
  "Сколько это стоит примерно?",
  "Подъеду через час",
  "Готов взяться, договорились",
  "Уточните детали, пожалуйста",
  "К сожалению, не возьмусь",
];

const CLIENT_TEMPLATES = [
  "Когда сможете приехать?",
  "Сколько будет стоить?",
  "Хорошо, договорились",
  "Спасибо!",
  "Можно подробнее?",
];

export interface QuickReplyChipsProps {
  /** Какой набор шаблонов показать — зависит от роли текущего пользователя в чате. */
  role: "master" | "client";
  /** Колбэк при тапе — текст шаблона. Owner обычно вызывает setText(template). */
  onSelect: (template: string) => void;
  /** Дополнительный отступ снизу — обычно `mb-2`. */
  className?: string;
}

export function QuickReplyChips({ role, onSelect, className }: QuickReplyChipsProps) {
  const templates = role === "master" ? MASTER_TEMPLATES : CLIENT_TEMPLATES;
  return (
    <View className={className} accessibilityRole="toolbar" accessibilityLabel="Быстрые ответы">
      <FlatList
        data={templates}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(t) => t}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Шаблон: ${item}`}
            onPress={() => onSelect(item)}
            className="h-9 items-center justify-center rounded-pill border border-hairline bg-canvas px-3 active:opacity-70"
          >
            <AppText weight="medium" className="text-caption text-body">
              {item}
            </AppText>
          </Pressable>
        )}
      />
    </View>
  );
}
