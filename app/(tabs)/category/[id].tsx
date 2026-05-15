/**
 * Category detail — список мастеров в L2 категории.
 *
 * Vercel + TaskRabbit Select-a-Tasker:
 *   - Top bar: back + city chip
 *   - H1 категории + краткое описание + counter мастеров
 *   - Список мастеров card-row: фото + имя + рейтинг + город + опыт
 *   - Список услуг с avg ценой (compact rows, expandable accordion)
 *
 * Тап карточки мастера → /master/[id]
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  ListChecks,
  MapPin,
  MessageCircle,
  Phone,
  Star,
  Users,
} from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  Image,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES, type CityId } from "@/components/CitySelector";
import { Avatar, PickerSheet, type PickerOption, Skeleton } from "@/components/ui";
import { getCategoryColorIconUrl } from "@/lib/category-color-icons";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";
import { useCategoryDetail } from "@/features/categories/use-category-detail";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_SHORT,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { type MasterInCategory, useMastersByL2 } from "@/features/master-view/use-masters-by-l2";
import {
  formatServicePrice,
  useMasterServices,
} from "@/features/master-services/use-master-services";
import {
  type PortfolioItem,
  useMasterPortfolio,
} from "@/features/profile/use-my-portfolio";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { pluralizeYears } from "@/lib/pluralize";

/** Высота скрываемой шапки = back-row (64) + chip-row (52).
 *  Back-row высокий, чтобы display-md заголовок (24px) и крупная back-кнопка
 *  (48×48 тач-таргет, chevron 28) комфортно помещались — пользователь
 *  жаловался что шапка «маленькая, мелкое написано» (2026-05-14).
 *  Chip-row — h-10 чипы + py-1.5, без chevron-down (убран по фидбэку). */
const HEADER_BAR_HEIGHT = 64;
const CHIPS_BAR_HEIGHT = 52;
const HIDEABLE_HEIGHT = HEADER_BAR_HEIGHT + CHIPS_BAR_HEIGHT;
/** Расстояние от верха, ниже которого срабатывает auto-hide. До 40px от
 *  верха шапка всегда видна — иначе пользователь не понимает где он. */
const HIDE_THRESHOLD = 40;
/** Минимальный delta-Y между событиями скролла, чтобы засчитать «жест»
 *  направления (исключаем шум от тач-pad'а). */
