import { getServerEnv } from "@/lib/access/env";
import { getTokenValidationError } from "@/lib/access/tokens";
import type { AccessTokenRecord } from "@/lib/access/tokens";
import type { TokenStatus } from "@/lib/access/shared";

interface ReadTokensResponse {
  status: string;
  data?: AccessTokenRecord[];
}

interface RawAccessTokenRecord {
  id: number | string;
  token_prefix: string;
  token_secret: string;
  tier: AccessTokenRecord["tier"];
  status: AccessTokenRecord["status"];
  remaining_uses: number | string;
  expires_at: string;
  notes: string;
}

interface ReadTokenResponse {
  status: string;
  data?: RawAccessTokenRecord;
}

function normalizeTokenRecord(record: RawAccessTokenRecord): AccessTokenRecord {
  return {
    id: typeof record.id === "number" ? record.id : Number.parseInt(record.id, 10),
    token_prefix: record.token_prefix,
    token_secret: record.token_secret,
    tier: record.tier,
    status: record.status,
    remaining_uses:
      typeof record.remaining_uses === "number"
        ? record.remaining_uses
        : Number.parseInt(record.remaining_uses, 10) || 0,
    expires_at: record.expires_at ?? "",
    notes: record.notes ?? ""
  };
}

function getBaseHeaders() {
  const { nocodebackendSecretKey } = getServerEnv();

  return {
    Authorization: `Bearer ${nocodebackendSecretKey}`,
    "Content-Type": "application/json"
  };
}

function buildUrl(pathname: string, params: Record<string, string>) {
  const { nocodebackendBaseUrl, nocodebackendInstance } = getServerEnv();
  const url = new URL(`${nocodebackendBaseUrl}${pathname}`);
  url.searchParams.set("Instance", nocodebackendInstance);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getBaseHeaders(),
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`NoCodeBackend request failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

export async function findTokenByPrefix(tokenPrefix: string): Promise<AccessTokenRecord | null> {
  const url = buildUrl("/read/access_tokens", {
    token_prefix: tokenPrefix,
    limit: "10",
    sort: "id",
    order: "desc"
  });

  const response = await requestJson<ReadTokensResponse>(url, {
    method: "GET"
  });

  const matches = Array.isArray(response.data)
    ? response.data.map((record) => normalizeTokenRecord(record as RawAccessTokenRecord))
    : [];
  return matches.find((record) => record.token_prefix === tokenPrefix) ?? null;
}

export async function getTokenById(id: number): Promise<AccessTokenRecord | null> {
  const url = buildUrl(`/read/access_tokens/${id}`, {});
  const response = await requestJson<ReadTokenResponse>(url, {
    method: "GET"
  });

  return response.data ? normalizeTokenRecord(response.data) : null;
}

export async function updateTokenRecord(
  record: AccessTokenRecord,
  input: {
    status: TokenStatus;
    remainingUses: number;
  }
): Promise<AccessTokenRecord> {
  const url = buildUrl(`/update/access_tokens/${record.id}`, {});

  await requestJson(url, {
    method: "PUT",
    body: JSON.stringify({
      token_prefix: record.token_prefix,
      token_secret: record.token_secret,
      tier: record.tier,
      status: input.status,
      remaining_uses: input.remainingUses,
      expires_at: record.expires_at,
      notes: record.notes
    })
  });

  return {
    ...record,
    status: input.status,
    remaining_uses: input.remainingUses
  };
}

export async function consumeTokenRecord(id: number): Promise<{
  record: AccessTokenRecord;
  beforeRemainingUses: number;
  afterRemainingUses: number;
  resultingStatus: TokenStatus;
}> {
  const record = await getTokenById(id);
  if (!record) {
    throw Object.assign(new Error("Token could not be found."), { status: 404 });
  }

  const validationError = getTokenValidationError(record);
  if (validationError) {
    throw Object.assign(new Error(validationError), { status: 403 });
  }

  const beforeRemainingUses = record.remaining_uses;
  const afterRemainingUses = Math.max(0, beforeRemainingUses - 1);
  const resultingStatus: TokenStatus = afterRemainingUses > 0 ? "active" : "used";
  const updated = await updateTokenRecord(record, {
    status: resultingStatus,
    remainingUses: afterRemainingUses
  });

  return {
    record: updated,
    beforeRemainingUses,
    afterRemainingUses,
    resultingStatus
  };
}
