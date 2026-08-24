/**
 * /(tabs)/master-cases/[id] — публичный листинг всех работ (кейсов) мастера.
 *
 * Sprint 0089 / AUDIT_LAUNCH_FUNCTIONAL_2026-05-19 (расширение):
 * на `/master/[id]` показывается превью 2 кейсов; «Смотреть все» открывает
 * этот экран. Тап по карточке → `/profile/portfolio/[caseId]` (этот route
 * уже сделан в репо для собственника, но он же служит публичным детальным
 * экраном кейса — see existing implementation).
 *
 * Источник данных — `useMasterCases(masterId)` (hook из 0085).
 * Дизайн карточки — тот же `MasterCaseCard` что и в превью на /master/[id],
 * чтобы UX был консистентен. Локальная копия компонента — чтобы не
 * расщеплять общий компонент по разным импортам (Vercel-style: «3 похожие
 * карточки лучше преждевременной абстракции»).
 */

import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Wrench } from "phosphor-react-native";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader, Skeleton } from "@/components/ui";
import { useMasterPublicProfile } from "@/features/master-view/use-master-public";
import { type CaseWithPreview, useMasterCases } from "@/features/profile/use-portfolio-cases";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

export default function MasterCasesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const masterId = typeof params.id === "string" ? params.id : null;
  // safeBack: deep-link → fallback на карточку мастера.
  const goBack = useSafeBack(`/(tabs)/master/${masterId ?? ""}` as never);

  const profile = useMasterPublicProfile(masterId);
  const cases = useMasterCases(masterId);
  const data = cases.data ?? [];

  const fullName =
    [profile.data?.user?.first_name, profile.data?.user?.last_name].filter(Boolean).join(" ") ||
    "Мастер";

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title={fullName ? `Работы — ${fullName}` : "Работы мастера"} onBack={goBack} />

      {cases.isLoading ? (
        <View className="px-5 pt-3 gap-3">
          <Skeleton style={{ height: 240, borderRadius: 12 }} />
          <Skeleton style={{ height: 240, borderRadius: 12 }} />
          <Skeleton style={{ height: 240, borderRadius: 12 }} />
        </View>
      ) : cases.error ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="medium" className="text-body-md text-error text-center">
            Не удалось загрузить. {cases.error.message}
          </AppText>
        </View>
      ) : data.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AppText weight="semibold" className="text-title-lg text-ink text-center">
            Работ пока нет
          </AppText>
          <AppText className="mt-2 text-body-md text-mute text-center">
            После завершённых заказов работы появятся здесь автоматически.
          </AppText>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: insets.bottom + 32,
            gap: 12,
          }}
          renderItem={({ item }) => (
            <CaseCard data={item} onPress={() => router.push(`/(tabs)/case/${item.id}` as never)} />
          )}
        />
      )}
    </View>
  );
}

interface CaseCardProps {
  data: CaseWithPreview;
  onPress: () => void;
}

function CaseCard({ data, onPress }: CaseCardProps) {
  const tc = useThemeColors(["muted-soft"]);
  const cover = data.preview_items[0];
  const remainingPhotos = data.items_count > 1 ? data.items_count - 1 : 0;
  const dateLabel = formatCaseDate(data.work_done_at);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-xl border border-hairline bg-canvas overflow-hidden active:opacity-80"
    >
      {cover ? (
        <View style={{ width: "100%", aspectRatio: 16 / 10, position: "relative" }}>
          <Image
            source={{ uri: cover.url }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
          />
          {remainingPhotos > 0 ? (
            <View className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5">
              <AppText weight="mono" className="text-mono-caption text-white">
                +{remainingPhotos}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={{ width: "100%", aspectRatio: 16 / 10 }}
          className="items-center justify-center bg-canvas-soft-2"
        >
          <Wrench size={28} weight="bold" color={tc["muted-soft"]} />
        </View>
      )}
      <View className="p-4">
        <AppText weight="semibold" className="text-body-md text-ink" numberOfLines={2}>
          {data.title}
        </AppText>
        {data.description ? (
          <AppText className="mt-1.5 text-body-sm text-body" numberOfLines={3}>
            {data.description}
          </AppText>
        ) : null}
        {dateLabel ? (
          <AppText
            weight="mono"
            className="mt-2 text-mono-caption text-mute uppercase tracking-widest"
          >
            {dateLabel}
          </AppText>
        ) : null}
      </View>
    </Pressable>
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
