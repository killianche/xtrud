import { describe, expect, it } from "vitest";
import {
  contactsPayload,
  contactsValid,
  displayPhone,
  resolveResponseContacts,
} from "./response-contacts";

describe("resolveResponseContacts (№322)", () => {
  it("берёт номер и способы из прошлого отклика", () => {
    expect(
      resolveResponseContacts({
        last: { contact_phone: "+79281234567", whatsapp_phone: "+79281234567" },
        profilePhone: "+79000000000",
        loginPhone: "+79111111111",
      }),
    ).toEqual({ phone: "+79281234567", call: true, whatsapp: true, waPhone: "" });
  });

  it("прошлый отклик только с WhatsApp — звонки выключены", () => {
    expect(
      resolveResponseContacts({ last: { contact_phone: null, whatsapp_phone: "+79281234567" } }),
    ).toEqual({ phone: "+79281234567", call: false, whatsapp: true, waPhone: "" });
  });

  it("отдельный номер WhatsApp из прошлого отклика сохраняется", () => {
    expect(
      resolveResponseContacts({
        last: { contact_phone: "+79281234567", whatsapp_phone: "+79287654321" },
      }).waPhone,
    ).toBe("+79287654321");
  });

  it("без откликов — контакты профиля, затем номер входа", () => {
    expect(
      resolveResponseContacts({ profilePhone: "+79000000000", loginPhone: "+7911" }).phone,
    ).toBe("+79000000000");
    const fromLogin = resolveResponseContacts({ loginPhone: "+79111111111" });
    expect(fromLogin).toEqual({ phone: "+79111111111", call: true, whatsapp: false, waPhone: "" });
  });

  it("WhatsApp включён, только если человек его указывал", () => {
    expect(
      resolveResponseContacts({ loginPhone: "+79111111111", profileWaSame: true }).whatsapp,
    ).toBe(true);
    expect(resolveResponseContacts({ loginPhone: "+79111111111" }).whatsapp).toBe(false);
  });

  it("ничего нет — пустой номер", () => {
    expect(resolveResponseContacts({}).phone).toBe("");
  });
});

describe("contactsValid / contactsPayload", () => {
  const base = { phone: "+7 928 123-45-67", call: true, whatsapp: false, waPhone: "" };

  it("нужен хотя бы один способ связи", () => {
    expect(contactsValid(base)).toBe(true);
    expect(contactsValid({ ...base, call: false })).toBe(false);
    expect(contactsValid({ ...base, call: false, whatsapp: true })).toBe(true);
  });

  it("неполный номер не отправляется", () => {
    expect(contactsValid({ ...base, phone: "+7 928" })).toBe(false);
    expect(contactsValid({ ...base, whatsapp: true, waPhone: "+7 92" })).toBe(false);
  });

  it("только WhatsApp — телефона в отклике нет", () => {
    expect(contactsPayload({ ...base, call: false, whatsapp: true })).toEqual({
      contactPhone: null,
      whatsappPhone: "+79281234567",
    });
  });

  it("отдельный номер WhatsApp уходит отдельно", () => {
    expect(contactsPayload({ ...base, whatsapp: true, waPhone: "8 928 765-43-21" })).toEqual({
      contactPhone: "+79281234567",
      whatsappPhone: "+79287654321",
    });
  });

  it("номер показывается маской", () => {
    expect(displayPhone("+79281234567")).toBe("+7 928 123-45-67");
    expect(displayPhone("+4915123456789")).toBe("+4915123456789");
  });
});
