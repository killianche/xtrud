/**
 * Полноэкранный просмотр фото — работы специалиста, фото задания.
 *
 * Переписан 2026-10-03 (владелец: «свайп очень странно работает: сам
 * переключает, плохо работает на свайп, на кнопки»). Раньше листание было
 * своим жестом (Gesture.Pan + Reanimated): картинка уезжала анимацией,
 * потом возвращалась на место и только затем менялся источник — фото
 * «прыгало» и будто листалось само; касания и стрелки конфликтовали с
 * жестом. Теперь — как в «Фото» iOS: горизонтальный список с постраничной
 * прокруткой (системная инерция и доводка до страницы), у каждой страницы
 * своё увеличение щипком — родной зум UIScrollView (только iOS; на Android
 * зума нет). Стрелки прокручивают список к соседнему фото, по кругу не
 * листается — как в «Фото». Своих жестов нет.
 *
 * Сохранено: чёрный фон, счётчик «3 / 4», крестик, стрелки, подпись, фото
 * зажато в телефонную колонку на вебе (useAppWidth).
 */

import { Image } from "expo-image";
import { CaretLeft, CaretRight, X } from "phosphor-react-native";
import { useRef } from "react";
import {
  FlatList,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { lightColors } from "@/lib/colors";
import { cdnBlur, cdnImage } from "@/lib/image-cdn";
import { useAppWidth } from "@/lib/use-app-width";

// Белый поверх чёрного фона лайтбокса (крестик/стрелки/счётчик) — токен
// on-dark, одинаковый в обеих темах.
const OVERLAY_WHITE = lightColors["on-dark"];

/**
 * Минимальная форма элемента для лайтбокса — только то, что он реально читает.
 * `PortfolioItem` (полная строка БД) структурно совместим; фото задания
 * (OrderPhotoCarousel) передают ту же форму.
 */
export type LightboxItem = { id: string; url: string; caption?: string | null };

const MAX_ZOOM = 4;

interface PortfolioLightboxProps {
  items: LightboxItem[];
  /** Индекс открытого фото; null = закрыт. */
  index: number | null;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

export function PortfolioLightbox({
  items,
  index,
  onClose,
  onChangeIndex,
}: PortfolioLightboxProps) {
  const visible = index !== null && index >= 0 && index < items.length;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {visible ? (
        <LightboxBody
          items={items}
          index={index as number}
          onClose={onClose}
          onChangeIndex={onChangeIndex}
        />
      ) : null}
    </Modal>
  );
}

function LightboxBody({
  items,
  index,
  onClose,
  onChangeIndex,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  // width зажат в телефонную колонку на вебе (Modal рендерится вне
  // PhoneFrame); height — реальная высота экрана.
  const { height } = useWindowDimensions();
  const width = useAppWidth();
  const reducedMotion = useReducedMotion();
  const listRef = useRef<FlatList<LightboxItem>>(null);
  const total = items.length;
  const canNav = total > 1;
  const item = items[index];

  // Текущая страница — и из пропса, и из последней прокрутки: стрелка,
  // нажатая во время свайпа, считает от того, что на экране (QA 2026-10-03).
  const current = useRef(index);
  current.current = index;

  // По кругу не листаем — как «Фото» iOS: со стрелки на последнем фото
  // список проезжал бы через все снимки к первому (QA 2026-10-03).
  const goTo = (next: number) => {
    if (next < 0 || next >= total) return;
    current.current = next;
    listRef.current?.scrollToIndex({ index: next, animated: !reducedMotion });
    onChangeIndex(next);
  };

  // Страница досчитана после окончания прокрутки — источник правды для
  // счётчика; программная прокрутка стрелками уже выставила тот же индекс.
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / width);
    if (page < 0 || page >= total) return;
    current.current = page;
    if (page !== index) onChangeIndex(page);
  };

  return (
    <View className="flex-1 items-center bg-black">
      <View style={{ flex: 1, width }}>
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(p) => p.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={onMomentumEnd}
          // Только соседние страницы держим отрисованными — фото тяжёлые.
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          renderItem={({ item: photo }) => <ZoomPage photo={photo} width={width} height={height} />}
        />

        {/* Счётчик и крестик */}
        <View
          className="absolute top-0 right-0 left-0 flex-row items-center justify-between px-4"
          style={{ paddingTop: insets.top + 8 }}
          pointerEvents="box-none"
        >
          <View className="rounded-full bg-black/40 px-3 py-1">
            <AppText
              weight="medium"
              className="text-caption text-on-dark"
              accessibilityLabel={`Фото ${index + 1} из ${total}`}
            >
              {index + 1} / {total}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
            onPress={onClose}
            hitSlop={12}
            className="h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
          >
            <X size={22} weight="bold" color={OVERLAY_WHITE} />
          </Pressable>
        </View>

        {/* Стрелки — прокручивают список к соседнему фото */}
        {canNav && index > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Предыдущее фото"
            onPress={() => goTo(current.current - 1)}
            hitSlop={12}
            className="absolute top-1/2 left-3 h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
            style={{ transform: [{ translateY: -22 }] }}
          >
            <CaretLeft size={26} weight="bold" color={OVERLAY_WHITE} />
          </Pressable>
        ) : null}
        {canNav && index < total - 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Следующее фото"
            onPress={() => goTo(current.current + 1)}
            hitSlop={12}
            className="absolute top-1/2 right-3 h-11 w-11 items-center justify-center rounded-full bg-black/40 active:opacity-70"
            style={{ transform: [{ translateY: -22 }] }}
          >
            <CaretRight size={26} weight="bold" color={OVERLAY_WHITE} />
          </Pressable>
        ) : null}

        {/* Подпись */}
        {item?.caption ? (
          <View
            className="absolute right-0 bottom-0 left-0 bg-black/55 px-6 py-4"
            style={{ paddingBottom: insets.bottom + 16 }}
            pointerEvents="box-none"
          >
            <AppText className="text-body-sm text-on-dark">{item.caption}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Одна страница: на iOS — родной зум щипком (UIScrollView), иначе — фото. */
function ZoomPage({
  photo,
  width,
  height,
}: {
  photo: LightboxItem;
  width: number;
  height: number;
}) {
  const image = (
    <Image
      source={{ uri: cdnImage(photo.url, { width: Math.round(width), quality: 80 }) }}
      placeholder={cdnBlur(photo.url) ? { uri: cdnBlur(photo.url) } : undefined}
      placeholderContentFit="contain"
      style={{ width, height }}
      contentFit="contain"
      transition={150}
      cachePolicy="memory-disk"
      accessibilityLabel={photo.caption ?? "Фото"}
    />
  );
  if (Platform.OS !== "ios") return <View style={{ width, height }}>{image}</View>;
  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={{ width, height }}
      maximumZoomScale={MAX_ZOOM}
      minimumZoomScale={1}
      bouncesZoom
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {image}
    </ScrollView>
  );
}
