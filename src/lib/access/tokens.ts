import { createHash } from "node:crypto";
import type { TokenStatus, TokenTier } from "@/lib/access/shared";

export interface AccessTokenParts {
  raw: string;
  tier: TokenTier;
  tokenPrefix: string;
  tokenSecret: string;
}

export interface AccessTokenRecord {
  id: number;
  token_prefix: string;
  token_secret: string;
  tier: TokenTier;
  status: TokenStatus;
  remaining_uses: number;
  expires_at: string;
  notes: string;
}

export function parseAccessToken(value: string): AccessTokenParts | null {
  const normalized = value.trim().toUpperCase();
  const [scheme, prefixBody, tokenSecret, ...rest] = normalized.split("-");

  if (rest.length > 0 || !scheme || !prefixBody || !tokenSecret) {
    return null;
  }

  if (!["BSC", "PRM"].includes(scheme)) {
    return null;
  }

  if (!/^[A-Z0-9]+$/.test(prefixBody) || !/^[A-Z0-9]+$/.test(tokenSecret)) {
    return null;
  }

  return {
    raw: normalized,
    tier: scheme === "BSC" ? "basic" : "premium",
    tokenPrefix: `${scheme}-${prefixBody}`,
    tokenSecret
  };
}

export function hashTokenSecret(tokenSecret: string): string {
  return createHash("sha256").update(tokenSecret).digest("hex");
}

export function isExpired(expiresAt: string): boolean {
  const trimmed = expiresAt.trim();
  if (!trimmed) {
    return false;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return timestamp <= Date.now();
}

export function getTokenValidationError(record: AccessTokenRecord): string | null {
  if (record.status !== "active") {
    return "Token is no longer active.";
  }

  if (record.remaining_uses <= 0) {
    return "Token has no remaining uses.";
  }

  if (isExpired(record.expires_at)) {
    return "Token has expired.";
  }

  return null;
}
