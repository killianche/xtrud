import { useRouter } from "expo-router";
import { ArrowCounterClockwise, CaretRight, CheckCircle, Clock, Star } from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/StatusPill";
import { isVerifiedLevel, VerifiedBadge } from "@/components/ui";
import { useMasterPhone, useMasterPublicProfile } from "@/features/master-view/use-master-public";
import type { OrderStatusView } from "@/features/orders/order-status-view";
import type { OrderResponseWithMaster } from "@/features/orders/use-order-responses";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";
import { normalizeWhatsappDigits, resolveWhatsappDigits } from "@/lib/whatsapp";
import { ContactButtons } from "./ContactButtons";
import { formatResponsePrice } from "./order-response-price";

// ----------------------------------------------------------------------------
// Карточка отклика у автора задания. Редизайн 2026-09-11 (владелец:
// «Показать контакты, Профиль, Скрыть — некрасиво»):
//
//   ┌──────────────────────────────────────────────┐
//   │ (фото) Имя ✓                        5 000 ₽   │
//   │        ★ 5.0 (1)   ⏱ Завтра                   │
//   │ Сообщение специалиста                          │
//   │ [   Позвонить   ]  [   WhatsApp   ]            │
//   │ ─────────────────────────────────────────────  │
//   │ Профиль ›                              Скрыть │
//   └──────────────────────────────────────────────┘
//
// Каждый отклик — отдельная карточка, как задание в ленте (DESIGN.md,
// 2026-09-02). Контакты видны сразу: они часть отклика (0147, DECISION
// 2026-09-01). Кнопка «Показать контакты» осталась от старой схемы и
// появлялась как раз у новых откликов, где номер уже в строке, — лишний шаг
// убран. Старым откликам без контактов в строке номер подгружается через
// get_master_phone. «Позвонить» — в акценте: чёрных кнопок в продукте нет
// (DESIGN.md: «черные кнопки не делай»).
// ----------------------------------------------------------------------------

interface ClientMasterResponseCardProps {
  response: OrderResponseWithMaster;
  isRejecting: boolean;
  /** Если undefined — кнопка «Скрыть» не показывается (заказ закрыт /
   *  rejected уже). */
  onReject: (() => void) | undefined;
  /** Скрытый отклик — приглушённый, без кнопок связи. */
  rejected?: boolean;
  /** «Выбрать исполнителем» (0196). Нет — кнопки нет. */
  onPick?: () => void;
  /** Выбор уходит на сервер — кнопка заблокирована. */
  picking?: boolean;
  /** Выбранный исполнитель — статус заказа глазами заказчика, показывается
   *  пилюлей рядом с ценой (§3.2: обводок цветом карточек больше нет — весь
   *  смысл несёт пилюля, как везде в приложении). */
  statusView?: OrderStatusView;
}

