import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAuthRoutes } from "./auth/routes.js";
import { Tokens } from "./auth/jwt.js";
import { loadConfig } from "./config.js";
import { Db } from "./db.js";
import { registerRpcRoutes } from "./rpc/routes.js";

const cfg = loadConfig();
const db = new Db(cfg.DATABASE_URL);
const tokens = new Tokens(cfg.JWT_SECRET, cfg.JWT_ISSUER, cfg.ACCESS_TTL_SECONDS);

const app = Fastify({ logger: { level: "info" }, bodyLimit: 2 * 1024 * 1024 });
await app.register(cors, { origin: true });

app.get("/v2/health", async () => {
  const r = await db.pool.query("SELECT now() AS now");
  return { ok: true, now: r.rows[0]?.now ?? null, version: "0.1.0" };
});

await app.register(
  async (scope) => {
    registerAuthRoutes(scope, db, tokens, cfg);
    registerRpcRoutes(scope, db, tokens);
  },
  { prefix: "/v2" },
);

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
