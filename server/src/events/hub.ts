// Живые обновления (SSE): кто сейчас на связи и как сказать ему «что-то
// изменилось». Содержимое событий не передаётся — только сигнал; данные
// приложение забирает обычными запросами под RLS. Поэтому канал ничего не
// раскрывает, даже если бы кадр ушёл не тому.

/** Больше потоков на одного человека не нужно: телефон, планшет, запас. */
export const MAX_STREAMS_PER_USER = 5;

export type Send = (frame: string) => void;

/** Кадр SSE: имя события и данные одной строкой JSON. */
export function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Комментарий SSE — держит соединение живым через nginx (таймаут 120 с). */
export const SSE_HEARTBEAT = ": ping\n\n";

export class EventHub {
  private readonly streams = new Map<string, Set<Send>>();

  /** Подключить поток. null — у человека уже слишком много потоков. */
  add(userId: string, send: Send): (() => void) | null {
    let set = this.streams.get(userId);
    if (!set) {
      set = new Set();
      this.streams.set(userId, set);
    }
    if (set.size >= MAX_STREAMS_PER_USER) return null;
    set.add(send);
    return () => {
      const current = this.streams.get(userId);
      if (!current) return;
      current.delete(send);
      if (current.size === 0) this.streams.delete(userId);
    };
  }

  /** Сигнал всем потокам человека. Сбой одного не мешает остальным. */
  publish(userId: string, event: string): number {
    const set = this.streams.get(userId);
    if (!set) return 0;
    const frame = sseFrame(event, {});
    let delivered = 0;
    for (const send of set) {
      try {
        send(frame);
        delivered += 1;
      } catch {
        // Поток уже закрывается — уберётся сам по событию close.
      }
    }
    return delivered;
  }

  /** Сколько потоков открыто сейчас. */
  size(): number {
    let n = 0;
    for (const set of this.streams.values()) n += set.size;
    return n;
  }
}
