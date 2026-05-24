/**
 * /(tabs)/case/[caseId] — публичный просмотр кейса портфолио.
 *
 * Это **публичный** read-only экран — для клиентов, других мастеров, анонов.
 * Open from:
 *   - /master/[id] → tap карточки в секции «Работы мастера»
 *   - /master-cases/[id] → tap карточки в листинге
 *
 * Для **owner** (мастер сам себе) есть отдельный экран
 * /(tabs)/profile/portfolio/[caseId] с edit-actions (Pencil/Trash menu,
 * sticky «+ Добавить фото»). Здесь — только просмотр.
 *
 * Контент:
 *   - Header: «Кейс» + название мастера в subtitle
 *   - Hero-carousel со всеми фото (4:5 портретный, dot-индикаторы)
 *   - Title
 *   - Дата выполнения (mono caption)
 *   - Description
 *   - Bottom CTA «Открыть профиль мастера» (ghost-button)
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";
import { cdnImage } from "@/lib/image-cdn";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useMasterPublicProfile } from "@/features/master-view/use-master-public";
import { useCaseDetail } from "@/features/profile/use-portfolio-cases";
import { useSafeBack } from "@/lib/use-safe-back";

const HERO_RATIO = 4 / 5;

export default function PublicCaseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ caseId: string }>();
  const caseId = typeof params.caseId === "string" ? params.caseId : null;
  const viewportWidth = useAppWidth();
  const heroWidth = Math.min(viewportWidth, 768);
  const heroHeight = heroWidth / HERO_RATIO;

  const detail = useCaseDetail(caseId);
  const data = detail.data;
  const masterId = data?.master_id ?? null;
  const profile = useMasterPublicProfile(masterId);

  const goBack = useSafeBack(`/(tabs)/master/${masterId ?? ""}` as never);
  const [photoIndex, setPhotoIndex] = useState(0);

  const fullName =
    [profile.data?.user?.first_name, profile.data?.user?.last_name]
      .filter(Boolean)
      .join(" ") || "Мастер";
  const dateLabel = formatCaseDate(data?.work_done_at);

  if (detail.isLoading) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Кейс" onBack={goBack} />
        <View className="px-5 pt-3 gap-3">
          <Skeleton style={{ width: "100%", height: heroHeight, borderRadius: 12 }} />
          <Skeleton style={{ width: "60%", height: 24, borderRadius: 6 }} />
          <Skeleton style={{ width: "100%", height: 16, borderRadius: 4 }} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Кейс" onBack={goBack} />
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="semibold" className="text-title-lg text-ink text-center">
            Кейс не найден
          </AppText>
          <AppText className="mt-2 text-body-md text-mute text-center">
            Возможно, мастер удалил эту работу из портфолио.
          </AppText>
        </View>
      </View>
    );
  }

  const items = data.items;
  const hasPhotos = items.length > 0;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title={fullName ? `Кейс — ${fullName}` : "Кейс"} onBack={goBack} />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {hasPhotos ? (
          <View style={{ width: heroWidth, height: heroHeight, position: "relative" }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
                setPhotoIndex(idx);
              }}
            >
              {items.map((it) => (
                <Image
                  key={it.id}
                  source={{ uri: cdnImage(it.url, { width: Math.round(heroWidth), quality: 76 }) }}
                  style={{ width: heroWidth, height: heroHeight }}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
            {items.length > 1 ? (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  bottom: 16,
                  left: 0,
                  right: 0,
                  flexDirection: "row",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                {items.map((it, i) => (
                  <View
                    key={it.id}
                    style={{
                      width: i === photoIndex ? 24 : 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor:
                        i === photoIndex ? "#ffffff" : "rgba(255,255,255,0.5)",
                    }}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View
            style={{ width: "100%", height: heroHeight / 2 }}
            className="items-center justify-center bg-canvas-soft-2"
          >
            <AppText className="text-body-sm text-mute">Фотографий пока нет</AppText>
          </View>
        )}

        <View className="px-5 mt-6">
          <AppText weight="bold" className="text-display-sm text-ink">
            {data.title}
          </AppText>
          {dateLabel ? (
            <AppText
              weight="mono"
              className="mt-2 text-mono-caption text-mute uppercase tracking-widest"
            >
              {dateLabel}
            </AppText>
          ) : null}
          {data.description ? (
            <AppText className="mt-4 text-body-md text-body leading-6">
              {data.description}
            </AppText>
          ) : null}

          {masterId ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/(tabs)/master/${masterId}` as never)}
              className="mt-8 h-12 items-center justify-center rounded-md border border-hairline active:opacity-70"
            >
              <AppText weight="semibold" className="text-button text-ink">
                Открыть профиль мастера
              </AppText>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const CASE_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

function formatCaseDate(workDoneAt: string | null | undefined): string | null {
  if (!workDoneAt) return null;
  const parts = workDoneAt.split("-");
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!year || !month || month < 1 || month > 12) return null;
  return `${CASE_MONTHS[month - 1]} ${year}`;
}
