import { getServerEnv } from "@/lib/access/env";
import {
  abandonRemoteScanSessionRecord,
  createRemoteScanSessionRecord,
  getRemoteScanSessionRecord,
  toScanSessionSummary as toRemoteScanSessionSummary,
  updateRemoteScanSessionRecord
} from "@/lib/access/scan-session-store-nocodebackend";
import {
  abandonScanSessionRecord as abandonLocalScanSessionRecord,
  createScanSessionRecord as createLocalScanSessionRecord,
  getScanSessionRecord as getLocalScanSessionRecord,
  toScanSessionSummary as toLocalScanSessionSummary,
  updateScanSessionRecord as updateLocalScanSessionRecord,
  type PremiumCaptureRecord,
  type ScanSessionRecord
} from "@/lib/access/scan-session-store-local";

function useRemoteScanSessionStore(): boolean {
  const { scanSessionStoreMode } = getServerEnv();
  return scanSessionStoreMode === "nocodebackend";
}

export type { PremiumCaptureRecord, ScanSessionRecord };

export function toScanSessionSummary(record: ScanSessionRecord) {
  return useRemoteScanSessionStore()
    ? toRemoteScanSessionSummary(record)
    : toLocalScanSessionSummary(record);
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
  return useRemoteScanSessionStore()
    ? createRemoteScanSessionRecord(input)
    : createLocalScanSessionRecord(input);
}

export async function getScanSessionRecord(id: string): Promise<ScanSessionRecord | null> {
  return useRemoteScanSessionStore()
    ? getRemoteScanSessionRecord(id)
    : getLocalScanSessionRecord(id);
}

export async function updateScanSessionRecord(
  id: string,
  updater: (record: ScanSessionRecord) => ScanSessionRecord
): Promise<ScanSessionRecord | null> {
  return useRemoteScanSessionStore()
    ? updateRemoteScanSessionRecord(id, updater)
    : updateLocalScanSessionRecord(id, updater);
}

export async function abandonScanSessionRecord(id: string): Promise<ScanSessionRecord | null> {
  return useRemoteScanSessionStore()
    ? abandonRemoteScanSessionRecord(id)
    : abandonLocalScanSessionRecord(id);
}
