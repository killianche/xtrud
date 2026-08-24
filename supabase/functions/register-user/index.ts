// Регистрация пользователя по «почта + пароль + телефон» (с 2026-06-05).
//
// Зачем серверная функция, а не клиентский supabase.auth.signUp:
//   В Supabase включено «Confirm email». При обычном signUp пользователь
//   создаётся БЕЗ сессии до подтверждения письма — а мы письма-подтверждения
//   не шлём (продукт телефоно-ориентированный, почта нужна лишь для сброса
//   пароля). Поэтому создаём пользователя сразу подтверждённым через admin API
//   (email_confirm:true), и клиент тут же входит по паролю → сессия есть.
//   Так регистрация работает БЕЗ ручного переключения настроек в дашборде.
//
// Контракт:
//   POST { phone: "+7XXXXXXXXXX", email: "...", password: "..." }
//   Всегда отвечает 200 с телом { ok:true } | { ok:false, error:"..." }
//   (чтобы supabase-js не превращал прикладную ошибку в throw — клиент читает data).
//
// verify_jwt=false: регистрация анонимна (как публичный signUp). Поверхность
// атаки та же, что у встроенного signUp. Сам пароль задаёт пользователь.
//
// ENV: SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY Supabase инжектит в функции
// автоматически — отдельные секреты не нужны.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(obj: Record<string, unknown>) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Каноническая форма телефона для хранения (зеркало normalizePhone на клиенте,
 * src/features/auth/validation.ts). Уже собранный международный номер с кодом
 * ≠ 7 (+49…, +375…, +1…) НЕ переписываем в +7 — иначе foreign-номер искажался
 * бы и вход по нему был бы невозможен. РФ/КЗ приводим к +7XXXXXXXXXX.
 */
function canonicalPhone(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const digits = (s: string) => s.replace(/\D/g, "");
  // Международный номер с кодом страны ≠ 7 — чистим до `+` + цифры, не трогаем.
  if (/^\+[1-9]\d{6,}$/.test(trimmed)) {
    const all = digits(trimmed);
    if (all.length > 0 && all[0] !== "7") return `+${all}`;
  }
  // РФ/КЗ: снимаем literal `+7`, отбрасываем ведущую 7/8 у 11-значного.
  const stripped = trimmed.replace(/^\+7/, "");
  let d = digits(stripped);
  if (d.length === 11 && (d[0] === "7" || d[0] === "8")) d = d.slice(1);
  return `+7${d.slice(0, 10)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return reply({ ok: false, error: "Метод не поддерживается" });
  }

  let body: { phone?: string; email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error: "Некорректный запрос" });
  }

  const email = String(body.email ?? "")
    .trim()
    .toLowerCase();
  const password = String(body.password ?? "");
  // Нормализуем телефон на сервере (защита: не полагаемся только на клиент).
  // РФ/КЗ-ввод приводим к +7XXXXXXXXXX; уже собранный международный номер
  // (+49…, +375…, +1…) сохраняем как есть — симметрично normalizePhone на клиенте.
  const phone = canonicalPhone(String(body.phone ?? "").trim());

  if (!email || !password) {
    return reply({ ok: false, error: "Почта и пароль обязательны" });
  }
  if (password.length < 6) {
    return reply({ ok: false, error: "Пароль минимум 6 символов" });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    console.error("[register-user] missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return reply({ ok: false, error: "Сервер не настроен" });
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Телефон уникален (users_private.phone UNIQUE). Проверяем ДО создания
  // аккаунта: иначе при занятом номере UPDATE-телефона падал бы по уникальному
  // ключу, а пользователь оставался бы «осиротевшим» (почта есть, телефона нет,
  // войти по номеру нельзя). Лучше сразу сказать «номер занят».
  if (phone) {
    const { data: existing, error: existErr } = await admin
      .from("users_private")
      .select("user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (existErr) {
      console.error("[register-user] phone check failed:", existErr.message);
      return reply({ ok: false, error: "Сервер недоступен. Попробуйте позже." });
    }
    if (existing) {
      return reply({
        ok: false,
        error: "Этот номер уже зарегистрирован. Войдите или восстановите пароль.",
      });
    }
  }

  // Создаём пользователя сразу подтверждённым → вход по паролю заработает мгновенно.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return reply({ ok: false, error: "Эта почта уже зарегистрирована. Войдите." });
    }
    if (msg.includes("invalid") && msg.includes("email")) {
      return reply({ ok: false, error: "Некорректная почта" });
    }
    console.error("[register-user] createUser failed:", error.message);
    return reply({ ok: false, error: error.message });
  }

  const userId = data.user?.id;

  // Сохраняем телефон в профиль. Триггер handle_new_auth_user уже создал
  // строки users / users_private в той же транзакции создания пользователя.
  if (userId && phone) {
    const { error: phoneErr } = await admin
      .from("users_private")
      .update({ phone })
      .eq("user_id", userId);
    if (phoneErr) {
      // Гонка: номер заняли между проверкой выше и этим UPDATE (нарушение
      // UNIQUE). Не оставляем осиротевший аккаунт без телефона — удаляем
      // только что созданного пользователя и сообщаем об ошибке.
      console.error("[register-user] phone save failed, rolling back user:", phoneErr.message);
      await admin.auth.admin.deleteUser(userId);
      return reply({
        ok: false,
        error: "Этот номер уже зарегистрирован. Войдите или восстановите пароль.",
      });
    }
  }

  return reply({ ok: true });
});
