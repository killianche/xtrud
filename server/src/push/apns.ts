// Отправка push прямо в Apple Push Notification service.
//
// Почему свой клиент, а не библиотека: APNs требует HTTP/2, и он есть в
// стандартном `node:http2`. Всё, что нужно сверх этого, — подписать провайдерский
// токен ES256 ключом .p8. Внешних зависимостей это не добавляет.
//
// Протокол: POST https://api.push.apple.com/3/device/<токен устройства>
// с заголовком `authorization: bearer <JWT>`. Apple отвечает 200 при приёме и
// 4xx с полем `reason`, если токен устройства мёртв или чужой.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import http2 from "node:http2";

export interface ApnsConfig {
  keyPath: string;
  keyId: string;
  teamId: string;
  /** Bundle identifier приложения — он же apns-topic. */
  topic: string;
}

export type ApnsEnvironment = "production" | "sandbox";

const HOSTS: Record<ApnsEnvironment, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

/**
 * Apple требует обновлять провайдерский токен не реже раза в час и не чаще
 * раза в 20 минут. Держим 50 минут — с запасом внутри обоих ограничений.
 */
const TOKEN_TTL_MS = 50 * 60 * 1000;

export interface PushMessage {
  title: string;
  body: string;
  /** Полезная нагрузка приложения: тип уведомления, id заказа и прочее. */
  data: Record<string, unknown>;
  /** Число на иконке приложения; не передаём, если считать нечего. */
  badge?: number;
}

export interface DeliveryResult {
  deviceToken: string;
  status: number;
  reason: string | null;
  /** Токен больше не действителен — устройство удалило приложение или это чужой токен. */
  gone: boolean;
}

/** Причины, после которых токен нужно убрать из базы, а не повторять отправку. */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
  "TopicDisallowed",
]);

/** Ответ Apple означает, что токен мёртв и его надо удалить. */
export function isDeadTokenReason(reason: string | null): boolean {
  return reason !== null && DEAD_TOKEN_REASONS.has(reason);
}

/**
 * Тело уведомления для Apple. Служебная часть лежит в `aps`, наша — рядом,
 * на верхнем уровне: приложение читает оттуда тип и id, чтобы открыть нужный
 * экран по нажатию.
 */
export function buildApnsPayload(message: PushMessage): Record<string, unknown> {
  return {
    aps: {
      alert: { title: message.title, body: message.body },
      sound: "default",
      ...(message.badge === undefined ? {} : { badge: message.badge }),
    },
    ...message.data,
  };
}

export class ApnsClient {
  private readonly cfg: ApnsConfig;
  private readonly key: string;
  private cachedToken: { value: string; issuedAt: number } | null = null;
  private sessions = new Map<ApnsEnvironment, http2.ClientHttp2Session>();

  constructor(cfg: ApnsConfig) {
    this.cfg = cfg;
    // Читаем ключ один раз при старте: если файла нет или он испорчен, сервер
    // должен упасть сразу, а не при первой попытке отправки ночью.
    this.key = readFileSync(cfg.keyPath, "utf8");
    if (!this.key.includes("BEGIN PRIVATE KEY")) {
      throw new Error(`Ключ APNs ${cfg.keyPath} не похож на .p8 (нет BEGIN PRIVATE KEY)`);
    }
  }

  private providerToken(): string {
    const now = Date.now();
    if (this.cachedToken && now - this.cachedToken.issuedAt < TOKEN_TTL_MS) {
      return this.cachedToken.value;
    }
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const header = b64({ alg: "ES256", kid: this.cfg.keyId });
    const payload = b64({ iss: this.cfg.teamId, iat: Math.floor(now / 1000) });
    const signature = createSign("SHA256")
      .update(`${header}.${payload}`)
      .sign({ key: this.key, dsaEncoding: "ieee-p1363" })
      .toString("base64url");
    const value = `${header}.${payload}.${signature}`;
    this.cachedToken = { value, issuedAt: now };
    return value;
  }

  /**
   * Соединение с Apple держим открытым: HTTP/2 позволяет слать по нему много
   * уведомлений, а рукопожатие TLS на каждое сообщение — лишние сотни
   * миллисекунд. Оборвалось — откроем заново при следующей отправке.
   */
  private session(env: ApnsEnvironment): http2.ClientHttp2Session {
    const existing = this.sessions.get(env);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = http2.connect(HOSTS[env]);
    session.on("error", () => this.sessions.delete(env));
    session.on("close", () => this.sessions.delete(env));
    this.sessions.set(env, session);
    return session;
  }

  async send(
    deviceToken: string,
    env: ApnsEnvironment,
    message: PushMessage,
  ): Promise<DeliveryResult> {
    const body = JSON.stringify(buildApnsPayload(message));

    return await new Promise<DeliveryResult>((resolve) => {
      let settled = false;
      const done = (status: number, reason: string | null) => {
        if (settled) return;
        settled = true;
        resolve({ deviceToken, status, reason, gone: isDeadTokenReason(reason) });
      };
      let request: http2.ClientHttp2Stream;
      try {
        request = this.session(env).request({
          ":method": "POST",
          ":path": `/3/device/${deviceToken}`,
          authorization: `bearer ${this.providerToken()}`,
          "apns-topic": this.cfg.topic,
          "apns-push-type": "alert",
          "apns-priority": "10",
          "content-type": "application/json",
        });
      } catch (e) {
        return done(0, (e as Error).message);
      }

      let status = 0;
      let raw = "";
      request.setEncoding("utf8");
      request.on("response", (headers) => {
        status = Number(headers[":status"] ?? 0);
      });
      request.on("data", (chunk: string) => {
        raw += chunk;
      });
      request.on("end", () => {
        let reason: string | null = null;
        if (raw.length > 0) {
          try {
            reason = (JSON.parse(raw) as { reason?: string }).reason ?? null;
          } catch {
            reason = raw.slice(0, 120);
          }
        }
        done(status, reason);
      });
      request.on("error", (e) => done(0, e.message));
      // Своё ограничение по времени: висящий поток не должен держать запрос
      // от базы, у которой таймаут всего две секунды.
      request.setTimeout(5_000, () => {
        request.close();
        done(0, "timeout");
      });
      request.end(body);
    });
  }

  close(): void {
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}
