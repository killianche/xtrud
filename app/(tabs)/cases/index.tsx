/**
 * /cases — вкладка мастера в нижнем меню «Ваши работы».
 *
 * Редизайн 2026-05-24 (фидбэк владельца: «создавать работу и добавлять фото в
 * минимум нажатий, быстро редактировать, показ компактный/минималистичный»).
 *
 * Что изменилось против прежней версии:
 *   1. «Фото вперёд» — 1 нажатие. Кнопка «+» (и большой CTA в пустом состоянии)
 *      сразу открывают мульти-выбор фото. Выбрал фото → создаём кейс с
 *      названием по умолчанию «Без имени» (title непустой — хук это требует;
 *      мастер переименует на детальной через карандаш) → грузим выбранные фото
 *      в новый кейс. Отмена выбора → кейс НЕ создаём
 *      (никаких пустых работ). Прежний CreateCaseSheet (название ПЕРЕД фото)
 *      убран из основного потока — имя теперь редактируется потом на детальной
 *      странице.
 *   2. Компактная сетка 2-в-ряд (вместо больших full-width карточек по одной).
 *      Обложка 4:5, маленькая подпись = название/дата, бейдж «+N» если фото >1.
 *      Плитка «+ Добавить фото» прямо на обложке существующей работы (пункт 5):
 *      докинуть фото не заходя внутрь.
 *
 * Lazyweb-референсы (2026-05-24): Google Photos / Apple Journal «Select photos»
 * + multi-select → одна кнопка добавляет много (photo-first). Canva / Glass /
 * Pixelcut — плотный thumbnail-grid 2-col + floating «+» для докидывания в
 * коллекцию без захода внутрь.
 *
 * Скрыт у клиента через href: null в (tabs)/_layout.tsx (active_role !== "master").
 * Детальный экран работы — /cases/[caseId] в root details Stack; back ведёт
 * в список, а TabBar на details скрыт. Legacy-роут
 * /profile/portfolio (старый список) оставлен как есть.
 *
 * Бизнес-логику не трогаем: авто-создание кейса при завершении заказа (DB
 * trigger), публичный показ портфолио на master/[id] (PortfolioGrid).
 */

import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ImageSquare, Plus, SignIn } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { ScreenHeader } from "@/components/ui";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useAddPortfolioItem } from "@/features/profile/use-my-portfolio";
import {
  type CaseWithPreview,
  useCreateCase,
  useMasterCases,
} from "@/features/profile/use-portfolio-cases";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { type PickedImage, pickMultipleImages, uploadPortfolioBatch } from "@/lib/image-upload";
import { useTabBarSpace } from "@/lib/tab-bar-space";
import { useAppWidth } from "@/lib/use-app-width";
import { useThemeColors } from "@/lib/use-theme-color";

// Белый поверх тёмного overlay на обложке — фиксированная константа, не токен
// (правило §B: для текста/иконок поверх фото заводим КОНСТАНТУ, не inline-hex
// в каждом месте). Тут белый одинаков в обеих темах — это слой над фото.
const OVERLAY_WHITE = "#ffffff";

/** Название новой работы по умолчанию (фидбэк владельца 2026-05-24: ставить
 *  «Без имени», а не «Работа · дата»). Хук useCreateCase требует непустой
 *  title — мастер переименует его на детальной странице через карандаш. */
const DEFAULT_CASE_TITLE = "Без имени";

