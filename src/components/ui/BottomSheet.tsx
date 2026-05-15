/**
 * BottomSheet — модальное окно снизу. Используется для:
 *   - LoginWall (просит логин на действиях анону)
 *   - CitySelector (выбор города)
 *   - Filter / Sort menus
 *   - Подтверждение опасных действий (отменить заказ)
 *
 * Реализация:
 *   - `animationType="none"` на Modal + ручная split-анимация:
 *     - Backdrop: opacity 0→1 (fade) — иначе «затемнение едет снизу вместе
 *       с листом», что выглядит сломанно (фидбэк user 2026-05-14).
 *     - Sheet: translateY +SHEET_DROP→0 (slide-up).
 *   - При закрытии — reverse, потом setMounted(false), чтобы анимация
 *     выхода успела отыграть до unmount.
 *   - useNativeDriver=true — transform+opacity нативно работают (на web
 *     fallback на JS-driver автоматически).
 *
 * Использование:
 *   <BottomSheet open={open} onClose={() => setOpen(false)} title="Войдите чтобы продолжить">
 *     <AppText>Описание...</AppText>
 *     <Button onPress={...}>Войти по телефону</Button>
 *   </BottomSheet>
 *
 * Контент уже имеет horizontal padding 20 + bottom safe-area. Сверху — drag handle + title.
 */

import { X } from "lucide-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { useThemeColors } from "@/lib/use-theme-color";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Подзаголовок под title — описание контекста. */
  subtitle?: string;
  children: ReactNode;
  /** Закрывать ли по тапу на backdrop. Default true. Для критических → false. */
  dismissibleOnBackdrop?: boolean;
  /** Если true — лист занимает весь экран (full-screen modal). По умолчанию
   *  bottom-sheet с минимальной высотой по содержимому. Используется для
   *  селекторов с длинным списком, где нужно «на весь экран». */
  fullScreen?: boolean;
}

/** Стартовое смещение листа вниз (вне viewport). Достаточно для любого
 *  реалистичного контента action-sheet'а; если лист короче — slide-in
 *  отыграет за те же 220ms просто из дальней точки. */
const SHEET_DROP_PX = 600;
const OPEN_DURATION = 220;
const CLOSE_DURATION = 180;

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  dismissibleOnBackdrop = true,
  fullScreen = false,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["canvas", "ink", "body", "hairline-strong", "mute"]);

  // mounted остаётся true пока closing-анимация не завершится — чтобы лист
  // не пропадал мгновенно при open=false.
  const [mounted, setMounted] = useState(open);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(SHEET_DROP_PX)).current;

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: OPEN_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: OPEN_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: CLOSE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(sheetTranslateY, {
          toValue: SHEET_DROP_PX,
          duration: CLOSE_DURATION,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [open, mounted, backdropOpacity, sheetTranslateY]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — fade-in отдельно от sheet. Pressable снаружи Animated
          ловит тап на затемнённой области, чтобы закрыть лист. */}
      <Animated.View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          opacity: backdropOpacity,
          justifyContent: "flex-end",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
          onPress={dismissibleOnBackdrop ? onClose : undefined}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />
        {/* Сам лист — translateY slide-up. bg-canvas через className
            (NativeWind), не inline tc.canvas — потому что в RN-Web Modal
            рендерится в portal вне основного DOM-дерева, и CSS-vars для
            `rgb(var(--canvas))` теряются → лист становится прозрачным (баг
            user 2026-05-14). className сохраняет cascade. */}
        <Animated.View
          className="bg-canvas"
          style={{
            transform: [{ translateY: sheetTranslateY }],
            borderTopLeftRadius: fullScreen ? 0 : 16,
            borderTopRightRadius: fullScreen ? 0 : 16,
            paddingHorizontal: 20,
            paddingTop: insets.top + (fullScreen ? 16 : 12),
            paddingBottom: insets.bottom + 20,
            // На web даёт максимальную ширину 480px для desktop view.
            // На mobile native max-width не сработает.
            maxWidth: 480,
            width: "100%",
            alignSelf: "center",
            ...(fullScreen ? { flex: 1 } : {}),
          }}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: tc["hairline-strong"],
              marginBottom: title || subtitle ? 16 : 12,
            }}
          />

          {/* Header (title + close X) */}
          {title || subtitle ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
              <View style={{ flex: 1 }}>
                {title ? (
                  <AppText weight="semibold" style={{ color: tc.ink, fontSize: 18, lineHeight: 24 }}>
                    {title}
                  </AppText>
                ) : null}
                {subtitle ? (
                  <AppText style={{ color: tc.body, fontSize: 14, lineHeight: 20, marginTop: 4 }}>
                    {subtitle}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, marginTop: 2 })}
              >
                <X size={20} strokeWidth={1.75} color={tc.mute} />
              </Pressable>
            </View>
          ) : null}

          {children}
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
