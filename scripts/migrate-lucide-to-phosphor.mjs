#!/usr/bin/env node

// Миграция Lucide React Native → Phosphor React Native.
//
// Заменяет в .ts/.tsx файлах:
//   1. import { ... } from "lucide-react-native"  → import { ... } from "phosphor-react-native"
//      (имена переименовываются по MAP таблице, например Home → House)
//   2. Все use-site вхождения старых имён (через word-boundary regex)
//   3. strokeWidth={n} → weight="bold"|"fill"
//      (1.5/1.75/2 → "bold", 2.25 → "fill", тернарник focused ? 2.25 : 1.5 → focused ? "fill" : "bold")
//
// Запуск:
//   node scripts/migrate-lucide-to-phosphor.mjs           # dry-run, печатает diff
//   node scripts/migrate-lucide-to-phosphor.mjs --apply   # применяет

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

// Полный маппинг Lucide → Phosphor.
// Проверено: каждое правое значение существует в node_modules/phosphor-react-native.
const MAP = {
  AlertCircle: "WarningCircle",
  AlertTriangle: "Warning",
  Bell: "Bell",
  BookOpen: "BookOpen",
  Briefcase: "Briefcase",
  Building2: "Buildings",
  Buildings: "Buildings",
  Calendar: "Calendar",
  Camera: "Camera",
  Car: "Car",
  Check: "Check",
  CheckCheck: "Checks",
  CheckCircle: "CheckCircle",
  CheckCircle2: "CheckCircle",
  ChevronDown: "CaretDown",
  ChevronLeft: "CaretLeft",
  ChevronRight: "CaretRight",
  ChevronUp: "CaretUp",
  CircleAlert: "WarningCircle",
  CirclePlus: "PlusCircle",
  ClipboardList: "ClipboardText",
  ClipboardText: "ClipboardText",
  Clock: "Clock",
  Compass: "Compass",
  Cpu: "Cpu",
  Droplet: "Drop",
  Edit: "Pencil",
  Edit3: "PencilSimple",
  Eye: "Eye",
  EyeOff: "EyeSlash",
  Filter: "FunnelSimple",
  Flag: "Flag",
  Folder: "Folder",
  Globe: "Globe",
  Heart: "Heart",
  HelpCircle: "Question",
  Home: "House",
  House: "House",
  Hourglass: "Hourglass",
  Image: "Image",
  ImagePlus: "Image",
  Inbox: "Tray",
  Info: "Info",
  Layers: "Stack",
  Link: "Link",
  ListChecks: "ListChecks",
  ListPlus: "ListPlus",
  Lock: "Lock",
  Loader: "CircleNotch",
  LogIn: "SignIn",
  LogOut: "SignOut",
  Mail: "Envelope",
  MapPin: "MapPin",
  Menu: "List",
  MessageCircle: "ChatCircle",
  MessageSquare: "ChatCenteredText",
  Moon: "Moon",
  MoreHorizontal: "DotsThree",
  MoreVertical: "DotsThreeVertical",
  Pencil: "Pencil",
  PencilSimple: "PencilSimple",
  Phone: "Phone",
  Plus: "Plus",
  PlusCircle: "PlusCircle",
  Search: "MagnifyingGlass",
  Send: "PaperPlaneTilt",
  Settings: "Gear",
  Share: "ShareNetwork",
  Share2: "ShareNetwork",
  ShieldCheck: "ShieldCheck",
  ShoppingBag: "ShoppingBag",
  ShoppingCart: "ShoppingCart",
  SlidersHorizontal: "SlidersHorizontal",
  Smartphone: "DeviceMobile",
  Sparkles: "Sparkle",
  Star: "Star",
  Sun: "Sun",
  Tag: "Tag",
  Trash: "Trash",
  Trash2: "Trash",
  Trophy: "Trophy",
  Upload: "UploadSimple",
  User: "User",
  UserCheck: "UserCheck",
  UserCircle: "UserCircle",
  UserRound: "User",
  Users: "Users",
  Wallet: "Wallet",
  Wrench: "Wrench",
  X: "X",
  XCircle: "XCircle",
  Zap: "Lightning",
};

