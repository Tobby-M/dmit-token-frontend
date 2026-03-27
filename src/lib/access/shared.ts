export type AccessTier = "free" | "basic" | "premium";
export type TokenTier = Exclude<AccessTier, "free">;
export type TokenStatus = "active" | "used" | "revoked";

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
