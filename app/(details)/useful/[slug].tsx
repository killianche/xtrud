/**
 * Чтение одной статьи (Sprint I.9).
 *
 * MVP-рендеринг markdown: разбиваем по \n\n, обрабатываем заголовки # ##
 * и списки 1. / -. Полноценный markdown — отдельная задача (react-native-markdown-display).
 */

import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { CaretLeft } from "phosphor-react-native";
import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useArticleBySlug } from "@/features/articles/use-articles";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColor } from "@/lib/use-theme-color";

interface MdBlock {
  type: "h1" | "h2" | "p" | "li";
  text: string;
  key: string;
}

function parseSimpleMarkdown(body: string): MdBlock[] {
  const lines = body.split(/\n/);
  const blocks: MdBlock[] = [];
  let buffer: string[] = [];
  let idx = 0;

  const flushParagraph = () => {
    if (buffer.length > 0) {
      blocks.push({ type: "p", text: buffer.join(" "), key: `p:${idx++}` });
      buffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flushParagraph();
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      blocks.push({ type: "h2", text: trimmed.slice(3), key: `h2:${idx++}` });
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushParagraph();
      blocks.push({ type: "h1", text: trimmed.slice(2), key: `h1:${idx++}` });
      continue;
    }
    if (/^(\d+\.|-)\s+/.test(trimmed)) {
      flushParagraph();
      blocks.push({
        type: "li",
        text: trimmed.replace(/^(\d+\.|-)\s+/, ""),
        key: `li:${idx++}`,
      });
      continue;
    }
    buffer.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

export default function ArticleScreen() {
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const slugStr = typeof slug === "string" ? slug : undefined;
  const { data: article, isLoading, error } = useArticleBySlug(slugStr);
  const tcInk = useThemeColor("ink");
  const goBack = useSafeBack("/useful" as const);

  const blocks = useMemo(() => (article ? parseSimpleMarkdown(article.body_md) : []), [article]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={12}
          className="h-12 w-12 items-center justify-center rounded-full active:opacity-70"
        >
          <CaretLeft size={28} weight="bold" color={tcInk} />
        </Pressable>
      </View>

      {isLoading && (
        <View className="mt-8 items-center">
          <ActivityIndicator />
        </View>
      )}

      {error && (
        <View className="mt-8 px-6">
          <AppText weight="medium" className="text-caption text-error">
            {error.message}
          </AppText>
        </View>
      )}

      {!isLoading && article && (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {article.cover_url && (
            <Image
              source={{ uri: article.cover_url }}
              style={{ width: "100%", aspectRatio: 16 / 9 }}
              contentFit="cover"
              transition={200}
            />
          )}

          <View className="px-6 pt-6">
            <AppText weight="bold" className="text-display-sm tracking-tight text-ink">
              {article.title}
            </AppText>
            {article.published_at && (
              <AppText className="mt-2 text-caption text-muted-soft">
                {new Date(article.published_at).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </AppText>
            )}
          </View>

          <View className="mt-6 gap-4 px-6">
            {blocks.map((b) => {
              if (b.type === "h1") {
                return (
                  <AppText key={b.key} weight="bold" className="text-display-sm text-ink">
                    {b.text}
                  </AppText>
                );
              }
              if (b.type === "h2") {
                return (
                  <AppText key={b.key} weight="semibold" className="mt-2 text-title-md text-ink">
                    {b.text}
                  </AppText>
                );
              }
              if (b.type === "li") {
                return (
                  <View key={b.key} className="flex-row gap-2">
                    <AppText className="text-body-md text-ink">•</AppText>
                    <AppText className="flex-1 text-body-md text-body">{b.text}</AppText>
                  </View>
                );
              }
              return (
                <AppText key={b.key} className="text-body-md leading-6 text-body">
                  {b.text}
                </AppText>
              );
            })}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
