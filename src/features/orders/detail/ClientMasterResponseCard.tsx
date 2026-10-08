import { useRouter } from "expo-router";
import {
  ArrowCounterClockwise,
  CaretRight,
  DotsThree,
  Phone,
  Star,
  WhatsappLogo,
} from "phosphor-react-native";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Avatar } from "@/components/Avatar";
import { StatusPill } from "@/components/StatusPill";
import { CompanyBadge, isVerifiedLevel, VerifiedBadge } from "@/components/ui";
import { useMasterPhone, useMasterPublicProfile } from "@/features/master-view/use-master-public";
import type { OrderStatusView } from "@/features/orders/order-status-view";
import type { OrderResponseWithMaster } from "@/features/orders/use-order-responses";
import { displayName, isCompanyVerified } from "@/features/specialist/company";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { showActionMenu } from "@/lib/action-menu";
import { trackEvent } from "@/lib/analytics";
import { openExternalUrl } from "@/lib/open-link";
import { CARD_SHADOW } from "@/lib/shadows";
import { useThemeColors } from "@/lib/use-theme-color";
import { normalizeWhatsappDigits, resolveWhatsappDigits } from "@/lib/whatsapp";
import { formatResponsePrice } from "./order-response-price";

// ----------------------------------------------------------------------------
// Карточка отклика у автора задания. Редизайн №260→№262 (владелец,
// 2026-10-07: «кнопки мелкие и непонятные, „Скрыть“ непонятная, редизайн с
// нуля в стиле iOS, как у больших компаний»):
//
//   ┌──────────────────────────────────────────────┐
//   │ (фото) Имя ✓                            ⋯     │  ← тап — профиль
//   │        ★ 5,0 · 3 отзыва   ›                   │
//   │ Цена              Срок                        │
//   │ 5 000 ₽           Завтра                      │
//   │ Сообщение специалиста                          │
//   │ [ 📞 Позвонить ]  [ WhatsApp ]                 │  ← №293
//   └──────────────────────────────────────────────┘
//
// Что взято: Thumbtack и Profi.ru — цена и срок отдельными подписанными
// фактами, а не мелким текстом у имени; «Контакты» iOS — связь круглыми
// кнопками-иконками; одно заметное действие — «Выбрать» (VoiceOver слышит
// «Выбрать исполнителем» и что задание закроется, №255; полная подпись
// переносилась на две строки). Редкое — «Скрыть» — в меню «⋯», как
// второстепенные действия в системных приложениях (HIG: Menus).
// Контакты видны сразу (0147); старым откликам без контактов в строке номер
// подгружается через get_master_phone.
// ----------------------------------------------------------------------------

interface ClientMasterResponseCardProps {
  response: OrderResponseWithMaster;
  isRejecting: boolean;
  /** «Скрыть» в меню «⋯»; undefined — пункта нет (заказ закрыт / уже
   *  скрыт). Выбор в меню — уже подтверждение: второго окна не нужно. */
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
  const { colorScheme } = useColorScheme();
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

  // Компания — название вместо имени (0245, №308).
  const masterName = displayName(
    response.master?.first_name,
    response.master?.last_name,
    response.master?.profile,
    "Исполнитель",
  );
  const companyVerified = isCompanyVerified(response.master?.profile);
  const priceText = formatResponsePrice(response);
  // «5,0», как в профиле: десятичная запятая по-русски.
  const ratingText = hasRating ? Number(ratingAvg).toFixed(1).replace(".", ",") : null;
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

  const onMore = () =>
    showActionMenu({
      title: masterName,
      message: onReject
        ? "Скрытое предложение уйдёт вниз списка. Специалист не узнает."
        : undefined,
      items: [
        { label: "Открыть профиль", onPress: onProfile },
        ...(onReject
          ? [{ label: "Скрыть предложение", destructive: true, onPress: onReject }]
          : []),
      ],
      colorScheme,
    });

