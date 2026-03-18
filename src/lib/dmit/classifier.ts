import { inspect } from "node:util";
import { createPartFromUri, GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import {
  DemoFinger,
  DEMO_FINGERS,
  isDemoFinger,
  isTypeCode,
  TYPE_CODES,
  TypeCode
} from "@/lib/dmit/constants";
import { getReferenceFingerprintFiles } from "@/lib/dmit/loader";

const classificationSchema = z.object({
  finger: z.string(),
  type: z.string(),
  confidence: z.number().min(0).max(1),
  notes: z.string().min(1)
});

export interface ClassificationResult {
  finger: DemoFinger;
  type: TypeCode;
  confidence: number;
  notes: string;
  raw: unknown;
}

interface UploadedReferenceImage {
  type: TypeCode;
  uri: string;
  mimeType: string;
}

let uploadedReferenceImagesPromise: Promise<UploadedReferenceImage[]> | null = null;

function serializeForLog(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return inspect(value, {
      depth: 8,
      breakLength: 120,
      compact: false
    });
  }
}

function logClassifier(
  level: "info" | "warn" | "error",
  message: string,
  details?: Record<string, unknown>
): void {
  const payload = details ? ` ${serializeForLog(details)}` : "";
  console[level](`[dmit:classifier] ${message}${payload}`);
}

async function getUploadedReferenceImages(client: GoogleGenAI): Promise<UploadedReferenceImage[]> {
  if (!uploadedReferenceImagesPromise) {
    uploadedReferenceImagesPromise = (async () => {
      const files = getReferenceFingerprintFiles();
      const uploaded: UploadedReferenceImage[] = [];

      logClassifier("info", "Uploading reference fingerprints", {
        referenceCount: files.length,
        types: files.map((file) => file.type)
      });

      for (const reference of files) {
        logClassifier("info", "Uploading reference fingerprint", {
          type: reference.type,
          path: reference.path,
          mimeType: reference.mimeType
        });

        const uploadedFile = await client.files.upload({
          file: reference.path,
          config: {
            mimeType: reference.mimeType
          }
        });

        if (!uploadedFile.uri || !uploadedFile.mimeType) {
          throw new Error(`Failed to upload reference image for ${reference.type}.`);
        }

        uploaded.push({
          type: reference.type,
          uri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType
        });

        logClassifier("info", "Uploaded reference fingerprint", {
          type: reference.type,
          uri: uploadedFile.uri,
          mimeType: uploadedFile.mimeType
        });
      }

      logClassifier("info", "Reference fingerprint upload complete", {
        uploadedCount: uploaded.length
      });

      return uploaded;
    })();
  }

  try {
    return await uploadedReferenceImagesPromise;
  } catch (error) {
    uploadedReferenceImagesPromise = null;
    logClassifier("error", "Reference fingerprint upload failed", {
      error: serializeForLog(error)
    });
    throw error;
  }
}

