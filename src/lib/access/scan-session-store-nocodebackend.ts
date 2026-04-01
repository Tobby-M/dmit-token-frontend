import { getServerEnv } from "@/lib/access/env";
import {
  type ScanSessionRecord,
  type PremiumCaptureRecord,
  toScanSessionSummary
} from "@/lib/access/scan-session-store-local";

interface RawScanSessionRow {
  id: number | string;
  session_id: string;
  tier: string;
  status: string;
  token_prefix: string | null;
  token_record_id: number | string | null;
  record_json: string;
}

interface ReadRowsResponse {
  status: string;
  data?: RawScanSessionRow[];
}

interface ReadRowResponse {
  status: string;
  data?: RawScanSessionRow;
}

interface ScanSessionRow {
  rowId: number;
  record: ScanSessionRecord;
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
    throw new Error(`Scan session store request failed (${response.status}): ${body}`);
  }

  return response.json() as Promise<T>;
}

function normalizePremiumCaptureRecord(value: unknown): PremiumCaptureRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((capture) => {
    if (!capture || typeof capture !== "object") {
      return {
        finger: "Unknown",
        processed: true,
        capturedAt: new Date(0).toISOString(),
        fileName: null,
        storageProvider: null,
        storageKey: null,
        storageUrl: null,
        storagePath: null
      };
    }

    const candidate = capture as Record<string, unknown>;
    return {
      finger: typeof candidate.finger === "string" ? candidate.finger : "Unknown",
      processed: candidate.processed !== false,
      capturedAt:
        typeof candidate.capturedAt === "string" ? candidate.capturedAt : new Date(0).toISOString(),
      fileName: typeof candidate.fileName === "string" ? candidate.fileName : null,
      storageProvider:
        candidate.storageProvider === "filesystem" || candidate.storageProvider === "cloudinary"
          ? candidate.storageProvider
          : null,
      storageKey: typeof candidate.storageKey === "string" ? candidate.storageKey : null,
      storageUrl: typeof candidate.storageUrl === "string" ? candidate.storageUrl : null,
      storagePath: typeof candidate.storagePath === "string" ? candidate.storagePath : null
    };
  });
}

function normalizeRecord(candidate: unknown, fallbackSessionId: string): ScanSessionRecord {
  const value = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};

  return {
    id: typeof value.id === "string" ? value.id : fallbackSessionId,
    tier:
      value.tier === "free" || value.tier === "basic" || value.tier === "premium"
        ? value.tier
        : "free",
    status:
      value.status === "active" || value.status === "completed" || value.status === "abandoned"
        ? value.status
        : "active",
    tokenPrefix: typeof value.tokenPrefix === "string" ? value.tokenPrefix : null,
    tokenRecordId: typeof value.tokenRecordId === "number" ? value.tokenRecordId : null,
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt:
      typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    requiredFingerCount:
      typeof value.requiredFingerCount === "number" ? value.requiredFingerCount : 0,
    fingerTargets: Array.isArray(value.fingerTargets)
      ? value.fingerTargets.filter((item): item is string => typeof item === "string")
      : [],
    completedFingers: Array.isArray(value.completedFingers)
      ? value.completedFingers.filter((item): item is string => typeof item === "string")
      : [],
    basicResults: Array.isArray(value.basicResults)
      ? (value.basicResults as ScanSessionRecord["basicResults"])
      : [],
    premiumCaptures: normalizePremiumCaptureRecord(value.premiumCaptures),
    redemption:
      value.redemption && typeof value.redemption === "object"
        ? {
            consumed: (value.redemption as Record<string, unknown>).consumed === true,
            consumedAt:
              typeof (value.redemption as Record<string, unknown>).consumedAt === "string"
                ? ((value.redemption as Record<string, unknown>).consumedAt as string)
                : null,
            beforeRemainingUses:
              typeof (value.redemption as Record<string, unknown>).beforeRemainingUses === "number"
                ? ((value.redemption as Record<string, unknown>).beforeRemainingUses as number)
                : null,
            afterRemainingUses:
              typeof (value.redemption as Record<string, unknown>).afterRemainingUses === "number"
                ? ((value.redemption as Record<string, unknown>).afterRemainingUses as number)
                : null,
            resultingStatus:
              (value.redemption as Record<string, unknown>).resultingStatus === "active" ||
              (value.redemption as Record<string, unknown>).resultingStatus === "used" ||
              (value.redemption as Record<string, unknown>).resultingStatus === "revoked"
                ? ((value.redemption as Record<string, unknown>).resultingStatus as
                    | "active"
                    | "used"
                    | "revoked")
                : null
          }
        : {
            consumed: false,
            consumedAt: null,
            beforeRemainingUses: null,
            afterRemainingUses: null,
            resultingStatus: null
          }
  };
}

