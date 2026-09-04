/**
 * Экран категории — кто в этой категории работает.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Дизайн 2026-09-04, сделан с нуля.
 *
 * DECISION владельца: «открываю категорию, чтобы посмотреть специалистов —
 * ужасно плохой дизайн, кнопка „назад“ ужасная, заголовок ужасный, все кнопки
 * ужас. Возьми стандартный дизайн Apple или наш референс и переделай с нуля.
 * И пускай будет iOS Liquid Glass».
 *
 * Что сделано и почему:
 *
 *  1. Шапка ведёт себя как системная. Крупное название категории живёт в
 *     содержимом и уезжает вверх при прокрутке, а в закреплённой строке
 *     навигации в этот же момент проявляется то же название мелким кеглем.
 *     Так устроен большой заголовок во всех приложениях Apple.
 *  2. Закреплённая шапка — в материале Liquid Glass: содержимое проезжает под
 *     ней и просвечивает. На устройствах без iOS 26 остаётся обычная
 *     поверхность с волосяной границей (см. GlassSurface).
 *  3. Кнопка «назад» была залитым треугольником в 28 px. Стало то, что рисует
 *     система: тонкая угловая скобка в круге 44×44.
 *  4. Прятанье шапки при прокрутке убрано. Оно уносило вместе с собой
 *     фильтры — единственное управление на экране, и человек терял его ровно
 *     тогда, когда листал список и хотел сузить выбор.
 *  5. Слово «мастер» убрано из интерфейса: в нижнем меню вкладка называется
 *     «Специалисты», и экран обязан говорить так же.
 *  6. Пустой экран больше не тупик: он говорит, что именно пусто (категория
 *     или выбранный фильтр), и даёт выход — сбросить фильтр или описать
 *     задачу.
 *  7. Карточка человека приведена к общему языку карточек (см. OrderRow):
 *     отдельный объект с мягкой тенью, ничего мельче 14 px.
 *
 * Тап карточки → /master/[id].
 */

import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowRight,
  Briefcase,
  Calendar,
  CaretLeft,
  ListChecks,
  MapPin,
  Star,
  UsersThree,
} from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { CITIES, type CityId } from "@/components/CitySelector";
import { Avatar, GlassSurface, LIQUID_GLASS, Skeleton } from "@/components/ui";
import { useCategoryFilterPickerStore } from "@/features/categories/category-filter-picker-store";
import { useCategoryDetail } from "@/features/categories/use-category-detail";
import {
  formatServicePrice,
  useMasterServices,
} from "@/features/master-services/use-master-services";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_SHORT,
  effectiveStatus,
  isAvailabilityVisible,
} from "@/features/master-view/availability";
import { useCategoryMasterDetails } from "@/features/master-view/use-category-master-details";
import { type MasterInCategory, useMastersByL2 } from "@/features/master-view/use-masters-by-l2";
import { useRecordMasterView } from "@/features/master-view/use-record-view";
import { specialistsLabel } from "@/features/orders/plural-ru";
import { useMasterPortfolio } from "@/features/profile/use-my-portfolio";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { cdnImage } from "@/lib/image-cdn";
import { pluralizeYears } from "@/lib/pluralize";
import { useAppWidth } from "@/lib/use-app-width";
import { useSafeBack } from "@/lib/use-safe-back";
import { useThemeColors } from "@/lib/use-theme-color";

/** Закреплённая шапка: строка навигации + строка фильтров. Содержимое
 *  проезжает под ней, поэтому она в материале Liquid Glass. */
const NAV_BAR_HEIGHT = 52;
const FILTER_BAR_HEIGHT = 58;
const HEADER_HEIGHT = NAV_BAR_HEIGHT + FILTER_BAR_HEIGHT;

/** На этом отрезке прокрутки крупный заголовок уезжает вверх, а его копия в
 *  строке навигации проявляется. Значения подобраны так, чтобы подмена
 *  случалась ровно когда крупный заголовок уходит за шапку. */
const TITLE_FADE_FROM = 16;
const TITLE_FADE_TO = 64;

/** Та же тень, что у карточки задания: край карточки читается без опоры на
 *  линию (src/components/OrderRow.tsx). */
