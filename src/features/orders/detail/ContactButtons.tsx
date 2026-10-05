import { Phone, WhatsappLogo } from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { openExternalUrl } from "@/lib/open-link";
import { useThemeColors } from "@/lib/use-theme-color";

/**
 * Связь одной парой кнопок — у заказчика и в откликах одинаково.
 * «Позвонить» — главное действие (акцент), WhatsApp — второе. Нет номера и
 * нет WhatsApp — честное «Нет номера»; номер ещё грузится — индикатор.
 */
export function ContactButtons({
  phoneTel,
  whatsappDigits,
  loading = false,
  who,
}: {
  phoneTel: string | null;
  whatsappDigits: string | null;
  loading?: boolean;
  /** Кому звоним — для VoiceOver. */
  who: string;
}) {
  const tc = useThemeColors(["ink", "on-accent", "mute"]);
  const showCall = !!phoneTel || loading || !whatsappDigits;
  return (
    <View className="mt-4 flex-row gap-2">
      {showCall ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={phoneTel ? `Позвонить: ${who}` : "Номера нет"}
          accessibilityState={{ disabled: !phoneTel, busy: loading && !phoneTel }}
          disabled={!phoneTel}
          onPress={() => phoneTel && openExternalUrl(`tel:${phoneTel}`)}
          className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill px-3 ${
            phoneTel ? "bg-accent active:opacity-85" : "bg-canvas-soft"
          }`}
        >
          {phoneTel ? (
            <>
              <Phone size={18} weight="bold" color={tc["on-accent"]} />
              <AppText weight="semibold" className="text-body-md text-on-accent">
                Позвонить
              </AppText>
            </>
          ) : loading ? (
            <ActivityIndicator size="small" color={tc.mute} />
          ) : (
            <AppText weight="medium" className="text-body-md text-mute">
              Нет номера
            </AppText>
          )}
        </Pressable>
      ) : null}
      {whatsappDigits ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Написать в WhatsApp: ${who}`}
          onPress={() => openExternalUrl(`https://wa.me/${whatsappDigits}`)}
          className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill border border-hairline-strong bg-canvas px-3 active:bg-canvas-soft"
        >
          <WhatsappLogo size={18} weight="bold" color={tc.ink} />
          <AppText weight="semibold" className="text-body-md text-ink">
            WhatsApp
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
