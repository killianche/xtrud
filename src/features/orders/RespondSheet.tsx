/**
 * RespondSheet — отклик на задание в системной шторке.
 *
 * DECISION владельца 2026-09-07: «дизайн отклика переделать: цена
 * предзаполнена ценой клиента и её можно поменять; „точная / от / до /
 * договорная“ убрать; срок — быстрыми кнопками (сегодня, завтра, на этой
 * неделе, на следующей) и свой; телефон и WhatsApp — одной кнопкой из
 * аккаунта или тот же номер; отклик отделён от задания, как на iOS».
 *
 * Правила:
 *   - цена: одно поле, предзаполнено бюджетом задания; пусто — договорная;
 *   - срок: капсулы + «Свой срок» (поле);
 *   - телефон: поле + строка «Из аккаунта» одним тапом; WhatsApp — «тот же
 *     номер» (по умолчанию) или отдельный, тоже с подстановкой из профиля;
 *   - сообщение — по желанию;
 *   - «Откликнуться» — стеклянная капсула внизу; дневной лимит объясняется
 *     словами, а не блокировкой без причины.
 */

import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { GlassButton, InsetGroup, InsetRow } from "@/components/ui";
import { useUserRecord } from "@/features/auth/use-user-record";
import { digitsOnly, normalizePhone } from "@/features/auth/validation";
import { useMasterPublicProfile } from "@/features/master-view/use-master-public";
import { formatPrice, type OrderPriceKind } from "@/features/orders/order-schema";
import { useSubmitResponse } from "@/features/orders/use-order-responses";
import { isDailyLimitError, useResponseLimit } from "@/features/orders/use-response-limit";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { formatBudgetInput, parseBudgetInput } from "@/features/task-composer/steps";
import { hapticSelection, hapticSuccess } from "@/lib/haptics";

const LEAD_TIMES = ["Сегодня", "Завтра", "На этой неделе", "На следующей неделе"] as const;
const CUSTOM = "__custom";

export interface RespondSheetProps {
  orderId: string;
  masterId: string;
  l2Id: string;
  budgetKind: OrderPriceKind | null;
  budgetValue: number | null;
  /** Отозванный отклик, который отправляем заново (0172). */
  resendResponseId?: string;
  onDone: () => void;
}

function phoneOk(value: string): boolean {
  return digitsOnly(value).length >= 10;
}

