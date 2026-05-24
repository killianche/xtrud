/**
 * AppDrawer — slide-out side menu для главной клиента (вызывается из бургер-
 * кнопки в шапке HomeTab).
 *
 * Поведение:
 *   - Modal-overlay на весь экран. Слева выезжает панель шириной ~82% (но
 *     не больше 340px чтобы не растягиваться на iPad / desktop-web), фон —
 *     bg-canvas с border-r hairline для отделения от затемнённого фона.
 *   - Затемнение справа: чёрная плёнка opacity 0→0.4 (анимация синхронно
 *     с translateX).
 *   - Открывается за 240ms ease-out, закрывается за 200ms.
 *   - Закрытие: тап на overlay / тап на любой menu-item (после router.push) /
 *     swipe drawer влево (PanResponder).
 *
 * Содержимое (фикс. структура):
 *   1) Header: avatar 48 + greeting «Привет, {имя}» + handle (телефон или
 *      «Гость»). На анон-пользователе — кнопка «Войти».
 *   2) Hairline.
 *   3) 4 menu-row: Профиль / Создать заказ / Мои заказы / Смотреть заказы.
 *   4) Footer: hairline + «xtrud · v{appVersion}» mini-caption.
 *
 * Lazyweb-референсы (2026-05-20):
 *   - LinkedIn / Bluesky / VSCO / FT — slide-out drawer с profile-header
 *     сверху и list-rows ниже.
 *   - Dominos / onX-Hunt — структура «greeting + primary actions + secondary
 *     section», но без upsell-карточек (не нужны в xtrud).
 *
 * Драйвер анимации: Animated API + PanResponder (RN-builtin). Без
 * react-native-reanimated, чтобы не тянуть GestureHandlerRootView в корень
 * приложения только ради swipe-close drawer'а.
 *
 * Дизайн-правила (см. .claude/rules/design-quality.md):
 *   - Без subtitle под H1 (правило §G) — нет «подсказывающего» текста.
 *   - Только Phosphor (§D).
 *   - Все цвета через токены useThemeColors (§B).
 *   - Минимум 12px (§C).
 *   - Все onPress'ы делают реальный router.push (§F), пустых нет.
 */

import { useRouter } from "expo-router";
import {
  CaretRight,
  ClipboardText,
  MagnifyingGlass,
  Plus,
  SignIn,
  UserCircle,
  X,
} from "phosphor-react-native";
import { type ReactNode, useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/ui";
import { useAppWidth } from "@/lib/use-app-width";
import { useColorScheme, useDomColorScheme } from "@/hooks/use-color-scheme";
import { darkColors, lightColors } from "@/lib/colors";
import { useThemeColors } from "@/lib/use-theme-color";
import type { IconComponent } from "@/types/icon";

const OPEN_DURATION = 240;
const CLOSE_DURATION = 200;
const MAX_WIDTH = 340;
const WIDTH_RATIO = 0.82;

interface AppDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Имя пользователя (first_name). null = аноним. */
  userName: string | null;
  /** Телефон или handle для подписи под именем. null = не показывать. */
  userHandle?: string | null;
  /** Avatar URL. Если null — Avatar fallback на инициалы. */
  avatarUrl: string | null;
  /** Залогинен ли пользователь — определяет «Войти» vs profile-header. */
  isAuthenticated: boolean;
  /** Версия приложения для footer'а (опц.). */
  appVersion?: string;
}

