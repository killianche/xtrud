// Подтверждение номера обратным звонком (2026-10-04, №209): сервер получает
// у SMS.ru номер, на который человек звонит, и спрашивает, был ли звонок.
// Состояние — в памяти процесса, как счётчики входа (xtrud-api — один
// процесс; после перезапуска человек просто получит номер заново).
//
// Номер — полный, канонический (+79XXXXXXXXX): подтверждение для +7 917…
// не подходит номеру +1 917… с теми же 10 цифрами (урок ревью SMS, H1).
//
// Ограничения (ревью xtrud-security 2026-10-04: M2, M3, L1):
//   - выданный номер действует 5 минут (столько ждёт SMS.ru); повторный
//     запрос в это время отдаёт тот же номер, новой проверки не создаёт;
//   - новых проверок на номер с одного адреса — не больше 5 в сутки: чужие
//     попытки не тратят лимит владельца номера; с адреса — 10 в час
//     (IPv6 — по сети /56: у арендованного сервера их тысячи /64);
//   - на весь сервер деньги считаются по подтверждённым звонкам (платится
//     только успешный): CALLCHECK_HOURLY_CAP в час и CALLCHECK_DAILY_CAP в
//     сутки; начатых проверок — STARTS_HOURLY_MAX в час (запас от всплеска);
//   - место под номер занимается до обращения к SMS.ru: одновременный второй
//     старт получает «номер уже ждёт звонка», а не затирает первый;
//   - к SMS.ru за статусом — не чаще раза в 2 секунды на номер, остальные
//     опросы отвечают «ждём» без обращения к провайдеру;
//   - результат — одноразовый токен на 15 минут для этого номера и этой цели
//     (регистрация, восстановление пароля, смена номера — №215, №220):
//     подтверждение для одного не годится для другого.
//
// Привязка к тому, кто начал: звонок доказывает лишь «с номера X позвонили»,
// поэтому статус отдаётся только по секрету, выданному при старте; пока
// проверка номера действует, другой клиент новую не получит. Иначе чужой,
// опрашивая тот же номер, мог бы забрать подтверждение, когда владелец
// позвонит, и зарегистрировать номер на себя.
import { randomBytes, timingSafeEqual } from "node:crypto";

export const CHECK_TTL_MS = 5 * 60_000;
export const POLL_INTERVAL_MS = 2_000;
export const PHONE_DAILY_MAX = 5;
export const IP_HOURLY_MAX = 10;
export const STARTS_HOURLY_MAX = 600;
/** Сколько держится место под номер, пока ждём ответа SMS.ru. */
export const RESERVE_MS = 15_000;
export const TOKEN_TTL_MS = 15 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_ENTRIES = 50_000;
const SWEEP_EVERY_MS = 60_000;

/** Зачем подтверждают номер (владелец, 2026-10-04: №209, №215, №220). */
export type CallPurpose = "register" | "recover" | "change_phone";

export type StartCheck =
  | { ok: true }
  | { ok: false; reason: "phone_daily" | "ip_hourly" | "global" };

export interface PendingCheck {
  secret: string;
  purpose: CallPurpose;
  /**
   * Чей аккаунт: смена номера — кто начал (вход), восстановление — аккаунт
   * этого номера на момент старта (ревью L4: номер не уйдёт к другому).
   */
  userId: string | null;
  checkId: string;
  callPhone: string;
  callPhonePretty: string;
  expiresAt: number;
  lastPollAt: number;
}

