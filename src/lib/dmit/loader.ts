import fs from "node:fs/promises";
import path from "node:path";
import { DemoFinger, DEMO_FINGERS, TYPE_CODES, TypeCode } from "@/lib/dmit/constants";
import { DmitReport, parseReport } from "@/lib/dmit/parser";

const DATA_ROOT = path.join(process.cwd(), "data", "data");
const REPORT_ROOT = path.join(DATA_ROOT, "Text", "sorted_by_finger");
const FINGERPRINT_ROOT = path.join(DATA_ROOT, "Image", "Fingerprints");

const REQUIRED_DATA_PATHS = [
  REPORT_ROOT,
  FINGERPRINT_ROOT,
  ...DEMO_FINGERS.map((finger) => path.join(REPORT_ROOT, finger)),
  ...TYPE_CODES.map((type) => path.join(FINGERPRINT_ROOT, `${type.toLowerCase()}.png`))
];

export async function validateDatasetAvailability(): Promise<void> {
  for (const targetPath of REQUIRED_DATA_PATHS) {
    try {
      await fs.access(targetPath);
    } catch {
      throw new Error(`Required DMIT path missing: ${targetPath}`);
    }
  }
}

export function getReportPath(finger: DemoFinger, type: TypeCode): string {
  return path.join(REPORT_ROOT, finger, `${type}.txt`);
}

export function getTypeImagePath(type: TypeCode): string {
  return path.join(FINGERPRINT_ROOT, `${type.toLowerCase()}.png`);
}

export async function loadReport(finger: DemoFinger, type: TypeCode): Promise<DmitReport> {
  const filePath = getReportPath(finger, type);
  const file = await fs.readFile(filePath, "utf8");
  return parseReport(file);
}

export async function getReferenceFingerprintParts(): Promise<
  Array<{ type: TypeCode; mimeType: string; base64: string }>
> {
  const types: TypeCode[] = ["CPW", "CW", "DL", "PE", "PW", "RL", "SA", "SW", "TA", "UL"];
  const parts: Array<{ type: TypeCode; mimeType: string; base64: string }> = [];

  for (const type of types) {
    const imagePath = getTypeImagePath(type);
    const bytes = await fs.readFile(imagePath);
    parts.push({
      type,
      mimeType: "image/png",
      base64: bytes.toString("base64")
    });
  }

  return parts;
}

export function getReferenceFingerprintFiles(): Array<{
  type: TypeCode;
  mimeType: "image/png";
  path: string;
}> {
  const types: TypeCode[] = ["CPW", "CW", "DL", "PE", "PW", "RL", "SA", "SW", "TA", "UL"];

  return types.map((type) => ({
    type,
    mimeType: "image/png",
    path: getTypeImagePath(type)
  }));
}
