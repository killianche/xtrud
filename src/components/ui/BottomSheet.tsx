/**
 * BottomSheet — модальное окно снизу. Используется для:
 *   - LoginWall (просит логин на действиях анону)
 *   - CitySelector (выбор города)
 *   - Filter / Sort menus
 *   - Подтверждение опасных действий (отменить заказ)
 *
 * Реализация:
 *   - На native + web используем react-native Modal (animationType="slide")
 *     для одинакового поведения. Это самый простой и совместимый путь.
 *     Свайп-вниз для закрытия — добавим отдельно через gesture-handler если будет нужно.
 *   - Backdrop: чёрный 60% opacity, тап закрывает.
 *   - Контент: bg canvas, top corners radius 16px (по DESIGN.md xl).
 *   - Drag handle: тонкая полоска hairline-strong сверху для UX-намёка.
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
import { type ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
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
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  dismissibleOnBackdrop = true,
}: BottomSheetProps) {
  const insets = useSafeAreaInsets();
  const tc = useThemeColors(["canvas", "ink", "body", "hairline-strong", "mute"]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
        onPress={dismissibleOnBackdrop ? onClose : undefined}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        {/* Сам лист — не пробрасывает тап родителю (иначе любой тап внутри закроет sheet) */}
        <Pressable
          onPress={() => {
            // no-op: блок proporopagation
          }}
          style={{
            backgroundColor: tc.canvas,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 20,
            // На web даёт максимальную ширину 480px для desktop view.
            // На mobile native max-width не сработает.
            maxWidth: 480,
            width: "100%",
            alignSelf: "center",
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}