const APPLY = process.argv.includes("--apply");

// SKIP: категорийные fallback-файлы. Категории — особый случай (через Iconify CDN
// в `category-color-icons.ts`), Lucide-fallback там для не-mapped L2. По правилу
// «иконки категорий не трогать» оставляем как есть.
const SKIP = new Set(["src/components/CategoryTile.tsx", "src/lib/category-icons.ts"]);

// Список всех .ts/.tsx с Lucide-импортами.
const files = execSync(`grep -rl 'lucide-react-native' app src 2>/dev/null`, { encoding: "utf-8" })
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((f) => !SKIP.has(f));

console.log(`Found ${files.length} files with Lucide imports.\n`);

let touched = 0;
const unknownNames = new Set();

for (const file of files) {
  const original = readFileSync(file, "utf-8");
  let content = original;

  // 1. Найти все импорты от lucide-react-native (single и multi-line).
  const importRe = /import\s*\{([^}]+)\}\s*from\s*["']lucide-react-native["'];?/g;
  const oldNamesInFile = new Set();
  content = content.replace(importRe, (_, names) => {
    const parsed = names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        // Поддержка "X as Alias" — берём левую часть.
        const m = entry.match(/^(\w+)(?:\s+as\s+(\w+))?$/);
        return m ? { name: m[1], alias: m[2] } : null;
      })
      .filter(Boolean);

    const newNames = parsed.map(({ name, alias }) => {
      const phName = MAP[name];
      if (!phName) {
        unknownNames.add(`${name} (in ${file})`);
        return alias ? `${name} as ${alias}` : name; // оставляем как есть → tsc упадёт, сигнал
      }
      oldNamesInFile.add(name);
      // Если был alias — сохраняем alias (использования остаются alias-ными, ничего не трогаем дальше).
      // Если alias не было — переименовываем имя и в use-sites.
      return alias ? `${phName} as ${alias}` : phName;
    });

    return `import { ${newNames.join(", ")} } from "phosphor-react-native";`;
  });

  // 2. Заменить use-sites: только имена без alias (т.е. где переименование сохранилось).
  for (const name of oldNamesInFile) {
    const newName = MAP[name];
    if (!newName || newName === name) continue;
    // Word-boundary, но осторожно — заменяем только в JSX-тегах и identifier-контексте.
    // Простой подход: \bOld\b. Тестовые строки с этим именем — редкость для иконок.
    const re = new RegExp(`\\b${name}\\b`, "g");
    content = content.replace(re, newName);
  }

  // 3. strokeWidth → weight (Phosphor weights).
  content = content.replace(/strokeWidth=\{2\.25\}/g, 'weight="fill"');
  content = content.replace(/strokeWidth=\{(?:1\.5|1\.75|2)\}/g, 'weight="bold"');
  // Тернарник focused ? 2.25 : 1.5 (или 1.75/2)
  content = content.replace(
    /strokeWidth=\{(\w+)\s*\?\s*2\.25\s*:\s*(?:1\.5|1\.75|2)\}/g,
    'weight={$1 ? "fill" : "bold"}',
  );
  // Обратный тернарник 1.5 : 2.25
  content = content.replace(
    /strokeWidth=\{(\w+)\s*\?\s*(?:1\.5|1\.75|2)\s*:\s*2\.25\}/g,
    'weight={$1 ? "bold" : "fill"}',
  );

  if (content !== original) {
    touched++;
    if (APPLY) {
      writeFileSync(file, content);
      console.log(`✓ ${file}`);
    } else {
      console.log(`Would change: ${file}`);
    }
  }
}

console.log(`\n${touched}/${files.length} files would change.`);
if (unknownNames.size > 0) {
  console.log("\n⚠️ Unknown Lucide names (added to MAP needed):");
  for (const n of unknownNames) console.log(`  - ${n}`);
}
console.log(APPLY ? "\nApplied." : "\nDry-run. Use --apply to write.");