const CARD_SHADOW = {
  shadowColor: "#000000",
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;

export default function CategoryDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categoryId = typeof id === "string" ? id : undefined;
  const { data, error, isLoading: isCategoryLoading } = useCategoryDetail(categoryId);
  const masters = useMastersByL2(categoryId ?? null);
  const refresh = usePullToRefresh(["masters-by-l2", "categories", "cities"]);
  // safeBack: при заходе по deeplink/refresh уходим на home, не в браузерную
  // историю до приложения.
  const goBack = useSafeBack("/" as const);
  const { ink: inkColor } = useThemeColors(["ink"]);

  // Прокрутка нужна ровно для одного: подменить крупный заголовок мелким в
  // строке навигации. Нативный драйвер — событие приходит в том же потоке,
  // что и сама прокрутка, и подмена не отстаёт от пальца.
  const scrollY = useRef(new Animated.Value(0)).current;
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [TITLE_FADE_FROM, TITLE_FADE_TO],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: true,
  });

  const categoryName = data?.category.name_ru ?? "Категория";
  const services = data?.services ?? [];
  const allMasters = masters.data ?? [];

  // Filters state
  type SortBy = "rating" | "experience" | "availability";
  const [cityFilter, setCityFilter] = useState<CityId>("all");
  const [l3Filter, setL3Filter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("rating");

  // Город/услуга/сортировка теперь выбираются на отдельных route-экранах
  // (`/category/{city,l3,sort}-select`, нативная formSheet-модальность вместо
  // самописного `<Modal>`) — слушаем результат из транзитного store и
  // применяем в local state. Паттерн 1-в-1 с
  // `useOrderDraftStore.selectedLocation` / `LocationPicker.tsx`.
  const sortResult = useCategoryFilterPickerStore((s) => s.sortResult);
  const setSortResult = useCategoryFilterPickerStore((s) => s.setSortResult);
  useEffect(() => {
    if (!sortResult) return;
    setSortBy(sortResult.value);
    setSortResult(null);
  }, [sortResult, setSortResult]);

  const cityResult = useCategoryFilterPickerStore((s) => s.cityResult);
  const setCityResult = useCategoryFilterPickerStore((s) => s.setCityResult);
  useEffect(() => {
    if (!cityResult) return;
    setCityFilter(cityResult.value);
    setCityResult(null);
  }, [cityResult, setCityResult]);

  const l3Result = useCategoryFilterPickerStore((s) => s.l3Result);
  const setL3Result = useCategoryFilterPickerStore((s) => s.setL3Result);
  useEffect(() => {
    if (!l3Result) return;
    setL3Filter(l3Result.value);
    setL3Result(null);
  }, [l3Result, setL3Result]);

  // Apply filter + sort
  const mastersList = useMemo(() => {
    let list = [...allMasters];
    if (cityFilter !== "all") {
      list = list.filter((m) => m.user.city_id === cityFilter);
    }
    // Фильтр по услуге. Раньше кнопка «Услуга» ничего не делала: выбор
    // применялся к пустоте, потому что список не знал услуг мастера. Теперь
    // l3_ids приходят вместе со списком, и фильтр работает без лишнего
    // запроса. Управляющий элемент, который ничего не меняет, — дефект
    // (.claude/rules/design-quality.md §1.1).
    if (l3Filter) {
      list = list.filter((m) => m.l3_ids.includes(l3Filter));
    }
    if (sortBy === "experience") {
      list.sort((a, b) => (b.profile?.experience_years ?? 0) - (a.profile?.experience_years ?? 0));
    } else if (sortBy === "availability") {
      const order: Record<string, number> = {
        today: 3,
        this_week: 2,
        next_week: 1,
        unavailable: 0,
      };
      list.sort(
        (a, b) =>
          (order[b.profile?.availability_status ?? "unavailable"] ?? 0) -
          (order[a.profile?.availability_status ?? "unavailable"] ?? 0),
      );
    }
    // 'rating' — default уже отсортирован hook'ом
    return list;
  }, [allMasters, cityFilter, sortBy, l3Filter]);

  // Услуги и портфолио для всех видимых карточек забираем двумя запросами и
  // кладём в кэш по ключам одиночных хуков. Без этого каждая карточка ходила
  // в сеть сама: 20 мастеров давали 40 лишних запросов, и экран открывался
  // тем медленнее, чем больше в категории людей.
  const visibleMasterIds = useMemo(() => mastersList.map((m) => m.user.id), [mastersList]);
  useCategoryMasterDetails(visibleMasterIds);

  const cityLabel = CITIES.find((c) => c.id === cityFilter)?.name ?? "Город";
  const l3Label = l3Filter
    ? (services.find((s) => s.id === l3Filter)?.name_ru ?? "Услуга")
    : "Услуга";
  const sortLabel =
    sortBy === "rating" ? "По рейтингу" : sortBy === "experience" ? "По опыту" : "Свободные";

  // Цельный скелет всего экрана пока грузятся данные категории И мастера.
  // Раньше заголовок/чипы/список появлялись по отдельности — рвано (фидбэк
  // владельца 2026-05-27: «открывается без заголовка, но пилюли загружены»).
  // Теперь: открыл → скелет всей структуры → потом весь контент разом.
  if (isCategoryLoading || masters.isLoading) {
    return <CategorySkeleton insets={insets} goBack={goBack} />;
  }

  const countLabel = specialistsLabel(mastersList.length);
  const hasFilters = cityFilter !== "all" || !!l3Filter;

  return (
    <View className="flex-1 bg-surface-page">
      <Animated.ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + HEADER_HEIGHT,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={refresh.control}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {/* Крупный заголовок. Он в содержимом, а не в шапке: уезжает вверх и
            освобождает экран под список — так работает большой заголовок в
            системных приложениях. */}
        <View className="px-5 pt-3 pb-5">
          <AppText weight="bold" className="text-display-lg text-ink">
            {categoryName}
          </AppText>
          <AppText className="mt-1 text-body-md text-mute">{countLabel}</AppText>
        </View>

        {mastersList.length === 0 ? (
          <EmptyCategory
            hasFilters={hasFilters}
            categoryName={categoryName}
            onReset={() => {
              setCityFilter("all");
              setL3Filter(null);
            }}
            onCreateTask={() => router.push("/orders/new" as never)}
          />
        ) : (
          <View>
            {mastersList.map((m) => (
              <MasterRow
                key={m.user.id}
                master={m}
                onPress={() => router.push(`/master/${m.user.id}` as never)}
              />
            ))}
          </View>
        )}

        {error ? (
          <View className="mt-6 px-5">
            <AppText className="text-body-md text-error">
              Не удалось загрузить: {error.message}
            </AppText>
          </View>
        ) : null}
      </Animated.ScrollView>

      {/* Закреплённая шапка поверх содержимого. Стекло имеет смысл только
          здесь: под ней действительно что-то едет. */}
      <GlassSurface
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          paddingTop: insets.top,
        }}
        fallbackClassName="bg-canvas"
      >
        <View className="flex-row items-center px-2" style={{ height: NAV_BAR_HEIGHT }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={goBack}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
          >
            <CaretLeft size={22} weight="bold" color={inkColor} />
          </Pressable>
          {/* Название проявляется ровно тогда, когда крупный заголовок ушёл
              за шапку: человек всегда знает, где он. */}
          <Animated.View className="min-w-0 flex-1" style={{ opacity: compactTitleOpacity }}>
            <AppText
              weight="semibold"
              className="text-center text-title-lg text-ink"
              numberOfLines={1}
            >
              {categoryName}
            </AppText>
          </Animated.View>
          {/* Симметричная пустота справа — заголовок стоит по центру экрана,
              а не по центру оставшегося места. */}
          <View className="h-11 w-11" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0, height: FILTER_BAR_HEIGHT }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            gap: 8,
            alignItems: "center",
          }}
        >
          <FilterChip
            label={cityLabel}
            icon={MapPin}
            active={cityFilter !== "all"}
            onPress={() =>
              router.push({
                pathname: "/category/city-select",
                params: { cityId: cityFilter },
              } as never)
            }
          />
          {/* Чип «Услуга» только если есть L3-подкатегории. */}
          {services.length > 0 ? (
            <FilterChip
              label={l3Label}
              icon={ListChecks}
              active={!!l3Filter}
              onPress={() =>
                router.push({
                  pathname: "/category/l3-select",
                  params: { categoryId, l3Filter: l3Filter ?? "" },
                } as never)
              }
            />
          ) : null}
          <FilterChip
            label={sortLabel}
            // Иконка меняется с выбором сортировки — видно, что именно
            // активно (рейтинг / опыт / готовность).
            icon={sortBy === "experience" ? Briefcase : sortBy === "availability" ? Calendar : Star}
            active={sortBy !== "rating"}
            onPress={() =>
              router.push({
                pathname: "/category/sort-select",
                params: { sortBy },
              } as never)
            }
          />
        </ScrollView>

        {/* Без стекла край шапки нужно обозначить линией — иначе она сливается
            с содержимым под ней. Со стеклом линия лишняя: материал сам даёт
            край. */}
        {LIQUID_GLASS ? null : <View className="h-px bg-hairline" />}
      </GlassSurface>
    </View>
  );
}

