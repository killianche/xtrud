import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { TRUSTED_PROXIES } from "../src/http/trust-proxy.js";

// nginx дописывает настоящий адрес клиента в конец X-Forwarded-For, контейнер
// видит соединение от шлюза Docker (172.18.0.1 на Beget).
const NGINX = "172.18.0.1";
const CLIENT = "203.0.113.7";

async function buildApp() {
  const app = Fastify({ trustProxy: TRUSTED_PROXIES });
  await app.register(rateLimit, { max: 2, timeWindow: "1 minute" });
  app.get("/ip", async (req) => ({ ip: req.ip }));
  await app.ready();
  return app;
}

describe("адрес клиента за nginx", () => {
  it("берётся из того, что дописал nginx, а не из присланного клиентом", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: NGINX,
      headers: { "x-forwarded-for": `1.2.3.4, 10.0.0.1, ${CLIENT}` },
    });
    expect(res.json()).toEqual({ ip: CLIENT });
    await app.close();
  });

  it("подделанный X-Forwarded-For не даёт нового лимита", async () => {
    const app = await buildApp();
    const codes: number[] = [];
    for (const spoofed of ["1.1.1.1", "8.8.8.8", "9.9.9.9", "127.0.0.1"]) {
      const res = await app.inject({
        method: "GET",
        url: "/ip",
        remoteAddress: NGINX,
        headers: { "x-forwarded-for": `${spoofed}, ${CLIENT}` },
      });
      codes.push(res.statusCode);
    }
    expect(codes).toEqual([200, 200, 429, 429]);
    await app.close();
  });

  it("заголовку от недоверенного адреса не верим совсем", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/ip",
      remoteAddress: "198.51.100.20",
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.json()).toEqual({ ip: "198.51.100.20" });
    await app.close();
  });
});
