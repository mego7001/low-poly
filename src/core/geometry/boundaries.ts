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
import { norm, sub } from './math';

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

  // Classify largest perimeter loop as outer loop, others as holes (Section 56)
  if (loops.length > 1) {
    let maxPerimeter = -1;
    let outerIdx = 0;
    for (let i = 0; i < loops.length; i++) {
      if (loops[i].perimeter > maxPerimeter) {
        maxPerimeter = loops[i].perimeter;
        outerIdx = i;
      }
    }
    for (let i = 0; i < loops.length; i++) {
      loops[i].isOuter = i === outerIdx;
      loops[i].nestingLevel = i === outerIdx ? 0 : 1;
    }
  }

  return loops;
}
