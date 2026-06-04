// Supabase Auth «Send SMS Hook» → доставка OTP через SMS.ru.
//
// Supabase сам генерирует и проверяет код. Наша задача — только доставить
// присланный sms.otp на user.phone через SMS.ru.
//
// Контракт hook'а (https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook):
//   payload = { user: { phone, ... }, sms: { otp } }
//   запрос подписан секретом SEND_SMS_HOOK_SECRET (standardwebhooks).
//
// ENV (задаются в Supabase Dashboard → Edge Functions → Secrets):
//   SEND_SMS_HOOK_SECRET — секрет hook'а (формат v1,whsec_...), генерит дашборд.
//   SMSRU_API_ID         — API-ключ SMS.ru из личного кабинета.
//   SMSRU_FROM           — (опц.) зарегистрированное имя отправителя.
//
// verify_jwt=false: hook зовётся без пользовательского JWT, подлинность —
// через подпись вебхука (wh.verify ниже).
//
// Деплой: через Supabase MCP deploy_edge_function (имя send-sms) ИЛИ
//   npx supabase functions deploy send-sms --no-verify-jwt

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

Deno.serve(async (req) => {
  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  const apiId = Deno.env.get("SMSRU_API_ID");
  const from = Deno.env.get("SMSRU_FROM"); // опционально

  if (!hookSecret || !apiId) {
    console.error("[send-sms] missing env: SEND_SMS_HOOK_SECRET or SMSRU_API_ID");
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: "SMS hook not configured" } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let user: { phone?: string };
  let sms: { otp?: string };
  try {
    const base64Secret = hookSecret.replace("v1,whsec_", "");
    const wh = new Webhook(base64Secret);
    const verified = wh.verify(payload, headers) as {
      user: { phone?: string };
      sms: { otp?: string };
    };
    user = verified.user;
    sms = verified.sms;
  } catch (err) {
    console.error("[send-sms] signature verify failed:", err);
    return new Response(
      JSON.stringify({ error: { http_code: 401, message: "Invalid signature" } }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const phone = (user?.phone ?? "").replace(/\D/g, ""); // SMS.ru ждёт цифры без +
  const otp = sms?.otp ?? "";
  if (!phone || !otp) {
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: "Missing phone or otp" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const message = `Kod dlya vhoda v xtrud: ${otp}`;

  const params = new URLSearchParams({
    api_id: apiId,
    to: phone,
    msg: message,
    json: "1",
  });
  if (from) params.set("from", from);

  let smsruResp: {
    status?: string;
    status_code?: number;
    status_text?: string;
    sms?: Record<string, { status?: string; status_code?: number; status_text?: string }>;
  };
  try {
    const resp = await fetch(`https://sms.ru/sms/send?${params.toString()}`);
    smsruResp = await resp.json();
  } catch (err) {
    console.error("[send-sms] SMS.ru request failed:", err);
    return new Response(
      JSON.stringify({ error: { http_code: 502, message: "SMS provider unreachable" } }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // SMS.ru: общий status OK + per-number status. Проверяем оба.
  const perNumber = smsruResp.sms?.[phone];
  const ok = smsruResp.status === "OK" && (!perNumber || perNumber.status === "OK");
  if (!ok) {
    const detail =
      perNumber?.status_text ?? smsruResp.status_text ?? `code ${smsruResp.status_code}`;
    console.error("[send-sms] SMS.ru rejected:", JSON.stringify(smsruResp));
    return new Response(
      JSON.stringify({ error: { http_code: 400, message: `SMS.ru: ${detail}` } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
