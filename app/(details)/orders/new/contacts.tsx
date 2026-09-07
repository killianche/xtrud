/**
 * /orders/new/contacts — «Как с вами связаться?».
 *
 * DECISION владельца 2026-09-07: «мастера могут откликнуться, но если я не
 * хочу откликов, а чтобы сразу звонили или писали в WhatsApp — дать выбор и
 * объяснить». Два способа, один выбирается явно (orders.contact_mode, 0168):
 *
 *   - Отклики в приложении (по умолчанию): номер скрыт, мастера присылают
 *     цену и срок, клиент сам выбирает, кому позвонить.
 *   - Звонок или WhatsApp напрямую: номер виден в задании, мастера связываются
 *     сами, откликов в приложении нет. Нужен хотя бы один номер; номер из
 *     аккаунта подставляется, но его можно заменить.
 */

import { Redirect } from "expo-router";
import { ChatCircleText, Phone } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ChoiceGroup, ChoiceRow } from "@/features/task-composer/ComposerRows";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isPhoneAcceptable, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";
import { useThemeColors } from "@/lib/use-theme-color";

const PHONE_ERROR = "Введите номер полностью";

export default function TaskContactsScreen() {
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("contacts");
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

  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  return (
    <ComposerScreen
      step="contacts"
      title="Как с вами связаться?"
      subtitle="Выберите, как мастера будут выходить на связь."
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("contacts", values)}
      onPrimary={nav.goNext}
    >
      <ChoiceGroup
        footer={
          direct
            ? "Номер увидят все, кто откроет задание. Откликов в приложении не будет — мастера свяжутся сами."
            : "Ваш номер скрыт. Мастера пришлют цену и срок, а вы сами решите, кому позвонить или написать."
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
          subtitle="Оставляете номер — мастера звонят и пишут сразу"
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
            autoFocus={!values.contactPhone && !values.whatsappPhone}
            error={isPhoneAcceptable(values.contactPhone) ? null : PHONE_ERROR}
            hint="Можно указать не тот номер, что в аккаунте."
            accessibilityLabel="Телефон для связи"
          />
          <ComposerField
            label="WhatsApp"
            value={values.whatsappPhone}
            onChangeText={(t) => patch({ whatsappPhone: t })}
            placeholder="Если отличается от телефона"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={isPhoneAcceptable(values.whatsappPhone) ? null : PHONE_ERROR}
            accessibilityLabel="Номер WhatsApp"
          />
        </>
      ) : null}
    </ComposerScreen>
  );
}