const DIRECTION_NOISE = 4;

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tc = useThemeColors(["accent", "canvas", "ink", "mute"]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = typeof id === "string" ? id : undefined;
  const { data, error } = useCategoryDetail(categoryId);
  const masters = useMastersByL2(categoryId ?? null);
  const refresh = usePullToRefresh();
  // safeBack: при заходе по deeplink/refresh уходим на home, не в браузерную
  // историю до приложения.
  const goBack = useSafeBack("/" as const);

  // Auto-hide header при скролле вниз / re-show при скролле вверх (Telegram/iOS-style).
  // useNativeDriver: false — на web нет нативного драйвера, на iOS/Android тоже работает
  // нормально для дешёвой translateY-анимации (200ms).
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const headerVisible = useRef(true);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      const dy = y - lastScrollY.current;
      lastScrollY.current = y;
      // У самого верха — всегда показывать, иначе пользователь не понимает контекст
      if (y <= HIDE_THRESHOLD) {
        if (!headerVisible.current) {
          headerVisible.current = true;
          Animated.timing(translateY, {
            toValue: 0,
            duration: 220,
            useNativeDriver: false,
          }).start();
        }
        return;
      }
      if (dy > DIRECTION_NOISE && headerVisible.current) {
        headerVisible.current = false;
        Animated.timing(translateY, {
          toValue: -HIDEABLE_HEIGHT,
          duration: 220,
          useNativeDriver: false,
        }).start();
      } else if (dy < -DIRECTION_NOISE && !headerVisible.current) {
        headerVisible.current = true;
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: false,
        }).start();
      }
    },
    [translateY],
  );

  const categoryName = data?.category.name_ru ?? "Категория";
  const services = data?.services ?? [];
  const allMasters = masters.data ?? [];

  // Filters state
  type SortBy = "rating" | "experience" | "availability";
  const [cityFilter, setCityFilter] = useState<CityId>("all");
  const [l3Filter, setL3Filter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("rating");
  const [openSheet, setOpenSheet] = useState<null | "city" | "l3" | "sort">(null);

  // Apply filter + sort
  const mastersList = useMemo(() => {
    let list = [...allMasters];
    if (cityFilter !== "all") {
      list = list.filter((m) => m.user.city_id === cityFilter);
    }
    // L3 фильтр пока без эффекта — master_categories.l3_ids массив, требует
    // отдельного запроса. TODO sprint 2: фильтровать через JOIN.
    if (sortBy === "experience") {
      list.sort((a, b) => (b.profile?.experience_years ?? 0) - (a.profile?.experience_years ?? 0));
    } else if (sortBy === "availability") {
      const order: Record<string, number> = { today: 3, this_week: 2, next_week: 1, unavailable: 0 };
      list.sort((a, b) => (order[b.profile?.availability_status ?? "unavailable"] ?? 0) - (order[a.profile?.availability_status ?? "unavailable"] ?? 0));
    }
    // 'rating' — default уже отсортирован hook'ом
    return list;
  }, [allMasters, cityFilter, l3Filter, sortBy]);

  const cityLabel = CITIES.find((c) => c.id === cityFilter)?.name ?? "Город";
  const l3Label = l3Filter ? services.find((s) => s.id === l3Filter)?.name_ru ?? "Услуга" : "Услуга";
  const sortLabel = sortBy === "rating" ? "По рейтингу" : sortBy === "experience" ? "По опыту" : "Свободные";

  return (
    <View className="flex-1 bg-canvas">
      {/* Animated скрываемая шапка: position:absolute поверх ScrollView,
          translateY=0 (видна) → -HIDEABLE_HEIGHT (скрыта). bg-canvas через
          className (NativeWind) — inline `tc.canvas` иногда теряет CSS-vars
          в Animated-portal на web и контент просвечивает (фидбэк user
          2026-05-14). Дублируем bg на back-row и chip-row для надёжности. */}
      <Animated.View
        className="bg-canvas"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
          transform: [{ translateY }],
        }}
        pointerEvents="box-none"
      >
        {/* Top bar: крупный back + название категории display-md (24px).
            Размеры подняты по фидбэку user 2026-05-14 («стрелочка очень
            маленькая, хедер тоже маленькая написано»). Back-кнопка 48×48
            (h-12 w-12) — комфортный тач-таргет, chevron 28 strokeWidth 2.25
            для большей контрастности. Title display-md weight=bold (700)
            — Airbnb / Booking detail-pattern. */}
        <View
          className="flex-row items-center gap-2 px-3 bg-canvas"
          style={{ height: HEADER_BAR_HEIGHT }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={goBack}
            className="h-12 w-12 items-center justify-center rounded-full active:bg-canvas-soft text-ink"
          >
            <ChevronLeft size={28} strokeWidth={2.25} color="currentColor" />
          </Pressable>
          <AppText
            weight="bold"
            className="flex-1 text-display-md tracking-tight text-ink"
            numberOfLines={1}
          >
            {categoryName}
          </AppText>
        </View>

        {/* Quick filter chips — горизонтальный scroll. flexGrow:0 чтобы не
            расползался по высоте (иначе схлопывается до ~12px). Tight
            paddingHorizontal:12 — chips ближе к краю экрана как у Airbnb. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="bg-canvas"
          style={{ flexGrow: 0, flexShrink: 0, height: CHIPS_BAR_HEIGHT }}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            gap: 6,
            alignItems: "center",
          }}
        >
          <FilterChip
            label={cityLabel}
            icon={MapPin}
            active={cityFilter !== "all"}
            onPress={() => setOpenSheet("city")}
          />
          {/* Чип «Услуга» только если есть L3-подкатегории. */}
          {services.length > 0 ? (
            <FilterChip
              label={l3Label}
              icon={ListChecks}
              active={!!l3Filter}
              onPress={() => setOpenSheet("l3")}
            />
          ) : null}
          <FilterChip
            label={sortLabel}
            // Иконка меняется с выбором сортировки — пользователь видит
            // что именно активно (рейтинг ★ / опыт 💼 / готовность 📅).
            icon={sortBy === "experience" ? Briefcase : sortBy === "availability" ? Calendar : Star}
            active={sortBy !== "rating"}
            onPress={() => setOpenSheet("sort")}
          />
        </ScrollView>
      </Animated.View>

      <ScrollView
        contentContainerStyle={{
          // Резервируем место под скрываемую шапку — иначе первый мастер
          // уезжает под неё при первом рендере.
          paddingTop: insets.top + HIDEABLE_HEIGHT,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >

        {/* Список мастеров. Заголовок «Мастера» убран — header страницы
            (имя категории «Сантехника») уже даёт контекст.
            Карточки full-width (без mx, без border), между ними hairline-
            разделитель — как в строгом feed-листе. mt-0 — chips сразу
            переходят в первую карточку, gap создаётся только её внутренним
            py-5 (≈ 2x сокращение от 16+28=44 до 0+20=20px по фидбэку user
            2026-05-14). */}
        <View>
          {masters.isLoading ? (
            // Skeleton повторяет форму MasterRow: avatar xl (96) + правая
            // колонка с именем/мета/городом. Высота ≈ реальной карточки,
            // чтобы при появлении данных layout не дёргался.
            <View>
              {[0, 1, 2].map((i, idx) => (
                <View key={i}>
                  {idx > 0 ? <View className="h-px bg-hairline mx-5" /> : null}
                  <View className="px-5 py-5 flex-row gap-4">
                    <Skeleton circle size={96} />
                    <View className="flex-1">
                      <Skeleton height={18} width="60%" className="rounded" />
                      <Skeleton height={14} width="40%" className="mt-3 rounded" />
                      <Skeleton height={14} width="30%" className="mt-2 rounded" />
                      <Skeleton height={14} width="35%" className="mt-2 rounded" />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : mastersList.length === 0 ? (
            <View className="items-center py-10 px-5">
              <AppText weight="bold" className="text-title-lg text-ink text-center">
                Пока нет мастеров в этой категории
              </AppText>
              <AppText className="mt-2 text-body-md text-mute text-center">
                Опишите задачу — мастера откликнутся.
              </AppText>
            </View>
          ) : (
            <View>
              {mastersList.map((m, idx) => (
                <View key={m.user.id}>
                  {idx > 0 ? <View className="h-px bg-hairline mx-5" /> : null}
                  {/* Старая карточка с круглой аватаркой (откат от
                      Wildberries-style 2026-05-14 по запросу user).
                      Чтобы вернуть фото-pager — заменить <MasterRow>
                      на <MasterRowGallery> (определение в этом же файле). */}
                  <MasterRow
                    master={m}
                    onPress={() => router.push(`/master/${m.user.id}` as never)}
                  />
                </View>
              ))}
            </View>
          )}
        </View>

        {/* «Типичные услуги» (L3 список с avg-чеком) убран по фидбэку user
            2026-05-14: блок не нёс полезной информации, ценники почти все
            «По договорённости» — выглядел шумно и пусто. L3-фильтр остался
            через FilterChip «Услуга» сверху, ценовые ориентиры — в карточках
            самих мастеров. */}

        {error ? (
          <View className="px-5 mt-6">
            <AppText className="text-error text-body-sm">
              Не удалось загрузить: {error.message}
            </AppText>
          </View>
        ) : null}
      </ScrollView>

      {/* Filter pickers — full-screen, иконка-square + title + Check.
          Универсальный PickerSheet (не BottomSheet) — без drag-handle,
          с большим header'ом и accent-color для selected. */}
      <PickerSheet
        open={openSheet === "city"}
        onClose={() => setOpenSheet(null)}
        title="Город"
        options={CITIES.map<PickerOption>((c) => ({
          id: c.id,
          title: c.name,
          icon: <MapPin size={18} strokeWidth={1.75} color={tc.ink} />,
        }))}
        selectedId={cityFilter}
        onSelect={(id) => {
          setCityFilter(id as CityId);
          setOpenSheet(null);
        }}
      />

      <PickerSheet
        open={openSheet === "l3"}
        onClose={() => setOpenSheet(null)}
        title={categoryName}
        options={[
          {
            id: "__all",
            title: "Все услуги",
            icon: <ListChecks size={18} strokeWidth={1.75} color={tc.ink} />,
          },
          ...services.map<PickerOption>((s) => {
            // Все L3-услуги одной L2 — рендерим цветную тематическую SVG-иконку
            // родительской L2-категории (через Iconify CDN). Так sheet выглядит
            // не «серым plain-листом», а живой и в стиле каталога.
            // 290+ L3 — отдельный mapping не имеет смысла: визуальная связь с
            // родительской категорией работает, и иконка узнаваема (окно/капля).
            const colorUrl = getCategoryColorIconUrl(categoryId ?? null);
            return {
              id: s.id,
              title: s.name_ru,
              icon: colorUrl ? (
                <Image
                  source={{ uri: colorUrl }}
                  style={{ width: 22, height: 22 }}
                />
              ) : (
                <ListChecks size={18} strokeWidth={1.75} color={tc.mute} />
              ),
            };
          }),
        ]}
        selectedId={l3Filter ?? "__all"}
        onSelect={(id) => {
          setL3Filter(id === "__all" ? null : id);
          setOpenSheet(null);
        }}
        searchable={services.length >= 8}
        searchPlaceholder="Например, замена смесителя"
        resettable={!!l3Filter}
        resetLabel="Сбросить"
      />

      <PickerSheet
        open={openSheet === "sort"}
        onClose={() => setOpenSheet(null)}
        title="Сортировка"
        options={[
          {
            id: "rating",
            title: "По рейтингу",
            subtitle: "Сначала с лучшими отзывами",
            icon: <Star size={18} strokeWidth={1.75} color={tc.ink} />,
          },
          {
            id: "experience",
            title: "По опыту",
            subtitle: "Сначала самые опытные",
            icon: <Briefcase size={18} strokeWidth={1.75} color={tc.ink} />,
          },
          {
            id: "availability",
            title: "Свободные сначала",
            subtitle: "Кто готов сегодня и на неделе",
            icon: <Calendar size={18} strokeWidth={1.75} color={tc.ink} />,
          },
        ]}
        selectedId={sortBy}
        onSelect={(id) => {
          setSortBy(id as SortBy);
          setOpenSheet(null);
        }}
      />
    </View>
  );
}

/** Chip-кнопка для quick filter bar.
 *  Sublte filter-pill pattern «больших компаний» (Airbnb / Linear / Stripe):
 *    - Inactive: thin hairline border, bg-canvas, text-body medium. Спокойный
 *      элемент в общем поле, не оттягивает внимание.
 *    - Active: bg-canvas-soft-2 (lightly filled), border-hairline-strong,
 *      text-ink semibold. Сигнал «фильтр применён» — через тонкую разницу
 *      bg + вес шрифта, без чёрного fill. Пользователь жаловался что прежняя
 *      filled-ink версия «слишком яркая» (2026-05-14).
 *  ChevronDown убран — pill-shape + tap делают affordance понятным сами.
 *  Размер: h-10, px-4 — text-body-sm (14px) дышит. */
function FilterChip({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  /** Lucide-иконка слева. Передаётся как компонент (`MapPin`, `Star` и т.п.). */
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string; className?: string }>;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className={`flex-row items-center gap-1.5 h-10 px-4 rounded-full active:opacity-70 ${
        active
          ? "bg-canvas-soft-2 border border-hairline-strong"
          : "bg-canvas border border-hairline"
      }`}
    >
      {Icon ? (
        <Icon
          size={15}
          strokeWidth={1.75}
          color="currentColor"
          className={active ? "text-ink" : "text-body"}
        />
      ) : null}
      <AppText
        weight={active ? "semibold" : "medium"}
        className={`text-body-sm ${active ? "text-ink" : "text-body"}`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function MasterRow({
  master,
  onPress,
}: {
  master: MasterInCategory;
  onPress: () => void;
}) {
  const u = master.user;
  const profile = master.profile;
  const cityName = master.city?.name ?? null;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Мастер";
  // Услуги мастера — топ-3 по position. Сейчас не фильтруются по L2 (master_services
  // не привязаны к категориям), но в scope категории показываем все его услуги
  // как индикатор «вот за сколько он работает». Если данных нет — секция не рисуется.
  const { data: services } = useMasterServices(u.id);
  const topServices = (services ?? []).slice(0, 3);
  // Портфолио — первые 5 фото для VK-style row под прайсом. Если фото больше
  // 5 — на 5-м плашка «+N». Тап → переход на профиль (lightbox внутри). Так
  // клиент видит реальные работы прямо в листинге, без перехода (фидбэк user
  // 2026-05-14).
  const { data: portfolioPhotos } = useMasterPortfolio(u.id);
  const previewPhotos = (portfolioPhotos ?? []).slice(0, 5);
  const portfolioOverflow = (portfolioPhotos?.length ?? 0) - 5;
  const rating = profile?.rating_overall_avg ?? null;
  const ratingCount = profile?.rating_overall_count ?? 0;
  const experience = profile?.experience_years ?? null;
  const accountType = profile?.account_type ?? null;
  const teamSize = profile?.team_size ?? null;
  const accountBadge =
    accountType === "brigade"
      ? `Бригада${teamSize ? ` · ${teamSize} чел.` : ""}`
      : accountType === "company"
        ? "Компания"
        : null;

  // Звонок/whatsapp — переход на профиль мастера (там есть CTA «Написать в чат»
  // и контакты после логина через LoginWall).
  const handleContact = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    onPress();
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fullName}
      className="px-5 py-5 active:bg-canvas-soft-2"
    >
      <>
        {/* Header row: avatar + имя + meta. Bio и кнопки — full-width ниже,
            от левого края карточки (фидбэк: под avatar пустое место). */}
        <View className="flex-row gap-4">
          {/* Аватар увеличен lg(64) → xl(96) — больше визуального веса
              и узнаваемости (фидбэк user 2026-05-14). */}
          <Avatar url={u.avatar_url} name={fullName} seed={u.id} size="xl" />
          <View className="flex-1">
            {/* Имя + chip готовности (h-6, text-caption=12px) — больше чем
                раньше (h-5/text-caption-xs выглядело мелко по фидбэку user). */}
            <View className="flex-row items-center gap-2">
              <AppText weight="semibold" className="text-ink text-body-lg flex-shrink" numberOfLines={1}>
                {fullName}
              </AppText>
              {(() => {
                const status = effectiveStatus(
                  profile?.availability_status ?? null,
                  profile?.availability_until ?? null,
                );
                if (!isAvailabilityVisible(status)) return null;
                return (
                  <View
                    className="flex-row items-center gap-1.5 h-6 px-2 rounded-full"
                    style={{ backgroundColor: `${AVAILABILITY_DOT[status]}22` }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: AVAILABILITY_DOT[status],
                      }}
                    />
                    <AppText
                      weight="medium"
                      className="text-caption"
                      style={{ color: AVAILABILITY_DOT[status] }}
                    >
                      {AVAILABILITY_SHORT[status]}
                    </AppText>
                  </View>
                );
              })()}
            </View>

            {/* Trust-meta в 2 строки (фидбэк user 2026-05-14: «город ниже на
                вторую строчку»):
                  Row 1: Бригада · Рейтинг · Опыт (мета о мастере как профи)
                  Row 2: 📍 Город (отдельный гео-контекст) */}
            <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
              {accountBadge ? (
                <View className="flex-row items-center gap-1">
                  <Users size={14} strokeWidth={1.75} color="currentColor" className="text-mute" />
                  <AppText className="text-mute text-body-sm">{accountBadge}</AppText>
                </View>
              ) : null}

              {rating !== null && ratingCount > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Star size={14} strokeWidth={1.75} color="currentColor" className="text-ink" />
                  <AppText weight="mono" className="text-ink text-mono-sm">
                    {rating.toFixed(1)}
                  </AppText>
                  <AppText weight="mono" className="text-mute text-mono-sm">
                    ({ratingCount})
                  </AppText>
                </View>
              ) : (
                <View className="flex-row items-center gap-1">
                  <Star size={14} strokeWidth={1.75} color="currentColor" className="text-mute" />
                  <AppText className="text-mute text-body-sm">Без отзывов</AppText>
                </View>
              )}

              {experience !== null && experience > 0 ? (
                <View className="flex-row items-center gap-1">
                  <Briefcase size={14} strokeWidth={1.75} color="currentColor" className="text-mute" />
                  <AppText className="text-mute text-body-sm">
                    {pluralizeYears(experience)} опыта
                  </AppText>
                </View>
              ) : null}
            </View>

            {cityName ? (
              <View className="flex-row items-center gap-1 mt-1.5">
                <MapPin size={14} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-mute text-body-sm">{cityName}</AppText>
              </View>
            ) : null}
          </View>
        </View>
        {/* Bio — full-width, от левого края (не из правой колонки).
            16px (body-md) — фидбэк user 2026-05-14 «14px мелко не читается». */}
        {profile?.bio ? (
          <AppText className="text-body text-body-md mt-3" numberOfLines={3}>
            {profile.bio}
          </AppText>
        ) : null}
        {/* Услуги мастера с ценами — топ-3. Формат «от X до Y ₽» / «X ₽».
            Unit показываем только если значимый (м² / час / день) — для
            per_task «за работу» опускаем (понятно по контексту).
            Текст услуги body-md (16px), цена mono-md (16px) — фидбэк
            user 2026-05-14 «маленькие шрифты, увеличить на 2-3-4px». */}
        {topServices.length > 0 ? (
          <View className="mt-3 gap-1">
            {topServices.map((s) => {
              // formatServicePrice (helper из use-master-services) сам обрабатывает
              // pricing_kind: 'quote' → «Договорная»; 'hourly' → «X ₽ / час»;
              // 'fixed' → «X ₽ · за работу»; 'range' → «X–Y ₽ · за работу».
              const priceText = formatServicePrice(s);
              return (
                <View key={s.id} className="flex-row items-center justify-between gap-2">
                  <AppText className="text-body text-body-md flex-1" numberOfLines={1}>
                    {s.title}
                  </AppText>
                  <AppText weight="mono" className="text-ink text-mono-md">
                    {priceText}
                  </AppText>
                </View>
              );
            })}
          </View>
        ) : null}
        {/* VK-style 5-thumb preview портфолио. Видно прямо в листинге, не
            заходя в профиль — клиент сразу проверяет качество работ. Тап на
            миниатюру → переход на профиль (lightbox откроется там).
            «+N» overlay на 5-й плашке если фото больше 5. */}
        {previewPhotos.length > 0 ? (
          <View className="mt-3 flex-row gap-1.5">
            {previewPhotos.map((p, i) => {
              const isLastSlot = i === 4 && portfolioOverflow > 0;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Фото ${i + 1}`}
                  onPress={handleContact}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 8,
                    overflow: "hidden",
                    backgroundColor: "#1a1a1a",
                    position: "relative",
                  }}
                  className="active:opacity-70"
                >
                  <Image
                    source={{ uri: p.url }}
                    style={{ width: "100%", height: "100%" }}
                    resizeMode="cover"
                  />
                  {isLastSlot ? (
                    <View
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: "rgba(0,0,0,0.55)",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <AppText
                        weight="semibold"
                        style={{ color: "#fff", fontSize: 14 }}
                      >
                        +{portfolioOverflow}
                      </AppText>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
        {/* Контакты — ghost pill-кнопки одного веса, без иконок и без
            контраста primary/secondary. Primary action в feed-карточке —
            сама карточка (тап → переход на профиль), кнопки контакта —
            secondary shortcut. Паттерн TaskRabbit / Booksy / Yelp.
            (Фидбэк user 2026-05-14: «кнопки сделай не такими заметными,
            убери иконки внутри них»). */}
        <View className="flex-row gap-2 mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Позвонить"
            onPress={handleContact}
            className="flex-1 items-center justify-center h-10 rounded-full bg-canvas-soft active:bg-canvas-soft-2"
          >
            <AppText weight="medium" className="text-body-sm text-ink">
              Позвонить
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="WhatsApp"
            onPress={handleContact}
            className="flex-1 items-center justify-center h-10 rounded-full bg-canvas-soft active:bg-canvas-soft-2"
          >
            <AppText weight="medium" className="text-body-sm text-ink">
              WhatsApp
            </AppText>
          </Pressable>
        </View>
      </>
    </Pressable>
  );
}

// ----------------------------------------------------------------------------
// MasterRowGallery — Wildberries-style: вместо круглой аватарки слева
// 4:5 swipable портфолио-pager. Текст и метаданные сдвинуты вправо. Тап на
// pager → переход на /master/[id]. Свайп между фото — pagingEnabled.
// Откат: в render заменить <MasterRowGallery> обратно на <MasterRow>.
// ----------------------------------------------------------------------------

const GALLERY_W = 140;
const GALLERY_H = 140; // square (фидбэк user 2026-05-14)

function MasterRowGallery({
  master,
  onPress,
}: {
  master: MasterInCategory;
  onPress: () => void;
}) {
  const u = master.user;
  const profile = master.profile;
  const cityName = master.city?.name ?? null;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Мастер";
  const { data: services } = useMasterServices(u.id);
  const { data: portfolioData } = useMasterPortfolio(u.id);
  const photos = portfolioData ?? [];
  const topServices = (services ?? []).slice(0, 3);
  const rating = profile?.rating_overall_avg ?? null;
  const ratingCount = profile?.rating_overall_count ?? 0;
  const experience = profile?.experience_years ?? null;
  const accountType = profile?.account_type ?? null;
  const teamSize = profile?.team_size ?? null;
  const accountBadge =
    accountType === "brigade"
      ? `Бригада${teamSize ? ` · ${teamSize} чел.` : ""}`
      : accountType === "company"
        ? "Компания"
        : null;

  const handleContact = (e: { stopPropagation?: () => void }) => {
    e.stopPropagation?.();
    onPress();
  };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fullName}
      className="px-5 py-5 active:bg-canvas-soft-2"
    >
      <View className="flex-row gap-3">
        {/* LEFT: square 140x140 портфолио-pager или fallback на аватарку */}
        <View style={{ width: GALLERY_W }}>
          {photos.length > 0 ? (
            <CompactPortfolioPager photos={photos} onPress={onPress} />
          ) : (
            <View
              style={{
                width: GALLERY_W,
                height: GALLERY_H,
                borderRadius: 12,
                overflow: "hidden",
              }}
              className="bg-canvas-soft items-center justify-center"
            >
              <Avatar url={u.avatar_url} name={fullName} seed={u.id} size="xl" />
            </View>
          )}
        </View>

        {/* RIGHT: грамотный стек сверху-вниз. Hierarchy:
              1. Имя (text-body-md semibold) — единственный анкор
              2. Status chip (зелёный pill) — единственный яркий accent
              3-6. Бригада / Рейтинг / Опыт / Город — единый mute-caption уровень
                   с маленькой иконкой слева, gap-1 между ними.
            Иерархия: один анкор → один accent → плотная мета-группа.
            Без растяжения по высоте картинки (выглядело пусто).
            mt-2 между «верхом» (имя+статус) и мета-группой даёт правильный воздух. */}
        <View style={{ flex: 1 }}>
          {/* Имя */}
          <AppText
            weight="semibold"
            className="text-ink text-body-lg"
            numberOfLines={1}
          >
            {fullName}
          </AppText>

          {/* Готовность */}
          {(() => {
            const status = effectiveStatus(
              profile?.availability_status ?? null,
              profile?.availability_until ?? null,
            );
            if (!isAvailabilityVisible(status)) return null;
            return (
              <View
                className="flex-row items-center self-start gap-1 h-5 px-1.5 mt-2 rounded-full"
                style={{ backgroundColor: `${AVAILABILITY_DOT[status]}22` }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: AVAILABILITY_DOT[status],
                  }}
                />
                <AppText
                  weight="medium"
                  className="text-caption-xs"
                  style={{ color: AVAILABILITY_DOT[status] }}
                >
                  {AVAILABILITY_SHORT[status]}
                </AppText>
              </View>
            );
          })()}

          {/* Мета-группа: Бригада / Рейтинг / Опыт / Город — единый mute-caption */}
          <View className="mt-2.5 gap-1">
            {accountBadge ? (
              <View className="flex-row items-center gap-1.5">
                <Users size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-mute text-caption" numberOfLines={1}>
                  {accountBadge}
                </AppText>
              </View>
            ) : null}

            {rating !== null && ratingCount > 0 ? (
              <View className="flex-row items-center gap-1.5">
                <Star size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText weight="mono" className="text-mute text-mono-caption">
                  {rating.toFixed(1)} ({ratingCount})
                </AppText>
              </View>
            ) : (
              <View className="flex-row items-center gap-1.5">
                <Star size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-mute text-caption">Без отзывов</AppText>
              </View>
            )}

            {experience !== null && experience > 0 ? (
              <View className="flex-row items-center gap-1.5">
                <Briefcase size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-mute text-caption">
                  {pluralizeYears(experience)} опыта
                </AppText>
              </View>
            ) : null}

            {cityName ? (
              <View className="flex-row items-center gap-1.5">
                <MapPin size={12} strokeWidth={1.75} color="currentColor" className="text-mute" />
                <AppText className="text-mute text-caption" numberOfLines={1}>
                  {cityName}
                </AppText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {/* Описание — снизу под row, full-width.
          16px (body-md) — фидбэк user 2026-05-14 «14px мелко». */}
      {profile?.bio ? (
        <AppText className="text-body text-body-md mt-3" numberOfLines={3}>
          {profile.bio}
        </AppText>
      ) : null}

      {/* Топ-3 услуги с ценами — full-width под gallery+text.
          Текст услуги body-md (16px), цена mono-md (16px). */}
      {topServices.length > 0 ? (
        <View className="mt-3 gap-1">
          {topServices.map((s) => {
            const priceText = formatServicePrice(s);
            return (
              <View key={s.id} className="flex-row items-center justify-between gap-2">
                <AppText className="text-body text-body-md flex-1" numberOfLines={1}>
                  {s.title}
                </AppText>
                <AppText weight="mono" className="text-ink text-mono-md">
                  {priceText}
                </AppText>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Кнопки — full-width */}
      <View className="flex-row gap-2 mt-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Позвонить"
          onPress={handleContact}
          className="flex-1 flex-row items-center justify-center gap-2 h-10 rounded-full bg-canvas-soft border border-hairline active:opacity-70"
        >
          <Phone size={16} strokeWidth={1.75} color="currentColor" className="text-ink" />
          <AppText weight="medium" className="text-body-sm text-ink">
            Позвонить
          </AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="WhatsApp"
          onPress={handleContact}
          className="flex-1 flex-row items-center justify-center gap-2 h-10 rounded-full bg-canvas-soft border border-hairline active:opacity-70"
        >
          <MessageCircle size={16} strokeWidth={1.75} color="currentColor" className="text-ink" />
          <AppText weight="medium" className="text-body-sm text-ink">
            WhatsApp
          </AppText>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** Компактный 4:5 swipable pager для inline-карточки.
 *  Тап на любой slide → onPress (= переход на профиль мастера). */
function CompactPortfolioPager({
  photos,
  onPress,
}: {
  photos: PortfolioItem[];
  onPress: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / GALLERY_W);
    if (i !== idx) setIdx(i);
  };
  return (
    <View
      style={{
        width: GALLERY_W,
        height: GALLERY_H,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
      }}
    >
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        snapToInterval={GALLERY_W}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={onPress} style={{ width: GALLERY_W, height: GALLERY_H }}>
            <Image
              source={{ uri: item.url }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="cover"
            />
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <View
          style={{
            position: "absolute",
            bottom: 8,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "center",
            gap: 4,
          }}
          pointerEvents="none"
        >
          {photos.map((p, i) => (
            <View
              key={p.id}
              style={{
                width: i === idx ? 16 : 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: i === idx ? "#ffffff" : "rgba(255,255,255,0.5)",
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
