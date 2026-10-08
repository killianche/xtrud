// Выдуманные данные для снимков админки (admin-shot.mjs). Имена и номера —
// не настоящие люди; к живой базе ничего не обращается.

const now = Date.parse("2026-10-04T12:00:00Z");
const ago = (h) => new Date(now - h * 3600_000).toISOString();
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const people = [
  ["Адам", "Евлоев", "+79280000101", "active", true],
  ["Мадина", "Котиева", "+79280000102", "active", false],
  ["Ибрагим", "Мальсагов", "+79280000103", "active", true],
  ["Зарина", "Гагиева", "+79280000104", "suspended", false],
  ["Руслан", "Барахоев", "+79280000105", "active", true],
  ["Лейла", "Цечоева", "+79280000106", "active", false],
  ["Магомед", "Озиев", "+79280000107", "banned", false],
  ["Хава", "Албакова", "+79280000108", "active", true],
];

const users = people.map(([first, last, phone, status, master], i) => ({
  id: id(100 + i),
  first_name: first,
  last_name: last,
  phone,
  status,
  is_master: master,
  is_admin: i === 0,
  created_at: ago(24 * (i * 5 + 1)),
  orders_count: (i * 3) % 7,
  responses_count: master ? (i * 5) % 11 : 0,
}));

const orders = [
  ["Поклеить обои в двух комнатах", "open", "Назрань"],
  ["Собрать кухонный гарнитур", "in_progress", "Магас"],
  ["Починить смеситель в ванной", "completed", "Карабулак"],
  ["Перевезти холодильник", "open", "Сунжа"],
  ["Уборка после ремонта, 3 комнаты", "cancelled", "Назрань"],
  ["Установить кондиционер", "open", "Малгобек"],
].map(([title, status, city], i) => ({
  id: id(200 + i),
  title,
  status,
  city,
  created_at: ago(5 + i * 9),
  responses_count: (i * 2 + 1) % 6,
  client_id: users[i % users.length].id,
  client_label: `${users[i % users.length].first_name} ${users[i % users.length].last_name}`,
  category: ["Обои", "Сборка мебели", "Сантехника", "Грузоперевозки", "Уборка", "Кондиционеры"][i],
  is_hidden: false,
}));

const reports = [
  {
    id: id(300),
    created_at: ago(2),
    status: "pending",
    reason: "fraud",
    description: "Просит предоплату на карту до начала работ.",
    target_type: "user",
    target_id: users[6].id,
    target_label: "Магомед Озиев",
    target_user_id: users[6].id,
    reporter_id: users[1].id,
    reporter_label: "Мадина Котиева",
    reports_on_target: 3,
    reports_by_reporter: 1,
  },
  {
    id: id(301),
    created_at: ago(20),
    status: "pending",
    reason: "spam",
    description: null,
    target_type: "order",
    target_id: orders[3].id,
    target_label: orders[3].title,
    target_user_id: users[3].id,
    reporter_id: users[2].id,
    reporter_label: "Ибрагим Мальсагов",
    reports_on_target: 1,
    reports_by_reporter: 2,
  },
];

