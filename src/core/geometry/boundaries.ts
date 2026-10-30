/**
 * @license
 * AUME LowPoly Fabrication — Boundary Extraction & Internal Triangulation Removal
 * Specification Compliant: Sections 21, 22, 52 - 57, 73, 80
 */

import {
  BoundaryLoop,
  GeometryRegion,
  GeometryV2Cache,
  MeshInput,
  RegionBoundaryEdge,
} from './types';
import { norm, sub, cross, dot, normalize } from './math';

export function extractRegionBoundary(
  region: GeometryRegion,
  mesh: MeshInput,
  cache: GeometryV2Cache
): { boundaryLoops: BoundaryLoop[]; boundaryEdges: RegionBoundaryEdge[] } {
  const edgeUsageCount = new Map<number, number>();
  const touchingEdges = new Set<number>();

  for (const faceId of region.faceIds) {
    const face = cache.faces.get(faceId);
    if (!face) continue;
    for (const edgeId of face.edgeIds) {
      touchingEdges.add(edgeId);
      edgeUsageCount.set(edgeId, (edgeUsageCount.get(edgeId) || 0) + 1);
    }
  }

  const boundaryEdges: RegionBoundaryEdge[] = [];
  const outerEdgeIds: number[] = [];
  const internalEdgeIds: number[] = [];

  for (const edgeId of touchingEdges) {
    const count = edgeUsageCount.get(edgeId) || 0;
    const edge = cache.edges.get(edgeId);
    if (!edge) continue;

    if (count === 2) {
      // Internal triangulation: shared between two faces inside the same region
      internalEdgeIds.push(edgeId);
      region.internalEdgeIds.add(edgeId);
    } else if (count === 1) {
      // True outer or inter-region boundary edge
      outerEdgeIds.push(edgeId);
      region.boundaryEdgeIds.add(edgeId);

      const classification =
        edge.faceIds.length === 1 ? 'OUTER' : 'REGION_ADJACENCY';

      boundaryEdges.push({
        edgeId,
        startVertexId: edge.vertexIds[0],
        endVertexId: edge.vertexIds[1],
        length: edge.length,
        sourceMeshEdgeId: edgeId,
        classification,
      });
    }
  }

  // Trace boundary edges into ordered, closed loops
  const boundaryLoops = traceBoundaryLoops(boundaryEdges, mesh);

  return { boundaryLoops, boundaryEdges };
}

/**
 * Traces a list of unorganized boundary edges into continuous directed loops (Section 54-56).
 */
