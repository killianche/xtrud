/**
 * SpecialistsCarousel — новый блок «Специалисты» на главной v2
 * (docs/HOME_V2_2026-10.md §4.1/§4.3/§4.4/§5.5/§5.6).
 *
 * Горизонтальная карусель компактных карточек (160 pt) между «Ваши задания»
 * и «Актуальные задания» — смена материала после двух одинаковых
 * вертикальных списков (диагноз §1.1) и первая точка на главной, где виден
 * хоть один специалист (диагноз §1.2). Не переиспользует вертикальный
 * `MasterCard` (`SpecialistsListScreen.tsx`) — тот рассчитан на full-width
 * список, а не горизонтальный скролл (§3 документа).
 *
 * `MasterCard` составляет `accessibilityLabel` неэкспортированной функцией —
 * переиспользовать её без правки чужого файла (вне зоны владения этой
 * задачи) нельзя; здесь написана локальная функция с тем же составом строки
 * (имя, verified/company, опыт, категории) — см. `specialistAccessibilityLabel`.
 *
 * Анимации — только `transform`/`opacity` на UI-потоке (Reanimated):
 *   - §5.5: снэп + масштаб/прозрачность карточки по расстоянию от центра,
 *     haptic один раз на `onMomentumScrollEnd`;
 *   - §5.6: press-scale 0.96 на самой карточке (в отличие от full-width
 *     строк `OrderRow`/`MasterCard`, которые не меняются).
 * «Уменьшение движения» выключает «дыхание» масштаба/прозрачности и
 * press-scale; снэп и сам скролл (прямое манипулирование) остаются.
 */

import { useRouter } from "expo-router";
import { CloudSlash, Star } from "phosphor-react-native";
import { Pressable, View } from "react-native";
import Animated, {
  FadeInRight,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { Skeleton } from "@/components/Skeleton";
import { Avatar, Button, CompanyBadge, VerifiedBadge } from "@/components/ui";
import { useHomeSpecialists } from "@/features/home/use-home-specialists";
import type { MasterSearchResult } from "@/features/master-view/use-search-masters";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { describeQueryError } from "@/lib/describe-query-error";
import { hapticImpact } from "@/lib/haptics";
import { pluralizeReviews } from "@/lib/pluralize";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColor, useThemeColors } from "@/lib/use-theme-color";

const CARD_WIDTH = 168;
const CARD_GAP = 12;
const SIDE_INSET = 16;
const STEP = CARD_WIDTH + CARD_GAP;

export function SpecialistsCarousel({ userId }: { userId: string | undefined }) {
  const router = useRouter();
  const accentColor = useThemeColor("accent");
  const { data, isLoading, error, refetch, isRefetching, categoryL2Id } =
    useHomeSpecialists(userId);

  // Каталог специалистов пуст целиком — блок скрыт честно, не «Специалисты»
  // над пустой строкой (§4.4: «честная пустота лучше показа пустого блока»).
  if (!isLoading && !error && (data?.length ?? 0) === 0) return null;

  return (
    <View className="mt-10">
      <View className="flex-row items-end justify-between px-4">
        <AppText accessibilityRole="header" weight="bold" className="text-display-sm text-ink">
          Специалисты
        </AppText>
        {data && data.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Все специалисты"
            hitSlop={12}
            onPress={() =>
              // navigate, не push — это переход на таб (как «Все» у
              // «Ваших заданий»/«Актуальных заданий»), не на новый экран.
              router.navigate({
                pathname: "/(tabs)/specialists",
                params: categoryL2Id ? { l2: categoryL2Id } : {},
              } as never)
            }
          >
            <AppText weight="semibold" className="text-body-md text-accent">
              Все
            </AppText>
          </Pressable>
        ) : null}
      </View>

      <View className="mt-4">
        {isLoading ? (
          <SpecialistsCarouselSkeleton />
        ) : error ? (
          <View
            className="mx-4 flex-row items-center gap-3 rounded-2xl bg-surface-card px-4 py-4"
            style={CARD_SHADOW}
          >
            <CloudSlash size={22} weight="bold" color={accentColor} />
            <AppText className="flex-1 text-body-sm text-body">
              {describeQueryError(error).title}
            </AppText>
            <Button
              variant="secondary"
              size="md"
              loading={isRefetching}
              onPress={() => void refetch()}
            >
              Повторить
            </Button>
          </View>
        ) : (
          <SpecialistsCarouselList
            items={data ?? []}
            onOpen={(id) => router.push(`/master/${id}` as never)}
          />
        )}
      </View>
    </View>
  );
}

function SpecialistsCarouselSkeleton() {
  return (
    <View className="flex-row gap-3 px-4">
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="rounded-2xl bg-surface-card p-4"
          style={[CARD_SHADOW, { width: CARD_WIDTH, minHeight: 196 }]}
        >
          <Skeleton variant="circle" width={64} />
          <Skeleton variant="text" width={112} className="mt-3" />
          <Skeleton variant="text" width={80} className="mt-2" />
        </View>
      ))}
    </View>
  );
}

