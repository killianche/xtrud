/**
 * Маппинг category_l2.id → конкретная цветная SVG-иконка через Iconify CDN.
 *
 * Подход «по L2 id» (а не по Lucide name) — гарантирует уникальность для
 * каждой категории. Twemoji = Twitter Color SVG (плоские цветные), не
 * unicode-эмодзи.
 *
 * Если категория не в маппинге — fallback на Lucide моно (см. caller).
 *
 * Локальные кастомные иконки (нарисованные вручную, когда в Iconify нет
 * подходящей) имеют приоритет — см. LOCAL_CATEGORY_ICON_URI.
 */

import { LOCAL_CATEGORY_ICON_URI } from "@/lib/local-category-icons";

const ICON_MAP: Record<string, string> = {
  // L2 id → iconify identifier (collection/name)
  plumbing: "twemoji/droplet",
  electrical: "fluent-color/lightbulb-24",
  renovation: "fluent-color/wrench-screwdriver-24",
  handyman: "fluent-color/wrench-24",
  "cleaning-post-renovation": "twemoji/sparkles",
  windows: "twemoji/window",
  doors: "twemoji/door",
  "locks-security": "fluent-color/lock-shield-24",
  painting: "fluent-color/paint-brush-24",
  wallpaper: "twemoji/scroll",  // рулон = обои (Sprint 0083 split из painting)
  drywall: "twemoji/paintbrush",          // штукатурка = кисть/нанесение слоя
  tiling: "twemoji/chequered-flag",       // плитка/мозаика = клетчатая сетка
  floors: "twemoji/black-square-button",  // пол-плитка/паркет = квадрат
  ceilings: "twemoji/light-bulb",         // потолок = лампа
  "tension-ceilings": "twemoji/film-frames", // натяжной = натянутая плёнка
  // climate переименован в «Отопление» 2026-05-27 — снежинка заменена на
  // термометр (тепло/температура). Кондиционеры переехали в appliance-repair.
  climate: "twemoji/thermometer",
  // water-sewer («Водоснабжение и канализация») — кастомная локальная иконка
  // (смеситель+капля, fluent-стиль), см. LOCAL_CATEGORY_ICON_URI. В ICON_MAP
  // не добавляем — local имеет приоритет в getCategoryColorIconUrl.
  insulation: "twemoji/scarf",            // утепление = тепло-изоляция
  roofing: "twemoji/house",
  facade: "fluent-color/building-24",
  concrete: "twemoji/construction-worker", // бетон = рабочий-бетонщик
  masonry: "twemoji/hammer-and-pick",     // кладка камня = кирка+молот
  welding: "twemoji/fire",
  "general-construction": "twemoji/construction",
  "drilling-wells": "twemoji/potable-water",
  "fences-gates": "twemoji/japanese-castle", // забор/ворота = стена крепости
  landscape: "twemoji/deciduous-tree",
  "baths-pools": "twemoji/hot-springs",   // баня + бассейн = горячий источник
  furniture: "twemoji/couch-and-lamp",
  "curtains-blinds": "twemoji/framed-picture",
  "interior-design": "twemoji/straight-ruler",
  demolition: "twemoji/hammer",
  movers: "twemoji/delivery-truck",
  "appliance-repair": "twemoji/electric-plug",
  "satellite-tv": "twemoji/satellite-antenna",
  "security-systems": "twemoji/camera",
  // Transport / спецтехника
  "heavy-equipment": "twemoji/articulated-lorry",
  manipulator: "twemoji/crane",
  "auto-service": "twemoji/automobile",
  "tire-service": "twemoji/tire",
  "mobile-fuel": "twemoji/fuel-pump",
  // Cleaning
  "interior-cleaning": "fluent-color/broom-24",
  "upholstery-cleaning": "twemoji/soap",
  // Computer / digital
  "computer-help": "twemoji/laptop",
  "online-store": "twemoji/shopping-bags",
  "landing-page": "twemoji/globe-with-meridians",
  // Logistics
  "garbage-removal": "twemoji/wastebasket",
  "furniture-assembly": "twemoji/screwdriver",
  // Beauty
  "haircut-women": "twemoji/woman-getting-haircut",
  "manicure-classic": "twemoji/nail-polish",
  "lashes-brows": "twemoji/eye",
  // Education / digital services
  "informatics-school": "twemoji/books",
  translation: "twemoji/speech-balloon",
};

const BASE = "https://api.iconify.design";

export function getCategoryColorIconUrl(l2Id: string | null | undefined): string | null {
  if (!l2Id) return null;
  // Локальная кастомная иконка (data-URI) имеет приоритет над Iconify CDN.
  const local = LOCAL_CATEGORY_ICON_URI[l2Id];
  if (local) return local;
  const mapped = ICON_MAP[l2Id];
  if (!mapped) return null;
  return `${BASE}/${mapped}.svg`;
}