export function fixture(path, args) {
  const fn = path.replace(/^\/v2\/rpc\//, "");
  switch (fn) {
    case "admin_metrics":
      return {
        users_total: 214,
        users_suspended: 2,
        users_banned: 1,
        masters_total: 61,
        orders_open: 18,
        orders_total: 143,
        responses_total: 402,
        reports_open: 2,
        signups_7d: 23,
      };
    case "admin_list_users":
      return users;
    case "admin_user_card": {
      const u = users.find((x) => x.id === args.p_user_id) ?? users[0];
      return {
        user: {
          ...u,
          username: null,
          login_email: `${u.phone.replace(/\D/g, "")}@phone.xtrud.pro`,
          last_sign_in_at: ago(3),
          city_id: "nazran",
          district: null,
        },
        orders: orders
          .slice(0, 3)
          .map((o) => ({ id: o.id, title: o.title, status: o.status, created_at: o.created_at })),
        responses: [
          { id: id(400), order_id: orders[1].id, status: "accepted", created_at: ago(30) },
        ],
        reviews: [{ id: id(500), rating: 5, status: "visible", created_at: ago(70) }],
      };
    }
    case "admin_list_reports":
      return args.p_status ? reports.filter((r) => r.status === args.p_status) : reports;
    case "admin_list_masters":
      return users
        .filter((u) => u.is_master)
        .map((u, i) => ({
          id: u.id,
          first_name: u.first_name,
          last_name: u.last_name,
          phone: u.phone,
          user_status: u.status,
          master_status: i === 2 ? "pending" : "active",
          is_hidden: i === 3,
          categories: [
            ["Электрика", "Сантехника"],
            ["Сборка мебели"],
            ["Обои", "Покраска"],
            ["Уборка"],
          ][i % 4],
          photos_count: i * 2,
          rating_avg: i === 1 ? null : 4.6 + i * 0.1,
          rating_count: i * 3,
          created_at: u.created_at,
        }));
    case "admin_list_verifications":
      return [
        {
          user_id: users[2].id,
          first_name: "Ибрагим",
          last_name: "Мальсагов",
          phone: users[2].phone,
          status: "pending",
          passport_main_path: "x/passport.jpg",
          selfie_path: null,
          submitted_at: ago(6),
          reviewed_at: null,
          rejection_reason: null,
          verification_level: null,
        },
      ];
    case "admin_list_actions":
      return [
        {
          id: id(600),
          performed_at: ago(1),
          admin_label: "Администратор",
          action: "set_password",
          target_type: "user",
          target_id: users[5].id,
          reason: "Заявка: забыла пароль",
          details: {},
        },
        {
          id: id(601),
          performed_at: ago(26),
          admin_label: "Администратор",
          action: "suspend",
          target_type: "user",
          target_id: users[3].id,
          reason: "Оскорбления в отзывах",
          details: {},
        },
        {
          id: id(602),
          performed_at: ago(50),
          admin_label: "Администратор",
          action: "verification_approve",
          target_type: "user",
          target_id: users[0].id,
          reason: "Паспорт совпадает",
          details: {},
        },
      ];
    case "admin_list_promo_banners":
      return [];
    case "admin_list_recovery_requests":
      return [
        {
          id: id(700),
          created_at: ago(1),
          status: "new",
          phone: users[5].phone,
          user_id: users[5].id,
          user_label: "Лейла Цечоева",
          note: null,
          handled_at: null,
        },
      ];
    case "get_order_limits":
      return { daily: 3, active: 5 };
    // Новые функции редизайна — те же выдуманные данные.
    case "admin_list_orders":
      return args.p_status ? orders.filter((o) => o.status === args.p_status) : orders;
    case "admin_order_card": {
      const o = orders.find((x) => x.id === args.p_order_id) ?? orders[0];
      return {
        order: {
          ...o,
          description: "Две комнаты по 18 м², обои флизелиновые, стены ровные. Материал есть.",
          budget: "от 8 000 ₽",
          contact_mode: "chat_only",
          district: null,
          picked_master_id: null,
          picked_master_label: null,
          photo_urls: [],
          client_phone: "+79280000101",
          budget_kind: "from",
          budget_value: 8000,
        },
        reviews: [],
        responses: users
          .filter((u) => u.is_master)
          .slice(0, 3)
          .map((u, i) => ({
            id: id(800 + i),
            master_id: u.id,
            master_label: `${u.first_name} ${u.last_name}`,
            status: i === 0 ? "viewed" : "sent",
            price_kind: i === 0 ? "fixed" : "negotiable",
            price_value: i === 0 ? 9000 : null,
            message: "Могу завтра после обеда.",
            created_at: ago(2 + i),
          })),
      };
    }
    case "admin_list_reviews":
      return [
        {
          id: id(900),
          created_at: ago(8),
          rating: 5,
          text: "Всё сделал аккуратно и вовремя, рекомендую.",
          status: "visible",
          author_label: "Мадина Котиева",
          target_label: "Адам Евлоев",
          order_title: orders[2].title,
        },
        {
          id: id(901),
          created_at: ago(40),
          rating: 1,
          text: "Не пришёл и не предупредил.",
          status: "visible",
          author_label: "Лейла Цечоева",
          target_label: "Магомед Озиев",
          order_title: orders[4].title,
        },
      ];
    case "admin_metrics_series":
      return Array.from({ length: args.p_days ?? 30 }, (_, i) => ({
        day: new Date(now - (29 - i) * 86_400_000).toISOString().slice(0, 10),
        signups:
          [
            0, 1, 0, 2, 1, 0, 3, 1, 0, 0, 2, 1, 4, 2, 0, 1, 1, 0, 2, 3, 1, 0, 0, 2, 1, 3, 2, 1, 4,
            2,
          ][i] ?? 0,
        orders:
          [
            1, 0, 2, 1, 0, 1, 3, 2, 1, 0, 1, 2, 2, 0, 1, 3, 1, 0, 2, 1, 0, 1, 2, 3, 1, 2, 0, 1, 3,
            2,
          ][i] ?? 0,
        responses:
          [
            2, 1, 4, 3, 0, 2, 6, 4, 2, 1, 3, 5, 4, 1, 2, 6, 3, 1, 4, 3, 2, 2, 5, 7, 3, 4, 1, 3, 6,
            5,
          ][i] ?? 0,
      }));
    case "admin_list_categories":
      return [
        ["repair", "Ремонт и отделка", "wallpaper", "Обои", true, 3, 5],
        ["repair", "Ремонт и отделка", "plaster", "Штукатурка и покраска", true, 1, 4],
        ["repair", "Ремонт и отделка", "ceiling", "Натяжные потолки", false, 0, 0],
        ["plumbing", "Сантехника и электрика", "plumbing", "Сантехника", true, 2, 6],
        ["plumbing", "Сантехника и электрика", "electric", "Электрика", true, 1, 3],
      ].map(([l1_id, l1_name, l2_id, l2_name, vis, oo, m], i) => ({
        l1_id,
        l1_name,
        l2_id,
        l2_name,
        is_active: true,
        is_visible: vis,
        sort_order: i,
        open_orders: oo,
        masters: m,
      }));
    // Аналитика (0243, №299) — выдуманные цифры.
    case "admin_analytics_overview":
      return {
        period_from: "2026-09-09",
        period_to: "2026-10-08",
        tracking_since: "2026-10-08T09:00:00Z",
        orders_published: 18,
        orders_test_excluded: 6,
        orders_with_response: 9,
        orders_with_contact: 5,
        orders_picked: 4,
        first_response_median_min: 940,
        first_response_p90_min: 2880,
        responses_total: 14,
        responses_withdrawn: 5,
        reach_avg_masters: 1.4,
        orders_reached: 7,
        order_views: 31,
        order_viewers: 6,
        call_clicks: 7,
        whatsapp_clicks: 4,
        profile_views: 22,
        active_masters_avg: 2.1,
        active_users_avg: 5.3,
        signups: 7,
      };
    case "admin_analytics_daily":
      return Array.from({ length: Number(args?.p_days ?? 30) }, (_, i) => ({
        day: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10),
        signups: i % 5 === 0 ? 1 : 0,
        orders: i % 3 === 0 ? 1 : 0,
        responses: i % 4 === 0 ? 1 : 0,
        new_order_notifications: i % 6 === 0 ? 2 : 0,
        order_views: i % 2,
        call_clicks: i > 26 ? 2 : 0,
        whatsapp_clicks: i > 27 ? 1 : 0,
        profile_views: i % 3,
        active_masters: 2,
        active_users: 4 + (i % 3),
      }));
    case "admin_analytics_orders":
      return [
        {
          order_id: "o1",
          created_at: new Date(Date.now() - 3600e3).toISOString(),
          title: "Поменять лампочки на столбе во дворе",
          category_name: "Электрика",
          status: "open",
          contact_mode: "chat_only",
          client_id: "u1",
          client_label: "Ахмед Евлоев",
          is_test: false,
          reached_masters: 2,
          viewed_by_masters: 3,
          responses: 1,
          responses_active: 1,
          minutes_to_first_response: 45,
          call_clicks: 2,
          whatsapp_clicks: 1,
          contacted_masters: 1,
          client_viewed_responses: true,
          picked_master_label: null,
          total_count: 3,
        },
        {
          order_id: "o2",
          created_at: new Date(Date.now() - 86400e3).toISOString(),
          title: "Подрезать траву и деревья",
          category_name: "Сад и участок",
          status: "open",
          contact_mode: "chat_only",
          client_id: "u2",
          client_label: "Зарема Костоева",
          is_test: false,
          reached_masters: 0,
          viewed_by_masters: 1,
          responses: 0,
          responses_active: 0,
          minutes_to_first_response: null,
          call_clicks: 0,
          whatsapp_clicks: 0,
          contacted_masters: 0,
          client_viewed_responses: false,
          picked_master_label: null,
          total_count: 3,
        },
        {
          order_id: "o3",
          created_at: new Date(Date.now() - 4 * 86400e3).toISOString(),
          title: "Ремонт котлов",
          category_name: "Мастер на час",
          status: "completed",
          contact_mode: "phone_open",
          client_id: "u1",
          client_label: "Ахмед Евлоев",
          is_test: false,
          reached_masters: 3,
          viewed_by_masters: 4,
          responses: 2,
          responses_active: 1,
          minutes_to_first_response: 1320,
          call_clicks: 3,
          whatsapp_clicks: 0,
          contacted_masters: 2,
          client_viewed_responses: true,
          picked_master_label: "Адам Оздоев",
          total_count: 3,
        },
      ];
    case "admin_analytics_masters":
      return [
        {
          master_id: "m1",
          label: "Адам Оздоев",
          status: "active",
          availability_status: "today",
          categories_count: 3,
          reached_orders: 4,
          order_views: 9,
          responses: 3,
          responses_withdrawn: 1,
          responses_picked: 1,
          profile_views: 11,
          call_clicks: 4,
          whatsapp_clicks: 2,
          clicks_today: 2,
          active_days: 12,
          last_active_at: new Date(Date.now() - 3600e3).toISOString(),
          rating_overall_avg: 5,
          total_count: 2,
        },
        {
          master_id: "m2",
          label: "Ибрагим Мальсагов",
          status: "active",
          availability_status: null,
          categories_count: 1,
          reached_orders: 2,
          order_views: 3,
          responses: 1,
          responses_withdrawn: 0,
          responses_picked: 0,
          profile_views: 4,
          call_clicks: 1,
          whatsapp_clicks: 0,
          clicks_today: 0,
          active_days: 4,
          last_active_at: new Date(Date.now() - 86400e3 * 2).toISOString(),
          rating_overall_avg: null,
          total_count: 2,
        },
      ];
    case "admin_analytics_clients":
      return [
        {
          client_id: "u1",
          label: "Ахмед Евлоев",
          orders_published: 4,
          orders_with_response: 3,
          responses_received: 5,
          call_clicks: 5,
          whatsapp_clicks: 1,
          orders_picked: 2,
          reviews_left: 1,
          last_order_at: new Date(Date.now() - 3600e3).toISOString(),
          last_active_at: new Date(Date.now() - 600e3).toISOString(),
          total_count: 1,
        },
      ];
    case "admin_attention":
      return process.env.SHOT_ROLE === "manager"
        ? {
            reports_open: 2,
            verifications_pending: null,
            recovery_new: null,
            masters_pending: null,
          }
        : { reports_open: 2, verifications_pending: 1, recovery_new: 1, masters_pending: 1 };
    // Роль входа (0239): SHOT_ROLE=manager снимает вид управляющего.
    case "my_staff_role":
      return process.env.SHOT_ROLE === "manager" ? "manager" : "admin";
    case "admin_list_staff":
      return [
        {
          id: "u1",
          first_name: "Ахмед",
          last_name: "Евлоев",
          phone: "+79280000001",
          role: "admin",
          status: "active",
          is_demo: false,
          last_active_at: new Date(Date.now() - 3600e3).toISOString(),
        },
        {
          id: "u2",
          first_name: "Магомед",
          last_name: "Цечоев",
          phone: "+79280000002",
          role: "manager",
          status: "active",
          is_demo: false,
          last_active_at: new Date(Date.now() - 86400e3).toISOString(),
        },
      ];
    default:
      return undefined;
  }
}
