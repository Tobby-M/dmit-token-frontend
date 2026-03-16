export const DEMO_FINGERS = [
  "Left Thumb",
  "Right Thumb",
  "Left Index",
  "Right Index"
] as const;

export const TYPE_CODES = [
  "CPW",
  "CW",
  "DL",
  "PE",
  "PW",
  "RL",
  "SA",
  "SW",
  "TA",
  "UL"
] as const;

export type DemoFinger = (typeof DEMO_FINGERS)[number];
export type TypeCode = (typeof TYPE_CODES)[number];

export function isDemoFinger(value: string): value is DemoFinger {
  return DEMO_FINGERS.includes(value as DemoFinger);
}

export function isTypeCode(value: string): value is TypeCode {
  return TYPE_CODES.includes(value as TypeCode);
}
