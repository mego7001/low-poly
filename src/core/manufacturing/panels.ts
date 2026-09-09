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

  if (outerLoop && outerLoop.vertexIds.length > 0) {
    for (const vId of outerLoop.vertexIds) {
      const v = mesh.vertices[vId];
      if (v) {
        outerVertices3D.push(v.position);
        outerVertices2D.push(projectPoint(v.position));
      }
    }
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
  }

  // Simplify collinear boundary vertices (Section 21, rule 7)
  outerVertices2D = simplifyPolygon2D(outerVertices2D, 1e-4);

  // Ensure counter-clockwise orientation
  const signedArea = calculatePolygonArea2D(outerVertices2D);
  if (signedArea < 0) {
    outerVertices2D.reverse();
    outerVertices3D.reverse();
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

export function buildSmartPanels(
  regions: GeometryRegion[],
  mesh: MeshInput
): SmartPanel[] {
  return regions.map((region, idx) => {
    const id = generateStablePanelId(region);
    const { outerVertices2D, outerVertices3D, holeLoops2D } = projectRegionTo2D(
      region,
      mesh
    );
    const confidence = calculatePanelConfidence(region);
    const type = classifyPanelType(outerVertices2D.length, region.faceIds.size);

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
      holeLoops2D,
      normal: region.normal,
      centroid3D: region.centroid,
      sectorId: Math.floor(idx / 4),
      composite: region.faceIds.size > 1,
    };
  });
}
