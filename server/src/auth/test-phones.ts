// Тестовые номера без звонка (№380, 2026-11-09). С отключёнными паролями
// вход — только подтверждением номера звонком, а ревьюер App Store и Google
// Play позвонить с российского номера не может. Номер из
// CALLCHECK_TEST_PHONES подтверждается сам (auth/routes.ts, /auth/call/start).
//
// Ограничения (ревью xtrud-security, H1 и M2): только вход, только в
// существующий аккаунт без прав сотрудника, вне общих лимитов звонков. Номер
// — фактически пароль ревьюера: хранится только в /opt/xtrud/xtrud-api.env и
// в заметках для проверки в магазинах, в Git его нет (DEMO_ACCOUNTS.md).

/** "+79280000000, 79280000001" → {"+79280000000", "+79280000001"}. */
export function parseTestPhones(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const digits = part.replace(/\D/g, "");
    if (/^79\d{9}$/.test(digits)) out.add(`+${digits}`);
  }
  return out;
}

/** Номер «для звонка» у тестового номера: звонить не нужно. */
export const TEST_CALL = { callPhone: "78000000000", callPhonePretty: "Звонить не нужно" } as const;
