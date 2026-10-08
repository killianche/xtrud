import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  type CleanupDb,
  type CleanupStorage,
  processFileDeletionQueue,
  type QueueItem,
  validateItem,
} from "../src/files/account-file-cleanup.js";

const UID = "a0000000-0000-4000-8000-0000000000c1";
const OTHER = "a0000000-0000-4000-8000-0000000000d1";

function fakeDb(items: QueueItem[], opts: { missing?: boolean } = {}) {
  const updates: { id: unknown; ok: boolean; error?: unknown }[] = [];
  const db: CleanupDb = {
    async asService(fn) {
      return fn({
        query: (async (sql: string, params: unknown[]) => {
          if (sql.includes("SELECT")) {
            if (opts.missing)
              throw Object.assign(new Error("relation does not exist"), { code: "42P01" });
            return { rows: items };
          }
          updates.push({ id: params[0], ok: sql.includes("done_at = now()"), error: params[1] });
          return { rows: [] };
        }) as never,
      });
    },
  };
  return { db, updates };
}

function fakeS3(keys: string[]): CleanupStorage & { deleted: string[] } {
  const store = new Set(keys);
  const deleted: string[] = [];
  return {
    deleted,
    async listKeys(prefix) {
      return [...store].filter((k) => k.startsWith(prefix)).slice(0, 2);
    },
    async delete(key) {
      store.delete(key);
      deleted.push(key);
    },
  };
}

describe("проверка задания очереди", () => {
  it("префикс — только папка своего пользователя", () => {
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "avatars",
        object_path: `${UID}/`,
        is_prefix: true,
      }),
    ).toEqual([UID]);
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "avatars",
        object_path: `${OTHER}/`,
        is_prefix: true,
      }),
    ).toBeNull();
    expect(
      validateItem({ id: 1, user_id: UID, bucket: "avatars", object_path: "/", is_prefix: true }),
    ).toBeNull();
  });
  it("чужой бакет и обход пути отвергаются", () => {
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "promo",
        object_path: `${UID}/`,
        is_prefix: true,
      }),
    ).toBeNull();
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "master-verifications",
        object_path: "../x.jpg",
        is_prefix: false,
      }),
    ).toBeNull();
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "master-verifications",
        object_path: "legacy/p.jpg",
        is_prefix: false,
      }),
    ).toBeNull();
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "master-verifications",
        object_path: `${OTHER}/passport.jpg`,
        is_prefix: false,
      }),
    ).toBeNull();
    expect(
      validateItem({
        id: 1,
        user_id: UID,
        bucket: "master-verifications",
        object_path: `${UID}/passport.jpg`,
        is_prefix: false,
      }),
    ).toEqual([UID, "passport.jpg"]);
  });
});

describe("проход по очереди", () => {
  it("удаляет папку пользователя на диске и в хранилище, чужое не трогает", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xtrud-cleanup-"));
    await mkdir(path.join(root, "avatars", UID), { recursive: true });
    await mkdir(path.join(root, "avatars", OTHER), { recursive: true });
    await writeFile(path.join(root, "avatars", UID, "a.jpg"), "x");
    await writeFile(path.join(root, "avatars", OTHER, "b.jpg"), "x");
    const s3 = fakeS3([
      `avatars/${UID}/a.jpg`,
      `avatars/${UID}/b.jpg`,
      `avatars/${UID}/c.jpg`,
      `avatars/${OTHER}/d.jpg`,
      `master-verifications/${UID}/p.jpg`,
      `master-verifications/${OTHER}/passport.jpg`,
    ]);
    const { db, updates } = fakeDb([
      { id: 1, user_id: UID, bucket: "avatars", object_path: `${UID}/`, is_prefix: true },
      {
        id: 2,
        user_id: UID,
        bucket: "master-verifications",
        object_path: `${UID}/p.jpg`,
        is_prefix: false,
      },
      { id: 3, user_id: UID, bucket: "avatars", object_path: `${OTHER}/`, is_prefix: true },
      {
        id: 4,
        user_id: UID,
        bucket: "master-verifications",
        object_path: `${OTHER}/passport.jpg`,
        is_prefix: false,
      },
    ]);
    const result = await processFileDeletionQueue(db, root, s3);
    expect(result).toEqual({ done: 2, failed: 2 });
    expect(existsSync(path.join(root, "avatars", UID))).toBe(false);
    expect(await readdir(path.join(root, "avatars", OTHER))).toEqual(["b.jpg"]);
    expect(s3.deleted.sort()).toEqual(
      [
        `avatars/${UID}/a.jpg`,
        `avatars/${UID}/b.jpg`,
        `avatars/${UID}/c.jpg`,
        `master-verifications/${UID}/p.jpg`,
      ].sort(),
    );
    expect(updates).toEqual([
      { id: 1, ok: true, error: undefined },
      { id: 2, ok: true, error: undefined },
      { id: 3, ok: false, error: "invalid queue item" },
      { id: 4, ok: false, error: "invalid queue item" },
    ]);
  });

  it("ошибка хранилища — задание остаётся с attempts и текстом ошибки", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "xtrud-cleanup-"));
    const s3: CleanupStorage = {
      async listKeys() {
        throw new Error("S3 LIST: HTTP 503");
      },
      async delete() {},
    };
    const { db, updates } = fakeDb([
      { id: 7, user_id: UID, bucket: "portfolio", object_path: `${UID}/`, is_prefix: true },
    ]);
    expect(await processFileDeletionQueue(db, root, s3)).toEqual({ done: 0, failed: 1 });
    expect(updates).toEqual([{ id: 7, ok: false, error: "S3 LIST: HTTP 503" }]);
  });

  it("последняя попытка — явная ошибка в лог, раньше — нет", async () => {
    const s3: CleanupStorage = {
      async listKeys() {
        throw new Error("S3 LIST: HTTP 503");
      },
      async delete() {},
    };
    const logged: unknown[] = [];
    const log = { error: (obj: object) => logged.push(obj) };
    const root = await mkdtemp(path.join(os.tmpdir(), "xtrud-cleanup-"));
    const { db } = fakeDb([
      {
        id: 8,
        user_id: UID,
        bucket: "avatars",
        object_path: `${UID}/`,
        is_prefix: true,
        attempts: 8,
      },
      {
        id: 9,
        user_id: UID,
        bucket: "avatars",
        object_path: `${UID}/`,
        is_prefix: true,
        attempts: 9,
      },
    ]);
    expect(await processFileDeletionQueue(db, root, s3, log)).toEqual({ done: 0, failed: 2 });
    expect(logged).toEqual([
      {
        fileCleanupExhausted: { id: 9, bucket: "avatars", error: "S3 LIST: HTTP 503" },
        attempts: 10,
      },
    ]);
  });

  it("до применения 0244 (нет таблицы) — тихо пропускает", async () => {
    const { db } = fakeDb([], { missing: true });
    expect(await processFileDeletionQueue(db, "/nonexistent", null)).toEqual({
      skipped: "queue_missing",
      done: 0,
      failed: 0,
    });
  });
});
