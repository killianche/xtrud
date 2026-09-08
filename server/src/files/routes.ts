// Файлы — замена Supabase Storage. Диск сервера (потом Beget S3), те же
// бакеты и пути `<bucket>/<userId>/<файл>`, те же правила, что были в
// политиках storage.objects (снимок 2026-09-08):
//   avatars, order-photos, portfolio — публичное чтение, запись/удаление
//   только в своей папке (portfolio — только специалист);
//   master-verifications — закрытый: чтение владельцу и админу по подписанной
//   ссылке, запись/удаление владельцу.
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Tokens } from "../auth/jwt.js";
import { bearer } from "../auth/routes.js";
import type { Db } from "../db.js";

export interface FilesConfig {
  root: string;
  publicBase: string;
  signSecret: string;
}

const BUCKETS: Record<string, { public: boolean; mastersOnly?: boolean }> = {
  avatars: { public: true },
  portfolio: { public: true, mastersOnly: true },
  "order-photos": { public: true },
  "master-verifications": { public: false },
};
const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const MAX_BYTES = 20 * 1024 * 1024;
/** Не больше файлов в папке пользователя внутри бакета (защита диска). */
const MAX_FILES_PER_FOLDER = 300;

/** Первые байты файла должны соответствовать заявленному типу. */
function matchesMagic(type: string, body: Buffer): boolean {
  if (body.length < 12) return false;
  if (type === "image/jpeg") return body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (type === "image/png")
    return body.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (type === "image/webp")
    return body.subarray(0, 4).toString() === "RIFF" && body.subarray(8, 12).toString() === "WEBP";
  return false;
}

function safeParts(raw: string): string[] | null {
  const parts = raw.split("/").filter((p) => p.length > 0);
  if (parts.length < 2 || parts.length > 6) return null;
  for (const p of parts) if (!SEGMENT_RE.test(p) || p === "." || p === "..") return null;
  return parts;
}

function sign(secret: string, bucket: string, filePath: string, exp: number): string {
  return createHmac("sha256", secret).update(`${bucket}/${filePath}:${exp}`).digest("base64url");
}

