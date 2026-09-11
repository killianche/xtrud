// Слушатель базы для живых обновлений. Триггер на notifications (0189)
// шлёт pg_notify('xtrud_user_events', user_id) — только после COMMIT, так что
// откатанное уведомление сигнала не даёт. Одно подключение LISTEN на весь
// процесс; обрыв — переподключение с паузой 1 → 30 с.
import pg from "pg";
import type { EventHub } from "./hub.js";

export const EVENTS_CHANNEL = "xtrud_user_events";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Log {
  info: (obj: object, msg?: string) => void;
  warn: (obj: object, msg?: string) => void;
}

/** Пустая строка, мусор или чужой канал — не событие. */
export function eventUserId(channel: string, payload: string | undefined): string | null {
  if (channel !== EVENTS_CHANNEL || !payload || !UUID.test(payload)) return null;
  return payload.toLowerCase();
}

export function startEventListener(url: string, hub: EventHub, log: Log): () => Promise<void> {
  let client: pg.Client | null = null;
  let stopped = false;
  let delay = 1000;
  let timer: NodeJS.Timeout | null = null;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    const c = new pg.Client({ connectionString: url });
    client = c;
    c.on("notification", (msg) => {
      const userId = eventUserId(msg.channel, msg.payload);
      if (userId) hub.publish(userId, "notification");
    });
    const retry = (err: unknown) => {
      if (stopped || client !== c) return;
      client = null;
      log.warn({ err: String(err) }, "events: LISTEN оборвался, переподключаюсь");
      c.removeAllListeners();
      // Без обработчика ошибка клиента pg уронила бы процесс.
      c.on("error", () => undefined);
      void c.end().catch(() => undefined);
      timer = setTimeout(() => void connect(), delay);
      delay = Math.min(delay * 2, 30_000);
    };
    c.on("error", retry);
    c.on("end", () => retry(new Error("соединение закрыто")));
    try {
      await c.connect();
      await c.query(`LISTEN ${EVENTS_CHANNEL}`);
      delay = 1000;
      log.info({}, "events: LISTEN подключён");
    } catch (err) {
      retry(err);
    }
  };

  void connect();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    await client?.end().catch(() => undefined);
  };
}
