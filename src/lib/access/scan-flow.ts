import type { DemoFinger } from "@/lib/dmit/constants";
import type { AccessTier } from "@/lib/access/shared";

export type FreeFingerChoice = "thumb" | "index";
export type PremiumFinger =
  | "Left Thumb"
  | "Left Index"
  | "Left Middle"
  | "Left Ring"
  | "Left Little"
  | "Right Thumb"
  | "Right Index"
  | "Right Middle"
  | "Right Ring"
  | "Right Little";
export type ScanFinger = DemoFinger | PremiumFinger;

export const FREE_ALLOWED_DEMO_FINGERS: DemoFinger[] = ["Left Thumb", "Left Index"];

export const BASIC_SCAN_SEQUENCE: DemoFinger[] = [
  "Left Thumb",
  "Right Thumb",
  "Left Index",
  "Right Index"
];

export const PREMIUM_SCAN_SEQUENCE: PremiumFinger[] = [
  "Left Thumb",
  "Left Index",
  "Left Middle",
  "Left Ring",
  "Left Little",
  "Right Thumb",
  "Right Index",
  "Right Middle",
  "Right Ring",
  "Right Little"
];

export const FREE_FINGER_OPTIONS: Array<{
  value: FreeFingerChoice;
  label: string;
  description: string;
  mappedFinger: DemoFinger;
}> = [
  {
    value: "thumb",
    label: "Thumb",
    description: "Uses the thumb path in the current demo flow.",
    mappedFinger: "Left Thumb"
  },
  {
    value: "index",
    label: "Index Finger",
    description: "Uses the index path in the current demo flow.",
    mappedFinger: "Left Index"
  }
];

export function getRequiredFingerCount(tier: AccessTier): number {
  switch (tier) {
    case "basic":
      return BASIC_SCAN_SEQUENCE.length;
    case "premium":
      return PREMIUM_SCAN_SEQUENCE.length;
    case "free":
    default:
      return 1;
  }
}

export function getFreeFingerFromChoice(choice: FreeFingerChoice): DemoFinger {
  return FREE_FINGER_OPTIONS.find((option) => option.value === choice)?.mappedFinger ?? "Left Thumb";
}

export function getFingerTargetsForTier(tier: AccessTier): ScanFinger[] {
  switch (tier) {
    case "basic":
      return [...BASIC_SCAN_SEQUENCE];
    case "premium":
      return [...PREMIUM_SCAN_SEQUENCE];
    case "free":
    default:
      return [];
  }
}

export function isPremiumFinger(value: string): value is PremiumFinger {
  return PREMIUM_SCAN_SEQUENCE.includes(value as PremiumFinger);
}