function parseFunctionCallArgs(payload: unknown): unknown {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidate = payload as Record<string, unknown>;
  if (Array.isArray(candidate.functionCalls) && candidate.functionCalls.length > 0) {
    const first = candidate.functionCalls[0] as Record<string, unknown>;
    return first.args ?? null;
  }

  const functionCall = candidate.functionCall as Record<string, unknown> | undefined;
  if (functionCall?.args) {
    return functionCall.args;
  }

  const response = candidate.response as Record<string, unknown> | undefined;
  if (response && Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
    const first = response.functionCalls[0] as Record<string, unknown>;
    return first.args ?? null;
  }

  const text = candidate.text;
  if (typeof text === "string") {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  return null;
}

function validateArgs(args: unknown): ClassificationResult {
  const parsed = classificationSchema.parse(args);

  if (!isDemoFinger(parsed.finger)) {
    throw new Error(`Invalid finger from model: ${parsed.finger}`);
  }

  if (!isTypeCode(parsed.type)) {
    throw new Error(`Invalid type from model: ${parsed.type}`);
  }

  return {
    finger: parsed.finger,
    type: parsed.type,
    confidence: parsed.confidence,
    notes: parsed.notes,
    raw: args
  };
}

export async function classifyFingerprint(args: {
  selectedFinger: DemoFinger;
  capturedImagePath: string;
  capturedImageMimeType: string;
  model: string;
  minConfidence?: number;
  requestId?: string;
  attemptLabel?: string;
}): Promise<ClassificationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const minConfidence = args.minConfidence ?? 0.55;
  const requestId = args.requestId ?? "no-request-id";
  const attemptLabel = args.attemptLabel ?? "initial";
  const client = new GoogleGenAI({ apiKey });
  const startedAt = Date.now();

  logClassifier("info", "Starting Gemini classification", {
    requestId,
    attemptLabel,
    selectedFinger: args.selectedFinger,
    capturedImagePath: args.capturedImagePath,
    capturedImageMimeType: args.capturedImageMimeType,
    model: args.model,
    minConfidence
  });

  const referenceImages = await getUploadedReferenceImages(client);
  if (referenceImages.length !== TYPE_CODES.length) {
    throw new Error(
      `Expected ${TYPE_CODES.length} reference images, received ${referenceImages.length}.`
    );
  }

  logClassifier("info", "Reference fingerprints ready", {
    requestId,
    attemptLabel,
    referenceCount: referenceImages.length,
    types: referenceImages.map((image) => image.type)
  });

  logClassifier("info", "Uploading captured fingerprint", {
    requestId,
    attemptLabel,
    capturedImagePath: args.capturedImagePath,
    mimeType: args.capturedImageMimeType
  });
  const capturedFile = await client.files.upload({
    file: args.capturedImagePath,
    config: {
      mimeType: args.capturedImageMimeType
    }
  });

  if (!capturedFile.uri || !capturedFile.mimeType) {
    throw new Error("Failed to upload captured fingerprint image.");
  }

  logClassifier("info", "Captured fingerprint uploaded", {
    requestId,
    attemptLabel,
    uri: capturedFile.uri,
    mimeType: capturedFile.mimeType
  });

  const functionDeclaration = {
    name: "select_dmit_type",
    description: "Return the most likely DMIT type for the given selected finger and captured fingerprint.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        finger: {
          type: Type.STRING,
          enum: [...DEMO_FINGERS],
          description: "Must match the selected finger exactly."
        },
        type: {
          type: Type.STRING,
          enum: [...TYPE_CODES],
          description: "Detected fingerprint type code."
        },
        confidence: {
          type: Type.NUMBER,
          description: "Number between 0 and 1."
        },
        notes: {
          type: Type.STRING,
          description: "Short explanation of why this type was chosen."
        }
      },
      required: ["finger", "type", "confidence", "notes"]
    }
  };

  const referenceOrderText = referenceImages
    .map((part) => part.type)
    .join("\n");

  const parts: Array<
    | { text: string }
    | {
        inlineData: {
          mimeType: string;
          data: string;
        };
      }
    | ReturnType<typeof createPartFromUri>
  > = [
    {
      text: [
        "You are an expert DMIT fingerprint classifier.",
        "The request always has 3 parts and you must use all 3 parts together before deciding.",
        "PART 1: DMIT task context and selected finger constraints.",
        `Selected finger is fixed and must remain exactly: ${args.selectedFinger}`,
        "Allowed finger values: Left Thumb, Right Thumb, Left Index, Right Index.",
        "Allowed type values: CPW, CW, DL, PE, PW, RL, SA, SW, TA, UL.",
        "PART 2: One captured user fingerprint image for the selected finger.",
        "PART 3: Exactly 10 labeled reference fingerprint images (one per type code).",
        "Decision policy:",
        "1) Compare ridge flow and core/delta structure of PART 2 against PART 3.",
        "2) Choose exactly one type from the allowed type values.",
        "3) Do not change finger; echo the selected finger exactly.",
        "4) Confidence must be a number between 0 and 1. If you are entirely unsure, you MUST STILL make your best guess! Never fail to output a classification.",
        "5) notes must be concise and evidence-based.",
        "Return output only via the select_dmit_type function call.",
        "Reference label order (10 images below):",
        referenceOrderText
      ].join("\n")
    }
  ];

  for (const ref of referenceImages) {
    parts.push({ text: `Type reference: ${ref.type}` });
    parts.push(createPartFromUri(ref.uri, ref.mimeType));
  }

  parts.push({ text: "Captured user fingerprint image (PART 2):" });
  parts.push(createPartFromUri(capturedFile.uri, capturedFile.mimeType));

  const response = await client.models.generateContent({
    model: args.model,
    contents: [{ role: "user", parts }],
    config: {
      tools: [{ functionDeclarations: [functionDeclaration] }],
      temperature: 0.1
    }
  });

  logClassifier("info", "Gemini raw response received", {
    requestId,
    attemptLabel,
    elapsedMs: Date.now() - startedAt,
    response
  });

  const functionArgs = parseFunctionCallArgs(response);
  if (!functionArgs) {
    logClassifier("warn", "Gemini response missing function call", {
      requestId,
      attemptLabel,
      response
    });
    throw new Error("Model did not return a function call.");
  }

  logClassifier("info", "Gemini function call args parsed", {
    requestId,
    attemptLabel,
    functionArgs
  });

  const result = validateArgs(functionArgs);
  logClassifier("info", "Gemini classification validated", {
    requestId,
    attemptLabel,
    classification: result
  });

  if (result.confidence < minConfidence) {
    logClassifier("warn", "Gemini classification below confidence threshold", {
      requestId,
      attemptLabel,
      confidence: result.confidence,
      minConfidence,
      classification: result
    });
    throw new Error(`Low confidence classification (${result.confidence.toFixed(2)}).`);
  }

  logClassifier("info", "Gemini classification succeeded", {
    requestId,
    attemptLabel,
    elapsedMs: Date.now() - startedAt,
    classification: result
  });

  return result;
}
