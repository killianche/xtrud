import cors from "@fastify/cors";
import Fastify from "fastify";
import { Tokens } from "./auth/jwt.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { loadConfig } from "./config.js";
import { Db } from "./db.js";
import { registerFilesRoutes } from "./files/routes.js";
import { registerRestProxy } from "./rest/routes.js";
import { registerRpcRoutes } from "./rpc/routes.js";

const cfg = loadConfig();
const db = new Db(cfg.DATABASE_URL);
const tokens = new Tokens(cfg.JWT_SECRET, cfg.JWT_ISSUER, cfg.ACCESS_TTL_SECONDS);

const app = Fastify({ logger: { level: "info" }, bodyLimit: 2 * 1024 * 1024 });
await app.register(cors, { origin: true });
// JSON остаётся строкой (прокси к PostgREST передаёт его как есть), остальные
// типы — буфером (файлы). Свои маршруты разбирают JSON сами.
app.removeAllContentTypeParsers();
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  try {
    done(null, typeof body === "string" && body.length > 0 ? JSON.parse(body) : {});
  } catch {
    done(null, {});
  }
});
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

app.get("/v2/health", async () => {
  const r = await db.pool.query("SELECT now() AS now");
  return { ok: true, now: r.rows[0]?.now ?? null, version: "0.1.0" };
});

await app.register(
  async (scope) => {
    registerAuthRoutes(scope, db, tokens, cfg);
    registerRpcRoutes(scope, db, tokens);
    registerRestProxy(scope, cfg.POSTGREST_URL);
    registerFilesRoutes(scope, db, tokens, {
      root: cfg.FILES_ROOT,
      publicBase: cfg.FILES_PUBLIC_BASE,
      signSecret: cfg.JWT_SECRET,
    });
  },
  { prefix: "/v2" },
);

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
