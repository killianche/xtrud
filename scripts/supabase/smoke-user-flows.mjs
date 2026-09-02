#!/usr/bin/env node
// Сквозная проверка пользовательских сценариев против ЖИВОГО сервера.
//
// Проверяет не «сервер отвечает 200», а то, что приложение может пройти
// сценарий целиком и что защита действительно не пускает туда, куда не должна.
//
// Запуск:
//   node scripts/supabase/smoke-user-flows.mjs
//
// Переменные (по умолчанию — production на Beget):
//   XTRUD_URL       адрес backend
//   XTRUD_ANON_KEY  публичный ключ
//
// Скрипт СОЗДАЁТ тестового пользователя и удаляет его в конце. При падении
// посреди сценария аккаунт остаётся — его телефон печатается, чтобы можно
// было убрать вручную.

const URL_BASE = process.env.XTRUD_URL ?? "https://api.xtrud.pro";
const ANON = process.env.XTRUD_ANON_KEY ?? "";

if (!ANON) {
  console.error("Не задан XTRUD_ANON_KEY.");
  process.exit(2);
}

let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(path, { token, method = "GET", body, headers } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    headers: {
      apikey: ANON,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
}

const stamp = Date.now().toString().slice(-7);
const PHONE = `+7999${stamp}`;
const DIGITS = PHONE.replace(/\D/g, "");
const EMAIL = `${DIGITS}@phone.xtrud.pro`;
const PASSWORD = `smoke-${stamp}-pass`;

async function main() {
  console.log(`Сервер: ${URL_BASE}`);
  console.log(`Тестовый номер: ${PHONE}\n`);

  // ---- До входа: что видит аноним -----------------------------------------
  console.log("Анонимные экраны");
  const cats = await call("/rest/v1/categories_l1?select=id,name_ru");
  report("категории читаются", cats.ok && Array.isArray(cats.body) && cats.body.length > 0);

  const feed = await call("/rest/v1/orders?select=id,title,budget_kind&status=eq.open&limit=5");
  report(
    "лента открытых заданий не пуста",
    feed.ok && Array.isArray(feed.body) && feed.body.length > 0,
    feed.ok ? `получено ${feed.body?.length ?? 0}` : `код ${feed.status}`,
  );

  const publicUsers = await call("/rest/v1/users?select=id,first_name,is_master&limit=3");
  report("публичные профили читаются", publicUsers.ok);

  // ---- До входа: чего аноним видеть НЕ должен ------------------------------
  console.log("\nЗащита от анонимного чтения");
  const phones = await call("/rest/v1/users?select=contact_phone&limit=1");
  report("телефоны закрыты", !phones.ok, `код ${phones.status}`);

  const inn = await call("/rest/v1/master_profiles?select=inn&limit=1");
  report("реквизиты мастеров закрыты", !inn.ok, `код ${inn.status}`);

  // ---- Регистрация и вход --------------------------------------------------
  console.log("\nРегистрация и вход");
  const reg = await call("/functions/v1/register-user", {
    token: ANON,
    method: "POST",
    body: { phone: PHONE, email: EMAIL, password: PASSWORD },
  });
  report(
    "регистрация по телефону и паролю",
    reg.ok && reg.body?.ok === true,
    JSON.stringify(reg.body).slice(0, 80),
  );

  const resolved = await call("/rest/v1/rpc/resolve_login_email", {
    method: "POST",
    body: { p_login: PHONE },
  });
  report("номер находит учётную запись", resolved.ok && typeof resolved.body === "string");

  const login = await call("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email: resolved.body, password: PASSWORD },
  });
  const token = login.body?.access_token ?? null;
  const uid = login.body?.user?.id ?? null;
  report("вход по номеру выдаёт сессию", Boolean(token));

  if (!token) {
    console.log("\nБез сессии продолжать нельзя.");
    return;
  }

  // ---- Профиль создан триггером -------------------------------------------
  const me = await call(`/rest/v1/users?select=id,active_role,status&id=eq.${uid}`, { token });
  const profile = Array.isArray(me.body) ? me.body[0] : null;
  report(
    "профиль создан автоматически",
    Boolean(profile),
    profile ? `роль ${profile.active_role}` : "профиля нет",
  );

  const own = await call("/rest/v1/users?select=*&limit=1", { token });
  report("своя запись читается целиком", own.ok);

  // ---- Защита от повышения прав -------------------------------------------
  console.log("\nЗащита прав");
  const admin = await call(`/rest/v1/users?id=eq.${uid}`, {
    token,
    method: "PATCH",
    body: { is_admin: true },
  });
  report("нельзя выдать себе администратора", !admin.ok, `код ${admin.status}`);

  const status = await call(`/rest/v1/users?id=eq.${uid}`, {
    token,
    method: "PATCH",
    body: { status: "active" },
  });
  // Переход active → active охранник пропускает: значение не меняется.
  // Проверяем именно попытку СМЕНЫ на banned.
  const unban = await call(`/rest/v1/users?id=eq.${uid}`, {
    token,
    method: "PATCH",
    body: { status: "banned" },
  });
  report("нельзя менять свой статус", !unban.ok, `код ${unban.status}`);
  void status;

  const rank = await call(`/rest/v1/master_profiles?user_id=eq.${uid}`, {
    token,
    method: "PATCH",
    body: { ranking_score: 999999 },
  });
  report("нельзя поднять себя в выдаче", !rank.ok, `код ${rank.status}`);

  // ---- Карточка мастера: объединённый запрос -------------------------------
  console.log("\nЭкран мастера");
  const anyMaster = await call("/rest/v1/users?select=id&is_master=eq.true&limit=1", { token });
  const masterId = Array.isArray(anyMaster.body) ? anyMaster.body[0]?.id : null;
  if (masterId) {
    const sel =
      "id,first_name,last_name,avatar_url,city_id,district,is_master," +
      "master:master_profiles!master_profiles_user_id_fkey(bio,experience_years,rating_overall_avg,status)";
    const card = await call(`/rest/v1/users?select=${sel}&id=eq.${masterId}`, { token });
    const row = Array.isArray(card.body) ? card.body[0] : null;
    report("профиль мастера приходит одним запросом", card.ok && Boolean(row?.master));

    const phone = await call("/rest/v1/rpc/get_master_phone", {
      token,
      method: "POST",
      body: { p_master_id: masterId },
    });
    report("телефон мастера отдаётся без ошибки", phone.ok);
  } else {
    report("профиль мастера приходит одним запросом", false, "мастеров в базе нет");
  }

  // ---- Блокировка ----------------------------------------------------------
  console.log("\nБлокировка");
  if (masterId) {
    const block = await call("/rest/v1/user_blocks", {
      token,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: { blocker_id: uid, blocked_id: masterId },
    });
    report("можно заблокировать пользователя", block.status === 201, `код ${block.status}`);
    const list = await call("/rest/v1/user_blocks?select=blocked_id", { token });
    report(
      "список блокировок читается",
      list.ok && Array.isArray(list.body) && list.body.length > 0,
    );
    const unblock = await call(`/rest/v1/user_blocks?blocked_id=eq.${masterId}`, {
      token,
      method: "DELETE",
    });
    report("можно снять блокировку", unblock.status === 204, `код ${unblock.status}`);
  }

  // ---- Отзывы: защита ------------------------------------------------------
  console.log("\nОтзывы");
  const anyReview = await call("/rest/v1/reviews?select=id,target_id&limit=1", { token });
  const reviewId = Array.isArray(anyReview.body) ? anyReview.body[0]?.id : null;
  if (reviewId) {
    const retarget = await call(`/rest/v1/reviews?id=eq.${reviewId}`, {
      token,
      method: "PATCH",
      body: { target_id: uid },
    });
    report("нельзя перенаправить чужой отзыв", !retarget.ok, `код ${retarget.status}`);

    // Код ответа здесь ничего не доказывает: PATCH, не подошедший ни под одну
    // строку по RLS, тоже возвращает 204. Проверяем ФАКТ — статус отзыва.
    const before = await call(`/rest/v1/reviews?select=status&id=eq.${reviewId}`, { token });
    const statusBefore = Array.isArray(before.body) ? before.body[0]?.status : null;
    await call(`/rest/v1/reviews?id=eq.${reviewId}`, {
      token,
      method: "PATCH",
      body: { status: statusBefore === "hidden" ? "visible" : "hidden" },
    });
    const after = await call(`/rest/v1/reviews?select=status&id=eq.${reviewId}`, { token });
    const statusAfter = Array.isArray(after.body) ? after.body[0]?.status : null;
    report(
      "обычный пользователь не меняет видимость отзыва",
      statusBefore !== null && statusAfter === statusBefore,
      `было ${statusBefore}, стало ${statusAfter}`,
    );
  } else {
    report("нельзя перенаправить чужой отзыв", false, "отзывов в базе нет");
  }

  // ---- Уборка --------------------------------------------------------------
  console.log("\nУборка");
  const del = await call("/rest/v1/rpc/delete_my_account", { token, method: "POST" });
  if (del.ok) {
    report("тестовый аккаунт удалён", true);
  } else {
    report("тестовый аккаунт удалён", false, `код ${del.status}; убрать вручную: ${PHONE}`);
  }
}

main()
  .then(() => {
    console.log(`\nИтог: пройдено ${passed}, провалено ${failed}`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error("\nСценарий оборвался:", err?.message ?? err);
    console.error(`Тестовый аккаунт мог остаться: ${PHONE}`);
    process.exit(2);
  });