function normalizeRow(row: RawScanSessionRow): ScanSessionRow {
  const parsedJson = (() => {
    try {
      return JSON.parse(row.record_json);
    } catch {
      return null;
    }
  })();

  return {
    rowId: typeof row.id === "number" ? row.id : Number.parseInt(String(row.id), 10),
    record: normalizeRecord(parsedJson, row.session_id)
  };
}

async function getRowBySessionId(sessionId: string): Promise<ScanSessionRow | null> {
  const url = buildUrl("/read/scan_sessions", {
    session_id: sessionId,
    limit: "10",
    sort: "id",
    order: "desc"
  });

  const response = await requestJson<ReadRowsResponse>(url, {
    method: "GET"
  });

  const rows = Array.isArray(response.data) ? response.data : [];
  const match = rows.find((row) => row.session_id === sessionId);
  return match ? normalizeRow(match) : null;
}

async function updateRemoteRow(
  rowId: number,
  record: ScanSessionRecord
): Promise<void> {
  const url = buildUrl(`/update/scan_sessions/${rowId}`, {});

  await requestJson(url, {
    method: "PUT",
    body: JSON.stringify({
      session_id: record.id,
      tier: record.tier,
      status: record.status,
      token_prefix: record.tokenPrefix ?? "",
      token_record_id: record.tokenRecordId ?? "",
      record_json: JSON.stringify(record)
    })
  });
}

export async function createRemoteScanSessionRecord(
  input: Omit<
    ScanSessionRecord,
    | "createdAt"
    | "updatedAt"
    | "completedAt"
    | "completedFingers"
    | "basicResults"
    | "premiumCaptures"
    | "redemption"
    | "status"
  >
): Promise<ScanSessionRecord> {
  const now = new Date().toISOString();
  const record: ScanSessionRecord = {
    ...input,
    status: "active",
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completedFingers: [],
    basicResults: [],
    premiumCaptures: [],
    redemption: {
      consumed: false,
      consumedAt: null,
      beforeRemainingUses: null,
      afterRemainingUses: null,
      resultingStatus: null
    }
  };

  const url = buildUrl("/create/scan_sessions", {});
  await requestJson(url, {
    method: "POST",
    body: JSON.stringify({
      session_id: record.id,
      tier: record.tier,
      status: record.status,
      token_prefix: record.tokenPrefix ?? "",
      token_record_id: record.tokenRecordId ?? "",
      record_json: JSON.stringify(record)
    })
  });

  return record;
}

export async function getRemoteScanSessionRecord(
  id: string
): Promise<ScanSessionRecord | null> {
  const row = await getRowBySessionId(id);
  return row?.record ?? null;
}

export async function updateRemoteScanSessionRecord(
  id: string,
  updater: (record: ScanSessionRecord) => ScanSessionRecord
): Promise<ScanSessionRecord | null> {
  const row = await getRowBySessionId(id);
  if (!row) {
    return null;
  }

  const updated = updater(row.record);
  updated.updatedAt = new Date().toISOString();
  await updateRemoteRow(row.rowId, updated);
  return updated;
}

export async function abandonRemoteScanSessionRecord(
  id: string
): Promise<ScanSessionRecord | null> {
  return updateRemoteScanSessionRecord(id, (record) => {
    if (record.status !== "active") {
      return record;
    }

    return {
      ...record,
      status: "abandoned"
    };
  });
}

export { toScanSessionSummary };
