import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GlbError, readGltfJson, scaleGlb } from '@/server/glb-scale';
import { factorFor, sizeSchema } from '@/server/model-size';

const GLB = readFileSync(path.resolve(__dirname, '../fixtures/pipeline-sphere.glb'));

describe('scaleGlb', () => {
  it('scales the root node, keeps the binary chunk identical and the file valid', () => {
    const out = scaleGlb(GLB, 0.5);
    expect(out.readUInt32LE(0)).toBe(0x46546c67);
    expect(out.readUInt32LE(8)).toBe(out.length);
    expect(out.readUInt32LE(12) % 4).toBe(0);
    const json = readGltfJson(out);
    expect(json.nodes![0]!.scale).toEqual([0.5, 0.5, 0.5]);
    const origBin = GLB.subarray(20 + GLB.readUInt32LE(12));
    const newBin = out.subarray(20 + out.readUInt32LE(12));
    expect(Buffer.compare(origBin, newBin)).toBe(0);
  });

  it('composes with an existing scale and translation, and with a matrix', () => {
    const twice = scaleGlb(scaleGlb(GLB, 2), 1.5);
    expect(readGltfJson(twice).nodes![0]!.scale).toEqual([3, 3, 3]);

    const json = readGltfJson(GLB) as { nodes: { matrix?: number[] }[] };
    json.nodes[0]!.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.2, 0, 0, 1];
    const body = Buffer.from(JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4, ' '));
    const rest = GLB.subarray(20 + GLB.readUInt32LE(12));
    const head = Buffer.alloc(20);
    head.writeUInt32LE(0x46546c67, 0);
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(20 + body.length + rest.length, 8);
    head.writeUInt32LE(body.length, 12);
    head.writeUInt32LE(0x4e4f534a, 16);
    const withMatrix = Buffer.concat([head, body, rest]);
    const m = readGltfJson(scaleGlb(withMatrix, 2)).nodes![0]!.matrix!;
    expect(m).toEqual([2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0.4, 0, 0, 1]);
  });

  it('rejects junk and bad factors', () => {
    expect(() => scaleGlb(Buffer.from('not a glb at all, really'), 1)).toThrow(GlbError);
    expect(() => scaleGlb(GLB, 0)).toThrow(GlbError);
    expect(() => scaleGlb(GLB, Number.NaN)).toThrow(GlbError);
  });
});

describe('real-size input', () => {
  it('maps the chosen axis to the stored bounding box', () => {
    // bbox is [width(X), height(Y), depth(Z)] in metres
    expect(factorFor([0.2, 0.35, 0.1], { axis: 'height', cm: 17.5 })).toBeCloseTo(0.5);
    expect(factorFor([0.2, 0.35, 0.1], { axis: 'width', cm: 40 })).toBeCloseTo(2);
    expect(factorFor([0.2, 0.35, 0.1], { axis: 'depth', cm: 5 })).toBeCloseTo(0.5);
  });

  it('accepts 0.5–500 cm only', () => {
    expect(sizeSchema.safeParse({ axis: 'height', cm: 20 }).success).toBe(true);
    expect(sizeSchema.safeParse({ axis: 'height', cm: 0.1 }).success).toBe(false);
    expect(sizeSchema.safeParse({ axis: 'height', cm: 900 }).success).toBe(false);
    expect(sizeSchema.safeParse({ axis: 'weight', cm: 20 }).success).toBe(false);
  });

  it('refuses a missing or degenerate bounding box', () => {
    expect(() => factorFor([], { axis: 'height', cm: 20 })).toThrow();
    expect(() => factorFor([0.2, 0, 0.1], { axis: 'height', cm: 20 })).toThrow();
  });
});
