/**
 * Иконки категорий — ОДИН набор на всё приложение: Phosphor.
 *
 * DECISION владельца 2026-09-05: «иконки у каждой категории сильно
 * различаются, нужны в одном стиле — современном, как у больших компаний,
 * как у Thumbtack (наш референс)».
 *
 * Что было: три набора одновременно — цветные Twemoji, цветные Fluent и
 * линейные Lucide. На одном экране «Клининг» тонкой линией стоял рядом с
 * объёмной каплей «Сантехники». Цветные иконки к тому же грузились с
 * чужого CDN (Iconify) — сеть ради значка.
 *
 * Что стало: имя иконки из `categories_l2.icon` / `categories_l1.icon`
 * (миграция 0157 проставила всем категориям имена из Phosphor) → компонент
 * Phosphor. Линейные, одной толщины, красятся токеном темы. Референс —
 * Thumbtack: у него иконки категорий тоже линейные и одноцветные.
 *
 * Имена сверены со списком node_modules/phosphor-react-native/src/icons.
 * Запасная иконка — Wrench: если имя из базы здесь не найдено, категория
 * всё равно рисуется, а не падает.
 */

import {
  AppWindow,
  Broadcast,
  Broom,
  Bug,
  Buildings,
  Cloud,
  Compass,
  Couch,
  Crane,
  Cube,
  Door,
  DotsThree,
  Drop,
  Fan,
  Fire,
  Garage,
  Gear,
  GridFour,
  Hammer,
  HardHat,
  House,
  Key,
  Lightning,
  Package,
  PaintBrush,
  PaintBucket,
  PencilRuler,
  Pipe,
  Plant,
  Rows,
  Ruler,
  SecurityCamera,
  ShieldCheck,
  Shovel,
  Snowflake,
  Sparkle,
  Square,
  SquaresFour,
  StackSimple,
  Television,
  Thermometer,
  TrafficCone,
  Trash,
  TreeEvergreen,
  Truck,
  Wall,
  WashingMachine,
  Waves,
  Wrench,
} from "phosphor-react-native";
import type { IconComponent } from "@/types/icon";

export const CATEGORY_ICONS: Record<string, IconComponent> = {
  AppWindow,
  Broadcast,
  Broom,
  Bug,
  Buildings,
  Cloud,
  Compass,
  Couch,
  Crane,
  Cube,
  Door,
  DotsThree,
  Drop,
  Fan,
  Fire,
  Garage,
  Gear,
  GridFour,
  Hammer,
  HardHat,
  House,
  Key,
  Lightning,
  Package,
  PaintBrush,
  PaintBucket,
  PencilRuler,
  Pipe,
  Plant,
  Rows,
  Ruler,
  SecurityCamera,
  ShieldCheck,
  Shovel,
  Snowflake,
  Sparkle,
  Square,
  SquaresFour,
  StackSimple,
  Television,
  Thermometer,
  TrafficCone,
  Trash,
  TreeEvergreen,
  Truck,
  Wall,
  WashingMachine,
  Waves,
  Wrench,
};

export const DEFAULT_CATEGORY_ICON: IconComponent = Wrench;

/** Иконка по имени из базы; неизвестное имя → Wrench. */
export function getCategoryIcon(iconName: string | null | undefined): IconComponent {
  if (!iconName) return DEFAULT_CATEGORY_ICON;
  return CATEGORY_ICONS[iconName] ?? DEFAULT_CATEGORY_ICON;
}
