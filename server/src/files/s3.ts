// Хранилище объектов S3 (Beget). Подпись AWS SigV4 своя, без зависимостей:
// нужен ровно один алгоритм, а SDK притащил бы десятки пакетов в образ.
//
// Публичные ссылки остаются на нашем домене — в базе лежат полные URL, и
// смена хоста сломала бы уже опубликованные задания. S3 здесь только место,
// где лежат байты, а не адрес, который видит человек.
import { createHash, createHmac } from "node:crypto";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
}

const sha256hex = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const hmac = (key: string | Buffer, data: string) =>
  createHmac("sha256", key).update(data).digest();

/** Каждый сегмент пути кодируется отдельно: «/» между сегментами остаётся. */
function encodeKey(key: string): string {
  return key
    .split("/")
    .map((s) =>
      encodeURIComponent(s).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

export class S3Storage {
  constructor(private readonly cfg: S3Config) {}

  private sign(
    method: string,
    key: string,
    payload: Buffer,
    extraHeaders: Record<string, string> = {},
  ): { url: string; headers: Record<string, string> } {
    const host = new URL(this.cfg.endpoint).host;
    const canonicalUri = `/${this.cfg.bucket}/${encodeKey(key)}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const payloadHash = sha256hex(payload);

    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...extraHeaders,
    };
    const names = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const canonicalHeaders = names
      .map((n) => `${n}:${String(headers[n] ?? extraHeaders[n]).trim()}\n`)
      .join("");
    const signedHeaders = names.join(";");

    const canonicalRequest = [
      method,
      canonicalUri,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.cfg.secretKey}`, date), this.cfg.region), "s3"),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");

    return {
      url: `${this.cfg.endpoint}${canonicalUri}`,
      headers: {
        ...headers,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  /**
   * Кладёт объект. `publicRead` включается для бакетов, которые раздаёт
   * nginx напрямую; паспорта кладутся без него и остаются закрытыми.
   */
  async put(key: string, body: Buffer, contentType: string, publicRead: boolean): Promise<void> {
    const extra: Record<string, string> = { "content-type": contentType };
    if (publicRead) extra["x-amz-acl"] = "public-read";
    const { url, headers } = this.sign("PUT", key, body, extra);
    const res = await fetch(url, {
      method: "PUT",
      headers,
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`S3 PUT ${key}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }

  /** Читает объект. null — если его нет. */
  async get(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    const { url, headers } = this.sign("GET", key, Buffer.alloc(0));
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`S3 GET ${key}: HTTP ${res.status}`);
    }
    return {
      body: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "application/octet-stream",
    };
  }

  /** Удаляет объект. Отсутствующий объект ошибкой не считается. */
  async delete(key: string): Promise<void> {
    const { url, headers } = this.sign("DELETE", key, Buffer.alloc(0));
    const res = await fetch(url, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`S3 DELETE ${key}: HTTP ${res.status}`);
    }
  }

  /**
   * Сколько объектов лежит под префиксом, но не больше `limit`. Заменяет
   * подсчёт файлов в папке на диске — защита от заваливания хранилища.
   */
  async countPrefix(prefix: string, limit: number): Promise<number> {
    const query = `list-type=2&max-keys=${limit}&prefix=${encodeURIComponent(prefix)}`;
    const host = new URL(this.cfg.endpoint).host;
    const canonicalUri = `/${this.cfg.bucket}`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const payloadHash = sha256hex("");
    // Параметры в канонической строке идут в алфавитном порядке ключа.
    const canonicalQuery = query
      .split("&")
      .map((p) => p.split("="))
      .sort((a, b) => ((a[0] ?? "") < (b[0] ?? "") ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    const canonicalHeaders =
      `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");
    const scope = `${date}/${this.cfg.region}/s3/aws4_request`;
    const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonicalRequest)].join("\n");
    const signingKey = hmac(
      hmac(hmac(hmac(`AWS4${this.cfg.secretKey}`, date), this.cfg.region), "s3"),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey).update(toSign).digest("hex");
    const res = await fetch(`${this.cfg.endpoint}${canonicalUri}?${canonicalQuery}`, {
      headers: {
        host,
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: `AWS4-HMAC-SHA256 Credential=${this.cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`S3 LIST ${prefix}: HTTP ${res.status}`);
    const xml = await res.text();
    return Number(/<KeyCount>(\d+)<\/KeyCount>/.exec(xml)?.[1] ?? "0");
  }

  /** Есть ли объект. Нужен, чтобы не считать файлы в папке заново. */
  async head(key: string): Promise<boolean> {
    const { url, headers } = this.sign("HEAD", key, Buffer.alloc(0));
    const res = await fetch(url, { method: "HEAD", headers, signal: AbortSignal.timeout(15_000) });
    return res.ok;
  }
}
