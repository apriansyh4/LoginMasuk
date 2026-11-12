import 'server-only';
import sharp, { type Metadata, type Sharp } from 'sharp';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ImageKind = 'jpeg' | 'png' | 'webp';

export class ImageRejected extends Error {
  constructor(public readonly code: 'INVALID_FILE' | 'FILE_TOO_LARGE') {
    super(code);
  }
}

/** Detect the type from the file's bytes only (the name/extension/claimed MIME are ignored). */
export function sniffImage(b: Buffer): ImageKind | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export interface SanitizedImage {
  data: Buffer;
  kind: ImageKind;
  contentType: string;
  width: number;
  height: number;
}

/**
 * Safe re-encode: apply EXIF orientation, then strip all metadata (EXIF/GPS/XMP)
 * by re-encoding. Output keeps the original pixels/colours; PNG/WEBP keep alpha.
 */
export async function sanitizeImage(input: Buffer): Promise<SanitizedImage> {
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageRejected('FILE_TOO_LARGE');
  const kind = sniffImage(input);
  if (!kind) throw new ImageRejected('INVALID_FILE');
  let pipeline: Sharp;
  let meta: Metadata;
  try {
    pipeline = sharp(input, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
    meta = await pipeline.metadata();
  } catch {
    throw new ImageRejected('INVALID_FILE');
  }
  if (meta.format !== kind && !(kind === 'jpeg' && meta.format === 'jpeg')) throw new ImageRejected('INVALID_FILE');
  if ((meta.pages ?? 1) > 1) throw new ImageRejected('INVALID_FILE');
  const rotated = pipeline.rotate(); // honours EXIF orientation; output carries no metadata by default
  let out: Buffer;
  try {
    if (kind === 'jpeg') out = await rotated.jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    else if (kind === 'png') out = await rotated.png({ compressionLevel: 8 }).toBuffer();
    else out = await rotated.webp({ quality: 95 }).toBuffer();
  } catch {
    throw new ImageRejected('INVALID_FILE');
  }
  const m2 = await sharp(out).metadata();
  const width = m2.width ?? 0;
  const height = m2.height ?? 0;
  // Resolution is judged by the validation engine (LOW_RESOLUTION) so the attempt is recorded in History.
  if (out.length > MAX_UPLOAD_BYTES) throw new ImageRejected('FILE_TOO_LARGE');
  return { data: out, kind, contentType: `image/${kind}`, width, height };
}
