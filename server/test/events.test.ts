import { describe, expect, it } from "vitest";
import { EventHub, MAX_STREAMS_PER_USER, sseFrame } from "../src/events/hub.js";
import { EVENTS_CHANNEL, eventUserId } from "../src/events/listener.js";

const A = "c17f2662-fe32-4f4c-b6f2-7854225fa340";
const B = "25942f12-d860-4813-96fe-edfe0fd34f7c";

describe("кадр SSE", () => {
  it("имя события и данные JSON, пустая строка в конце", () => {
    expect(sseFrame("notification", {})).toBe("event: notification\ndata: {}\n\n");
  });
});

describe("EventHub", () => {
  it("сигнал уходит только потокам этого человека", () => {
    const hub = new EventHub();
    const a: string[] = [];
    const b: string[] = [];
    hub.add(A, (f) => a.push(f));
    hub.add(B, (f) => b.push(f));
    expect(hub.publish(A, "notification")).toBe(1);
    expect(a).toEqual([sseFrame("notification", {})]);
    expect(b).toEqual([]);
  });

  it("закрытый поток больше не получает сигналов", () => {
    const hub = new EventHub();
    const got: string[] = [];
    const remove = hub.add(A, (f) => got.push(f));
    remove?.();
    expect(hub.publish(A, "notification")).toBe(0);
    expect(got).toEqual([]);
    expect(hub.size()).toBe(0);
  });

  it("не больше пяти потоков на человека", () => {
    const hub = new EventHub();
    for (let i = 0; i < MAX_STREAMS_PER_USER; i += 1)
      expect(hub.add(A, () => undefined)).not.toBeNull();
    expect(hub.add(A, () => undefined)).toBeNull();
    expect(hub.add(B, () => undefined)).not.toBeNull();
  });

  it("сбой одного потока не мешает остальным", () => {
    const hub = new EventHub();
    const got: string[] = [];
    hub.add(A, () => {
      throw new Error("сокет закрыт");
    });
    hub.add(A, (f) => got.push(f));
    expect(hub.publish(A, "notification")).toBe(1);
    expect(got).toHaveLength(1);
  });
});

describe("сигнал из базы", () => {
  it("uuid из своего канала — событие", () => {
    expect(eventUserId(EVENTS_CHANNEL, A)).toBe(A);
    expect(eventUserId(EVENTS_CHANNEL, A.toUpperCase())).toBe(A);
  });

  it("чужой канал, пусто и мусор — нет", () => {
    expect(eventUserId("other", A)).toBeNull();
    expect(eventUserId(EVENTS_CHANNEL, undefined)).toBeNull();
    expect(eventUserId(EVENTS_CHANNEL, "drop table")).toBeNull();
  });
});