function SpecialistsCarouselList({
  items,
  onOpen,
}: {
  items: MasterSearchResult[];
  onOpen: (userId: string) => void;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={STEP}
      snapToAlignment="start"
      disableIntervalMomentum
      // Haptic один раз на доводку карточки — не на каждый кадр скролла
      // (design-quality §1.2 / IOS_FOUNDATION §5.5).
      onMomentumScrollEnd={() => hapticImpact()}
      contentContainerStyle={{ paddingHorizontal: SIDE_INSET, gap: CARD_GAP }}
    >
      {items.map((master, index) => (
        <SpecialistCard
          key={master.user_id}
          master={master}
          index={index}
          reducedMotion={reducedMotion}
          onPress={() => onOpen(master.user_id)}
        />
      ))}
    </Animated.ScrollView>
  );
}

function fullMasterName(master: MasterSearchResult): string {
  if (master.account_type === "company" && master.legal_name?.trim()) {
    return master.legal_name.trim();
  }
  const name = [master.first_name, master.last_name].filter(Boolean).join(" ").trim();
  return name.length > 0 ? name : "Специалист";
}

/** Рейтинг — только при настоящих отзывах; «4 отзыва» — их реальное число
 *  (честность §5 `design-quality.md`). Без отзывов рейтинга нет вовсе. */
function specialistRating(master: MasterSearchResult): { value: string; count: string } | null {
  if (master.rating_avg === null || (master.rating_count ?? 0) <= 0) return null;
  return {
    value: Number(master.rating_avg).toFixed(1).replace(".", ","),
    count: pluralizeReviews(master.rating_count ?? 0),
  };
}

/** Строка о деле: главная категория, а если её нет — опыт. */
function specialistTrade(master: MasterSearchResult): string | null {
  const firstCategory = master.categories[0];
  if (firstCategory) return firstCategory;
  if (master.experience_years) return `Опыт ${master.experience_years} лет`;
  return null;
}

/** Тот же состав строки, что `MasterCard` (`SpecialistsListScreen.tsx`) уже
 *  вычисляет для VoiceOver — переиспользовать саму функцию нельзя (она не
 *  экспортирована, файл вне зоны владения этой задачи), поэтому состав
 *  продублирован один в один. */
function specialistAccessibilityLabel(master: MasterSearchResult, name: string): string {
  return `${name}${master.is_verified ? ", проверенный специалист" : ""}${
    master.company_verified ? ", компания подтверждена" : ""
  }${master.has_experience_badge ? ", большой опыт" : ""}. ${master.categories.join(", ")}`;
}

function SpecialistCard({
  master,
  index,
  reducedMotion,
  onPress,
}: {
  master: MasterSearchResult;
  index: number;
  reducedMotion: boolean;
  onPress: () => void;
}) {
  const tc = useThemeColors(["warning"]);
  const pressScale = useSharedValue(1);
  const name = fullMasterName(master);
  const rating = specialistRating(master);
  const trade = specialistTrade(master);

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));

  return (
    // Вход один раз при появлении карусели: карточки въезжают справа
    // пружиной с шагом 70 мс — как полка в App Store. «Уменьшение движения»
    // — сразу на месте (ReduceMotion.System).
    <Animated.View
      entering={FadeInRight.delay(index * 70)
        .springify()
        .damping(18)
        .stiffness(160)
        .reduceMotion(ReduceMotion.System)}
    >
      <Animated.View style={pressStyle}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={specialistAccessibilityLabel(master, name)}
          accessibilityHint="Откроет профиль специалиста"
          onPress={onPress}
          onPressIn={() => {
            if (reducedMotion) return;
            pressScale.value = withTiming(0.96, { duration: 110 });
          }}
          onPressOut={() => {
            if (reducedMotion) return;
            // Отпускание — пружиной: карточка «отскакивает» обратно.
            pressScale.value = withSpring(1, { damping: 14, stiffness: 260 });
          }}
          className="rounded-2xl bg-surface-card p-4"
          style={[CARD_SHADOW, { width: CARD_WIDTH, minHeight: 196 }]}
        >
          <Avatar url={master.avatar_url} name={name} seed={name} size="lg" />
          <View className="mt-3 flex-row items-center gap-1">
            <AppText
              weight="bold"
              className="min-w-0 shrink text-title-md text-ink"
              numberOfLines={2}
            >
              {name}
            </AppText>
            {master.is_verified ? <VerifiedBadge size={16} /> : null}
            {master.company_verified ? <CompanyBadge size={16} /> : null}
          </View>
          {trade ? (
            <AppText className="mt-1 text-body-sm text-mute" numberOfLines={2}>
              {trade}
            </AppText>
          ) : null}
          {rating ? (
            <View className="mt-auto flex-row items-center gap-1 pt-3">
              <Star size={14} weight="fill" color={tc.warning} />
              <AppText weight="semibold" className="text-body-sm text-ink">
                {rating.value}
              </AppText>
              <AppText className="text-body-sm text-mute" numberOfLines={1}>
                · {rating.count}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