export function registerFilesRoutes(
  app: FastifyInstance,
  db: Db,
  tokens: Tokens,
  cfg: FilesConfig,
) {
  const abs = (bucket: string, parts: string[]) => path.join(cfg.root, bucket, ...parts);
  const publicUrl = (bucket: string, filePath: string) => `${cfg.publicBase}/${bucket}/${filePath}`;

  app.put<{ Params: { bucket: string; "*": string } }>(
    "/files/:bucket/*",
    { bodyLimit: MAX_BYTES },
    async (req, reply) => {
      const bucket = BUCKETS[req.params.bucket];
      if (!bucket) return reply.code(404).send({ error: "Нет такого хранилища" });
      const parts = safeParts(req.params["*"]);
      if (!parts) return reply.code(400).send({ error: "Неверный путь файла" });
      const claims = await tokens.verify(bearer(req.headers.authorization));
      if (!claims) return reply.code(401).send({ error: "Нужен вход" });
      if (parts[0] !== claims.sub)
        return reply.code(403).send({ error: "Можно загружать только в свою папку" });
      const type = (req.headers["content-type"] ?? "").split(";")[0]?.trim() ?? "";
      const extensions = ALLOWED_TYPES[type];
      if (!extensions) return reply.code(415).send({ error: "Только JPEG, PNG или WebP" });
      const fileName = parts[parts.length - 1] ?? "";
      const ext = path.extname(fileName).toLowerCase();
      if (!extensions.includes(ext))
        return reply.code(415).send({ error: "Расширение файла не совпадает с типом" });
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0)
        return reply.code(400).send({ error: "Пустой файл" });
      if (!matchesMagic(type, body))
        return reply.code(415).send({ error: "Файл не является изображением" });
      const folder = path.join(cfg.root, req.params.bucket, parts[0] ?? "");
      const existing = await readdir(folder).catch(() => [] as string[]);
      if (existing.length >= MAX_FILES_PER_FOLDER && !existing.includes(fileName)) {
        return reply.code(429).send({ error: "Слишком много файлов. Удалите ненужные." });
      }
      if (bucket.mastersOnly) {
        const isMaster = await db.asUser(claims, async (c) => {
          const r = await c.query<{ is_master: boolean }>(
            "SELECT is_master FROM public.users WHERE id = $1",
            [claims.sub],
          );
          return r.rows[0]?.is_master === true;
        });
        if (!isMaster)
          return reply.code(403).send({ error: "Фото работ загружает только специалист" });
      }
      const target = abs(req.params.bucket, parts);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o755 });
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, body, { mode: 0o644 });
      await rename(tmp, target);
      const filePath = parts.join("/");
      return reply.send({
        bucket: req.params.bucket,
        path: filePath,
        publicUrl: bucket.public ? publicUrl(req.params.bucket, filePath) : null,
      });
    },
  );

  app.delete<{ Params: { bucket: string; "*": string } }>(
    "/files/:bucket/*",
    async (req, reply) => {
      const bucket = BUCKETS[req.params.bucket];
      if (!bucket) return reply.code(404).send({ error: "Нет такого хранилища" });
      const parts = safeParts(req.params["*"]);
      if (!parts) return reply.code(400).send({ error: "Неверный путь файла" });
      const claims = await tokens.verify(bearer(req.headers.authorization));
      if (!claims) return reply.code(401).send({ error: "Нужен вход" });
      if (parts[0] !== claims.sub)
        return reply.code(403).send({ error: "Можно удалять только свои файлы" });
      await rm(abs(req.params.bucket, parts), { force: true });
      return reply.code(204).send();
    },
  );

  /** Подписанная ссылка на закрытый файл: владелец или администратор. */
  app.post<{ Body: { bucket?: string; path?: string } }>("/files/sign", async (req, reply) => {
    const bucketName = String(req.body?.bucket ?? "");
    const bucket = BUCKETS[bucketName];
    const parts = safeParts(String(req.body?.path ?? ""));
    if (!bucket || !parts) return reply.code(400).send({ error: "Неверный путь файла" });
    const claims = await tokens.verify(bearer(req.headers.authorization));
    if (!claims) return reply.code(401).send({ error: "Нужен вход" });
    const allowed =
      parts[0] === claims.sub ||
      (await db.asUser(claims, async (c) => {
        const r = await c.query<{ ok: boolean }>("SELECT public.is_admin_session() AS ok");
        return r.rows[0]?.ok === true;
      }));
    if (!allowed) return reply.code(403).send({ error: "Нет доступа к файлу" });
    const filePath = parts.join("/");
    const exp = Math.floor(Date.now() / 1000) + 600;
    const sig = sign(cfg.signSecret, bucketName, filePath, exp);
    return reply.send({
      url: `${cfg.publicBase.replace(/\/files$/, "")}/v2/files/private/${bucketName}/${filePath}?exp=${exp}&sig=${sig}`,
    });
  });

  app.get<{ Params: { bucket: string; "*": string }; Querystring: { exp?: string; sig?: string } }>(
    "/files/private/:bucket/*",
    async (req, reply) => {
      const bucket = BUCKETS[req.params.bucket];
      const parts = safeParts(req.params["*"]);
      if (!bucket || !parts) return reply.code(404).send({ error: "Файл не найден" });
      const exp = Number(req.query.exp ?? 0);
      const sig = String(req.query.sig ?? "");
      if (!exp || exp < Math.floor(Date.now() / 1000))
        return reply.code(403).send({ error: "Ссылка истекла" });
      const expected = sign(cfg.signSecret, req.params.bucket, parts.join("/"), exp);
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      if (a.length !== b.length || !timingSafeEqual(a, b))
        return reply.code(403).send({ error: "Неверная подпись" });
      const target = abs(req.params.bucket, parts);
      if (!existsSync(target)) return reply.code(404).send({ error: "Файл не найден" });
      const ext = path.extname(target).toLowerCase();
      reply.header(
        "Content-Type",
        ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg",
      );
      reply.header("Cache-Control", "private, max-age=300");
      return reply.send(createReadStream(target));
    },
  );
}
