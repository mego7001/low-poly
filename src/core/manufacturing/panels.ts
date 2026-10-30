/**
 * @license
 * AUME LowPoly Fabrication — Smart Panel Classification & Local UV Projection
 * Specification Compliant: Sections 23 - 26, 35, 80
 */

import {
  GeometryRegion,
  MeshInput,
  Vec2,
  Vec3,
} from '../geometry/types';
import { SmartPanel, PanelType } from './types';
import { cross, dot, norm, normalize, sub } from '../geometry/math';

/**
 * Generates stable Panel ID: P-XXXXXXXX (Section 25)
 * Derived from deterministic geometric signature of the region
 */
export function generateStablePanelId(region: GeometryRegion): string {
  const source = `${region.stableKey}_${region.faceIds.size}_${Math.round(region.area * 100)}`;
  let hash = 5381;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 33) ^ source.charCodeAt(i);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `P-${hex.slice(0, 8)}`;
}

/**
 * Classifies panel geometric type based on outer boundary vertex count (Section 23)
 */
export function classifyPanelType(boundaryVertexCount: number, faceCount: number): PanelType {
  if (faceCount > 1 && boundaryVertexCount > 6) {
    return 'Composite';
  }
  switch (boundaryVertexCount) {
    case 3:
      return 'Triangle';
    case 4:
      return 'Quad';
    case 5:
      return 'Pentagon';
    case 6:
      return 'Hexagon';
    default:
      return boundaryVertexCount > 6 ? 'Composite' : 'Other';
  }
}

/**
 * Computes panel confidence (0 - 100) (Section 26)
 */
export function calculatePanelConfidence(region: GeometryRegion): number {
  let score = 100;

  // Deduction for distance deviation from flat plane
  if (region.stats.maxPerpDistance > 0.0001) {
    score -= Math.min(30, region.stats.maxPerpDistance * 10000);
  }

  // Deduction for normal angular deviation
  if (region.stats.maxNormalDeviationDeg > 0.1) {
    score -= Math.min(30, region.stats.maxNormalDeviationDeg * 5);
  }

  // Bonus for larger well-reconstructed regions
  if (region.faceIds.size > 1) {
    score = Math.min(100, score + 5);
  }

  return Math.max(10, Math.min(100, Math.round(score)));
}

/**
 * Constructs an orthonormal local basis (u, v, n) for the region plane.
 * Projects 3D boundary points onto the 2D local plane.
 */
export function projectRegionTo2D(
  region: GeometryRegion,
  mesh: MeshInput
): {
  outerVertices2D: Vec2[];
  outerVertices3D: Vec3[];
  outerEdgeIds2D: number[];
  holeLoops2D: Vec2[][];
} {
  const normal = region.normal;
  // Choose reference vector not parallel to normal
  let ref: Vec3 = [0, 0, 1];
  if (Math.abs(dot(normal, ref)) > 0.9) {
    ref = [0, 1, 0];
  }

  const uAxis = normalize(cross(ref, normal));
  const vAxis = normalize(cross(normal, uAxis));
  const origin = region.centroid;

  const projectPoint = (p: Vec3): Vec2 => {
    const diff = sub(p, origin);
    return [dot(diff, uAxis), dot(diff, vAxis)];
  };

  const outerLoop = region.boundaryLoops.find((l) => l.isOuter) || region.boundaryLoops[0];
  const holeLoops = region.boundaryLoops.filter((l) => !l.isOuter && l !== outerLoop);

  let outerVertices3D: Vec3[] = [];
  let outerVertices2D: Vec2[] = [];
  let rawEdgeIds: number[] = [];

  if (outerLoop && outerLoop.vertexIds.length > 0) {
    for (const vId of outerLoop.vertexIds) {
      const v = mesh.vertices[vId];
      if (v) {
        outerVertices3D.push(v.position);
        outerVertices2D.push(projectPoint(v.position));
      }
    }
    rawEdgeIds = outerLoop.edgeIds && outerLoop.edgeIds.length > 0 ? [...outerLoop.edgeIds] : [];
  } else {
    // Fallback: collect unique vertices from region faces
    const uniqueVIds = new Set<number>();
    for (const fId of region.faceIds) {
      const f = mesh.faces[fId];
      if (f) {
        f.vertexIds.forEach((id) => uniqueVIds.add(id));
      }
    }
    for (const vId of uniqueVIds) {
      const v = mesh.vertices[vId];
      if (v) {
        outerVertices3D.push(v.position);
        outerVertices2D.push(projectPoint(v.position));
      }
    }
    rawEdgeIds = outerVertices2D.map((_, i) => i);
  }

  // Synchronously simplify collinear boundary vertices across 2D, 3D, and edge IDs
  const simplified = simplifyPolygonSynced(
    outerVertices2D,
    outerVertices3D,
    rawEdgeIds,
    1e-4
  );
  outerVertices2D = simplified.pts2D;
  outerVertices3D = simplified.pts3D;
  let outerEdgeIds2D = simplified.edgeIds;

  // Ensure counter-clockwise orientation
  const signedArea = calculatePolygonArea2D(outerVertices2D);
  if (signedArea < 0) {
    outerVertices2D.reverse();
    outerVertices3D.reverse();
    outerEdgeIds2D = reversePolygonEdges(outerEdgeIds2D);
  }

  const holeLoops2D: Vec2[][] = [];
  for (const hole of holeLoops) {
    const hPoints: Vec2[] = [];
    for (const vId of hole.vertexIds) {
      const v = mesh.vertices[vId];
      if (v) {
        hPoints.push(projectPoint(v.position));
      }
    }
    if (hPoints.length >= 3) {
      holeLoops2D.push(simplifyPolygon2D(hPoints, 1e-4));
    }
  }

  return {
    outerVertices2D,
    outerVertices3D,
    outerEdgeIds2D,
    holeLoops2D,
  };
}