export function AppDrawer({
  open,
  onClose,
  userName,
  userHandle,
  avatarUrl,
  isAuthenticated,
  appVersion,
}: AppDrawerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewportWidth = useAppWidth();
  const tc = useThemeColors(["ink", "muted", "canvas", "hairline"]);
  // На web в react-native-web Modal портал часто оказывается ВНЕ корневого
  // <html> с классом `dark` — CSS-vars (rgb(var(--canvas))) у детей могут
  // резолвиться по светлой палитре, а inline-цвета (через useThemeColors)
  // на web возвращают CSS-var строку, которая тоже резолвится по корню.
  // Чтобы гарантировать соответствие, делаем как в BottomSheet:
  //   1) резолвим палитру вручную через `useDomColorScheme()` на web,
  //   2) прокидываем `dark` className на корневую обёртку Modal, чтобы
  //      все дочерние NativeWind-классы внутри drawer'а резолвили vars
  //      через `.dark` селектор.
  // User feedback (BottomSheet 2026-05-16/19) — этот фикс уже отработан.
  const isWeb = Platform.OS === "web";
  const domScheme = useDomColorScheme();
  const { colorScheme: nativeScheme } = useColorScheme();
  const colorScheme = isWeb ? domScheme : nativeScheme;
  const palette = colorScheme === "dark" ? darkColors : lightColors;
  const panelBg = isWeb ? palette.canvas : tc.canvas;
  const panelBorder = isWeb ? palette.hairline : tc.hairline;
  const inkColor = isWeb ? palette.ink : tc.ink;
  const muteColor = isWeb ? palette.muted : tc.muted;
  const canvasColor = isWeb ? palette.canvas : tc.canvas;

  const drawerWidth = Math.min(viewportWidth * WIDTH_RATIO, MAX_WIDTH);

  // Animated values — translateX от -drawerWidth до 0, overlay opacity от 0 до 1.
  const translateX = useRef(new Animated.Value(-drawerWidth)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  // mounted = true пока модалка реально на экране. Закрытие сначала анимирует,
  // потом снимает Modal — иначе видно мгновенный «прыжок».
  const mountedRef = useRef(open);

  useEffect(() => {
    if (open) {
      mountedRef.current = true;
      // На каждом открытии заново стартуем из -drawerWidth (на случай если
      // viewport меняется при rotate).
      translateX.setValue(-drawerWidth);
      overlayOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: OPEN_DURATION,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: OPEN_DURATION,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    } else if (mountedRef.current) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -drawerWidth,
          duration: CLOSE_DURATION,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: CLOSE_DURATION,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
  }, [open, drawerWidth, translateX, overlayOpacity]);

  // PanResponder — swipe drawer влево чтобы закрыть. Срабатывает только если
  // горизонтальный жест значимо больше вертикального (избегаем конфликта со
  // scroll'ом внутри drawer'а).
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) =>
        Math.abs(gs.dx) > 10 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_e, gs) => {
        // dx < 0 — палец движется влево. Двигаем drawer вместе с пальцем,
        // ограничивая на [-drawerWidth, 0].
        const clamped = Math.max(-drawerWidth, Math.min(0, gs.dx));
        translateX.setValue(clamped);
        // overlay тоже фейдится — чем дальше уехал, тем прозрачнее.
        const progress = 1 + clamped / drawerWidth;
        overlayOpacity.setValue(progress);
      },
      onPanResponderRelease: (_e, gs) => {
        // Если уехал больше чем на 40% или быстро смахнули влево — закрываем.
        if (gs.dx < -drawerWidth * 0.4 || gs.vx < -0.5) {
          onClose();
        } else {
          // Возвращаем на место.
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: 0,
              duration: 160,
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(overlayOpacity, {
              toValue: 1,
              duration: 160,
              useNativeDriver: Platform.OS !== "web",
            }),
          ]).start();
        }
      },
    }),
  ).current;

  const handlePush = (path: string) => {
    onClose();
    // Маленькая задержка чтобы close-анимация успела стартануть до transition'а
    // на новый экран (иначе на web виден «перескок» drawer'а).
    setTimeout(() => router.push(path as never), 80);
  };

  const greetingName = userName?.trim() || "Гость";

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Затемнённая плёнка — clickable для закрытия.
          `dark` className на корне — фикс react-native-web Modal portal
          (см. длинный комментарий выше). */}
      <View className={colorScheme === "dark" ? "dark" : ""} style={{ flex: 1 }}>
        <Animated.View
          style={{
            ...StyleSheetAbsoluteFill,
            backgroundColor: "rgba(0,0,0,0.4)",
            opacity: overlayOpacity,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрыть меню"
            onPress={onClose}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* Drawer panel — slide from left. */}
        <Animated.View
          {...panResponder.panHandlers}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            width: drawerWidth,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
            transform: [{ translateX }],
            // backgroundColor / borderRight через resolved tokens —
            // NativeWind не докатывает на Animated.View в react-native-web.
            backgroundColor: panelBg,
            borderRightWidth: 1,
            borderRightColor: panelBorder,
            // Лёгкая тень в правый край drawer'а — отделяет от затемнения.
            shadowColor: "#000",
            shadowOffset: { width: 2, height: 0 },
            shadowOpacity: 0.08,
            shadowRadius: 12,
            elevation: 16,
          }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {/* === Header: avatar + greeting + close === */}
            <View className="px-5 pt-3 pb-5 flex-row items-start justify-between">
              <View className="flex-row items-center gap-3 flex-1">
                <Avatar
                  url={avatarUrl}
                  name={greetingName}
                  seed={greetingName}
                  size="md"
                />
                <View className="flex-1">
                  <AppText
                    weight="semibold"
                    className="text-title-md text-ink"
                    numberOfLines={1}
                  >
                    {isAuthenticated ? `Привет, ${greetingName}` : "Гость"}
                  </AppText>
                  {isAuthenticated && userHandle ? (
                    <AppText
                      className="text-caption text-mute mt-0.5"
                      numberOfLines={1}
                    >
                      {userHandle}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть меню"
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-canvas-soft"
                hitSlop={8}
              >
                <X size={22} weight="bold" color={inkColor} />
              </Pressable>
            </View>

            <View className="h-px bg-hairline mx-5" />

            {/* === Гость: кнопка «Войти» вместо menu-item'ов профиля === */}
            {!isAuthenticated ? (
              <View className="px-5 pt-4">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Войти"
                  onPress={() => handlePush("/(auth)/phone")}
                  className="h-12 flex-row items-center justify-center gap-2 rounded-lg bg-ink active:opacity-80"
                >
                  <SignIn size={18} weight="bold" color={canvasColor} />
                  <AppText
                    weight="semibold"
                    className="text-body-md text-on-primary"
                  >
                    Войти по телефону
                  </AppText>
                </Pressable>
              </View>
            ) : null}

            {/* === Primary menu ===
                Порядок (2026-05-20): Создать заказ → Мои заказы → Смотреть
                заказы → Профиль. «Профиль» в самом низу — стандарт mobile-app
                drawer (Telegram/WhatsApp/Bluesky): action-items сверху,
                «account» — последним.
                Откат 2026-05-20 (вечер): пункт «Найти мастера» убран,
                навигация снова через нижний TabBar. AppDrawer оставлен в
                кодовой базе как заготовка на случай возврата к drawer-pattern. */}
            <View className="mt-2">
              <DrawerItem
                Icon={Plus}
                label="Создать заказ"
                onPress={() => handlePush("/(tabs)/orders/new")}
                inkColor={inkColor}
                muteColor={muteColor}
              />
              {isAuthenticated ? (
                <DrawerItem
                  Icon={ClipboardText}
                  label="Мои заказы"
                  onPress={() => handlePush("/(tabs)/orders")}
                  inkColor={inkColor}
                  muteColor={muteColor}
                />
              ) : null}
              <DrawerItem
                Icon={MagnifyingGlass}
                label="Смотреть заказы"
                onPress={() => handlePush("/(tabs)/orders/search")}
                inkColor={inkColor}
                muteColor={muteColor}
              />
              {isAuthenticated ? (
                <DrawerItem
                  Icon={UserCircle}
                  label="Профиль"
                  onPress={() => handlePush("/(tabs)/profile")}
                  inkColor={inkColor}
                  muteColor={muteColor}
                />
              ) : null}
            </View>

            {/* === Footer === */}
            <View className="mt-8 px-5">
              <View className="h-px bg-hairline" />
              <AppText className="mt-3 text-caption text-mute">
                xtrud{appVersion ? ` · ${appVersion}` : ""}
              </AppText>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// DrawerItem — единый menu-row.
// ----------------------------------------------------------------------------

interface DrawerItemProps {
  /** Phosphor-style иконка (size/weight/color). Используется по умолчанию.
   *  Игнорируется если передан customIcon. */
  Icon?: IconComponent;
  /** Альтернативная кастомная иконка — для случаев когда нужен не-Phosphor
   *  компонент (например, фирменный XtrudLogo для пункта «Найти мастера»).
   *  Сама должна резолвить размер 20px и подходящий цвет. */
  customIcon?: ReactNode;
  label: string;
  onPress: () => void;
  /** Resolved colors from parent — портал-safe (см. комментарий в AppDrawer). */
  inkColor: string;
  muteColor: string;
}

function DrawerItem({ Icon, customIcon, label, onPress, inkColor, muteColor }: DrawerItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center gap-3 px-5 py-3 active:bg-canvas-soft"
    >
      <View className="h-9 w-9 items-center justify-center rounded-full bg-canvas-soft">
        {customIcon ?? (Icon ? <Icon size={20} weight="bold" color={inkColor} /> : null)}
      </View>
      <AppText weight="semibold" className="flex-1 text-body-md text-ink">
        {label}
      </AppText>
      <CaretRight size={16} weight="bold" color={muteColor} />
    </Pressable>
  );
}

// Локальный shorthand чтобы не тянуть StyleSheet ради одного объекта.
const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
};
