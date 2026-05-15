/**
 * HelpCallout — горизонтальная информационная плашка с pink-coral логотипом
 * слева и копи + ссылкой-CTA справа.
 *
 * Используется на главной (под списком категорий) для сценария «не нашли
 * нужного мастера? — мы поищем по республике вручную». Помогает удержать
 * клиента когда match не сработал.
 *
 * Стиль — Vercel-card (canvas-soft + rounded-xl + hairline) с одним цветным
 * акцентом (gradient-badge с logo). Текст 2 строки: bold-вопрос + link-ответ.
 */

import { LinearGradient } from "expo-linear-gradient";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { XtrudLogo } from "@/components/XtrudLogo";

interface HelpCalloutProps {
  title: string;
  body: string;
  onPress?: () => void;
}

export function HelpCallout({ title, body, onPress }: HelpCalloutProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      className="rounded-xl border border-hairline bg-canvas-soft p-3 active:opacity-80"
    >
      <View className="flex-row items-center gap-3">
        {/* Pink-coral gradient badge с белым логотипом */}
        <View className="rounded-full overflow-hidden" style={{ width: 56, height: 56 }}>
          <LinearGradient
            colors={["#ff6b8a", "#ee0048"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 56,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {/* holeColor = средний оттенок градиента, чтобы дыра «исчезла» в фон */}
            <XtrudLogo size={32} color="#ffffff" holeColor="#f6376a" />
          </LinearGradient>
        </View>
        <View className="flex-1">
          <AppText weight="semibold" className="text-body-md text-ink">
            {title}
          </AppText>
          <AppText className="mt-1 text-body-sm text-link" numberOfLines={3}>
            {body}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
