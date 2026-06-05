// Отправка письма «сброс пароля» через интернет-API Unisender Go (2026-06-05).
//
// Зачем не Supabase SMTP: зарубежные серверы Supabase не дотягиваются до
// российского SMTP Unisender (postfix-соединение виснет → 504 upstream timeout).
// Проверено вживую. Зато HTTPS-API Unisender (goapi.unisender.ru, 443) работает
// между странами стабильно. Поэтому письмо шлём отсюда:
//   1) admin.generateLink(type:recovery) → ссылка восстановления Supabase;
//   2) отправляем письмо с этой ссылкой через API Unisender.
// Клиент (app/(auth)/forgot-password.tsx) зовёт эту функцию вместо
// supabase.auth.resetPasswordForEmail. Ссылка ведёт на xtrud.pro/reset-password,
// где экран reset-password подхватывает recovery-сессию (detectSessionInUrl).
//
// API-ключ Unisender читается из таблицы public.app_secrets (key=unisender_api_key)
// через service_role — в коде/репозитории ключа нет.
//
// Контракт: POST { email } → всегда 200 { ok:true } | { ok:false, error }.
// Для несуществующего email отвечаем ok:true (не раскрываем, есть ли аккаунт).
//
// ENV: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY инжектятся Supabase автоматически.
// verify_jwt=false: запрос анонимный (как публичный resetPasswordForEmail).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RESET_REDIRECT = "https://xtrud.pro/reset-password";
const UNISENDER_SEND_URL =
  "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";

function reply(obj: Record<string, unknown>) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function resetEmailHtml(actionLink: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111111;">
  <h1 style="font-size:20px;font-weight:700;margin:0 0 16px;">Сброс пароля</h1>
  <p style="font-size:15px;line-height:1.5;color:#333333;margin:0 0 20px;">Вы запросили сброс пароля в xtrud. Нажмите кнопку, чтобы задать новый пароль:</p>
  <a href="${actionLink}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:8px;font-size:15px;font-weight:600;">Задать новый пароль</a>
  <p style="font-size:13px;line-height:1.5;color:#777777;margin:24px 0 0;">Если вы не запрашивали сброс — просто проигнорируйте это письмо, пароль останется прежним. Ссылка действует ограниченное время.</p>
  <p style="font-size:13px;color:#999999;margin:16px 0 0;">xtrud — мастера для дома и ремонта</p>
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return reply({ ok: false, error: "Метод не поддерживается" });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "Некорректный запрос" });
  }
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return reply({ ok: false, error: "Укажите почту" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("[send-reset-email] missing SUPABASE_URL / SERVICE_ROLE_KEY");
    return reply({ ok: false, error: "Сервер не настроен" });
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // API-ключ Unisender из защищённой таблицы.
  const { data: cfg, error: cfgErr } = await admin
    .from("app_secrets")
    .select("value")
    .eq("key", "unisender_api_key")
    .maybeSingle();
  if (cfgErr || !cfg?.value) {
    console.error("[send-reset-email] no unisender key:", cfgErr?.message);
    return reply({ ok: false, error: "Почтовый сервис не настроен" });
  }
  const apiKey = cfg.value;

  // Ссылка восстановления. Несуществующий email → молча ok (защита от перебора).
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: RESET_REDIRECT },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    const msg = (linkErr?.message ?? "").toLowerCase();
    if (msg.includes("not found") || msg.includes("no user") || msg.includes("user not")) {
      return reply({ ok: true });
    }
    console.error("[send-reset-email] generateLink failed:", linkErr?.message);
    return reply({ ok: false, error: "Не удалось подготовить ссылку" });
  }
  const actionLink = linkData.properties.action_link;

  // Отправка через API Unisender (track_links:0 → ссылка прямая, без обёртки).
  let result: { status?: string; message?: string };
  try {
    const resp = await fetch(UNISENDER_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
      body: JSON.stringify({
        message: {
          recipients: [{ email }],
          subject: "Сброс пароля — xtrud",
          from_email: "noreply@xtrud.pro",
          from_name: "xtrud",
          body: { html: resetEmailHtml(actionLink) },
          track_links: 0,
          track_read: 0,
        },
      }),
    });
    result = await resp.json();
  } catch (err) {
    console.error("[send-reset-email] unisender request failed:", err);
    return reply({ ok: false, error: "Почтовый сервис недоступен" });
  }

  if (result.status !== "success") {
    console.error("[send-reset-email] unisender rejected:", JSON.stringify(result));
    return reply({ ok: false, error: "Не удалось отправить письмо" });
  }

  return reply({ ok: true });
});
