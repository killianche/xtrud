/**
 * Поля «Как с вами связаться?» — два способа и номер для «напрямую». Общие
 * для шага `contacts.tsx` и формы одним экраном: №260 (владелец, 2026-10-07)
 * — «там только две кнопки, выведи их сразу на экран, чтобы не заходить».
 *
 * DECISION владельца 2026-09-07 (orders.contact_mode, 0168):
 *   - Отклики в приложении (по умолчанию): номер скрыт, мастера присылают
 *     цену и срок, клиент сам выбирает, кому позвонить.
 *   - Звонок или WhatsApp напрямую: номер виден в задании, мастера связываются
 *     сами, откликов в приложении нет. Номер из аккаунта подставляется.
 */

import { ChatCircleText, Phone } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { useComposer } from "@/features/task-composer/composer-store";
import { isPhoneAcceptable } from "@/features/task-composer/steps";
import { useThemeColors } from "@/lib/use-theme-color";

const PHONE_ERROR = "Введите номер полностью";

export function ContactsFields({
  title,
  /** Шаг открыт отдельно: поле номера сразу в фокусе, если номера нет. */
  autoFocusPhone = false,
}: {
  /** Подпись группы на форме («Связь»); у шага свой заголовок. */
  title?: string;
  autoFocusPhone?: boolean;
}) {
  const composer = useComposer();
  const { values, patch } = composer;
  const tc = useThemeColors(["ink", "on-accent"]);
  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const direct = values.contactMode === "phone_open";

  // Номер из аккаунта подставляется один раз, когда человек выбрал
  // «напрямую» и поле ещё пустое — не просим вводить то, что уже знаем.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!direct || prefilledRef.current || composer.mode.kind !== "create") return;
    const phone = user?.contact_phone?.trim();
    if (!phone || values.contactPhone) return;
    prefilledRef.current = true;
    patch({ contactPhone: phone });
  }, [direct, composer.mode.kind, user?.contact_phone, values.contactPhone, patch]);

  return (
    <>
      <ChoiceGroup
        title={title}
        footer={
          direct
            ? "Номер увидят все, кто откроет задание. Откликов в приложении не будет — специалисты свяжутся сами."
            : "Ваш номер скрыт. Специалисты пришлют цену и срок, а вы сами решите, кому позвонить или написать."
        }
      >
        <ChoiceRow
          title="Отклики в приложении"
          subtitle="Номер скрыт. Сравниваете предложения и выбираете сами"
          icon={
            <ChatCircleText size={18} weight="bold" color={!direct ? tc["on-accent"] : tc.ink} />
          }
          iconAccent={!direct}
          selected={!direct}
          onPress={() => patch({ contactMode: "chat_only" })}
        />
        <ChoiceRow
          title="Звонок или WhatsApp напрямую"
          subtitle="Оставляете номер — специалисты звонят и пишут сразу"
          icon={<Phone size={18} weight="bold" color={direct ? tc["on-accent"] : tc.ink} />}
          iconAccent={direct}
          selected={direct}
          onPress={() => patch({ contactMode: "phone_open" })}
          last
        />
      </ChoiceGroup>

      {direct ? (
        <>
          <ComposerField
            label="Телефон"
            value={values.contactPhone}
            onChangeText={(t) => patch({ contactPhone: t })}
            placeholder="+7 928 000-00-00"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            autoFocus={autoFocusPhone && !values.contactPhone && !values.whatsappPhone}
            error={isPhoneAcceptable(values.contactPhone) ? null : PHONE_ERROR}
            accessibilityLabel="Телефон для связи"
          />
          <ChoiceGroup>
            <ChoiceRow
              title="WhatsApp — тот же номер"
              toggle={{
                value: values.whatsappSameAsPhone,
                onChange: (next) =>
                  patch({
                    whatsappSameAsPhone: next,
                    whatsappPhone: next ? "" : values.whatsappPhone,
                  }),
              }}
              last
            />
          </ChoiceGroup>
          {values.whatsappSameAsPhone ? null : (
            <ComposerField
              label="Номер WhatsApp"
              value={values.whatsappPhone}
              onChangeText={(t) => patch({ whatsappPhone: t })}
              placeholder="+7 928 000-00-00"
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              error={isPhoneAcceptable(values.whatsappPhone) ? null : PHONE_ERROR}
              accessibilityLabel="Номер WhatsApp"
            />
          )}
        </>
      ) : null}
    </>
  );
}
