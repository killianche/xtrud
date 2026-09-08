/**
 * Флаг страны из кода ISO-3166 alpha-2 как эмодзи (региональные индикаторы).
 * DECISION владельца 2026-09-08: без иностранных сервисов — flagcdn.com убран,
 * флаг рисует системный шрифт iOS.
 */
export function flagEmoji(code: string): string {
  const upper = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🏳️";
  return String.fromCodePoint(...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
