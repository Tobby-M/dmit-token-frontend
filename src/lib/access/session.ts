import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { getServerEnv } from "@/lib/access/env";
import type { AccessTier } from "@/lib/access/shared";

export const ACCESS_SESSION_COOKIE = "dmit_access_session";
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

export interface AccessSessionPayload {
  tier: AccessTier;
  tokenPrefix: string | null;
  expiresAt: number;
}

function sign(encodedPayload: string): string {
  const { accessSessionSecret } = getServerEnv();
  return createHmac("sha256", accessSessionSecret).update(encodedPayload).digest("hex");
}

export function createAccessSessionValue(payload: Omit<AccessSessionPayload, "expiresAt">): string {
  const completePayload: AccessSessionPayload = {
    ...payload,
    expiresAt: Date.now() + SESSION_DURATION_MS
  };

  const encodedPayload = Buffer.from(JSON.stringify(completePayload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyAccessSessionValue(value: string | undefined): AccessSessionPayload | null {
  if (!value) {
    return null;
  }

  const [encodedPayload, providedSignature] = value.split(".");
  if (!encodedPayload || !providedSignature) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as AccessSessionPayload;

    if (!["free", "basic", "premium"].includes(parsed.tier)) {
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function readAccessSession(
  cookieStore: Pick<ReadonlyRequestCookies, "get">
): AccessSessionPayload | null {
  return verifyAccessSessionValue(cookieStore.get(ACCESS_SESSION_COOKIE)?.value);
}

function shouldUseSecureCookie(request?: Request): boolean {
  if (!request) {
    return process.env.NODE_ENV === "production";
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim() === "https";
  }

  const url = new URL(request.url);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return false;
  }

  return url.protocol === "https:";
}

export function getAccessSessionCookieOptions(request?: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookie(request),
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000
  };
}
