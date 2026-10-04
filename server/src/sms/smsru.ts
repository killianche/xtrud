// Отправка SMS через SMS.ru (https://sms.ru/api/send) — коды подтверждения
// номера (2026-10-04, владелец: «подключить SMS с кодом»).
//
// Ключ — SMSRU_API_ID в /opt/xtrud/xtrud-api.env, в Git не попадает. Имя
// отправителя — согласованное в кабинете SMS.ru («xtrud.pro»). На 2026-10-04
// у него подключён только Билайн (FACT по /sms/cost): на МТС, МегаФон и Т2
// SMS.ru отвечает 204 «оператор не подключён», это отдаётся человеку как
// «не удалось отправить», а не как успех.

export type SmsResult =
  | { ok: true; smsId: string | null }
  | { ok: false; reason: "unreachable" | "invalid_number" | "provider_limit" | "provider_error" };

export interface SmsSender {
  send(phone: string, text: string): Promise<SmsResult>;
}

interface SmsRuSendResponse {
  status?: string;
  status_code?: number;
  sms?: Record<string, { status?: string; status_code?: number; sms_id?: string }>;
}

/**
 * Разбор ответа SMS.ru. Общий статус — про запрос, статус в `sms[номер]` —
 * про конкретное сообщение; успех только когда оба OK (100).
 * Коды: https://sms.ru/api/send (таблица статусов).
 */
export function parseSmsRuResponse(body: unknown): SmsResult {
  const res = (body ?? {}) as SmsRuSendResponse;
  const one = res.sms ? Object.values(res.sms)[0] : undefined;
  if (res.status === "OK" && one?.status === "OK" && one.status_code === 100) {
    return { ok: true, smsId: one.sms_id ?? null };
  }
  const code = one?.status_code ?? res.status_code ?? 0;
  // 202 — неверный номер; 203 — нет текста; 204 — оператор не подключён
  // у отправителя; 205–208, 230–233 — лимиты; 201 — нет денег на балансе.
  if (code === 202) return { ok: false, reason: "invalid_number" };
  if (code === 204) return { ok: false, reason: "unreachable" };
  if (code === 201 || code === 206 || code === 207 || (code >= 230 && code <= 233)) {
    return { ok: false, reason: "provider_limit" };
  }
  return { ok: false, reason: "provider_error" };
}

export class SmsRu implements SmsSender {
  constructor(
    private readonly apiId: string,
    private readonly from: string,
    private readonly test = false,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(phone: string, text: string): Promise<SmsResult> {
    const params = new URLSearchParams({
      api_id: this.apiId,
      to: phone.replace(/\D/g, ""),
      msg: text,
      from: this.from,
      json: "1",
    });
    if (this.test) params.set("test", "1");
    try {
      const res = await this.fetchImpl("https://sms.ru/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return { ok: false, reason: "provider_error" };
      return parseSmsRuResponse(await res.json());
    } catch {
      return { ok: false, reason: "provider_error" };
    }
  }
}
