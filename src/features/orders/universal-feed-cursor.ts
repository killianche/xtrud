/**
 * Stable keyset cursor for the universal order feed.
 *
 * `created_at` alone is ambiguous when several orders share a timestamp. The
 * cursor compares the real UTC instant plus `id`, preserving sub-millisecond
 * precision and preventing different ISO offsets from being sorted as text.
 */

import { z } from "zod";

const ISO_TIMESTAMP_PARTS =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;
const isoTimestampSchema = z
  .string()
  .datetime({ offset: true })
  .refine((value) => (ISO_TIMESTAMP_PARTS.exec(value)?.[3]?.length ?? 0) <= 9, {
    message: "Timestamp precision cannot exceed nanoseconds",
  });

interface ParsedTimestamp {
  canonical: string;
  epochSecond: number;
  fractionNanoseconds: string;
}

function parseTimestamp(value: string): ParsedTimestamp {
  const valid = isoTimestampSchema.parse(value);
  const match = ISO_TIMESTAMP_PARTS.exec(valid);
  if (!match) throw new Error("Invalid ISO timestamp");

  const [, date, time, rawFraction = "", rawOffset = "Z"] = match;
  const fractionNanoseconds = rawFraction.slice(0, 9).padEnd(9, "0");
  let offsetMinutes = 0;
  if (rawOffset !== "Z") {
    const sign = rawOffset.startsWith("+") ? 1 : -1;
    const [hours = 0, minutes = 0] = rawOffset.slice(1).split(":").map(Number);
    offsetMinutes = sign * (hours * 60 + minutes);
  }

  const utcSecondMs = Date.parse(`${date}T${time}Z`) - offsetMinutes * 60_000;
  if (!Number.isFinite(utcSecondMs)) throw new Error("Invalid ISO timestamp");

  const canonicalSecond = new Date(utcSecondMs).toISOString().slice(0, 19);
  const trimmedFraction = fractionNanoseconds.replace(/0+$/, "").padEnd(3, "0");
  return {
    canonical: `${canonicalSecond}.${trimmedFraction}Z`,
    epochSecond: Math.trunc(utcSecondMs / 1000),
    fractionNanoseconds,
  };
}

export const universalOrderCursorSchema = z.object({
  createdAt: isoTimestampSchema.transform((value) => parseTimestamp(value).canonical),
  id: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
});

export type UniversalOrderCursor = z.input<typeof universalOrderCursorSchema>;

export function serializeUniversalOrderCursor(cursor: UniversalOrderCursor): string {
  const validCursor = universalOrderCursorSchema.parse(cursor);
  return `${encodeURIComponent(validCursor.createdAt)}~${validCursor.id}`;
}

export function parseUniversalOrderCursor(value: string): UniversalOrderCursor | null {
  const separatorIndex = value.indexOf("~");
  if (separatorIndex <= 0 || separatorIndex !== value.lastIndexOf("~")) return null;

  try {
    const parsed = universalOrderCursorSchema.safeParse({
      createdAt: decodeURIComponent(value.slice(0, separatorIndex)),
      id: value.slice(separatorIndex + 1),
    });
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function isOrderAfterCursor(
  order: UniversalOrderCursor,
  cursor: UniversalOrderCursor,
): boolean {
  const validOrder = universalOrderCursorSchema.parse(order);
  const validCursor = universalOrderCursorSchema.parse(cursor);
  const orderTimestamp = parseTimestamp(validOrder.createdAt);
  const cursorTimestamp = parseTimestamp(validCursor.createdAt);
  if (orderTimestamp.epochSecond !== cursorTimestamp.epochSecond) {
    return orderTimestamp.epochSecond < cursorTimestamp.epochSecond;
  }
  if (orderTimestamp.fractionNanoseconds !== cursorTimestamp.fractionNanoseconds) {
    return orderTimestamp.fractionNanoseconds < cursorTimestamp.fractionNanoseconds;
  }
  return validOrder.id < validCursor.id;
}