  return (
    <View
      className="rounded-2xl bg-surface-card p-4"
      style={[CARD_SHADOW, rejected ? { opacity: 0.6 } : null]}
    >
      <View className="flex-row items-start gap-2">
        {/* Кто: тап — профиль; шеврон говорит, что строка ведёт дальше. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={profileAccessibilityLabel}
          accessibilityHint="Открывает профиль специалиста"
          onPress={onProfile}
          className="min-h-11 flex-1 flex-row items-center gap-3 active:opacity-70"
        >
          <Avatar
            url={response.master?.avatar_url ?? null}
            name={masterName}
            seed={response.master?.id ?? response.master_id}
            size="lg"
          />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-center gap-1">
              <AppText
                weight="semibold"
                className="shrink text-ios-body text-ink"
                numberOfLines={2}
              >
                {masterName}
              </AppText>
              {verified ? <VerifiedBadge size={16} /> : null}
              {companyVerified ? <CompanyBadge size={16} /> : null}
            </View>
            <View className="mt-0.5 flex-row items-center gap-1">
              {ratingText ? (
                <>
                  <Star size={14} weight="fill" color={tc.warning} />
                  <AppText weight="semibold" className="text-ios-subheadline text-ink">
                    {ratingText}
                  </AppText>
                  <AppText className="text-ios-subheadline text-mute">
                    {` · ${reviewsLabel(ratingCount)}`}
                  </AppText>
                </>
              ) : (
                <AppText className="text-ios-subheadline text-mute">Профиль</AppText>
              )}
              <CaretRight size={13} weight="bold" color={tc.mute} />
            </View>
          </View>
        </Pressable>
        {statusView ? (
          <StatusPill
            tone={statusView.pillTone}
            label={statusView.label}
            iconKey={statusView.iconKey}
            iconWeight={statusView.iconWeight}
          />
        ) : rejected ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ещё: ${masterName}`}
            onPress={onMore}
            disabled={isRejecting}
            hitSlop={6}
            className="h-11 w-11 items-center justify-center rounded-full active:bg-canvas-soft"
          >
            {isRejecting ? (
              <ActivityIndicator size="small" color={tc.mute} />
            ) : (
              <DotsThree size={24} weight="bold" color={tc.mute} />
            )}
          </Pressable>
        )}
      </View>

      {/* Цена и срок — два подписанных факта, как в предложениях Thumbtack. */}
      <View className="mt-4 flex-row gap-6">
        <View className="shrink">
          <AppText className="text-ios-footnote text-mute">Цена</AppText>
          <AppText weight="semibold" className="mt-0.5 text-ios-title3 text-ink">
            {priceText}
          </AppText>
        </View>
        {response.lead_time ? (
          <View className="min-w-0 shrink">
            <AppText className="text-ios-footnote text-mute">Срок</AppText>
            <AppText
              weight="semibold"
              className="mt-0.5 text-ios-title3 text-ink"
              numberOfLines={2}
            >
              {response.lead_time}
            </AppText>
          </View>
        ) : null}
      </View>

      {response.message ? (
        <AppText className="mt-3 text-ios-body text-body" numberOfLines={6}>
          {response.message}
        </AppText>
      ) : null}

      {rejected ? (
        <AppText weight="medium" className="mt-3 text-ios-subheadline text-mute">
          Предложение скрыто
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
          className="mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-pill bg-canvas-soft px-3 active:opacity-70"
        >
          {contactsLoading ? (
            <ActivityIndicator size="small" color={tc.mute} />
          ) : (
            <>
              <ArrowCounterClockwise size={16} weight="bold" color={tc.ink} />
              <AppText weight="semibold" className="text-ios-body text-ink">
                Контакты не загрузились — повторить
              </AppText>
            </>
          )}
        </Pressable>
      ) : (
        <View className="mt-4 flex-row flex-wrap items-center gap-2">
          <ContactPillButton
            kind="call"
            enabled={!!phoneTel}
            loading={contactsLoading && !phoneTel}
            who={masterName}
            onPress={() => {
              if (!phoneTel) return;
              trackEvent("call_click", {
                orderId: response.order_id,
                responseId: response.id,
                source: "response_card",
              });
              openExternalUrl(`tel:${phoneTel}`);
            }}
          />
          {/* Пока контакты старого отклика грузятся — место WhatsApp занято
              индикатором, как у «Позвонить», без скачка разметки (QA №262). */}
          {phoneWa || contactsLoading ? (
            <ContactPillButton
              kind="whatsapp"
              enabled={!!phoneWa}
              loading={contactsLoading && !phoneWa}
              who={masterName}
              onPress={() => {
                trackEvent("whatsapp_click", {
                  orderId: response.order_id,
                  responseId: response.id,
                  source: "response_card",
                });
                openExternalUrl(`https://wa.me/${phoneWa}`);
              }}
            />
          ) : null}
          {onPick ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Выбрать исполнителем: ${masterName}`}
              accessibilityHint="Задание закроется и уйдёт из поиска"
              accessibilityState={{ disabled: picking, busy: picking }}
              onPress={onPick}
              disabled={picking}
              className={`min-h-12 grow basis-40 items-center justify-center rounded-pill bg-accent px-4 active:opacity-85 ${
                picking ? "opacity-60" : ""
              }`}
            >
              <AppText weight="semibold" className="text-center text-ios-body text-on-accent">
                {picking ? "Выбираем…" : "Выбрать"}
              </AppText>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/** «3 отзыва», «1 отзыв», «5 отзывов». */
function reviewsLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? "отзыв"
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? "отзыва"
        : "отзывов";
  return `${n} ${word}`;
}

/**
 * Кнопка связи с подписью (№293, владелец 2026-10-07: «не нравится кнопка
 * звонка» — одинокий розовый круг без подписи после ухода «Выбрать»).
 * Стили iOS: «Позвонить» — tinted (заливка оттенком, текст акцентом),
 * WhatsApp — gray. Не сплошная красная: откликов бывает пять, и под ними
 * чёрная «Закрыть задание» (№321) — одно сплошное действие на экран.
 */
function ContactPillButton({
  kind,
  enabled,
  loading = false,
  who,
  onPress,
}: {
  kind: "call" | "whatsapp";
  enabled: boolean;
  loading?: boolean;
  who: string;
  onPress: () => void;
}) {
  const tc = useThemeColors(["accent", "mute", "ink"]);
  const call = kind === "call";
  const Icon = call ? Phone : WhatsappLogo;
  const label = call ? (enabled ? "Позвонить" : "Номера нет") : "WhatsApp";
  const a11y = call ? (enabled ? `Позвонить: ${who}` : "Номера нет") : `WhatsApp: ${who}`;
  const tone = !enabled
    ? "bg-canvas-soft"
    : call
      ? "bg-accent-soft active:opacity-70"
      : "bg-canvas-soft-2 active:opacity-70";
  const iconColor = !enabled ? tc.mute : call ? tc.accent : tc.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: !enabled, busy: loading }}
      disabled={!enabled}
      onPress={onPress}
      className={`min-h-12 grow basis-32 flex-row items-center justify-center gap-2 rounded-pill px-4 ${tone}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tc.mute} />
      ) : (
        <>
          <Icon size={20} weight="fill" color={iconColor} />
          <AppText
            weight="semibold"
            className={`text-ios-body ${!enabled ? "text-mute" : call ? "text-accent" : "text-ink"}`}
          >
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}
