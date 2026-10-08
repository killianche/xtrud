/**
 * Контакты в отклике (владелец, 2026-10-08, №322: «каждый раз вводить
 * телефон неудобно; человек может хотеть только WhatsApp; вписал один раз —
 * второй раз номер должен появиться сам, „Изменить“ — если нужно»).
 *
 * Откуда берём номер, по порядку:
 *   1. прошлый отклик человека — как он ответил в прошлый раз, так и
 *      предлагаем (номер, звонки, WhatsApp);
 *   2. контакты специалиста из «Я специалист → Контакты»;
 *   3. номер входа (users_private.phone) — подтверждён звонком при
 *      регистрации.
 * Номер отклика видят только автор задания и сам специалист (RLS
 * order_responses_read_participants), поэтому в профиль, который виден всем
 * в каталоге, мы его сами не переносим. Разбор — docs/RESPONSE_CONTACTS_2026-10.md.
 */

import { digitsOnly, formatPhoneMask, normalizePhone } from "@/features/auth/validation";

export interface ResponseContactsDraft {
  /** Номер для связи — для звонков и, если отдельного нет, для WhatsApp. */
  phone: string;
  /** Клиент может звонить. */
  call: boolean;
  /** Клиент может писать в WhatsApp. */
  whatsapp: boolean;
  /** Отдельный номер WhatsApp; пусто — тот же, что phone. */
  waPhone: string;
}

export interface ContactSources {
  last?: { contact_phone: string | null; whatsapp_phone: string | null } | null;
  profilePhone?: string | null;
  profileWa?: string | null;
  profileWaSame?: boolean | null;
  loginPhone?: string | null;
}

const clean = (v: string | null | undefined): string => v?.trim() ?? "";

export function phoneComplete(value: string): boolean {
  return digitsOnly(value).length >= 10;
}

/** Один и тот же номер в разной записи (+7 / 8 / пробелы). */
export function samePhone(a: string, b: string): boolean {
  const da = digitsOnly(a).slice(-10);
  return da.length === 10 && da === digitsOnly(b).slice(-10);
}

/** Номер для показа: российский — маской, иностранный — как есть. */
export function displayPhone(value: string): string {
  const v = value.trim();
  if (/^\+[1-689]/.test(v)) return v;
  return formatPhoneMask(v);
}

export function resolveResponseContacts(src: ContactSources): ResponseContactsDraft {
  const lastPhone = clean(src.last?.contact_phone);
  const lastWa = clean(src.last?.whatsapp_phone);
  if (lastPhone || lastWa) {
    const phone = lastPhone || lastWa;
    return {
      phone,
      call: lastPhone.length > 0,
      whatsapp: lastWa.length > 0,
      waPhone: lastPhone && lastWa && !samePhone(lastPhone, lastWa) ? lastWa : "",
    };
  }
  const profileWa = clean(src.profileWa);
  const phone = clean(src.profilePhone) || clean(src.loginPhone) || profileWa;
  return {
    phone,
    call: true,
    // WhatsApp включаем, только если человек сам его указал: кнопка у
    // клиента не должна вести в пустоту (владелец, 2026-09-09).
    whatsapp: profileWa.length > 0 || src.profileWaSame === true,
    waPhone: profileWa && phone && !samePhone(profileWa, phone) ? profileWa : "",
  };
}

/** Можно отправлять: номер полный, выбран хотя бы один способ. */
export function contactsValid(d: ResponseContactsDraft): boolean {
  return (
    phoneComplete(d.phone) &&
    (d.call || d.whatsapp) &&
    (!d.whatsapp || d.waPhone.trim().length === 0 || phoneComplete(d.waPhone))
  );
}

/** Что уходит на сервер (submit_order_response). */
export function contactsPayload(d: ResponseContactsDraft): {
  contactPhone: string | null;
  whatsappPhone: string | null;
} {
  const wa = d.waPhone.trim() ? d.waPhone : d.phone;
  return {
    contactPhone: d.call ? normalizePhone(d.phone) : null,
    whatsappPhone: d.whatsapp ? normalizePhone(wa) : null,
  };
}
