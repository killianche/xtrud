/**
 * /orders/new/contacts — «Как с вами связаться?»: телефон и WhatsApp по
 * желанию, можно не тот, что в аккаунте (DECISION владельца 2026-09-06).
 * Номер из аккаунта подставляется один раз, если поле пустое (Apple:
 * «не просите вводить то, что уже знаете»). Проверка — когда поле покинули.
 */

import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import { useAuthSession } from "@/features/auth/use-auth-session";
import { useUserRecord } from "@/features/auth/use-user-record";
import { ComposerField } from "@/features/task-composer/ComposerFields";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { useComposer } from "@/features/task-composer/composer-store";
import { isPhoneAcceptable, isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

const PHONE_ERROR = "Введите номер полностью";

export default function TaskContactsScreen() {
  const composer = useComposer();
  const { values, patch } = composer;
  const nav = useStepNavigation("contacts");
  const { session } = useAuthSession();
  const { data: user } = useUserRecord(session?.user?.id);
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || composer.mode.kind !== "create") return;
    const phone = user?.contact_phone?.trim();
    if (!phone || values.contactPhone) return;
    prefilledRef.current = true;
    patch({ contactPhone: phone });
  }, [composer.mode.kind, user?.contact_phone, values.contactPhone, patch]);
  if (nav.notReady) return null;
  if (nav.needsIntent) return <Redirect href="/orders/new" />;

  const empty = !values.contactPhone.trim() && !values.whatsappPhone.trim();
  return (
    <ComposerScreen
      step="contacts"
      title="Как с вами связаться?"
      subtitle="По желанию. Можно указать другой номер — не тот, что в аккаунте. Мастера увидят его в задании."
      onBack={nav.goBack}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("contacts", values)}
      onPrimary={nav.goNext}
      secondaryLabel={empty && !nav.fromReview ? "Пропустить" : undefined}
      onSecondary={empty && !nav.fromReview ? nav.goNext : undefined}
    >
      <ComposerField
        label="Телефон"
        value={values.contactPhone}
        onChangeText={(t) => patch({ contactPhone: t })}
        placeholder="+7 928 000-00-00"
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        error={isPhoneAcceptable(values.contactPhone) ? null : PHONE_ERROR}
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
    </ComposerScreen>
  );
}
