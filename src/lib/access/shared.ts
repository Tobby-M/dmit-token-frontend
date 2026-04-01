export type AccessTier = "free" | "basic" | "premium";
export type TokenTier = Exclude<AccessTier, "free">;
export type TokenStatus = "active" | "used" | "revoked";
export type ScanSessionStatus = "active" | "completed" | "abandoned";
export type PremiumCaptureStorageProvider = "filesystem" | "cloudinary";

export interface BasicScanResult {
  finger: string;
  type: string;
  confidence: number;
  notes: string;
  abilityTitle: string;
}

export interface PremiumCaptureSummary {
  finger: string;
  processed: boolean;
  capturedAt: string;
  fileName: string | null;
  storageProvider: PremiumCaptureStorageProvider | null;
  storageKey: string | null;
  storageUrl: string | null;
}

export interface ScanRedemptionSummary {
  consumed: boolean;
  consumedAt: string | null;
  beforeRemainingUses: number | null;
  afterRemainingUses: number | null;
  resultingStatus: TokenStatus | null;
}

export interface ScanSessionSummary {
  id: string;
  tier: AccessTier;
  status: ScanSessionStatus;
  requiredFingerCount: number;
  fingerTargets: string[];
  completedFingers: string[];
  completedCount: number;
  nextFinger: string | null;
  readyForCompletion: boolean;
  isComplete: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  basicResults: BasicScanResult[];
  premiumCaptures: PremiumCaptureSummary[];
  redemption: ScanRedemptionSummary;
}

export interface PublicAccessSession {
  tier: AccessTier;
  tokenPrefix: string | null;
  scanSessionId: string;
  scanSession: ScanSessionSummary;
}

export function getTierLabel(tier: AccessTier): string {
  switch (tier) {
    case "basic":
      return "Basic Plan";
    case "premium":
      return "Premium Plan";
    case "free":
    default:
      return "Free Trial";
  }
}
