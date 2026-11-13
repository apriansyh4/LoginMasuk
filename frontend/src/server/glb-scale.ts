import 'server-only';

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

export class GlbError extends Error {}

type GltfNode = { matrix?: number[]; scale?: number[]; translation?: number[] };
type Gltf = { scene?: number; scenes?: { nodes?: number[] }[]; nodes?: GltfNode[] };

/**
 * Uniformly scale a binary glTF (GLB) about the origin by changing only the root
 * nodes' transforms. Geometry bytes are untouched, so the result is exact and
 * cheap. Our pipeline exports models in metres with the base on Y=0 and centred
 * on X/Z, so scaling about the origin keeps the product standing on the floor.
 */
export function scaleGlb(glb: Buffer, factor: number): Buffer {
  if (!Number.isFinite(factor) || factor <= 0) throw new GlbError('BAD_FACTOR');
  if (glb.length < 20 || glb.readUInt32LE(0) !== MAGIC || glb.readUInt32LE(4) !== 2) throw new GlbError('NOT_GLB');
  if (glb.readUInt32LE(8) !== glb.length) throw new GlbError('BAD_LENGTH');
  const jsonLen = glb.readUInt32LE(12);
  if (glb.readUInt32LE(16) !== CHUNK_JSON || 20 + jsonLen > glb.length) throw new GlbError('BAD_JSON_CHUNK');

  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots = scene?.nodes ?? [];
  if (!roots.length || !gltf.nodes) throw new GlbError('NO_ROOT_NODES');

  for (const index of roots) {
    const node = gltf.nodes[index];
    if (!node) throw new GlbError('BAD_NODE');
    if (node.matrix) {
      // column-major 4x4: scale rows 0..2 of every column (S * M)
      node.matrix = node.matrix.map((v, i) => (i % 4 === 3 ? v : v * factor));
    } else {
      node.scale = (node.scale ?? [1, 1, 1]).map((v) => v * factor);
      if (node.translation) node.translation = node.translation.map((v) => v * factor);
    }
  }

  let json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  if (pad) json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]); // spec: pad JSON with spaces
  const rest = glb.subarray(20 + jsonLen); // binary chunk(s), unchanged

  const header = Buffer.alloc(20);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + rest.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.writeUInt32LE(CHUNK_JSON, 16);
  return Buffer.concat([header, json, rest]);
}

/** Read the root-node scale back (used by tests and as a sanity check). */
export function readGltfJson(glb: Buffer): Gltf {
  const jsonLen = glb.readUInt32LE(12);
  return JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8')) as Gltf;
}
