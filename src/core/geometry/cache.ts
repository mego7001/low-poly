/**
 * @license
 * AUME LowPoly Fabrication — Geometry Precomputation & Cache
 * Specification Compliant: Sections 5, 6, 7, 15, 16, 17, 73, 74
 */

import {
  MeshInput,
  GeometryV2Cache,
  FaceGeometry,
  EdgeGeometry,
  Vec3,
} from './types';
import {
  sub,
  cross,
  norm,
  normalize,
  calculateBoundingBox,
  makeStableFaceKey,
  EPSILON,
} from './math';

export function buildGeometryV2Cache(mesh: MeshInput): GeometryV2Cache {
  const facesMap = new Map<number, FaceGeometry>();
  const edgesMap = new Map<number, EdgeGeometry>();
  const faceNeighbors = new Map<number, number[]>();
  const faceToEdges = new Map<number, number[]>();
  const faceKeys = new Map<number, string>();
  const degenerateFaceIds = new Set<number>();
  const nonManifoldEdgeIds = new Set<number>();

  // Map to identify unique edges by canonical vertex IDs: min(v0,v1) + '_' + max(v0,v1)
  const edgeKeyToId = new Map<string, number>();
  let nextEdgeId = 0;

  // 1. Process all faces
  for (const face of mesh.faces) {
    const v0 = mesh.vertices[face.vertexIds[0]];
    const v1 = mesh.vertices[face.vertexIds[1]];
    const v2 = mesh.vertices[face.vertexIds[2]];

    if (!v0 || !v1 || !v2) {
      degenerateFaceIds.add(face.id);
      continue;
    }

    const p0: Vec3 = v0.position;
    const p1: Vec3 = v1.position;
    const p2: Vec3 = v2.position;

    const e1 = sub(p1, p0);
    const e2 = sub(p2, p0);
    const cr = cross(e1, e2);
    const area = norm(cr) * 0.5;

    if (area <= 1e-12) {
      degenerateFaceIds.add(face.id);
    }

    const normal = normalize(cr);
    const centroid: Vec3 = [
      (p0[0] + p1[0] + p2[0]) / 3,
      (p0[1] + p1[1] + p2[1]) / 3,
      (p0[2] + p1[2] + p2[2]) / 3,
    ];

    const bbox = calculateBoundingBox([p0, p1, p2]);
    const stableKey = makeStableFaceKey(face, mesh.vertices);
    faceKeys.set(face.id, stableKey);

    // Build face edge indices
    const faceEdgePairs: [number, number][] = [
      [face.vertexIds[0], face.vertexIds[1]],
      [face.vertexIds[1], face.vertexIds[2]],
      [face.vertexIds[2], face.vertexIds[0]],
    ];

    const faceEdgeIds: number[] = [];

    for (const [va, vb] of faceEdgePairs) {
      const minV = Math.min(va, vb);
      const maxV = Math.max(va, vb);
      const edgeKey = `${minV}_${maxV}`;

      let edgeId = edgeKeyToId.get(edgeKey);
      if (edgeId === undefined) {
        edgeId = nextEdgeId++;
        edgeKeyToId.set(edgeKey, edgeId);

        const pa = mesh.vertices[va]?.position || [0, 0, 0];
        const pb = mesh.vertices[vb]?.position || [0, 0, 0];
        const length = norm(sub(pa, pb));

        edgesMap.set(edgeId, {
          edgeId,
          vertexIds: [minV, maxV],
          faceIds: [face.id],
          length,
          stableKey: `E:${minV}_${maxV}`,
        });
      } else {
        const edge = edgesMap.get(edgeId)!;
        edge.faceIds.push(face.id);
        if (edge.faceIds.length > 2) {
          nonManifoldEdgeIds.add(edgeId);
        }
      }
      faceEdgeIds.push(edgeId);
    }

    faceToEdges.set(face.id, faceEdgeIds);

    facesMap.set(face.id, {
      faceId: face.id,
      vertexIds: face.vertexIds,
      positions: [p0, p1, p2],
      centroid,
      normal,
      area,
      bbox,
      edgeIds: faceEdgeIds,
      stableKey,
    });
  }

  // 2. Build face neighbors via shared manifold edges
  for (const edge of edgesMap.values()) {
    if (edge.faceIds.length === 2) {
      const fA = edge.faceIds[0];
      const fB = edge.faceIds[1];

      if (!faceNeighbors.has(fA)) faceNeighbors.set(fA, []);
      if (!faceNeighbors.has(fB)) faceNeighbors.set(fB, []);

      faceNeighbors.get(fA)!.push(fB);
      faceNeighbors.get(fB)!.push(fA);
    }
  }

  // Sort neighbors by stable face key for full determinism
  for (const [faceId, nbs] of faceNeighbors.entries()) {
    nbs.sort((a, b) => {
      const keyA = faceKeys.get(a) || '';
      const keyB = faceKeys.get(b) || '';
      return keyA.localeCompare(keyB);
    });
  }

  // 3. Deterministic stable face ordering (Section 7, 19)
  // Non-degenerate faces, sorted by area desc, then stable key asc
  const validFaceIds = Array.from(facesMap.keys()).filter(
    (id) => !degenerateFaceIds.has(id)
  );

  validFaceIds.sort((a, b) => {
    const fA = facesMap.get(a)!;
    const fB = facesMap.get(b)!;
    // Round area to 4 decimals for stable tiering
    const areaDiff = Math.round(fB.area * 10000) - Math.round(fA.area * 10000);
    if (areaDiff !== 0) {
      return areaDiff;
    }
    return fA.stableKey.localeCompare(fB.stableKey);
  });

  return {
    faces: facesMap,
    edges: edgesMap,
    faceNeighbors,
    faceToEdges,
    stableFaceOrder: validFaceIds,
    faceKeys,
    degenerateFaceIds,
    nonManifoldEdgeIds,
  };
}
