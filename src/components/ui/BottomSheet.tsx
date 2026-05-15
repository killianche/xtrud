/**
 * BottomSheet — полноэкранная модалка для любых вложенных flow'ов (фильтры,
 * выбор города, JIT-signup, action menu, подтверждения).
 *
 * Историческое название «BottomSheet» сохранено (много импортов), но
 * **поведение теперь всегда full-screen** — никаких bottom-anchored листов.
 * По фидбэку user 2026-05-15: «откажемся полностью от щитов, всё всплывает
 * на полный экран — как Фильтры».
 *
 * Что внутри:
 *   - Полностью покрывает viewport (включая статус-бар через insets.top).
 *   - Сверху — `ScreenHeader`-style строка: back-кнопка `←` слева,
 *     опц. title по центру (semibold), пустое место справа для будущих
 *     action'ов.
 *   - Slide-in анимация снизу — мягкий «push» как в нативном стеке.
 *
 * Использование:
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="Действия">
 *     <ActionItem .../>
 *   </BottomSheet>
 *
 * Контент уже имеет horizontal padding 20 + bottom safe-area.
 *
 * Контракт `fullScreen` prop **deprecated** — игнорируется. Оставлен в
 * сигнатуре для обратной совместимости с consumers (LocationSheet,
 * LocationFilterSheet и т.п.), удалить можно после очистки.
 */

import { CaretLeft } from "phosphor-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { darkColors, lightColors } from "@/lib/colors";
import { useThemeColors } from "@/lib/use-theme-color";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Подзаголовок под title — описание контекста. */
  subtitle?: string;
  children: ReactNode;
  /** Закрывать ли по тапу на backdrop. Сохранён для API-совместимости,
   *  но в full-screen режиме backdrop'а нет — параметр игнорируется. */
  dismissibleOnBackdrop?: boolean;
  /** @deprecated — поведение всегда full-screen, prop игнорируется. */
  fullScreen?: boolean;
}

/** Сдвиг для slide-in анимации. Достаточно для любого высокого контента. */
const SHEET_DROP_PX = 600;
const OPEN_DURATION = 240;
const CLOSE_DURATION = 200;

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["canvas", "ink", "body"]);
  // CSS-vars `rgb(var(--X))` теряются в portal'е react-native-web Modal
  // (Modal рендерится вне основного DOM-дерева). Резолвим ВСЕ нужные цвета
  // вручную из палитры — иначе title и текст невидимы на canvas-фоне.
  const { colorScheme } = useColorScheme();
  const isWeb = Platform.OS === "web";
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const sheetBgColor = isWeb ? palette.canvas : tc.canvas;
  const sheetInkColor = isWeb ? palette.ink : tc.ink;
  const sheetBodyColor = isWeb ? palette.body : tc.body;

  const [mounted, setMounted] = useState(open);
  const sheetTranslateY = useRef(new Animated.Value(SHEET_DROP_PX)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(sheetTranslateY, {
        toValue: 0,
        duration: OPEN_DURATION,
        useNativeDriver: true,
      }).start();
    } else if (mounted) {
      Animated.timing(sheetTranslateY, {
        toValue: SHEET_DROP_PX,
        duration: CLOSE_DURATION,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, mounted, sheetTranslateY]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Full-screen контейнер. Без backdrop'а — лист сам занимает viewport. */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: sheetBgColor,
          transform: [{ translateY: sheetTranslateY }],
        }}
      >
        {/* Header — 1:1 ScreenHeader: height 64, gap-2, px-3, h-12 w-12 back
            (CaretLeft 28 strokeWidth 2.25), display-md title (24px, 700).
            Цвета inline-styled (резолвленные hex), а не CSS-vars — иначе
            теряются в portal Modal. */}
        <View
          style={{
            paddingTop: insets.top,
          }}
        >
          <View
            style={{
              height: 64,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Назад"
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => ({
                opacity: pressed ? 0.5 : 1,
                width: 48,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 24,
              })}
            >
              <CaretLeft size={28} weight="fill" color={sheetInkColor} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              {title ? (
                <AppText
                  weight="display"
                  numberOfLines={1}
                  style={{
                    color: sheetInkColor,
                    fontSize: 24,
                    lineHeight: 30,
                    letterSpacing: -0.5,
                  }}
                >
                  {title}
                </AppText>
              ) : null}
              {subtitle ? (
                <AppText
                  numberOfLines={1}
                  style={{
                    color: sheetBodyColor,
                    fontSize: 13,
                    lineHeight: 18,
                    marginTop: 2,
                  }}
                >
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          </View>
        </View>

        {/* Контент: без default-padding, чтобы row-items могли быть full-bleed
            (как PickerSheet). Если consumer хочет padding — обернёт сам. */}
        <View
          style={{
            flex: 1,
            paddingBottom: insets.bottom + 20,
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}
