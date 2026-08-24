// Edge function `notify` — посылает Expo Push уведомления одному пользователю.
//
// Sprint 8.6 MVP:
// - verify_jwt=false. Защищён shared secret в header `x-notify-secret`,
//   хранится в vault.secrets[name='notify_secret'].
// - Читает `vault.decrypted_secrets` через service_role_key (built-in).
// - secret-значение кешируется в instance memory — второй и дальнейшие
//   вызовы не стучат в БД.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

type Payload = {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
let cachedSecret: string | null = null;

async function loadSecret(supa: SupabaseClient): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const { data, error } = await supa
    .schema("vault")
    .from("decrypted_secrets")
    .select("decrypted_secret")
    .eq("name", "notify_secret")
    .maybeSingle();
  if (error || !data?.decrypted_secret) return null;
  cachedSecret = data.decrypted_secret as string;
  return cachedSecret;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response("Server misconfigured", { status: 500 });
  }
  const supa = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const expected = await loadSecret(supa);
  const provided = req.headers.get("x-notify-secret");
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (!payload?.user_id || !payload?.title || !payload?.body) {
    return new Response("Missing fields", { status: 400 });
  }

  const { data: tokens, error } = await supa
    .from("notification_tokens")
    .select("expo_token")
    .eq("user_id", payload.user_id);
  if (error) {
    return new Response(`Token query failed: ${error.message}`, { status: 500 });
  }
  if (!tokens || tokens.length === 0) {
    return new Response("No tokens for user", { status: 200 });
  }

  const messages = tokens.map((t) => ({
    to: t.expo_token,
    sound: "default",
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));

  const expoRes = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "accept-encoding": "gzip, deflate",
    },
    body: JSON.stringify(messages),
  });

  const expoText = await expoRes.text();
  return new Response(expoText, {
    status: expoRes.status,
    headers: { "content-type": "application/json" },
  });
});