export function RespondSheet({
  orderId,
  masterId,
  l2Id,
  budgetKind,
  budgetValue,
  resendResponseId,
  onDone,
}: RespondSheetProps) {
  const submit = useSubmitResponse();
  const { data: limit } = useResponseLimit();
  const { data: me } = useUserRecord(masterId);
  const myPublic = useMasterPublicProfile(masterId);
  const accountPhone = me?.contact_phone?.trim() ?? "";
  const profileWa = myPublic.data?.master?.whatsapp_phone?.trim() ?? "";

  const [price, setPrice] = useState<number | null>(
    budgetKind && budgetKind !== "negotiable" ? budgetValue : null,
  );
  const [lead, setLead] = useState<string>("Завтра");
  const [customLead, setCustomLead] = useState("");
  const [phone, setPhone] = useState("");
  const [sameWa, setSameWa] = useState(true);
  const [wa, setWa] = useState("");
  const [message, setMessage] = useState("");

  // Номер из аккаунта подставляется один раз — «не просим то, что знаем».
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !accountPhone) return;
    prefilledRef.current = true;
    setPhone(accountPhone);
  }, [accountPhone]);

  const leadTime = lead === CUSTOM ? customLead.trim() : lead;
  const waEffective = sameWa ? phone : wa;
  const limitReached = (limit?.remaining ?? 5) <= 0;
  const valid =
    leadTime.length > 0 &&
    leadTime.length <= 100 &&
    phoneOk(phone) &&
    (sameWa || wa.trim().length === 0 || phoneOk(wa)) &&
    message.length <= 1000;

  const error = submit.error
    ? isDailyLimitError(submit.error)
      ? "На сегодня отклики закончились. Завтра будет снова 5."
      : "Не удалось отправить отклик. Попробуйте ещё раз."
    : limitReached
      ? "На сегодня отклики закончились. Завтра будет снова 5."
      : null;

  const send = async () => {
    if (!valid || submit.isPending) return;
    await submit.mutateAsync({
      resendResponseId,
      orderId,
      masterId,
      l2Id,
      priceKind: price && price > 0 ? "fixed" : "negotiable",
      priceValue: price && price > 0 ? price : null,
      leadTime,
      message,
      contactPhone: phoneOk(phone) ? normalizePhone(phone) : null,
      whatsappPhone: phoneOk(waEffective) ? normalizePhone(waEffective) : null,
    });
    hapticSuccess();
    onDone();
  };

  const budgetLabel = budgetKind ? formatPrice(budgetKind, budgetValue) : null;

  return (
    <View>
      <ComposerField
        label="Ваша цена"
        size="title"
        value={formatBudgetInput(price)}
        onChangeText={(t) => setPrice(parseBudgetInput(t))}
        placeholder="Договорная"
        suffix="₽"
        keyboardType="number-pad"
        returnKeyType="done"
        hint={
          budgetLabel && budgetKind !== "negotiable"
            ? `Клиент указал ${budgetLabel}. Можно предложить свою; пусто — договорная.`
            : "Пусто — цена договорная."
        }
        accessibilityLabel="Ваша цена"
      />

      <View className="mb-7 px-4">
        <AppText className="mb-1.5 ml-4 text-ios-footnote uppercase text-mute">
          Когда сможете
        </AppText>
        <View className="flex-row flex-wrap gap-2">
          {[...LEAD_TIMES, CUSTOM].map((item) => {
            const on = lead === item;
            const label = item === CUSTOM ? "Свой срок" : item;
            return (
              <Pressable
                key={item}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={label}
                onPress={() => {
                  hapticSelection();
                  setLead(item);
                }}
                className={`min-h-11 items-center justify-center rounded-full px-4 ${on ? "bg-accent" : "bg-canvas"}`}
              >
                <AppText
                  weight="semibold"
                  className={`text-ios-callout ${on ? "text-on-accent" : "text-ink"}`}
                >
                  {label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {lead === CUSTOM ? (
        <ComposerField
          value={customLead}
          onChangeText={(t) => setCustomLead(t.slice(0, 100))}
          placeholder="Например, в четверг после обеда"
          returnKeyType="done"
          accessibilityLabel="Свой срок"
        />
      ) : null}

      <ComposerField
        label="Телефон для связи"
        value={phone}
        onChangeText={setPhone}
        placeholder="+7 928 000-00-00"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        error={phone.trim() && !phoneOk(phone) ? "Введите номер полностью" : null}
        accessibilityLabel="Телефон для связи"
      />
      {accountPhone && phone.trim() !== accountPhone ? (
        <View className="-mt-3 mb-6 px-4">
          <InsetGroup>
            <InsetRow
              title="Подставить из аккаунта"
              value={accountPhone}
              onPress={() => setPhone(accountPhone)}
              last
            />
          </InsetGroup>
        </View>
      ) : null}

      <InsetGroup
        footer={sameWa ? "Клиент сможет написать в WhatsApp на этот же номер." : undefined}
      >
        <InsetRow
          title="WhatsApp — тот же номер"
          toggle={{ value: sameWa, onChange: setSameWa }}
          last
        />
      </InsetGroup>
      {sameWa ? null : (
        <>
          <ComposerField
            label="Номер WhatsApp"
            value={wa}
            onChangeText={setWa}
            placeholder="+7 928 000-00-00"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={wa.trim() && !phoneOk(wa) ? "Введите номер полностью" : null}
            accessibilityLabel="Номер WhatsApp"
          />
          {profileWa && wa.trim() !== profileWa ? (
            <View className="-mt-3 mb-6 px-4">
              <InsetGroup>
                <InsetRow
                  title="Подставить из профиля"
                  value={profileWa}
                  onPress={() => setWa(profileWa)}
                  last
                />
              </InsetGroup>
            </View>
          ) : null}
        </>
      )}

      <ComposerField
        label="Сообщение клиенту"
        multiline
        value={message}
        onChangeText={(t) => setMessage(t.slice(0, 1000))}
        placeholder="По желанию: делал такое, есть свой инструмент, приеду со всем нужным."
        accessibilityLabel="Сообщение клиенту"
      />

      <View className="px-5 pb-2">
        {error ? (
          <AppText
            accessibilityRole="alert"
            className="mb-2 text-center text-ios-subheadline text-error"
          >
            {error}
          </AppText>
        ) : null}
        <GlassButton
          label={resendResponseId ? "Откликнуться снова" : "Откликнуться"}
          onPress={() => void send()}
          disabled={!valid || limitReached}
          busy={submit.isPending}
        />
        {limit ? (
          <AppText className="mt-2 text-center text-ios-footnote text-mute">
            Сегодня осталось откликов: {Math.max(0, limit.remaining)} из {limit.max}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
