import 'server-only';
import { z } from 'zod';
import { serverEnv } from '@/lib/env';

export const REJECTION_CODES = [
  'LOW_RESOLUTION',
  'TOO_BLURRY',
  'BAD_EXPOSURE',
  'MULTIPLE_PRODUCTS',
  'HUMAN_DETECTED',
  'BODY_PART_DETECTED',
  'ANIMAL_DETECTED',
  'OTHER_FOREGROUND_OBJECTS',
  'PRODUCT_CROPPED',
  'PRODUCT_OCCLUDED',
  'UNSUPPORTED_CATEGORY',
  'LOW_CONFIDENCE',
  'INVALID_FILE',
] as const;

export const validationResultSchema = z.object({
  isValid: z.boolean(),
  objectCount: z.number().int().nullable(),
  containsHuman: z.boolean().nullable(),
  containsOtherObjects: z.boolean().nullable(),
  isBlurry: z.boolean().nullable(),
  isOccluded: z.boolean().nullable(),
  isCropped: z.boolean().nullable(),
  qualityScore: z.number().int().min(0).max(100).nullable(),
  subScores: z
    .object({
      sharpness: z.number().int(),
      exposure: z.number().int(),
      contrast: z.number().int(),
      backgroundSimplicity: z.number().int(),
      completeness: z.number().int(),
    })
    .nullable(),
  detectedCategory: z.string().nullable(),
  categoryConfidence: z.number().nullable(),
  rejectionReasons: z.array(
    z.object({
      code: z.enum(REJECTION_CODES),
      message: z.string(),
      detail: z
        .record(z.string(), z.union([z.string(), z.number()]))
        .nullable()
        .optional(),
    }),
  ),
  configVersion: z.string(),
  stagesRun: z.array(z.string()),
  timingsMs: z.record(z.string(), z.number()),
  maskPngBase64: z.string().nullable().optional(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const healthSchema = z.object({
  status: z.string(),
  validationAvailable: z.boolean(),
  validationMissing: z.array(z.string()),
  validationConfigVersion: z.string(),
  gpuAvailable: z.boolean(),
  gpuName: z.string().nullable(),
  reconstructionAvailable: z.boolean(),
  reconstructionReason: z.string().nullable().optional(),
  modelVersion: z.string().nullable(),
  detectors: z.record(z.string(), z.object({ name: z.string(), state: z.string() }).loose()),
});
export type AiHealth = z.infer<typeof healthSchema>;

export class AiServiceError extends Error {
  constructor(public readonly code: 'VALIDATION_UNAVAILABLE' | 'AI_SERVICE_UNREACHABLE' | 'AI_SERVICE_BAD_RESPONSE') {
    super(code);
  }
}

function base() {
  const env = serverEnv();
  return { url: env.AI_SERVICE_URL.replace(/\/$/, ''), headers: { 'x-service-token': env.AI_SERVICE_SECRET } };
}

export async function getAiHealth(): Promise<AiHealth | null> {
  const { url, headers } = base();
  try {
    const r = await fetch(`${url}/health`, { headers, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    return healthSchema.parse(await r.json());
  } catch {
    return null;
  }
}

export async function validateImage(image: Buffer): Promise<ValidationResult> {
  const { url, headers } = base();
  let r: Response;
  try {
    r = await fetch(`${url}/validate`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: new Uint8Array(image),
      cache: 'no-store',
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new AiServiceError('AI_SERVICE_UNREACHABLE');
  }
  if (r.status === 503) throw new AiServiceError('VALIDATION_UNAVAILABLE');
  if (!r.ok) throw new AiServiceError('AI_SERVICE_BAD_RESPONSE');
  const parsed = validationResultSchema.safeParse(await r.json());
  if (!parsed.success) throw new AiServiceError('AI_SERVICE_BAD_RESPONSE');
  // Defence in depth: a "valid" result must not carry reasons.
  if (parsed.data.isValid && parsed.data.rejectionReasons.length > 0) throw new AiServiceError('AI_SERVICE_BAD_RESPONSE');
  return parsed.data;
}