/** Адрес для лимита: IPv6 — по сети /56. */
export function ipBucket(ip: string): string {
  if (!ip.includes(":") || ip.startsWith("::ffff:")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...h, ...Array<string>(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
    : h;
  const g4 = (groups[3] ?? "0").padStart(4, "0").slice(0, 2);
  return `${groups.slice(0, 3).join(":")}:${g4}00::/56`;
}

interface Window {
  count: number;
  resetAt: number;
}

export class CallChecks {
  private readonly pending = new Map<string, PendingCheck>();
  private readonly phoneDaily = new Map<string, Window>();
  private readonly ipHourly = new Map<string, Window>();
  private readonly tokens = new Map<
    string,
    { phone: string; purpose: CallPurpose; userId: string | null; expiresAt: number }
  >();
  private confirmedDay: Window = { count: 0, resetAt: 0 };
  private confirmedHour: Window = { count: 0, resetAt: 0 };
  private startsHour: Window = { count: 0, resetAt: 0 };
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly dailyCap: number,
    private readonly hourlyCap: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Действующая проверка этого номера, если есть. */
  active(phone: string): PendingCheck | null {
    this.sweep();
    const p = this.pending.get(phone);
    if (!p) return null;
    if (p.expiresAt <= this.now()) {
      this.pending.delete(phone);
      return null;
    }
    return p;
  }

  /** Можно ли создать новую проверку. Ничего не меняет. */
  canStart(phone: string, rawIp: string): StartCheck {
    const t = this.now();
    const ip = ipBucket(rawIp);
    if (this.count(this.phoneDaily, `${phone}|${ip}`) >= PHONE_DAILY_MAX) {
      return { ok: false, reason: "phone_daily" };
    }
    if (this.count(this.ipHourly, ip) >= IP_HOURLY_MAX) {
      return { ok: false, reason: "ip_hourly" };
    }
    if (
      (this.confirmedDay.resetAt > t && this.confirmedDay.count >= this.dailyCap) ||
      (this.confirmedHour.resetAt > t && this.confirmedHour.count >= this.hourlyCap) ||
      (this.startsHour.resetAt > t && this.startsHour.count >= STARTS_HOURLY_MAX)
    ) {
      return { ok: false, reason: "global" };
    }
    return { ok: true };
  }

  /**
   * Попытка засчитывается до обращения к провайдеру — и удачная, и нет; место
   * под номер занято до ответа SMS.ru (снимается forget при сбое).
   */
  countStart(phone: string, rawIp: string, purpose: CallPurpose, userId: string | null): void {
    const t = this.now();
    const ip = ipBucket(rawIp);
    this.bump(this.phoneDaily, `${phone}|${ip}`, DAY_MS);
    this.bump(this.ipHourly, ip, HOUR_MS);
    this.startsHour = this.tick(this.startsHour, HOUR_MS);
    this.pending.set(phone, {
      secret: "",
      purpose,
      userId,
      checkId: "",
      callPhone: "",
      callPhonePretty: "",
      expiresAt: t + RESERVE_MS,
      lastPollAt: t,
    });
  }

  /** Секрет клиента совпадает с выданным при старте. */
  owns(entry: PendingCheck, secret: string | undefined): boolean {
    if (!secret || !entry.secret) return false;
    const a = Buffer.from(entry.secret);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  remember(
    phone: string,
    check: Omit<PendingCheck, "secret" | "expiresAt" | "lastPollAt" | "purpose" | "userId"> &
      Partial<Pick<PendingCheck, "purpose" | "userId">>,
  ): PendingCheck {
    const held = this.pending.get(phone);
    const entry: PendingCheck = {
      purpose: held?.purpose ?? "register",
      userId: held?.userId ?? null,
      ...check,
      secret: randomBytes(24).toString("base64url"),
      expiresAt: this.now() + CHECK_TTL_MS,
      lastPollAt: 0,
    };
    this.pending.set(phone, entry);
    return entry;
  }

  /** Пора ли спросить провайдера (не чаще раза в 2 с); отмечает опрос. */
  shouldPoll(entry: PendingCheck): boolean {
    const t = this.now();
    if (t - entry.lastPollAt < POLL_INTERVAL_MS) return false;
    entry.lastPollAt = t;
    return true;
  }

  forget(phone: string): void {
    this.pending.delete(phone);
  }

  /**
   * Звонок был — выдать одноразовое подтверждение для той проверки, которую
   * опрашивали. Пока шёл запрос к провайдеру, проверка номера могла смениться —
   * тогда подтверждения нет (ревью L3), null.
   */
  confirm(phone: string, polled?: PendingCheck): string | null {
    const held = this.pending.get(phone);
    if (!held || (polled !== undefined && held !== polled)) return null;
    this.pending.delete(phone);
    this.confirmedDay = this.tick(this.confirmedDay, DAY_MS);
    this.confirmedHour = this.tick(this.confirmedHour, HOUR_MS);
    const token = randomBytes(32).toString("base64url");
    this.tokens.set(token, {
      phone,
      purpose: held.purpose,
      userId: held.userId,
      expiresAt: this.now() + TOKEN_TTL_MS,
    });
    return token;
  }

  /**
   * Подтверждение годится для этого номера. Не тратит его: регистрация
   * тратит после успешной записи (consumeToken) — сбой базы не заставляет
   * звонить снова (ревью L2). Чужой номер — подтверждение сгорает сразу.
   */
  tokenValid(
    token: string,
    phone: string,
    purpose: CallPurpose = "register",
    userId: string | null = null,
  ): boolean {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    if (
      entry.expiresAt > this.now() &&
      entry.phone === phone &&
      entry.purpose === purpose &&
      (purpose === "register" || entry.userId === userId)
    ) {
      return true;
    }
    this.tokens.delete(token);
    return false;
  }

  /** Одноразово: подтверждение годится только для этого номера и цели. */
  consumeToken(
    token: string,
    phone: string,
    purpose: CallPurpose = "register",
    userId: string | null = null,
  ): boolean {
    const ok = this.tokenValid(token, phone, purpose, userId);
    this.tokens.delete(token);
    return ok;
  }

  private tick(w: Window, windowMs: number): Window {
    const t = this.now();
    const next = w.resetAt <= t ? { count: 0, resetAt: t + windowMs } : w;
    next.count += 1;
    return next;
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

  private sweep(): void {
    const t = this.now();
    if (t - this.lastSweep < SWEEP_EVERY_MS) return;
    this.lastSweep = t;
    for (const [k, v] of this.pending) if (v.expiresAt <= t) this.pending.delete(k);
    for (const [k, v] of this.tokens) if (v.expiresAt <= t) this.tokens.delete(k);
    for (const m of [this.phoneDaily, this.ipHourly]) {
      for (const [k, v] of m) if (v.resetAt <= t) m.delete(k);
    }
  }
}