export function traceBoundaryLoops(
  edges: RegionBoundaryEdge[],
  mesh: MeshInput
): BoundaryLoop[] {
  if (edges.length === 0) return [];

  // Build adjacency map: vertexId -> list of edge references
  const adj = new Map<number, { edgeIndex: number; targetV: number }[]>();

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const v0 = e.startVertexId;
    const v1 = e.endVertexId;

    if (!adj.has(v0)) adj.set(v0, []);
    if (!adj.has(v1)) adj.set(v1, []);

    adj.get(v0)!.push({ edgeIndex: i, targetV: v1 });
    adj.get(v1)!.push({ edgeIndex: i, targetV: v0 });
  }

  const usedEdges = new Set<number>();
  const loops: BoundaryLoop[] = [];

  for (let i = 0; i < edges.length; i++) {
    if (usedEdges.has(i)) continue;

    const loopVertexIds: number[] = [];
    const loopEdgeIds: number[] = [];
    let currV = edges[i].startVertexId;
    const startV = currV;

    loopVertexIds.push(currV);
    let isClosed = false;

    while (true) {
      const candidates = (adj.get(currV) || []).filter(
        (c) => !usedEdges.has(c.edgeIndex)
      );

      if (candidates.length === 0) {
        // Can't continue, open loop
        break;
      }

      // Pick next edge
      const nextStep = candidates[0];
      usedEdges.add(nextStep.edgeIndex);
      loopEdgeIds.push(edges[nextStep.edgeIndex].edgeId);
      currV = nextStep.targetV;

      if (currV === startV) {
        isClosed = true;
        break;
      }
      loopVertexIds.push(currV);

      if (loopVertexIds.length > edges.length + 1) {
        // Loop safety
        break;
      }
    }

    // Calculate perimeter
    let perimeter = 0;
    for (let vIdx = 0; vIdx < loopVertexIds.length; vIdx++) {
      const vAId = loopVertexIds[vIdx];
      const vBId = loopVertexIds[(vIdx + 1) % loopVertexIds.length];
      const pA = mesh.vertices[vAId]?.position;
      const pB = mesh.vertices[vBId]?.position;
      if (pA && pB) {
        perimeter += norm(sub(pA, pB));
      }
    }

    loops.push({
      vertexIds: loopVertexIds,
      edgeIds: loopEdgeIds,
      closed: isClosed,
      perimeter,
      isOuter: true, // Will be classified below
      nestingLevel: 0,
    });
  }

  // Classify loop nesting depth (Section 11, 56):
  // depth 0 -> outer boundary
  // depth 1 -> hole
  // depth 2 -> island (nested inside hole)
  // depth 3 -> hole ...
  if (loops.length > 1) {
    // 1. Build 2D projections of all loops for containment testing
    // Choose an arbitrary reference vector not collinear with loop's normal
    const loopPolys2D: [number, number][][] = [];

    // Derive projection basis from vertices of the first loop
    const firstLoop = loops[0];
    let normal: [number, number, number] = [0, 0, 1];
    if (firstLoop.vertexIds.length >= 3) {
      const p0 = mesh.vertices[firstLoop.vertexIds[0]]?.position || [0, 0, 0];
      const p1 = mesh.vertices[firstLoop.vertexIds[1]]?.position || [0, 0, 0];
      const p2 = mesh.vertices[firstLoop.vertexIds[2]]?.position || [0, 0, 0];
      const e1 = sub(p1, p0);
      const e2 = sub(p2, p0);
      const cr = cross(e1, e2);
      const len = norm(cr);
      if (len > 1e-8) {
        normal = [cr[0] / len, cr[1] / len, cr[2] / len];
      }
    }

    let refAxis: [number, number, number] = [0, 0, 1];
    if (Math.abs(normal[2]) > 0.9) {
      refAxis = [0, 1, 0];
    }
    const uAxis = normalize(cross(refAxis, normal));
    const vAxis = normalize(cross(normal, uAxis));

    for (const loop of loops) {
      const poly2D: [number, number][] = [];
      for (const vId of loop.vertexIds) {
        const p = mesh.vertices[vId]?.position || [0, 0, 0];
        poly2D.push([dot(p, uAxis), dot(p, vAxis)]);
      }
      loopPolys2D.push(poly2D);
    }

    // 2. Compute nesting depth via 2D polygon containment
    for (let j = 0; j < loops.length; j++) {
      let depth = 0;
      const polyJ = loopPolys2D[j];
      if (polyJ.length < 3) continue;

      // Sample a representative test point (average of first 3 vertices)
      const testPt: [number, number] = [
        (polyJ[0][0] + polyJ[1][0] + polyJ[2][0]) / 3,
        (polyJ[0][1] + polyJ[1][1] + polyJ[2][1]) / 3,
      ];

      for (let i = 0; i < loops.length; i++) {
        if (i === j) continue;
        const polyI = loopPolys2D[i];
        if (polyI.length < 3) continue;

        if (isPointInPolygon2D(testPt, polyI)) {
          depth++;
        }
      }

      loops[j].nestingLevel = depth;
      // Even depth (0, 2) = outer/island; Odd depth (1, 3) = hole
      loops[j].isOuter = depth % 2 === 0;
    }
  }

  return loops;
}

/**
 * Standard ray-casting test for point inside 2D polygon
 */
function isPointInPolygon2D(
  p: [number, number],
  poly: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > p[1] !== yj > p[1] &&
      p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