export default function CasesScreen() {
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const router = useRouter();
  const { session } = useAuthSession();
  const userId = session?.user?.id ?? null;
  const tc = useThemeColors(["muted-soft", "on-primary", "ink"]);

  const { data: cases = [], isLoading } = useMasterCases(userId);
  const createCase = useCreateCase(userId);
  const addItem = useAddPortfolioItem(userId);

  // Глобальный busy-стейт для «фото вперёд» — пока идёт создание+загрузка,
  // блокируем повторные тапы и показываем прогресс на sticky-кнопке.
  const [creating, setCreating] = useState<{ done: number; total: number } | null>(null);
  // id кейса в который сейчас докидываем фото с обложки (для спиннера на плитке).
  const [addingToCaseId, setAddingToCaseId] = useState<string | null>(null);

  // Гость (нет userId) — нормальный empty state с CTA, не голая надпись.
  // /cases — вкладка мастера (`href: null` для не-мастеров в _layout), но через
  // прямую ссылку анон сюда может попасть. Раньше показывалась серая фраза
  // «Войдите в аккаунт.» без кнопки — нарушение Apple HIG (см. аудит 2026-05-26
  // блокер #4) и тупик для пользователя. Теперь — title + hint + primary CTA.
  if (!userId) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ScreenHeader title="Ваши работы" />
        <View className="flex-1 items-center justify-center px-6">
          <ImageSquare size={48} weight="regular" color={tc["muted-soft"]} />
          <AppText weight="semibold" className="mt-4 text-title-md text-ink text-center">
            Войдите в аккаунт
          </AppText>
          <AppText className="mt-2 text-body-sm text-mute text-center">
            «Ваши работы» — портфолио мастера. Войдите по телефону, чтобы добавить фото своих работ
            и привлечь клиентов.
          </AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Войти по телефону"
            onPress={() => router.push("/(auth)/phone" as never)}
            className="mt-6 flex-row items-center justify-center gap-2 min-h-12 px-6 rounded-md bg-primary active:opacity-80"
          >
            <SignIn size={18} weight="bold" color={tc["on-primary"]} />
            <AppText weight="semibold" className="text-button-lg text-on-primary">
              Войти по телефону
            </AppText>
          </Pressable>
        </View>
      </View>
    );
  }

  /** Привязывает уже загруженные фото к кейсу (последовательно, чтобы
   *  sort_order шёл предсказуемо). Возвращает число неудач. */
  async function attachUploaded(
    caseId: string,
    results: Awaited<ReturnType<typeof uploadPortfolioBatch>>,
  ): Promise<number> {
    let failed = 0;
    for (const r of results) {
      if (!r.ok) {
        failed++;
        continue;
      }
      try {
        await addItem.mutateAsync({
          url: r.publicUrl,
          storagePath: r.path,
          caseId,
        });
      } catch {
        failed++;
      }
    }
    return failed;
  }

  /** Главный «фото вперёд» поток: выбор фото → создание кейса → загрузка. */
  const handleCreateWithPhotos = async () => {
    if (!userId || creating) return;
    let picked: PickedImage[] = [];
    try {
      picked = await pickMultipleImages(50);
    } catch {
      picked = [];
    }
    // Отмена выбора — НЕ создаём пустой кейс.
    if (picked.length === 0) return;

    setCreating({ done: 0, total: picked.length });
    try {
      const created = await createCase.mutateAsync({
        title: DEFAULT_CASE_TITLE,
        description: null,
        workDoneAt: null,
      });
      const results = await uploadPortfolioBatch(userId, picked, {
        concurrency: 3,
        onProgress: (done, total) => setCreating({ done, total }),
      });
      const failed = await attachUploaded(created.id, results);
      setCreating(null);
      if (failed > 0) {
        Alert.alert(
          "Часть фото не загрузилась",
          `Не удалось: ${failed}. Откройте работу и добавьте ещё раз.`,
        );
      }
      // Открываем созданную работу — мастер сразу видит результат и может
      // переименовать / добавить ещё. Роут ВНУТРИ вкладки cases → активной
      // остаётся «Ваши работы», back вернёт в список.
      router.push(`/cases/${created.id}` as never);
    } catch (e) {
      setCreating(null);
      Alert.alert(
        "Не удалось создать работу",
        e instanceof Error ? e.message : "Неизвестная ошибка",
      );
    }
  };

  /** Докинуть фото в существующую работу прямо с обложки (пункт 5). */
  const handleAddToCase = async (caseId: string) => {
    if (!userId || addingToCaseId) return;
    let picked: PickedImage[] = [];
    try {
      picked = await pickMultipleImages(50);
    } catch {
      picked = [];
    }
    if (picked.length === 0) return;

    setAddingToCaseId(caseId);
    try {
      const results = await uploadPortfolioBatch(userId, picked, {
        concurrency: 3,
      });
      const failed = await attachUploaded(caseId, results);
      if (failed > 0) {
        Alert.alert("Часть фото не загрузилась", `Не удалось: ${failed}. Попробуйте ещё раз.`);
      }
    } finally {
      setAddingToCaseId(null);
    }
  };

  const hasCases = cases.length > 0;

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScreenHeader title="Ваши работы" />

      <FlashList
        style={{ flex: 1 }}
        data={hasCases ? cases : []}
        numColumns={2}
        keyExtractor={(c) => c.id}
        extraData={addingToCaseId}
        contentContainerStyle={{
          // Плитка сама даёт горизонтальный gutter (см. CasesTile) — контейнер
          // компенсирует внешние 16px через CASES_CONTAINER_PADDING.
          paddingHorizontal: CASES_CONTAINER_PADDING,
          paddingTop: 16,
          paddingBottom: tabBarSpace,
        }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CaseTile
            caseItem={item}
            adding={addingToCaseId === item.id}
            onPress={() => router.push(`/cases/${item.id}` as never)}
            onAddPhoto={() => handleAddToCase(item.id)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <CasesGridSkeleton />
          ) : (
            <CasesEmptyState
              onStart={handleCreateWithPhotos}
              busy={!!creating}
              mutedColor={tc["muted-soft"]}
              onPrimaryColor={tc["on-primary"]}
            />
          )
        }
      />

      {/* Sticky bottom CTA — «Добавить работу». Один тап = выбор фото → новая
          работа. Во время создания/загрузки показываем прогресс. */}
      {hasCases ? (
        <View
          className="absolute left-0 right-0 bg-canvas border-t border-hairline px-5 pt-3"
          style={{ bottom: 0, paddingBottom: insets.bottom + 12 }}
        >
          {creating ? (
            <View className="items-center py-2">
              <AppText weight="semibold" className="text-body-md text-ink">
                Загружаем {creating.done} / {creating.total}…
              </AppText>
              <View className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft-2">
                <View
                  className="h-full bg-ink"
                  style={{
                    width: `${Math.round((creating.done / Math.max(1, creating.total)) * 100)}%`,
                  }}
                />
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Добавить работу"
              onPress={handleCreateWithPhotos}
              className="flex-row items-center justify-center gap-2 min-h-12 rounded-md bg-primary active:opacity-80"
            >
              <Plus size={20} weight="bold" color={tc["on-primary"]} />
              <AppText weight="semibold" className="text-button-lg text-on-primary">
                Добавить работу
              </AppText>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

// ============================================================================
// Сетка обложек 2-в-ряд — раскладка отдана FlashList (numColumns=2 в
// CasesScreen), здесь остаются только константы и сама плитка (CaseTile).
// ============================================================================

const GRID_GUTTER = 12;
const SCREEN_PADDING = 16;
// Виртуализация (2026-08-30): CasesGrid (общий flex-wrap контейнер) удалён —
// плитки теперь renderItem FlashList с numColumns=2, колонку считает сам
// FlashList. Контейнер даёт компенсацию под собственный gutter плитки
// (см. CasesTile) — CASES_CONTAINER_PADDING.
const CASES_CONTAINER_PADDING = SCREEN_PADDING - GRID_GUTTER / 2;

// Запас на дробное округление ширины на web: используется только в
// CasesGridSkeleton (плейсхолдер из фиксированных 4 плиток — обычный
// flex-wrap, не FlashList). Реальная колонка под горизонтальным padding
// оказывается ~446 у useAppWidth ~480 (≈2px «теряются» на рамке PhoneFrame).
// Без запаса две плитки встают ровно по краю контейнера и flex-wrap переносит
// вторую в новый столбец (баг 2026-05-24). 3px на плитку — гарантирует 2 в
// ряд и на web, и на нативе.
const WIDTH_SAFETY = 3;

/** Ширина плитки для надёжной 2-колоночной сетки (skeleton) и CDN-хинта
 *  размера фото в реальной плитке (см. CaseTile). */
function twoColTileWidth(screenW: number): number {
  return Math.max(120, Math.floor((screenW - SCREEN_PADDING * 2 - GRID_GUTTER) / 2) - WIDTH_SAFETY);
}

// ============================================================================
// CaseTile — одна плитка работы: обложка 4:5 + подпись под ней.
//
// Ширину колонки в FlashList-сетке (numColumns=2) считает сам FlashList —
// плитка не задаёт себе width, обложка держит пропорцию через aspectRatio
// вместо фиксированного px-height (twoColTileWidth используется только как
// хинт размера для CDN-ресайза фото, не для layout).
// ============================================================================

function CaseTile({
  caseItem,
  adding,
  onPress,
  onAddPhoto,
}: {
  caseItem: CaseWithPreview;
  adding: boolean;
  onPress: () => void;
  onAddPhoto: () => void;
}) {
  const tc = useThemeColors(["muted-soft", "ink"]);
  const screenW = useAppWidth();
  const cdnWidth = twoColTileWidth(screenW);

  const hero = caseItem.preview_items[0] ?? null;
  const photoCount = caseItem.items_count;
  const [failed, setFailed] = useState(false);

  const label = caseItem.title;
  const dateLabel = caseItem.work_done_at
    ? new Date(caseItem.work_done_at).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="active:opacity-90"
      style={{ paddingHorizontal: GRID_GUTTER / 2, paddingBottom: GRID_GUTTER }}
    >
      {/* Обложка — 4:5 (вертикальная), пропорция вместо фикс. px-height. */}
      <View
        className="overflow-hidden rounded-lg bg-canvas-soft-2"
        style={{ width: "100%", aspectRatio: 0.8, position: "relative" }}
      >
        {hero && !failed ? (
          <Image
            source={{ uri: cdnImage(hero.url, { width: cdnWidth }) }}
            placeholder={cdnBlur(hero.url) ? { uri: cdnBlur(hero.url) } : undefined}
            placeholderContentFit="cover"
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={200}
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
          />
        ) : (
          // Работа без фото (создана авто-триггером при завершении заказа) —
          // dashed-placeholder, тап по «+» добавит фото.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Добавить фото"
            onPress={onAddPhoto}
            disabled={adding}
            className="flex-1 items-center justify-center border-2 border-dashed border-hairline rounded-lg active:opacity-70"
          >
            <ImageSquare size={26} weight="bold" color={tc["muted-soft"]} />
            <AppText weight="medium" className="mt-1.5 text-caption text-mute">
              {adding ? "Загружаем…" : "Добавить фото"}
            </AppText>
          </Pressable>
        )}

        {/* Бейдж «+N» в углу — если фото больше одного. */}
        {hero && photoCount > 1 ? (
          <View className="absolute top-2 left-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-0.5">
            <ImageSquare size={12} weight="fill" color={OVERLAY_WHITE} />
            <AppText weight="mono" className="text-mono-caption" style={{ color: OVERLAY_WHITE }}>
              {photoCount}
            </AppText>
          </View>
        ) : null}

        {/* Кнопка «+» докинуть фото — поверх обложки (только когда есть фото;
            при пустой обложке весь блок и так кликабелен под добавление). */}
        {hero ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Добавить фото в работу"
            onPress={onAddPhoto}
            disabled={adding}
            hitSlop={6}
            className="absolute bottom-2 right-2 h-9 w-9 items-center justify-center rounded-full bg-black/55 active:opacity-70"
          >
            <Plus size={18} weight="bold" color={OVERLAY_WHITE} />
          </Pressable>
        ) : null}
      </View>

      {/* Подпись под обложкой — название + дата (компактно). */}
      <View className="mt-2 px-0.5">
        <AppText weight="semibold" className="text-body-sm text-ink" numberOfLines={1}>
          {label}
        </AppText>
        {dateLabel ? (
          <AppText weight="mono" className="mt-0.5 text-mono-caption text-mute">
            {dateLabel}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

// ============================================================================
// CasesGridSkeleton — загрузочный плейсхолдер сетки (а не голый спиннер).
// ============================================================================

function CasesGridSkeleton() {
  const screenW = useAppWidth();
  const tileW = twoColTileWidth(screenW);
  const coverH = Math.round(tileW * 1.25);
  return (
    // ListEmptyComponent рендерится внутри того же contentContainerStyle, что
    // и реальные плитки (paddingHorizontal: CASES_CONTAINER_PADDING = 10, а не
    // 16) — компенсируем разницу (+6), чтобы плейсхолдер стоял вровень с
    // исходным SCREEN_PADDING.
    <View
      className="flex-row flex-wrap"
      style={{ gap: GRID_GUTTER, marginHorizontal: SCREEN_PADDING - CASES_CONTAINER_PADDING }}
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <View
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton position
          key={i}
          style={{ width: tileW }}
        >
          <View className="rounded-lg bg-canvas-soft-2" style={{ width: tileW, height: coverH }} />
          <View className="mt-2 h-3.5 w-3/4 rounded-md bg-canvas-soft-2" />
        </View>
      ))}
    </View>
  );
}

// ============================================================================
// CasesEmptyState — пустое состояние с большим CTA «фото вперёд».
// ============================================================================

function CasesEmptyState({
  onStart,
  busy,
  mutedColor,
  onPrimaryColor,
}: {
  onStart: () => void;
  busy: boolean;
  mutedColor: string;
  onPrimaryColor: string;
}) {
  return (
    // Та же компенсация контейнерного паддинга, что и в CasesGridSkeleton
    // (см. её комментарий) — держит исходный SCREEN_PADDING вокруг CTA.
    <View
      className="items-center justify-center py-20 px-6"
      style={{ marginHorizontal: SCREEN_PADDING - CASES_CONTAINER_PADDING }}
    >
      <ImageSquare size={48} weight="regular" color={mutedColor} />
      <AppText weight="semibold" className="mt-4 text-title-md text-ink text-center">
        Покажите ваши работы
      </AppText>
      <AppText className="mt-2 text-body-sm text-mute text-center">
        Добавьте фото — клиенты доверяют мастерам с портфолио в разы чаще.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Добавить фото"
        onPress={onStart}
        disabled={busy}
        className="mt-6 flex-row items-center justify-center gap-2 min-h-12 px-6 rounded-md bg-primary active:opacity-80"
      >
        <Plus size={20} weight="bold" color={onPrimaryColor} />
        <AppText weight="semibold" className="text-button-lg text-on-primary">
          {busy ? "Загружаем…" : "Добавить фото"}
        </AppText>
      </Pressable>
    </View>
  );
}
