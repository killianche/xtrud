import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { Tokens } from "./auth/jwt.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { apnsConfigured, loadConfig, rustorePushConfigured, s3Configured } from "./config.js";
import { Db } from "./db.js";
import { EventHub } from "./events/hub.js";
import { startEventListener } from "./events/listener.js";
import { registerEventRoutes } from "./events/routes.js";
import { registerFilesRoutes } from "./files/routes.js";
import { S3Storage } from "./files/s3.js";
import { ApnsClient } from "./push/apns.js";
import { registerPushRoutes } from "./push/routes.js";
import { RuStorePushClient } from "./push/rustore.js";
import { registerRestProxy } from "./rest/routes.js";
import { registerRpcRoutes } from "./rpc/routes.js";

const cfg = loadConfig();
const db = new Db(cfg.DATABASE_URL);
const tokens = new Tokens(cfg.JWT_SECRET, cfg.JWT_ISSUER, cfg.ACCESS_TTL_SECONDS);
// Хранилище файлов: объектное, если настроено, иначе диск сервера.
const s3 = s3Configured(cfg)
  ? new S3Storage({
      endpoint: cfg.S3_ENDPOINT as string,
      region: cfg.S3_REGION as string,
      bucket: cfg.S3_BUCKET as string,
      accessKey: cfg.S3_ACCESS_KEY as string,
      secretKey: cfg.S3_SECRET_KEY as string,
    })
  : null;
// Ключ APNs читается на старте: испорченный файл должен уронить деплой,
// а не выясниться при первом уведомлении.
const apns = apnsConfigured(cfg)
  ? new ApnsClient({
      keyPath: cfg.APNS_KEY_PATH as string,
      keyId: cfg.APNS_KEY_ID as string,
      teamId: cfg.APNS_TEAM_ID as string,
      topic: cfg.APNS_TOPIC,
    })
  : null;
// Push на Android идёт через RuStore: там наш канал распространения, и он
// работает на телефонах без сервисов Google.
const rustorePush = rustorePushConfigured(cfg)
  ? new RuStorePushClient({
      projectId: cfg.RUSTORE_PUSH_PROJECT_ID as string,
      serviceToken: cfg.RUSTORE_PUSH_SERVICE_TOKEN as string,
    })
  : null;

// trustProxy: реальный IP приходит от nginx в X-Forwarded-For (лимиты по IP).
const app = Fastify({ logger: { level: "info" }, bodyLimit: 2 * 1024 * 1024, trustProxy: true });
// Браузерные клиенты — только админка; приложение (React Native) Origin не шлёт.
const ALLOWED_ORIGINS = new Set([
  "https://xtrud.pro",
  "https://www.xtrud.pro",
  "http://localhost:5173",
]);
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || ALLOWED_ORIGINS.has(origin)),
  exposedHeaders: ["content-range", "preference-applied"],
});
// Лимиты по IP: общий и отдельный, строже, для входа (перебор паролей).
await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute" });
// JSON остаётся строкой (прокси к PostgREST передаёт его как есть), остальные
// типы — буфером (файлы). Свои маршруты разбирают JSON сами.
app.removeAllContentTypeParsers();
app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
  try {
    done(null, typeof body === "string" && body.length > 0 ? JSON.parse(body) : {});
  } catch {
    done(Object.assign(new Error("Неверный JSON"), { statusCode: 400 }));
  }
});
app.addContentTypeParser("*", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

// Живые обновления: база сообщает о новом уведомлении (0189), сервер —
// открытым потокам этого человека (GET /v2/events).
const hub = new EventHub();
startEventListener(cfg.DATABASE_URL, hub, app.log);

app.get("/v2/health", async () => {
  const r = await db.pool.query("SELECT now() AS now");
  return {
    ok: true,
    now: r.rows[0]?.now ?? null,
    version: "0.1.0",
    push: apns !== null,
    pushAndroid: rustorePush !== null,
    storage: s3 === null ? "disk" : "s3",
  };
});

await app.register(
  async (scope) => {
    await scope.register(async (authScope) => {
      await authScope.register(rateLimit, { max: 20, timeWindow: "1 minute" });
      registerAuthRoutes(authScope, db, tokens, cfg);
    });
    registerRpcRoutes(scope, db, tokens);
    registerEventRoutes(scope, tokens, hub);
    if (cfg.NOTIFY_SECRET !== undefined) {
      registerPushRoutes(scope, db, apns, cfg.NOTIFY_SECRET, rustorePush);
    }
    registerRestProxy(scope, cfg.POSTGREST_URL);
    registerFilesRoutes(scope, db, tokens, {
      root: cfg.FILES_ROOT,
      publicBase: cfg.FILES_PUBLIC_BASE,
      signSecret: cfg.JWT_SECRET,
      s3,
    });
  },
  { prefix: "/v2" },
);

await app.listen({ port: cfg.PORT, host: "0.0.0.0" });
