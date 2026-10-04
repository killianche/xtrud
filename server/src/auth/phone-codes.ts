// Коды подтверждения номера по SMS (2026-10-04) — в памяти процесса, как
// счётчики входа (login-attempts.ts): xtrud-api — один процесс, код живёт
// минуты, при перезапуске человек просто запросит новый.
//
// Номер везде — полный, канонический (+79XXXXXXXXX), а не последние 10
// цифр: иначе код, пришедший на +7 917…, подошёл бы к аккаунту +1 917…
// (ревью xtrud-security 2026-10-04, H1).
//
// Защита денег и аккаунтов:
//   - код 6 цифр, живёт 5 минут, 5 попыток ввода — потом только новый код;
//   - на номер: не чаще раза в минуту, не больше 5 отправок и 10 попыток
//     ввода за сутки (попытки не обнуляются новым кодом);
//   - с одного адреса: не больше 10 отправок в час; IPv6 — по сети /64;
//   - на весь сервер: не больше SMS_DAILY_CAP в сутки отдельно для
//     регистрации и для нового пароля — потолок расхода, и выбрать его
//     регистрациями не значит закрыть восстановление;
//   - подтверждение — одноразовый токен на 15 минут, привязанный к номеру и
//     цели (регистрация или новый пароль), а не сам код.
// Хранится только хеш кода; сравнение — за постоянное время.
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export type CodePurpose = "register" | "reset";

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 5 * 60_000;
export const MAX_VERIFY_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60_000;
export const PHONE_DAILY_MAX = 5;
export const IP_HOURLY_MAX = 10;
export const VERIFY_DAILY_MAX = 10;
export const TOKEN_TTL_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_ENTRIES = 50_000;
const SWEEP_EVERY_MS = 60_000;

export type SendCheck =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryInSec: number }
  | { ok: false; reason: "phone_daily" | "ip_hourly" | "global_daily" };

export type VerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many" };

/** Адрес для лимита: IPv6 — по сети /64 (у одного абонента их бесконечно много). */
export function ipBucket(ip: string): string {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
    : h;
  return `${groups.slice(0, 4).join(":")}::/64`;
}

interface CodeEntry {
  hash: Buffer;
  expiresAt: number;
  attempts: number;
}
interface Window {
  count: number;
  resetAt: number;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export class PhoneCodes {
  private readonly codes = new Map<string, CodeEntry>();
  private readonly lastSent = new Map<string, number>();
  private readonly phoneDaily = new Map<string, Window>();
  private readonly ipHourly = new Map<string, Window>();
  private readonly verifyDaily = new Map<string, Window>();
  private readonly tokens = new Map<
    string,
    { phone: string; purpose: CodePurpose; expiresAt: number }
  >();
  private readonly global: Record<CodePurpose, Window> = {
    register: { count: 0, resetAt: 0 },
    reset: { count: 0, resetAt: 0 },
  };
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly dailyCap: number,
    private readonly now: () => number = Date.now,
    private readonly makeCode: () => string = () =>
      String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0"),
  ) {}

