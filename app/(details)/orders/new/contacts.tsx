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
 *
 * Поля — `ContactsFields` (общие с формой одним экраном, №260).
 */

import { Redirect } from "expo-router";
import { ComposerScreen } from "@/features/task-composer/ComposerScreen";
import { ContactsFields } from "@/features/task-composer/ContactsFields";
import { useComposer } from "@/features/task-composer/composer-store";
import { isStepValid } from "@/features/task-composer/steps";
import { useStepNavigation } from "@/features/task-composer/use-step-navigation";

export default function TaskContactsScreen() {
  const { values } = useComposer();
  const nav = useStepNavigation("contacts");

  if (nav.notReady) return null;
  if (nav.needsCategory) return <Redirect href="/orders/new" />;

  return (
    <ComposerScreen
      step="contacts"
      title="Как с вами связаться?"
      onBack={nav.goBack}
      onClose={nav.close}
      primaryLabel={nav.primaryLabel}
      primaryDisabled={!isStepValid("contacts", values)}
      onPrimary={nav.goNext}
    >
      <ContactsFields autoFocusPhone />
    </ComposerScreen>
  );
}
