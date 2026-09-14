// Лимит неудачных входов, в памяти процесса (xtrud-api — один процесс; при
// перезапуске счётчики обнуляются).
//
// Два счётчика (ревью xtrud-security, 2026-09-13):
//   - «номер + IP» — основной, 10 неудач за 15 минут. Перебор с одного
//     адреса упирается в него, а чужой человек не закрывает вход владельцу
//     номера: у того другой адрес;
//   - «номер» — мягкий, 50 неудач за час. Держит перебор с многих адресов;
//     чтобы закрыть им вход чужому номеру, нужно не меньше пяти адресов и
//     полсотни попыток, и закрыт вход будет не дольше часа.
// Лимит по IP на весь /auth (index.ts) остаётся сверху.
//
// Память ограничена: не больше MAX_ENTRIES ключей на счётчик. При переполнении
// сначала — не чаще раза в минуту — удаляются истёкшие, затем самый старый
// ключ (Map хранит порядок вставки). Одна неудача никогда не стоит O(n).
import { isPhoneLogin, phoneKey } from "./phone.js";

export const PAIR_MAX_FAILURES = 10;
export const PAIR_WINDOW_MS = 15 * 60_000;
export const LOGIN_MAX_FAILURES = 50;
export const LOGIN_WINDOW_MS = 60 * 60_000;
export const MAX_ENTRIES = 50_000;
const SWEEP_EVERY_MS = 60_000;

/** Ключ аккаунта: у номера — последние 10 цифр (как ищет аккаунт база). */
export function loginAttemptKey(login: string): string {
  const trimmed = login.trim();
  if (isPhoneLogin(trimmed)) {
    const key = phoneKey(trimmed);
    if (key) return `phone:${key}`;
  }
  return `login:${trimmed.toLowerCase()}`;
}

/** Счётчик неудач в окне фиксированной длины с ограниченной памятью. */
export class FailureWindow {
  private readonly entries = new Map<string, { failures: number; resetAt: number }>();
  private lastSweep = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = MAX_ENTRIES,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  blocked(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (entry.resetAt <= this.now()) {
      this.entries.delete(key);
      return false;
    }
    return entry.failures >= this.maxFailures;
  }

  fail(key: string): void {
    const t = this.now();
    const entry = this.entries.get(key);
    if (entry && entry.resetAt > t) {
      entry.failures += 1;
      return;
    }
    if (entry) this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) this.makeRoom(t);
    this.entries.set(key, { failures: 1, resetAt: t + this.windowMs });
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private makeRoom(t: number): void {
    if (t - this.lastSweep >= SWEEP_EVERY_MS) {
      this.lastSweep = t;
      for (const [key, entry] of this.entries) {
        if (entry.resetAt <= t) this.entries.delete(key);
      }
    }
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
  }
}

export class LoginAttempts {
  private readonly pair: FailureWindow;
  private readonly login: FailureWindow;

  constructor(now: () => number = Date.now, maxEntries = MAX_ENTRIES) {
    this.pair = new FailureWindow(PAIR_MAX_FAILURES, PAIR_WINDOW_MS, now, maxEntries);
    this.login = new FailureWindow(LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS, now, maxEntries);
  }

  blocked(loginKey: string, ip: string): boolean {
    return this.pair.blocked(`${loginKey}|${ip}`) || this.login.blocked(loginKey);
  }

  fail(loginKey: string, ip: string): void {
    this.pair.fail(`${loginKey}|${ip}`);
    this.login.fail(loginKey);
  }

  /** Удачный вход снимает счётчик своего адреса. Общий на номер истекает сам:
   *  иначе вход владельца обнулял бы перебор с чужих адресов. */
  succeed(loginKey: string, ip: string): void {
    this.pair.reset(`${loginKey}|${ip}`);
  }
}