  /** Можно ли сейчас отправить код на номер с этого адреса. Ничего не меняет. */
  check(phone: string, purpose: CodePurpose, rawIp: string): SendCheck {
    const ip = ipBucket(rawIp);
    this.sweep();
    const t = this.now();
    const last = this.lastSent.get(phone);
    if (last !== undefined && t - last < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryInSec: Math.ceil((RESEND_COOLDOWN_MS - (t - last)) / 1000),
      };
    }
    // Попытки ввода за сутки кончились — новый код всё равно не примут, SMS
    // не тратим (повторное ревью 2026-10-04).
    if (
      this.count(this.phoneDaily, phone) >= PHONE_DAILY_MAX ||
      this.count(this.verifyDaily, phone) >= VERIFY_DAILY_MAX
    ) {
      return { ok: false, reason: "phone_daily" };
    }
    if (this.count(this.ipHourly, ip) >= IP_HOURLY_MAX) return { ok: false, reason: "ip_hourly" };
    const g = this.global[purpose];
    if (g.resetAt > t && g.count >= this.dailyCap) {
      return { ok: false, reason: "global_daily" };
    }
    return { ok: true };
  }

  /**
   * Попытка отправки засчитывается до обращения к провайдеру — и удачная, и
   * нет: иначе неотправляемые номера можно было бы дёргать без конца.
   * Возвращает новый код; прежний код этого номера и цели перестаёт работать.
   */
  issue(phone: string, purpose: CodePurpose, rawIp: string): string {
    const t = this.now();
    this.lastSent.set(phone, t);
    this.bump(this.phoneDaily, phone, DAY_MS);
    this.bump(this.ipHourly, ipBucket(rawIp), HOUR_MS);
    const g = this.global[purpose];
    if (g.resetAt <= t) {
      g.count = 0;
      g.resetAt = t + DAY_MS;
    }
    g.count += 1;
    const code = this.makeCode();
    this.codes.set(`${purpose}:${phone}`, {
      hash: sha(`${phone}:${code}`),
      expiresAt: t + CODE_TTL_MS,
      attempts: 0,
    });
    return code;
  }

  /** Сколько отправок за текущие сутки для цели — для предупреждения в журнал. */
  usage(purpose: CodePurpose): number {
    const g = this.global[purpose];
    return g.resetAt > this.now() ? g.count : 0;
  }

  /** Отправить не удалось — код не должен оставаться действующим. */
  discard(phone: string, purpose: CodePurpose): void {
    this.codes.delete(`${purpose}:${phone}`);
  }

  verify(phone: string, purpose: CodePurpose, code: string): VerifyResult {
    const key = `${purpose}:${phone}`;
    const entry = this.codes.get(key);
    const t = this.now();
    if (!entry) return { ok: false, reason: "expired" };
    if (entry.expiresAt <= t) {
      this.codes.delete(key);
      return { ok: false, reason: "expired" };
    }
    if (
      entry.attempts >= MAX_VERIFY_ATTEMPTS ||
      this.count(this.verifyDaily, phone) >= VERIFY_DAILY_MAX
    ) {
      this.codes.delete(key);
      return { ok: false, reason: "too_many" };
    }
    entry.attempts += 1;
    this.bump(this.verifyDaily, phone, DAY_MS);
    const given = sha(`${phone}:${code.trim()}`);
    if (!timingSafeEqual(given, entry.hash)) {
      if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
        this.codes.delete(key);
        return { ok: false, reason: "too_many" };
      }
      return { ok: false, reason: "invalid" };
    }
    this.codes.delete(key);
    const token = randomBytes(32).toString("base64url");
    this.tokens.set(token, { phone, purpose, expiresAt: t + TOKEN_TTL_MS });
    return { ok: true, token };
  }

  /** Одноразово: подтверждение годится для этого номера и этой цели. */
  consumeToken(token: string, phone: string, purpose: CodePurpose): boolean {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    this.tokens.delete(token);
    return entry.expiresAt > this.now() && entry.phone === phone && entry.purpose === purpose;
  }

  private count(map: Map<string, Window>, key: string): number {
    const w = map.get(key);
    if (!w) return 0;
    if (w.resetAt <= this.now()) {
      map.delete(key);
      return 0;
    }
    return w.count;
  }

  private bump(map: Map<string, Window>, key: string, windowMs: number): void {
    const t = this.now();
    const w = map.get(key);
    if (!w || w.resetAt <= t) {
      if (map.size >= MAX_ENTRIES) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, { count: 1, resetAt: t + windowMs });
    } else {
      w.count += 1;
    }
  }

  /** Не чаще раза в минуту выкидываем истёкшее — память ограничена. */
  private sweep(): void {
    const t = this.now();
    if (t - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = t;
    for (const [k, v] of this.codes) if (v.expiresAt <= t) this.codes.delete(k);
    for (const [k, v] of this.tokens) if (v.expiresAt <= t) this.tokens.delete(k);
    for (const [k, v] of this.lastSent) if (t - v >= RESEND_COOLDOWN_MS) this.lastSent.delete(k);
    for (const m of [this.phoneDaily, this.ipHourly, this.verifyDaily]) {
      for (const [k, v] of m) if (v.resetAt <= t) m.delete(k);
    }
  }
}
