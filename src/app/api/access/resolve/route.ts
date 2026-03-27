import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findTokenByPrefix } from "@/lib/access/nocodebackend";
import {
  abandonScanSessionRecord,
  createScanSessionRecord,
  toScanSessionSummary
} from "@/lib/access/scan-session-store";
import { getFingerTargetsForTier, getRequiredFingerCount } from "@/lib/access/scan-flow";
import {
  createAccessSessionValue,
  ACCESS_SESSION_COOKIE,
  getAccessSessionCookieOptions,
  readAccessSession
} from "@/lib/access/session";
import {
  getTokenValidationError,
  hashTokenSecret,
  parseAccessToken
} from "@/lib/access/tokens";

const resolveRequestSchema = z.object({
  token: z.string().optional().default("")
});

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json().catch(() => ({}));
  const parsedBody = resolveRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid access request." }, { status: 400 });
  }

  const rawToken = parsedBody.data.token.trim();
  const cookieStore = await cookies();
  const previousSession = readAccessSession(cookieStore);

  if (previousSession?.scanSessionId) {
    await abandonScanSessionRecord(previousSession.scanSessionId);
  }

  if (!rawToken) {
    const scanSession = await createScanSessionRecord({
      id: randomUUID(),
      tier: "free",
      tokenPrefix: null,
      tokenRecordId: null,
      requiredFingerCount: getRequiredFingerCount("free"),
      fingerTargets: getFingerTargetsForTier("free")
    });

    cookieStore.set(
      ACCESS_SESSION_COOKIE,
      createAccessSessionValue({
        tier: "free",
        tokenPrefix: null,
        tokenRecordId: null,
        scanSessionId: scanSession.id
      }),
      getAccessSessionCookieOptions(request)
    );

    return NextResponse.json({
      ok: true,
      session: {
        tier: "free",
        tokenPrefix: null,
        scanSessionId: scanSession.id,
        scanSession: toScanSessionSummary(scanSession)
      }
    });
  }

  const tokenParts = parseAccessToken(rawToken);
  if (!tokenParts) {
    return NextResponse.json(
      { error: "Token format is invalid." },
      { status: 400 }
    );
  }

  const record = await findTokenByPrefix(tokenParts.tokenPrefix);
  if (!record) {
    return NextResponse.json(
      { error: "Token could not be found." },
      { status: 404 }
    );
  }

  if (record.tier !== tokenParts.tier) {
    return NextResponse.json(
      { error: "Token tier does not match." },
      { status: 403 }
    );
  }

  if (record.token_secret !== hashTokenSecret(tokenParts.tokenSecret)) {
    return NextResponse.json(
      { error: "Token is invalid." },
      { status: 403 }
    );
  }

  const validationError = getTokenValidationError(record);
  if (validationError) {
    return NextResponse.json(
      { error: validationError },
      { status: 403 }
    );
  }

  const scanSession = await createScanSessionRecord({
    id: randomUUID(),
    tier: record.tier,
    tokenPrefix: record.token_prefix,
    tokenRecordId: record.id,
    requiredFingerCount: getRequiredFingerCount(record.tier),
    fingerTargets: getFingerTargetsForTier(record.tier)
  });

  cookieStore.set(
    ACCESS_SESSION_COOKIE,
    createAccessSessionValue({
      tier: record.tier,
      tokenPrefix: record.token_prefix,
      tokenRecordId: record.id,
      scanSessionId: scanSession.id
    }),
    getAccessSessionCookieOptions(request)
  );

  return NextResponse.json({
    ok: true,
    session: {
      tier: record.tier,
      tokenPrefix: record.token_prefix,
      scanSessionId: scanSession.id,
      scanSession: toScanSessionSummary(scanSession)
    }
  });
}
