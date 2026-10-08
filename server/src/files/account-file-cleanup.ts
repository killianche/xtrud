// Удаление файлов удалённых аккаунтов (№304, миграция 0244).
//
// delete_my_account() в базе не может стереть файлы, поэтому ставит задания в
// xtrud_private.file_deletion_queue: префикс папки пользователя
// `<uuid>/` в каждом бакете (загрузка в routes.ts требует parts[0] = sub,
// значит все файлы человека лежат там) и точные пути паспорта вне папки.
// Здесь задания выполняются: удаляется копия на диске и в объектном
// хранилище, затем задание отмечается done_at. Ошибка — attempts + 1 и
// last_error; после MAX_ATTEMPTS задание больше не берётся (видно в базе).
//
// Работает от роли xtrud_api (Db.asService): ей выданы SELECT и
// UPDATE (done_at, attempts, last_error) — больше ничего.
import { rm } from "node:fs/promises";
import path from "node:path";
import type pg from "pg";

export const CLEANUP_BUCKETS = new Set([
  "avatars",
  "portfolio",
  "order-photos",
  "master-verifications",
]);
export const MAX_ATTEMPTS = 10;
const BATCH = 50;
const SEGMENT_RE = /^[A-Za-z0-9._-]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** То, что нужно от объектного хранилища. */
export interface CleanupStorage {
  /** Ключи под префиксом (не больше одной страницы). */
  listKeys(prefix: string): Promise<string[]>;
  delete(key: string): Promise<void>;
}

export interface CleanupDb {
  asService<T>(fn: (client: Pick<pg.PoolClient, "query">) => Promise<T>): Promise<T>;
}

export interface QueueItem {
  id: number | string;
  attempts?: number;
  user_id: string;
  bucket: string;
  object_path: string;
  is_prefix: boolean;
}

/**
 * Проверка задания до любого удаления: бакет из списка, безопасные сегменты,
 * префикс — ровно папка пользователя этого задания `<user_id>/`.
 */
export function validateItem(item: QueueItem): string[] | null {
  if (!CLEANUP_BUCKETS.has(item.bucket)) return null;
  const raw = item.object_path;
  if (item.is_prefix) {
    if (!UUID_RE.test(item.user_id) || raw !== `${item.user_id}/`) return null;
    return [item.user_id];
  }
  // Точный путь — тоже только в папке пользователя этого задания: путь в
  // базе мог задать клиент, чужой файл удалять нельзя (ревью 0244, B1).
  const parts = raw.split("/");
  if (!UUID_RE.test(item.user_id) || parts[0] !== item.user_id) return null;
  if (parts.length < 2 || parts.length > 6) return null;
  for (const p of parts) if (!SEGMENT_RE.test(p) || p === "." || p === "..") return null;
  return parts;
}

async function deleteItem(
  item: QueueItem,
  parts: string[],
  root: string,
  s3: CleanupStorage | null,
): Promise<void> {
  const bucketDir = path.resolve(root, item.bucket);
  const target = path.resolve(bucketDir, ...parts);
  if (!target.startsWith(bucketDir + path.sep)) throw new Error("path escapes bucket");
  await rm(target, { recursive: item.is_prefix, force: true });
  if (!s3) return;
  if (!item.is_prefix) {
    await s3.delete(`${item.bucket}/${parts.join("/")}`);
    return;
  }
  const prefix = `${item.bucket}/${parts[0]}/`;
  // Листаем, пока под префиксом что-то есть; предел — от бесконечного цикла.
  for (let page = 0; page < 100; page++) {
    const keys = await s3.listKeys(prefix);
    if (keys.length === 0) return;
    for (const key of keys) {
      if (!key.startsWith(prefix)) throw new Error("listed key outside prefix");
      await s3.delete(key);
    }
  }
  throw new Error("too many objects under prefix");
}

export interface CleanupResult {
  skipped?: "queue_missing";
  done: number;
  failed: number;
}

/** Куда сообщить о задании, исчерпавшем попытки (pino-совместимо). */
export interface CleanupLogger {
  error(obj: object, msg: string): void;
}

/** Один проход по очереди. Безопасно вызывать по таймеру. */
export async function processFileDeletionQueue(
  db: CleanupDb,
  root: string,
  s3: CleanupStorage | null,
  log?: CleanupLogger,
): Promise<CleanupResult> {
  let items: QueueItem[];
  try {
    items = await db.asService(async (c) => {
      const r = await c.query<QueueItem>(
        `SELECT id, user_id, bucket, object_path, is_prefix, attempts
           FROM xtrud_private.file_deletion_queue
          WHERE done_at IS NULL AND attempts < $1
          ORDER BY enqueued_at, id
          LIMIT $2`,
        [MAX_ATTEMPTS, BATCH],
      );
      return r.rows;
    });
  } catch (e) {
    // До применения 0244 таблицы нет — это не ошибка сервера.
    if ((e as { code?: string }).code === "42P01")
      return { skipped: "queue_missing", done: 0, failed: 0 };
    throw e;
  }

  let done = 0;
  let failed = 0;
  for (const item of items) {
    const parts = validateItem(item);
    let error: string | null = parts ? null : "invalid queue item";
    if (parts) {
      try {
        await deleteItem(item, parts, root, s3);
      } catch (e) {
        error = (e as Error).message || "delete failed";
      }
    }
    await db.asService((c) =>
      error === null
        ? c.query(
            `UPDATE xtrud_private.file_deletion_queue
                SET done_at = now(), attempts = attempts + 1, last_error = NULL
              WHERE id = $1`,
            [item.id],
          )
        : c.query(
            `UPDATE xtrud_private.file_deletion_queue
                SET attempts = attempts + 1, last_error = left($2, 500)
              WHERE id = $1`,
            [item.id, error],
          ),
    );
    if (error === null) done++;
    else {
      failed++;
      // Последняя попытка: дальше задание не берётся — нужен человек.
      if ((item.attempts ?? 0) + 1 >= MAX_ATTEMPTS) {
        log?.error(
          {
            fileCleanupExhausted: { id: item.id, bucket: item.bucket, error },
            attempts: MAX_ATTEMPTS,
          },
          "account file cleanup gave up: max attempts reached",
        );
      }
    }
  }
  return { done, failed };
}
