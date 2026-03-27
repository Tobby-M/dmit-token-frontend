import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findTokenByPrefix } from "@/lib/access/nocodebackend";
import {
  createAccessSessionValue,
  ACCESS_SESSION_COOKIE,
  getAccessSessionCookieOptions
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

  if (!rawToken) {
    cookieStore.set(
      ACCESS_SESSION_COOKIE,
      createAccessSessionValue({
        tier: "free",
        tokenPrefix: null
      }),
      getAccessSessionCookieOptions(request)
    );

    return NextResponse.json({
      ok: true,
      session: {
        tier: "free",
        tokenPrefix: null
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

  cookieStore.set(
    ACCESS_SESSION_COOKIE,
    createAccessSessionValue({
      tier: record.tier,
      tokenPrefix: record.token_prefix
    }),
    getAccessSessionCookieOptions(request)
  );

  return NextResponse.json({
    ok: true,
    session: {
      tier: record.tier,
      tokenPrefix: record.token_prefix
    }
  });
}
