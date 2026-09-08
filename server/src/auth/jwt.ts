// Токены доступа — HS256 с тем же секретом и claims, что у GoTrue, поэтому
// auth.uid() в базе и старые сборки приложения понимают их одинаково.
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Claims } from "../db.js";

export interface TokenUser {
  id: string;
  email: string | null;
  phone: string | null;
}

export class Tokens {
  private readonly key: Uint8Array;
  constructor(
    secret: string,
    private readonly issuer: string,
    private readonly accessTtl: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async signAccess(user: TokenUser, sessionId: string): Promise<{ token: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.accessTtl;
    const token = await new SignJWT({
      role: "authenticated",
      aud: "authenticated",
      email: user.email ?? undefined,
      phone: user.phone ?? undefined,
      session_id: sessionId,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      is_anonymous: false,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(user.id)
      .setIssuer(this.issuer)
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .sign(this.key);
    return { token, expiresAt };
  }

  /** null — токена нет или он не наш/просрочен. Issuer не проверяем: старые
   *  токены GoTrue (iss = URL Supabase) должны приниматься при откате. */
  async verify(token: string | undefined): Promise<Claims> {
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      if (typeof payload.sub !== "string" || payload.role !== "authenticated") return null;
      return {
        sub: payload.sub,
        role: "authenticated",
        email: typeof payload.email === "string" ? payload.email : undefined,
        phone: typeof payload.phone === "string" ? payload.phone : undefined,
      };
    } catch {
      return null;
    }
  }
}

export function newRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashRefresh(raw) };
}

export function hashRefresh(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
