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
 *   - связь (№322): номер подставляется сам — из прошлого отклика, контактов
 *     профиля или номера входа (response-contacts.ts) — и показан строкой с
 *     «Изменить»; переключатели «Звонки» и «WhatsApp», можно оставить один;
 *   - сообщение — по желанию;
 *   - «Откликнуться» — стеклянная капсула внизу; дневной лимит объясняется
 *     словами, а не блокировкой без причины.
 */

import { Phone } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/AppText";
import { GlassButton, InsetGroup, InsetRow } from "@/components/ui";
import { useUserRecord } from "@/features/auth/use-user-record";
import { useMasterPublicProfile } from "@/features/master-view/use-master-public";
import type { OrderPriceKind } from "@/features/orders/order-schema";
import {
  contactsPayload,
  contactsValid,
  displayPhone,
  phoneComplete,
  type ResponseContactsDraft,
  resolveResponseContacts,
} from "@/features/orders/response-contacts";
import {
  useMyLastResponseContacts,
  useSubmitResponse,
} from "@/features/orders/use-order-responses";
import { isDailyLimitError, useResponseLimit } from "@/features/orders/use-response-limit";
import { useUserPrivate } from "@/features/profile/use-user-private";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { formatBudgetInput, parseBudgetInput } from "@/features/task-composer/steps";
import { describeServerError } from "@/lib/describe-server-error";
import { hapticSelection, hapticSuccess } from "@/lib/haptics";
import { useThemeColors } from "@/lib/use-theme-color";

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
  const loginPhone = useUserPrivate(masterId);
  const lastContacts = useMyLastResponseContacts(masterId);
  const tc = useThemeColors(["ink"]);

  const [price, setPrice] = useState<number | null>(
    budgetKind && budgetKind !== "negotiable" ? budgetValue : null,
  );
  const [lead, setLead] = useState<string>("Завтра");
  const [customLead, setCustomLead] = useState("");
  const [contacts, setContacts] = useState<ResponseContactsDraft>({
    phone: "",
    call: true,
    whatsapp: false,
    waPhone: "",
  });
  // Поля номера открыты, только когда номера нет или человек нажал
  // «Изменить»; иначе номер — одной строкой (№322).
  const [editing, setEditing] = useState(true);
  const [message, setMessage] = useState("");
  // Подставляем по мере ответа источников, пока человек сам не тронул
  // связь: медленный источник не держит форму пустой, а ответ, пришедший
  // позже, не затирает введённое. «Не просим то, что знаем».
  const touchedRef = useRef(false);
  const patch = (next: Partial<ResponseContactsDraft>) => {
    touchedRef.current = true;
    setContacts((c) => ({ ...c, ...next }));
  };
  useEffect(() => {
    if (touchedRef.current) return;
    const draft = resolveResponseContacts({
      last: lastContacts.data ?? null,
      profilePhone: me?.contact_phone,
      profileWa: myPublic.data?.master?.whatsapp_phone,
      profileWaSame: myPublic.data?.master?.whatsapp_same_as_phone,
      loginPhone: loginPhone.data?.phone,
    });
    setContacts(draft);
    setEditing(!phoneComplete(draft.phone));
  }, [lastContacts.data, me, myPublic.data, loginPhone.data]);

  const leadTime = lead === CUSTOM ? customLead.trim() : lead;
  const limitReached = (limit?.remaining ?? 5) <= 0;
  const valid =
    leadTime.length > 0 &&
    leadTime.length <= 100 &&
    contactsValid(contacts) &&
    message.length <= 1000;

  const error = submit.error
    ? isDailyLimitError(submit.error)
      ? "На сегодня предложения закончились. Завтра будет снова 5."
      : // Сервер объясняет причину сам («вы уже откликнулись», «вас уже
        // выбрали»). Прежний общий текст звал повторить попытку там, где
        // повтор не мог сработать (разбор 2026-09-09).
        describeServerError(submit.error, "Не удалось отправить предложение. Попробуйте ещё раз.")
    : limitReached
      ? "На сегодня предложения закончились. Завтра будет снова 5."
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
      ...contactsPayload(contacts),
    });
    hapticSuccess();
    onDone();
  };

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

      {editing ? (
        <ComposerField
          label="Номер для связи"
          value={contacts.phone}
          onChangeText={(t) => patch({ phone: t })}
          placeholder="+7 928 000-00-00"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          error={
            contacts.phone.trim() && !phoneComplete(contacts.phone)
              ? "Введите номер полностью"
              : null
          }
          accessibilityLabel="Номер для связи"
        />
      ) : null}
      <InsetGroup
        title={editing ? undefined : "Связь с вами"}
        footer={
          !contacts.call && !contacts.whatsapp
            ? "Оставьте хотя бы один способ — иначе клиент не сможет с вами связаться."
            : "Номер увидит только автор задания. В следующий раз подставим его сами."
        }
      >
        {editing ? null : (
          <InsetRow
            title={displayPhone(contacts.phone)}
            icon={<Phone size={18} weight="bold" color={tc.ink} />}
            value="Изменить"
            accessibilityLabel={`Номер для связи ${displayPhone(contacts.phone)}. Изменить`}
            onPress={() => {
              touchedRef.current = true;
              setEditing(true);
            }}
          />
        )}
        <InsetRow
          title="Звонки"
          toggle={{ value: contacts.call, onChange: (v) => patch({ call: v }) }}
        />
        <InsetRow
          title="WhatsApp"
          subtitle={
            contacts.whatsapp && contacts.waPhone.trim() && !editing
              ? `на ${displayPhone(contacts.waPhone)}`
              : undefined
          }
          toggle={{ value: contacts.whatsapp, onChange: (v) => patch({ whatsapp: v }) }}
          last
        />
      </InsetGroup>
      {editing && contacts.whatsapp ? (
        <ComposerField
          label="Другой номер для WhatsApp"
          value={contacts.waPhone}
          onChangeText={(t) => patch({ waPhone: t })}
          placeholder="Если не тот же"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          error={
            contacts.waPhone.trim() && !phoneComplete(contacts.waPhone)
              ? "Введите номер полностью"
              : null
          }
          accessibilityLabel="Другой номер для WhatsApp"
        />
      ) : null}

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
          label={resendResponseId ? "Предложить снова" : "Предложить свои услуги"}
          onPress={() => void send()}
          disabled={!valid || limitReached}
          busy={submit.isPending}
        />
        {limit ? (
          <AppText className="mt-2 text-center text-ios-footnote text-mute">
            Сегодня осталось предложений: {Math.max(0, limit.remaining)} из {limit.max}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