/** Пустой экран категории. Он обязан отвечать на два разных вопроса: пусто
 *  из-за фильтра или в категории действительно никого нет — и в обоих случаях
 *  давать выход, а не заканчивать разговор. */
function EmptyCategory({
  hasFilters,
  categoryName,
  onReset,
  onCreateTask,
}: {
  hasFilters: boolean;
  categoryName: string;
  onReset: () => void;
  onCreateTask: () => void;
}) {
  const tc = useThemeColors(["accent", "on-accent"]);

  return (
    <View className="items-center px-8 pt-8">
      <View className="h-20 w-20 items-center justify-center rounded-full bg-accent-soft">
        <UsersThree size={36} weight="bold" color={tc.accent} />
      </View>
      <AppText weight="bold" className="mt-6 text-center text-display-sm text-ink">
        {hasFilters ? "Под фильтр никто не подошёл" : "Здесь пока никого нет"}
      </AppText>
      <AppText className="mt-2 text-center text-body-md text-body">
        {hasFilters
          ? "Снимите фильтры — возможно, подходящие люди есть в другом городе или по другой услуге."
          : `В категории «${categoryName}» ещё не зарегистрировались специалисты. Опишите задачу — она попадёт в общую ленту, и вам ответят.`}
      </AppText>
      {hasFilters ? (
        <Pressable
          accessibilityRole="button"
          onPress={onReset}
          className="mt-6 min-h-12 items-center justify-center rounded-pill border border-hairline-strong px-6 active:opacity-60"
        >
          <AppText weight="semibold" className="text-body-md text-ink">
            Сбросить фильтры
          </AppText>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={onCreateTask}
          className="mt-6 min-h-12 flex-row items-center gap-2 rounded-pill bg-accent px-6 active:opacity-85"
        >
          <AppText weight="semibold" className="text-body-md text-on-accent">
            Описать задачу
          </AppText>
          <ArrowRight size={18} weight="bold" color={tc["on-accent"]} />
        </Pressable>
      )}
    </View>
  );
}

