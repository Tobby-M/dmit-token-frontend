import { getServerEnv } from "@/lib/access/env";
import type { AccessTokenRecord } from "@/lib/access/tokens";

interface ReadTokensResponse {
  status: string;
  data?: AccessTokenRecord[];
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

  const matches = Array.isArray(response.data) ? response.data : [];
  return matches.find((record) => record.token_prefix === tokenPrefix) ?? null;
}
