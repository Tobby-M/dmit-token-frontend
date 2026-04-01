import fs from "node:fs/promises";
import path from "node:path";
import type {
  AccessTier,
  BasicScanResult,
  PremiumCaptureStorageProvider,
  PremiumCaptureSummary,
  ScanRedemptionSummary,
  ScanSessionStatus,
  ScanSessionSummary
} from "@/lib/access/shared";

export interface PremiumCaptureRecord extends PremiumCaptureSummary {
  storagePath: string | null;
}

export interface ScanSessionRecord {
  id: string;
  tier: AccessTier;
  status: ScanSessionStatus;
  tokenPrefix: string | null;
  tokenRecordId: number | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  requiredFingerCount: number;
  fingerTargets: string[];
  completedFingers: string[];
  basicResults: BasicScanResult[];
  premiumCaptures: PremiumCaptureRecord[];
  redemption: ScanRedemptionSummary;
}

const STORAGE_DIR = path.join(process.cwd(), ".runtime");
const STORAGE_PATH = path.join(STORAGE_DIR, "scan-sessions.json");

async function ensureStore() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });

  try {
    await fs.access(STORAGE_PATH);
  } catch {
    await fs.writeFile(STORAGE_PATH, "[]", "utf8");
  }
}

async function readStore(): Promise<ScanSessionRecord[]> {
  await ensureStore();
  const raw = await fs.readFile(STORAGE_PATH, "utf8");

  try {
    const parsed = JSON.parse(raw) as ScanSessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeStore(records: ScanSessionRecord[]): Promise<void> {
  await ensureStore();
  await fs.writeFile(STORAGE_PATH, JSON.stringify(records, null, 2), "utf8");
}

function normalizeCaptureSummary(
  capture: PremiumCaptureRecord
): PremiumCaptureSummary {
  return {
    finger: capture.finger,
    processed: capture.processed,
    capturedAt: capture.capturedAt,
    fileName: capture.fileName,
    storageProvider: (capture.storageProvider ?? null) as PremiumCaptureStorageProvider | null,
    storageKey: capture.storageKey ?? null,
    storageUrl: capture.storageUrl ?? null
  };
}

function getNextFinger(record: ScanSessionRecord): string | null {
  if (record.status !== "active") {
    return null;
  }

  return record.fingerTargets[record.completedFingers.length] ?? null;
}

export function toScanSessionSummary(record: ScanSessionRecord): ScanSessionSummary {
  const completedCount = record.completedFingers.length;
  const readyForCompletion =
    record.status === "active" && completedCount >= record.requiredFingerCount;

  return {
    id: record.id,
    tier: record.tier,
    status: record.status,
    requiredFingerCount: record.requiredFingerCount,
    fingerTargets: [...record.fingerTargets],
    completedFingers: [...record.completedFingers],
    completedCount,
    nextFinger: getNextFinger(record),
    readyForCompletion,
    isComplete: record.status === "completed",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    basicResults: [...record.basicResults],
    premiumCaptures: record.premiumCaptures.map(normalizeCaptureSummary),
    redemption: {
      ...record.redemption
    }
  };
}

export async function createScanSessionRecord(
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
  const records = await readStore();
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

  records.push(record);
  await writeStore(records);
  return record;
}

export async function getScanSessionRecord(id: string): Promise<ScanSessionRecord | null> {
  const records = await readStore();
  return records.find((record) => record.id === id) ?? null;
}

export async function updateScanSessionRecord(
  id: string,
  updater: (record: ScanSessionRecord) => ScanSessionRecord
): Promise<ScanSessionRecord | null> {
  const records = await readStore();
  const index = records.findIndex((record) => record.id === id);

  if (index === -1) {
    return null;
  }

  const updated = updater(records[index]);
  updated.updatedAt = new Date().toISOString();
  records[index] = updated;
  await writeStore(records);
  return updated;
}

export async function abandonScanSessionRecord(id: string): Promise<ScanSessionRecord | null> {
  return updateScanSessionRecord(id, (record) => {
    if (record.status !== "active") {
      return record;
    }

    return {
      ...record,
      status: "abandoned"
    };
  });
}