export function calculatePolygonArea2D(pts: Vec2[]): number {
  if (pts.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i][0] * pts[j][1];
    area -= pts[j][0] * pts[i][1];
  }
  return area * 0.5;
}

/**
 * Reverses polygon edge IDs to maintain segment-to-edge mapping when polygon vertices are reversed.
 */
export function reversePolygonEdges(edgeIds: number[]): number[] {
  const N = edgeIds.length;
  if (N <= 1) return [...edgeIds];
  const result = new Array<number>(N);
  for (let k = 0; k < N - 1; k++) {
    result[k] = edgeIds[N - 2 - k];
  }
  result[N - 1] = edgeIds[N - 1];
  return result;
}

/**
 * Synchronously simplifies collinear boundary vertices across 2D coordinates,
 * 3D coordinates, and mesh edge IDs, preserving topological identity and exact sync.
 */
export function simplifyPolygonSynced(
  pts2D: Vec2[],
  pts3D: Vec3[],
  edgeIds: number[],
  tolerance: number = 1e-4
): { pts2D: Vec2[]; pts3D: Vec3[]; edgeIds: number[] } {
  const n = pts2D.length;
  if (n <= 3) {
    const safeEdgeIds =
      edgeIds.length === n
        ? edgeIds
        : Array.from({ length: n }, (_, i) => edgeIds[i] ?? i);
    return { pts2D, pts3D, edgeIds: safeEdgeIds };
  }

  const safeEdgeIds =
    edgeIds.length === n
      ? [...edgeIds]
      : Array.from({ length: n }, (_, i) => edgeIds[i] ?? i);

  const keepIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts2D[(i - 1 + n) % n];
    const curr = pts2D[i];
    const next = pts2D[(i + 1) % n];

    const lineDx = next[0] - prev[0];
    const lineDy = next[1] - prev[1];
    const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

    if (lineLen < 1e-7) {
      continue; // Duplicate point
    }

    const dist =
      Math.abs(lineDx * (prev[1] - curr[1]) - (prev[0] - curr[0]) * lineDy) / lineLen;
    if (dist > tolerance) {
      keepIndices.push(i);
    }
  }

  if (keepIndices.length < 3) {
    return { pts2D, pts3D, edgeIds: safeEdgeIds };
  }

  return {
    pts2D: keepIndices.map((i) => pts2D[i]),
    pts3D: keepIndices.map((i) => pts3D[i] ?? [0, 0, 0]),
    edgeIds: keepIndices.map((i) => safeEdgeIds[i]),
  };
}

export function simplifyPolygon2D(points: Vec2[], tolerance: number = 1e-4): Vec2[] {
  if (points.length <= 3) return points;

  const result: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    // Distance from curr to line (prev -> next)
    const lineDx = next[0] - prev[0];
    const lineDy = next[1] - prev[1];
    const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);

    if (lineLen < 1e-7) {
      continue; // Duplicate point
    }

    const dist = Math.abs(lineDx * (prev[1] - curr[1]) - (prev[0] - curr[0]) * lineDy) / lineLen;
    if (dist > tolerance) {
      result.push(curr);
    }
  }

  return result.length >= 3 ? result : points;
}

/**
 * Computes manufacturing sectors based on topological adjacency clusters (Section 13).
 * Replaces arbitrary index grouping with connected manifold component sectors.
 */
export function computeManufacturingSectors(regions: GeometryRegion[]): Map<number, number> {
  const sectorMap = new Map<number, number>();
  if (regions.length === 0) return sectorMap;

  const adj = new Map<number, number[]>();
  for (const r of regions) {
    adj.set(r.id, (r.neighbors || []).map((n) => n.neighborRegionId));
  }

  const visited = new Set<number>();
  let currentSector = 1;
  const maxPerSector = Math.max(4, Math.min(12, Math.ceil(regions.length / 6)));

  for (const r of regions) {
    if (visited.has(r.id)) continue;

    const queue = [r.id];
    visited.add(r.id);
    let countInSector = 0;

    while (queue.length > 0) {
      const curr = queue.shift()!;
      sectorMap.set(curr, currentSector);
      countInSector++;

      if (countInSector >= maxPerSector) {
        currentSector++;
        countInSector = 0;
      }

      const neighbors = adj.get(curr) || [];
      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    if (countInSector > 0) {
      currentSector++;
    }
  }

  return sectorMap;
}

export function buildSmartPanels(
  regions: GeometryRegion[],
  mesh: MeshInput
): SmartPanel[] {
  const sectorMap = computeManufacturingSectors(regions);

  return regions.map((region) => {
    const id = generateStablePanelId(region);
    const { outerVertices2D, outerVertices3D, outerEdgeIds2D, holeLoops2D } = projectRegionTo2D(
      region,
      mesh
    );
    const confidence = calculatePanelConfidence(region);
    const type = classifyPanelType(outerVertices2D.length, region.faceIds.size);
    const sectorId = sectorMap.get(region.id) ?? 1;

    return {
      id,
      regionId: region.id,
      type,
      confidence,
      area: region.area,
      faceCount: region.faceIds.size,
      boundaryVertexCount: outerVertices2D.length,
      outerVertices2D,
      outerVertices3D,
      outerEdgeIds2D,
      holeLoops2D,
      normal: region.normal,
      centroid3D: region.centroid,
      sectorId,
      composite: region.faceIds.size > 1,
    };
  });
}