// ----------------------------------------------------------------------------
// CategorySkeleton — цельный скелет экрана категории на время загрузки.
// Повторяет структуру: header (back + заголовок) → чипы → список мастеров.
// Показывается пока грузятся данные категории И мастера, потом весь контент
// появляется разом. Фидбэк владельца 2026-05-27 «всё должно загружаться
// равномерно, а не по кускам».
// ----------------------------------------------------------------------------

function CategorySkeleton({
  insets,
  goBack,
}: {
  insets: { top: number; bottom: number };
  goBack: () => void;
}) {
  const { ink } = useThemeColors(["ink"]);

  return (
    <View className="flex-1 bg-surface-page" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-2" style={{ height: NAV_BAR_HEIGHT }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={goBack}
          hitSlop={6}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-50"
        >
          <CaretLeft size={22} weight="bold" color={ink} />
        </Pressable>
      </View>

      {/* Скелет повторяет ту же структуру, что и готовый экран: строка
          фильтров, крупный заголовок, карточки. Иначе при появлении данных
          всё подпрыгивает. */}
      <View className="flex-row gap-2 px-4" style={{ height: FILTER_BAR_HEIGHT }}>
        <Skeleton width={132} height={40} style={{ borderRadius: 999, marginTop: 9 }} />
        <Skeleton width={112} height={40} style={{ borderRadius: 999, marginTop: 9 }} />
        <Skeleton width={128} height={40} style={{ borderRadius: 999, marginTop: 9 }} />
      </View>

      <View className="px-5 pt-3 pb-5">
        <Skeleton width={230} height={34} style={{ borderRadius: 8 }} />
        <View className="mt-2">
          <Skeleton width={120} height={18} style={{ borderRadius: 6 }} />
        </View>
      </View>

      {[0, 1, 2].map((i) => (
        <View
          key={i}
          className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4"
          style={CARD_SHADOW}
        >
          <View className="flex-row gap-3">
            <Skeleton circle size={56} />
            <View className="flex-1">
              <Skeleton height={20} width="58%" style={{ borderRadius: 6 }} />
              <View className="mt-2">
                <Skeleton height={16} width="42%" style={{ borderRadius: 5 }} />
              </View>
            </View>
          </View>
          <View className="mt-3">
            <Skeleton height={16} width="92%" style={{ borderRadius: 5 }} />
          </View>
          <View className="mt-1.5">
            <Skeleton height={16} width="70%" style={{ borderRadius: 5 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Кнопка фильтра в закреплённой строке.
 *
 *  Она лежит на стекле, поэтому у неё своя заливка: прозрачная кнопка на
 *  прозрачном материале не читается, а стекло на стекле Apple прямо не
 *  советует. Состояние «фильтр применён» показано фирменным цветом, а не
 *  чёрной заливкой — владелец уже говорил, что чёрные пилюли слишком громкие.
 *  Высота 44 — минимальная тач-цель; было 40. */
function FilterChip({
  label,
  icon: Icon,
  active,
  onPress,
}: {
  label: string;
  /** Иконка слева. Передаётся как компонент (`MapPin`, `Star` и т.п. из Phosphor). */
  icon?: import("@/types/icon").IconComponent;
  active: boolean;
  onPress: () => void;
}) {
  const tc = useThemeColors(["accent", "body"]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      className={`h-11 flex-row items-center gap-2 rounded-pill px-4 active:opacity-60 ${
        active ? "border border-accent bg-accent-soft" : "border border-hairline bg-canvas-soft"
      }`}
    >
      {Icon ? <Icon size={17} weight="bold" color={active ? tc.accent : tc.body} /> : null}
      <AppText
        weight="semibold"
        className={`text-body-md ${active ? "text-accent" : "text-body"}`}
        numberOfLines={1}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Карточка человека в категории.
 *
 *  Тот же язык, что у карточки задания: отдельный объект с мягкой тенью,
 *  жирное имя, одна строка фактов, ничего мельче 14 px. До 2026-09-04 это был
 *  ряд во всю ширину с разделителями и мета-строкой в 12 px — она читалась
 *  как таблица и не совпадала ни с одной другой карточкой приложения. */
function MasterRow({ master, onPress }: { master: MasterInCategory; onPress: () => void }) {
  const u = master.user;
  // Размер миниатюры портфолио подгоняется под ширину экрана, чтобы пять фото
  // всегда помещались в карточку: поля карточки (16+16) + её padding (16+16) +
  // четыре зазора по 6.
  const screenW = useAppWidth();
  const thumbSize = Math.min(72, Math.max(44, Math.floor((screenW - 64 - 24) / 5)));
  const tc = useThemeColors(["ink", "mute", "warning"]);
  // Telemetry: impression при появлении карточки в списке категории. RPC сам
  // дедупит за 24 ч, in-memory дедуп защищает от повторов в одной сессии.
  const recordView = useRecordMasterView();
  useEffect(() => {
    if (u?.id) recordView(u.id, "impression");
  }, [u?.id, recordView]);

  const profile = master.profile;
  const cityName = master.city?.name ?? null;
  const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || "Специалист";
  // Услуги — топ-3 по position: сколько человек берёт за работу. Если данных
  // нет, блок не рисуется, а не показывает пустоту.
  const { data: services } = useMasterServices(u.id);
  const topServices = (services ?? []).slice(0, 3);
  // Портфолио — первые пять работ прямо в списке, чтобы не заходить в профиль
  // ради «а что он умеет».
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

  const status = effectiveStatus(
    profile?.availability_status ?? null,
    profile?.availability_until ?? null,
  );
  const showStatus = isAvailabilityVisible(status);

  // Одна строка фактов вместо четырёх блоков с иконками по 12 px. Рейтинг из
  // неё вынесен направо — это единственное, что сравнивают между карточками.
  const facts = [
    cityName,
    experience !== null && experience > 0 ? `${pluralizeYears(experience)} опыта` : null,
    accountBadge,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fullName}
      className="mx-4 mb-3 rounded-2xl border border-hairline bg-surface-card p-4 active:opacity-90"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-center gap-3">
        <Avatar url={u.avatar_url} name={fullName} seed={u.id} size="md" />
        <View className="min-w-0 flex-1">
          <AppText weight="bold" className="text-title-lg text-ink" numberOfLines={1}>
            {fullName}
          </AppText>
          {facts.length > 0 ? (
            <AppText className="mt-0.5 text-body-sm text-mute" numberOfLines={1}>
              {facts.join(" · ")}
            </AppText>
          ) : null}
        </View>
        {/* Рейтинга нет — ничего не показываем. «Без отзывов» у новичка это
            приговор, которого данные не подтверждают. */}
        {rating !== null && ratingCount > 0 ? (
          <View className="flex-row items-center gap-1">
            <Star size={16} weight="fill" color={tc.warning} />
            <AppText weight="mono" className="text-mono-md text-ink">
              {rating.toFixed(1)}
            </AppText>
            <AppText weight="mono" className="text-mono-body text-mute">
              ({ratingCount})
            </AppText>
          </View>
        ) : null}
      </View>

      {showStatus ? (
        <View
          className="mt-3 flex-row items-center gap-2 self-start rounded-pill px-2.5 py-1"
          style={{ backgroundColor: `${AVAILABILITY_DOT[status]}22` }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: AVAILABILITY_DOT[status],
            }}
          />
          <AppText
            weight="semibold"
            className="text-body-sm"
            style={{ color: AVAILABILITY_DOT[status] }}
          >
            {AVAILABILITY_SHORT[status]}
          </AppText>
        </View>
      ) : null}

      {profile?.bio ? (
        <AppText className="mt-3 text-body-md text-body" numberOfLines={2}>
          {profile.bio}
        </AppText>
      ) : null}

      {/* Услуги с ценами. Формат считает formatServicePrice: «Договорная»,
          «X ₽ / час», «X ₽ · за работу», «X–Y ₽». */}
      {topServices.length > 0 ? (
        <View className="mt-3 gap-1.5">
          {topServices.map((service) => (
            <View key={service.id} className="flex-row items-center justify-between gap-3">
              <AppText className="min-w-0 flex-1 text-body-md text-body" numberOfLines={1}>
                {service.title}
              </AppText>
              <AppText weight="mono" className="text-mono-md text-ink">
                {formatServicePrice(service)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      {previewPhotos.length > 0 ? (
        <View className="mt-3 flex-row gap-1.5">
          {previewPhotos.map((photo, i) => {
            const isLastSlot = i === 4 && portfolioOverflow > 0;
            return (
              <View
                key={photo.id}
                style={{
                  width: thumbSize,
                  height: thumbSize,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
                className="bg-canvas-soft-2"
              >
                {/* Миниатюра намеренно низкого качества: список должен
                    появляться мгновенно, полные фото открываются в профиле. */}
                <Image
                  source={{ uri: cdnImage(photo.url, { width: thumbSize, dpr: 1, quality: 40 }) }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="cover"
                />
                {isLastSlot ? (
                  <View className="absolute inset-0 items-center justify-center bg-black/55">
                    <AppText weight="semibold" className="text-body-sm text-on-dark">
                      +{portfolioOverflow}
                    </AppText>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}
