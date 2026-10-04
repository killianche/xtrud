// Обратный звонок SMS.ru (https://sms.ru/api/call, обновлено 2025-06-16) —
// подтверждение номера при регистрации (2026-10-04, №209). Человек сам звонит
// со своего номера на выданный бесплатный номер 8-800, SMS.ru сбрасывает
// звонок и отмечает номер подтверждённым. Входящие звонки от компаний
// операторы режут без маркировки — исходящий звонок человека от этого не
// зависит (выбор владельца, docs/PHONE_CALL_VERIFICATION_2026-10.md).
//
//   callcheck/add {api_id, phone, ip, json=1} → {status, status_code,
//     check_id, call_phone, call_phone_pretty}
//   callcheck/status {api_id, check_id, json=1} → {status, status_code,
//     check_status: "400" ждём | "401" подтверждён | "402" истекло}
//
// Ключ — SMSRU_API_ID в /opt/xtrud/xtrud-api.env, в Git не попадает.

export type AddResult =
  | { ok: true; checkId: string; callPhone: string; callPhonePretty: string }
  | { ok: false; reason: "invalid_number" | "provider_limit" | "provider_error"; code: number };

export type StatusResult = "confirmed" | "waiting" | "expired" | "provider_error";

export interface CallCheckProvider {
  add(phone: string, ip: string | null): Promise<AddResult>;
  status(checkId: string): Promise<StatusResult>;
}

const BASE = "https://sms.ru/callcheck";

function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Разбор ответа callcheck/add. В примере JSON номер — `call_phone`, в
 * примере кода той же страницы — `call_number`: принимаются оба. Живой ответ
 * (FACT 2026-10-04): `call_phone: "+78007779999"`, `call_phone_pretty:
 * "8-800-777-9999"`, `check_status` в статусе — число 400. Номер приводится
 * к цифрам.
 */
export function parseAdd(body: unknown): AddResult {
  const r = (body ?? {}) as Record<string, unknown>;
  const code = Number(r.status_code ?? 0);
  const checkId = str(r.check_id);
  const callPhone = (str(r.call_phone) ?? str(r.call_number))?.replace(/\D/g, "") ?? null;
  if (r.status === "OK" && code === 100 && checkId && callPhone && /^\d{10,15}$/.test(callPhone)) {
    const pretty = str(r.call_phone_pretty) ?? str(r.call_number_pretty) ?? `+${callPhone}`;
    return { ok: true, checkId, callPhone, callPhonePretty: pretty };
  }
  // 202 — номер указан неверно; 201 — нет денег; 230–233 — лимиты SMS.ru.
  if (code === 202) return { ok: false, reason: "invalid_number", code };
  if (code === 201 || (code >= 230 && code <= 233)) {
    return { ok: false, reason: "provider_limit", code };
  }
  return { ok: false, reason: "provider_error", code };
}

/** Разбор callcheck/status: подтверждено — только явный 401. */
export function parseStatus(body: unknown): StatusResult {
  const r = (body ?? {}) as Record<string, unknown>;
  if (r.status !== "OK") return "provider_error";
  const s = str(r.check_status);
  if (s === "401") return "confirmed";
  if (s === "400") return "waiting";
  if (s === "402") return "expired";
  return "provider_error";
}

export class SmsRuCallCheck implements CallCheckProvider {
  constructor(
    private readonly apiId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, params: Record<string, string>): Promise<unknown> {
    const res = await this.fetchImpl(`${BASE}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ api_id: this.apiId, json: "1", ...params }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`sms.ru ${res.status}`);
    return res.json();
  }

  async add(phone: string, ip: string | null): Promise<AddResult> {
    try {
      // IP человека: по нему SMS.ru видит роуминг и выдаёт обычный номер
      // вместо 8-800 (на 8-800 из-за границы не позвонить).
      const params: Record<string, string> = { phone: phone.replace(/\D/g, "") };
      if (ip) params.ip = ip;
      return parseAdd(await this.post("add", params));
    } catch {
      return { ok: false, reason: "provider_error", code: 0 };
    }
  }

  async status(checkId: string): Promise<StatusResult> {
    try {
      return parseStatus(await this.post("status", { check_id: checkId }));
    } catch {
      return "provider_error";
    }
  }
}
