// Лимит неудачных входов на один номер (или почту), в памяти процесса.
// Лимит по IP (index.ts) не спасает от перебора пароля к одному номеру с
// многих адресов; этот — спасает. Считаются только неудачи: человек, который
// вошёл, сбрасывает счётчик. xtrud-api работает одним процессом, поэтому
// общего хранилища не нужно; при перезапуске счётчики обнуляются.
import { isPhoneLogin, phoneKey } from "./phone.js";

export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_WINDOW_MS = 15 * 60_000;
const SWEEP_THRESHOLD = 10_000;

/** Ключ счётчика: у номера — последние 10 цифр (как ищет аккаунт база). */
export function loginAttemptKey(login: string): string {
  const trimmed = login.trim();
  if (isPhoneLogin(trimmed)) {
    const key = phoneKey(trimmed);
    if (key) return `phone:${key}`;
  }
  return `login:${trimmed.toLowerCase()}`;
}

export class LoginAttempts {
  private readonly entries = new Map<string, { failures: number; resetAt: number }>();

  constructor(
    private readonly maxFailures = LOGIN_MAX_FAILURES,
    private readonly windowMs = LOGIN_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Сколько секунд ещё нельзя пытаться; 0 — можно. */
  retryAfterSeconds(key: string): number {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    const left = entry.resetAt - this.now();
    if (left <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return entry.failures >= this.maxFailures ? Math.ceil(left / 1000) : 0;
  }

  fail(key: string): void {
    const t = this.now();
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= t) {
      if (this.entries.size >= SWEEP_THRESHOLD) this.sweep(t);
      this.entries.set(key, { failures: 1, resetAt: t + this.windowMs });
      return;
    }
    entry.failures += 1;
  }

  reset(key: string): void {
    this.entries.delete(key);
  }

  private sweep(t: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= t) this.entries.delete(key);
    }
  }
}