export function ClientMasterResponseCard({
  response,
  isRejecting,
  onReject,
  rejected,
  onPick,
  picking = false,
  statusView,
}: ClientMasterResponseCardProps) {
  const router = useRouter();
  const tc = useThemeColors(["ink", "mute", "warning", "accent"]);
  const rowPhone = response.contact_phone?.trim() || null;
  const rowWa = response.whatsapp_phone?.trim() || null;
  const rowHasContacts = Boolean(rowPhone || rowWa);

  // Рейтинг — только когда есть хотя бы один отзыв (у новичка строки нет,
  // а не «Без отзывов»). Значок — только за пройденную проверку паспорта.
  const ratingAvg = response.master?.profile?.rating_overall_avg ?? null;
  const ratingCount = response.master?.profile?.rating_overall_count ?? 0;
  const hasRating = ratingAvg != null && ratingCount > 0;
  const verified = isVerifiedLevel(response.master?.profile?.verification_level);

  // Старый отклик без контактов в строке — номер и WhatsApp из профиля.
  // У новых откликов и у скрытых запросов нет вовсе.
  const fetchContactsFor = !rowHasContacts && !rejected ? response.master_id : undefined;
  const masterPhone = useMasterPhone(fetchContactsFor);
  const masterPublic = useMasterPublicProfile(fetchContactsFor);

  const phoneRaw = rowHasContacts ? rowPhone : (masterPhone.data ?? null);
  const phoneTel = phoneRaw?.replace(/[^\d+]/g, "") || null;
  const phoneWa = rowHasContacts
    ? normalizeWhatsappDigits(rowWa)
    : resolveWhatsappDigits({
        whatsappPhone: masterPublic.data?.master?.whatsapp_phone,
        whatsappSameAsPhone: masterPublic.data?.master?.whatsapp_same_as_phone,
        masterPhone: phoneRaw,
      });
  const contactsError = fetchContactsFor ? (masterPhone.error ?? masterPublic.error) : null;
  const contactsLoading = fetchContactsFor
    ? masterPhone.isFetching || masterPublic.isFetching
    : false;

  const masterName =
    [response.master?.first_name, response.master?.last_name].filter(Boolean).join(" ") ||
    "Исполнитель";
  const priceText = formatResponsePrice(response);
  const ratingText = hasRating ? Number(ratingAvg).toFixed(1) : null;
  const profileAccessibilityLabel = [
    `Профиль ${masterName}`,
    verified ? "Проверенный специалист" : null,
    ratingText ? `Рейтинг ${ratingText}, отзывов ${ratingCount}` : null,
    priceText,
    response.lead_time ? `Срок ${response.lead_time}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  const onProfile = () => router.push(`/master/${response.master_id}` as never);

  return (
    <View
      className="rounded-2xl bg-surface-card p-4"
      style={[CARD_SHADOW, rejected ? { opacity: 0.6 } : null]}
    >
      {/* Кто и за сколько. Тап — профиль специалиста; шеврон у имени говорит
          об этом, отдельной кнопки «Профиль» нет (владелец, 2026-10-03:
          «зачем она, если тап по аккаунту и так туда ведёт»). Материал —
          как у карточек списков: тень без рамки. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={profileAccessibilityLabel}
        onPress={onProfile}
        className="flex-row items-center gap-3 active:opacity-70"
      >
        <Avatar
          url={response.master?.avatar_url ?? null}
          name={masterName}
          seed={response.master?.id ?? response.master_id}
          size="md"
        />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-1">
            <AppText weight="semibold" className="shrink text-body-md text-ink" numberOfLines={1}>
              {masterName}
            </AppText>
            {verified ? <VerifiedBadge size={16} /> : null}
            <CaretRight size={14} weight="bold" color={tc.mute} />
          </View>
          {ratingText || response.lead_time ? (
            <View className="mt-0.5 flex-row flex-wrap items-center gap-x-3">
              {ratingText ? (
                <View className="flex-row items-center gap-1">
                  <Star size={14} weight="fill" color={tc.warning} />
                  <AppText weight="semibold" className="text-body-sm text-ink">
                    {ratingText}
                  </AppText>
                  <AppText className="text-body-sm text-mute">({ratingCount})</AppText>
                </View>
              ) : null}
              {response.lead_time ? (
                <View className="shrink flex-row items-center gap-1">
                  <Clock size={14} weight="bold" color={tc.mute} />
                  <AppText className="shrink text-body-sm text-mute" numberOfLines={1}>
                    {response.lead_time}
                  </AppText>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        <View className="items-end gap-1">
          {statusView ? (
            <StatusPill
              tone={statusView.pillTone}
              label={statusView.label}
              iconKey={statusView.iconKey}
              iconWeight={statusView.iconWeight}
            />
          ) : null}
          <AppText weight="bold" className="text-title-lg text-ink">
            {priceText}
          </AppText>
        </View>
      </Pressable>

      {response.message ? (
        <AppText className="mt-3 text-body-md text-body" numberOfLines={6}>
          {response.message}
        </AppText>
      ) : null}

      {rejected ? (
        <AppText weight="medium" className="mt-3 text-body-sm text-mute">
          Отклик скрыт
        </AppText>
      ) : contactsError ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Повторить загрузку контактов"
          accessibilityState={{ disabled: contactsLoading, busy: contactsLoading }}
          disabled={contactsLoading}
          onPress={() => {
            void Promise.all([masterPhone.refetch(), masterPublic.refetch()]);
          }}
          className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-pill border border-hairline-strong bg-canvas px-3 active:bg-canvas-soft"
        >
          {contactsLoading ? (
            <ActivityIndicator size="small" color={tc.mute} />
          ) : (
            <>
              <ArrowCounterClockwise size={16} weight="bold" color={tc.ink} />
              <AppText weight="semibold" className="text-body-md text-ink">
                Контакты не загрузились — повторить
              </AppText>
            </>
          )}
        </Pressable>
      ) : (
        <ContactButtons
          phoneTel={phoneTel}
          whatsappDigits={phoneWa}
          loading={contactsLoading}
          who={masterName}
        />
      )}

      {/* Выбор исполнителя — контурная капсула: главное на карточке всё же
          связь, а выбирают после разговора (0196). «Скрыть» — тихая ссылка
          в той же строке, без отдельной полосы под линией. */}
      {onPick || onReject ? (
        <View className="mt-2.5 flex-row items-center gap-2">
          {onPick ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Выбрать исполнителем: ${masterName}`}
              accessibilityState={{ disabled: picking, busy: picking }}
              onPress={onPick}
              disabled={picking}
              className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-pill border-2 border-accent bg-canvas px-3 active:bg-accent-soft ${picking ? "opacity-60" : ""}`}
            >
              <CheckCircle size={18} weight="bold" color={tc.accent} />
              <AppText weight="semibold" className="text-body-md text-accent">
                {picking ? "Выбираем…" : "Выбрать исполнителем"}
              </AppText>
            </Pressable>
          ) : (
            <View className="flex-1" />
          )}
          {onReject ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Скрыть отклик: ${masterName}`}
              accessibilityState={{ disabled: isRejecting, busy: isRejecting }}
              onPress={onReject}
              disabled={isRejecting}
              className="min-h-12 items-center justify-center px-3 active:opacity-60"
            >
              {isRejecting ? (
                <ActivityIndicator size="small" color={tc.mute} />
              ) : (
                <AppText weight="medium" className="text-body-md text-mute">
                  Скрыть
                </AppText>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
