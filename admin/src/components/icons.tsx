// Иконки админки — линейные, обводка 1.8, в одном стиле (по мотивам Lucide /
// SF Symbols, нарисованы здесь же: библиотека ради трёх десятков значков не
// нужна). У каждого раздела — своя иконка, без повторов (№367: в старом меню
// одна звезда стояла у трёх разделов).

import type { ReactNode } from "react";

function Svg({
  children,
  size = 22,
  fill = false,
}: {
  children: ReactNode;
  size?: number;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

type P = { size?: number };

export const Icon = {
  // Вкладки
  inbox: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M5.5 5h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z" />
    </Svg>
  ),
  task: ({ size }: P = {}) => (
    <Svg size={size}>
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M8.5 9h7M8.5 13h7M8.5 17h4" />
    </Svg>
  ),
  users: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.6 3 5.2" />
    </Svg>
  ),
  more: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </Svg>
  ),
  // Разделы
  home: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Svg>
  ),
  tool: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M14.5 5.5a4.5 4.5 0 0 0 5.9 5.9l-9.1 9.1a2.1 2.1 0 0 1-3-3l9.1-9.1z" />
      <path d="M14.5 5.5 17 3l4 4-2.5 2.5" />
    </Svg>
  ),
  star: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
    </Svg>
  ),
  flag: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </Svg>
  ),
  id: ({ size }: P = {}) => (
    <Svg size={size}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <circle cx="9" cy="11" r="2" />
      <path d="M6 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h3.5M14.5 13.5h3.5" />
    </Svg>
  ),
  building: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16" />
      <path d="M15 9h4a1 1 0 0 1 1 1v11M2.5 21h19" />
      <path d="M8 8h3M8 12h3M8 16h3" />
    </Svg>
  ),
  instagram: ({ size }: P = {}) => (
    <Svg size={size}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" />
    </Svg>
  ),
  medal: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="12" cy="14.5" r="5.5" />
      <path d="m8.5 10-3-6.5h4.5L12 8l2-4.5h4.5l-3 6.5" />
      <path d="m12 12.2.8 1.6 1.7.2-1.3 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.3-1.2 1.7-.2z" />
    </Svg>
  ),
  phone: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M5 4h3.5l1.5 4.5-2.2 1.4a11 11 0 0 0 6.3 6.3l1.4-2.2L20 15.5V19a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4" />
    </Svg>
  ),
  alert: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M12 3.5 2.8 19.5h18.4z" />
      <path d="M12 10v4M12 17h.01" />
    </Svg>
  ),
  chart: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M4 20V4M4 20h16" />
      <path d="m7.5 15 3.5-4 3 2.5L19 8" />
    </Svg>
  ),
  grid: ({ size }: P = {}) => (
    <Svg size={size}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </Svg>
  ),
  image: ({ size }: P = {}) => (
    <Svg size={size}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 18 5-4.5 3.5 3 3-2.5L20 18" />
    </Svg>
  ),
  megaphone: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1z" />
      <path d="M18 9.5a3.5 3.5 0 0 1 0 5M7.5 15l1.2 4.5" />
    </Svg>
  ),
  settings: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  journal: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z" />
      <path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19v-3M9 7.5h6M9 11h4" />
    </Svg>
  ),
  shield: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  bell: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </Svg>
  ),
  eyeOff: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.4.8-1.3 2-2.5 3.2M6.3 7.6C4.4 8.9 3.1 10.7 2.5 12c1 1.8 4.5 6 9.5 6 1.6 0 3-.4 4.2-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18" />
    </Svg>
  ),
  undo: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Svg>
  ),
  check: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  ),
  x: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  ),
  plus: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  whatsapp: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M4 20l1.3-4A8.5 8.5 0 1 1 8.4 19z" />
      <path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2.1-1-1 .9a4.5 4.5 0 0 1-2.2-2.2l.9-1-1-2.1z" />
    </Svg>
  ),
  external: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  ),
  zoom: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5" />
    </Svg>
  ),
  search: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  ),
  menu: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  sparkles: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M12 4l1.6 4.4L18 10l-4.4 1.6L12 16l-1.6-4.4L6 10l4.4-1.6z" />
      <path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </Svg>
  ),
  logout: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </Svg>
  ),
  chevronLeft: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="m15 5-7 7 7 7" />
    </Svg>
  ),
  chevronRight: ({ size = 18 }: P = {}) => (
    <Svg size={size}>
      <path d="m9 5 7 7-7 7" />
    </Svg>
  ),
  arrowRight: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  ),
  // Совместимость со старыми страницами (переключатель темы убран — админка светлая).
  moon: ({ size }: P = {}) => (
    <Svg size={size}>
      <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z" />
    </Svg>
  ),
  sun: ({ size }: P = {}) => (
    <Svg size={size}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </Svg>
  ),
};
