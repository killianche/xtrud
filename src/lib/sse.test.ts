import { describe, expect, it } from "vitest";
import { parseSseFrames } from "./sse";

describe("parseSseFrames", () => {
  it("кадр с событием и данными", () => {
    expect(parseSseFrames("event: notification\ndata: {}\n\n")).toEqual({
      frames: [{ event: "notification", data: "{}" }],
      rest: "",
    });
  });

  it("retry и ready в одном кадре — событие ready", () => {
    const { frames } = parseSseFrames("retry: 5000\nevent: ready\ndata: {}\n\n");
    expect(frames).toEqual([{ event: "ready", data: "{}" }]);
  });

  it("сигнал «жив» — не кадр", () => {
    expect(parseSseFrames(": ping\n\n")).toEqual({ frames: [], rest: "" });
  });

  it("незаконченный кадр ждёт следующего куска", () => {
    const first = parseSseFrames("event: notif");
    expect(first.frames).toEqual([]);
    const second = parseSseFrames(`${first.rest}ication\ndata: {}\n\n`);
    expect(second.frames).toEqual([{ event: "notification", data: "{}" }]);
  });

  it("несколько кадров подряд и перевод строки \\r\\n", () => {
    const { frames } = parseSseFrames("event: a\r\ndata: 1\r\n\r\nevent: b\ndata: 2\n\n");
    expect(frames.map((f) => f.event)).toEqual(["a", "b"]);
  });
});
