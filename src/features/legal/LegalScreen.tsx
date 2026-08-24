/**
 * LegalScreen — общая обёртка для /legal/privacy и /legal/terms.
 *
 * Apple Review 5.1.1 и Google Play требуют:
 *   - реальный текст PP/ToS (не stub «coming soon»);
 *   - доступ к ссылке БЕЗ авторизации (Apple/Google reviewer не логинится);
 *   - дата вступления в силу;
 *   - контакт для запросов по данным.
 *
 * Контент — template, разделённый на секции. Финальную редакцию делает юрист
 * перед публичной submission в App Store / Google Play.
 *
 * Стилизация — нативный typography из DESIGN.md (Inter + Geist Mono caption),
 * без WebView и без markdown-парсера (Apple не любит heavy webview shells).
 */

import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { useSafeBack } from "@/lib/use-safe-back";

export interface LegalSection {
  /** Короткий заголовок секции (H2). */
  title: string;
  /** Параграфы (каждый — один блок text-body). */
  paragraphs: string[];
}

export interface LegalScreenProps {
  /** Title в header'е и H1 на экране. */
  title: string;
  /** Дата вступления в силу — текстом, в формате «19 мая 2026 г.». */
  effectiveAt: string;
  /** Короткое intro перед секциями (1-2 предложения). */
  intro: string;
  /** Секции документа. */
  sections: LegalSection[];
  /** Email/контакт для DPO в конце. */
  contactLine?: string;
}

export function LegalScreen({
  title,
  effectiveAt,
  intro,
  sections,
  contactLine,
}: LegalScreenProps) {
  const insets = useSafeAreaInsets();
  // back на /(tabs)/profile — у нас sole entry-point (settings + auth/phone link).
  const goBack = useSafeBack("/(tabs)/profile" as const);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title={title} onBack={goBack} />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 32,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
      >
        <AppText weight="mono" className="text-mono-caption text-mute uppercase tracking-widest">
          Действует с {effectiveAt}
        </AppText>
        <AppText weight="semibold" className="mt-2 text-title-xl text-ink">
          {title}
        </AppText>
        <AppText className="mt-3 text-body-md text-body">{intro}</AppText>

        {sections.map((s, i) => (
          <View key={s.title} className="mt-8">
            <AppText
              weight="mono"
              className="text-mono-caption text-mute uppercase tracking-widest"
            >
              {String(i + 1).padStart(2, "0")}
            </AppText>
            <AppText weight="semibold" className="mt-1 text-title-lg text-ink">
              {s.title}
            </AppText>
            {s.paragraphs.map((p) => (
              <AppText key={`${s.title}:${p}`} className="mt-3 text-body-md text-body">
                {p}
              </AppText>
            ))}
          </View>
        ))}

        {contactLine ? (
          <View className="mt-10 rounded-lg border border-hairline bg-canvas-soft p-4">
            <AppText weight="semibold" className="text-body-md text-ink">
              Контакт
            </AppText>
            <AppText className="mt-2 text-body-sm text-body">{contactLine}</AppText>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
