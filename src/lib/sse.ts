/**
 * Поток SSE поверх XMLHttpRequest — для живых обновлений (/v2/events).
 *
 * В React Native нет EventSource, а fetch не отдаёт тело по частям. XHR
 * отдаёт: при подписке на onprogress он шлёт текст кусками по мере прихода
 * (react-native/Libraries/Network/XMLHttpRequest.js, incrementalUpdates).
 * Поэтому без сторонних библиотек.
 */

export interface SseFrame {
  event: string;
  data: string;
}

/**
 * Разобрать накопленный текст на кадры. Кадры разделяет пустая строка;
 * незаконченный хвост возвращается в `rest` до следующего куска.
 * Комментарии («: ping») кадром не считаются.
 */
export function parseSseFrames(buffer: string): { frames: SseFrame[]; rest: string } {
  const frames: SseFrame[] = [];
  let rest = buffer.replace(/\r\n/g, "\n");
  let end = rest.indexOf("\n\n");
  while (end >= 0) {
    const block = rest.slice(0, end);
    rest = rest.slice(end + 2);
    let event = "message";
    const data: string[] = [];
    let hasField = false;
    for (const line of block.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") {
        event = value;
        hasField = true;
      } else if (field === "data") {
        data.push(value);
        hasField = true;
      }
    }
    if (hasField) frames.push({ event, data: data.join("\n") });
    end = rest.indexOf("\n\n");
  }
  return { frames, rest };
}

export interface SseOptions {
  url: string;
  token: string;
  onFrame: (frame: SseFrame) => void;
  /** Пришли любые данные, включая «: ping», — канал жив. */
  onActivity: () => void;
  /** Соединение закрылось не по нашей просьбе (сервер, сеть, 401). */
  onClose: (status: number) => void;
}

/** Открыть поток. Возвращает функцию закрытия; после неё onClose не зовётся. */
export function openSse(o: SseOptions): () => void {
  const xhr = new XMLHttpRequest();
  let seen = 0;
  let buffer = "";
  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    o.onClose(xhr.status);
  };
  xhr.open("GET", o.url);
  xhr.setRequestHeader("Authorization", `Bearer ${o.token}`);
  xhr.setRequestHeader("Accept", "text/event-stream");
  xhr.setRequestHeader("Cache-Control", "no-cache");
  xhr.onprogress = () => {
    const text = xhr.responseText ?? "";
    if (text.length <= seen) return;
    buffer += text.slice(seen);
    seen = text.length;
    o.onActivity();
    const { frames, rest } = parseSseFrames(buffer);
    buffer = rest;
    for (const frame of frames) o.onFrame(frame);
  };
  xhr.onreadystatechange = () => {
    if (xhr.readyState === 4) finish();
  };
  xhr.onerror = finish;
  xhr.send();
  return () => {
    if (closed) return;
    closed = true;
    xhr.abort();
  };
}
