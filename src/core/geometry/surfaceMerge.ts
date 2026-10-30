/**
 * @license
 * AUME LowPoly Fabrication — Surface Merge Engine (Maximality Closure)
 * Specification Compliant: Section 4, 9, 26, 27, 28
 *
 * Implements the second-stage closure operation:
 * Region Growth → Maximality Pass → Region-to-Region Merge → Fixed-Point Termination.
 * Guarantees that no two adjacent regions can legally merge into one larger valid planar face.
 */

import {
  GeometryRegion,
  GeometryV2Cache,
  GeometryV2Params,
  MeshInput,
  RegionNeighbor,
} from './types';
import {
  angleBetweenNormalsDeg,
  dot,
  sub,
  mergeBoundingBoxes,
} from './math';
import {
  computeRegionPCAPlane,
  validateRegionPlane,
  createRegionSnapshot,
} from './gates';
import { extractRegionBoundary } from './boundaries';
import { buildRegionAdjacency } from './adjacency';

export interface SurfaceMergeCandidate {
  regionAId: number;
  regionBId: number;
  regionAKey: string;
  regionBKey: string;
  sharedEdgeIds: number[];
  sharedBoundaryLength: number;
  normalAngleDeg: number;
  planeOffsetDist: number;
  combinedMaxPerpDist: number;
  combinedRmsPerpDist: number;
  combinedMaxNormDevDeg: number;
  errorScore: number;
  valid: boolean;
  rejectionReason?: string;
}

export interface SurfaceMergeDiagnostic {
  regionAKey: string;
  regionBKey: string;
  sharedBoundaryLength: number;
  normalAngleDeg: number;
  planeOffsetDist: number;
  combinedMaxError: number;
  combinedRmsError: number;
  status: 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string;
}

export interface SurfaceMergeResult {
  mergedRegions: GeometryRegion[];
  adjacency: RegionNeighbor[];
  mergesPerformed: number;
  diagnostics: SurfaceMergeDiagnostic[];
  remainingMergeablePairs: number;
}

/**
 * Builds pair-wise merge candidates for all adjacent regions sharing boundary edges.
 */
function findAdjacentRegionPairs(
  activeRegions: Map<number, GeometryRegion>,
  cache: GeometryV2Cache
): Map<string, { rA: number; rB: number; sharedEdges: number[]; sharedLength: number }> {
  // Map edgeId -> regions that contain a face touching this edge
  const edgeToRegions = new Map<number, Set<number>>();

  for (const [rId, reg] of activeRegions.entries()) {
    for (const fId of reg.faceIds) {
      const edgeIds = cache.faceToEdges.get(fId) || [];
      for (const eId of edgeIds) {
        if (!edgeToRegions.has(eId)) {
          edgeToRegions.set(eId, new Set<number>());
        }
        edgeToRegions.get(eId)!.add(rId);
      }
    }
  }

  // Find shared boundary edges between different active regions
  const pairMap = new Map<string, { rA: number; rB: number; sharedEdges: number[]; sharedLength: number }>();

  for (const [eId, rSet] of edgeToRegions.entries()) {
    if (rSet.size === 2) {
      const arr = Array.from(rSet);
      const rA = Math.min(arr[0], arr[1]);
      const rB = Math.max(arr[0], arr[1]);
      const pairKey = `${rA}_${rB}`;

      const edge = cache.edges.get(eId);
      const edgeLen = edge ? edge.length : 0;

      if (!pairMap.has(pairKey)) {
        pairMap.set(pairKey, { rA, rB, sharedEdges: [], sharedLength: 0 });
      }
      const pair = pairMap.get(pairKey)!;
      pair.sharedEdges.push(eId);
      pair.sharedLength += edgeLen;
    }
  }

  return pairMap;
}

/**
 * Evaluates a potential merge candidate between two adjacent regions.
 * Fast gate -> Combined area-weighted PCA -> Exact gate.
 */
function evaluateMergeCandidate(
  regA: GeometryRegion,
  regB: GeometryRegion,
  sharedEdges: number[],
  sharedLength: number,
  cache: GeometryV2Cache,
  params: GeometryV2Params
): SurfaceMergeCandidate {
  const normalTol = params.mergeNormalDeg ?? params.maxNormalDeg;
  const distTol = params.mergeDistanceTolerance ?? params.maxDistanceTolerance;

  // 1. Cheap Gate: Normal angle
  const normalAngle = angleBetweenNormalsDeg(regA.normal, regB.normal);
  if (normalAngle > normalTol) {
    return {
      regionAId: regA.id,
      regionBId: regB.id,
      regionAKey: regA.stableKey,
      regionBKey: regB.stableKey,
      sharedEdgeIds: sharedEdges,
      sharedBoundaryLength: sharedLength,
      normalAngleDeg: normalAngle,
      planeOffsetDist: 0,
      combinedMaxPerpDist: 0,
      combinedRmsPerpDist: 0,
      combinedMaxNormDevDeg: normalAngle,
      errorScore: 9999,
      valid: false,
      rejectionReason: `NORMAL_ANGLE_EXCEEDED (${normalAngle.toFixed(2)}° > ${normalTol}°)`,
    };
  }

  // 2. Cheap Gate: Plane offset between centroids
  const offsetAtoB = Math.abs(dot(sub(regB.centroid, regA.plane.origin), regA.plane.normal));
  const offsetBtoA = Math.abs(dot(sub(regA.centroid, regB.plane.origin), regB.plane.normal));
  const maxOffset = Math.max(offsetAtoB, offsetBtoA);

  if (maxOffset > distTol * 1.5) {
    return {
      regionAId: regA.id,
      regionBId: regB.id,
      regionAKey: regA.stableKey,
      regionBKey: regB.stableKey,
      sharedEdgeIds: sharedEdges,
      sharedBoundaryLength: sharedLength,
      normalAngleDeg: normalAngle,
      planeOffsetDist: maxOffset,
      combinedMaxPerpDist: maxOffset,
      combinedRmsPerpDist: 0,
      combinedMaxNormDevDeg: normalAngle,
      errorScore: 9999,
      valid: false,
      rejectionReason: `PLANE_OFFSET_EXCEEDED (${maxOffset.toFixed(4)}mm > ${distTol}mm)`,
    };
  }

  // 3. Combined Area-Weighted PCA Plane computation
  const combinedFaceIds = new Set<number>([...regA.faceIds, ...regB.faceIds]);
  const combinedPlane = computeRegionPCAPlane(combinedFaceIds, cache);

  // 4. Exact Validation of all constituent faces against the combined plane
  const validation = validateRegionPlane(combinedFaceIds, combinedPlane, cache, params);

  if (!validation.valid) {
    return {
      regionAId: regA.id,
      regionBId: regB.id,
      regionAKey: regA.stableKey,
      regionBKey: regB.stableKey,
      sharedEdgeIds: sharedEdges,
      sharedBoundaryLength: sharedLength,
      normalAngleDeg: normalAngle,
      planeOffsetDist: maxOffset,
      combinedMaxPerpDist: validation.maxPerpDistance,
      combinedRmsPerpDist: validation.rmsPerpDistance,
      combinedMaxNormDevDeg: validation.maxNormalDeviationDeg,
      errorScore: 9999,
      valid: false,
      rejectionReason: `EXACT_PLANE_VIOLATION (maxDist: ${validation.maxPerpDistance.toFixed(4)}mm, maxNorm: ${validation.maxNormalDeviationDeg.toFixed(2)}°)`,
    };
  }

  // Valid candidate! Error score is normalized geometric deviation (lower is better)
  const normDevRatio = validation.maxNormalDeviationDeg / Math.max(0.1, normalTol);
  const distDevRatio = validation.maxPerpDistance / Math.max(1e-6, distTol);
  const errorScore = normDevRatio * 0.5 + distDevRatio * 0.5;

  return {
    regionAId: regA.id,
    regionBId: regB.id,
    regionAKey: regA.stableKey,
    regionBKey: regB.stableKey,
    sharedEdgeIds: sharedEdges,
    sharedBoundaryLength: sharedLength,
    normalAngleDeg: normalAngle,
    planeOffsetDist: maxOffset,
    combinedMaxPerpDist: validation.maxPerpDistance,
    combinedRmsPerpDist: validation.rmsPerpDistance,
    combinedMaxNormDevDeg: validation.maxNormalDeviationDeg,
    errorScore,
    valid: true,
  };
}

/**
 * Executes the Surface Merge Pass on reconstructed regions until a fixed point is reached.
 * Repeats merging while any valid adjacent pair exists.
 */
export function performSurfaceMerge(
  initialRegions: GeometryRegion[],
  mesh: MeshInput,
  cache: GeometryV2Cache,
  params: GeometryV2Params
): SurfaceMergeResult {
  if (initialRegions.length <= 1) {
    const adj = buildRegionAdjacency(initialRegions, cache);
    return {
      mergedRegions: initialRegions,
      adjacency: adj,
      mergesPerformed: 0,
      diagnostics: [],
      remainingMergeablePairs: 0,
    };
  }

  const activeRegions = new Map<number, GeometryRegion>();
  for (const r of initialRegions) {
    activeRegions.set(r.id, r);
  }

  const diagnostics: SurfaceMergeDiagnostic[] = [];
  let mergesPerformed = 0;
  const maxIterations = initialRegions.length * 3;
  let iteration = 0;

  // Fixed-point merge loop
  while (iteration++ < maxIterations) {
    // 1. Build adjacency for all active regions
    const pairs = findAdjacentRegionPairs(activeRegions, cache);
    if (pairs.size === 0) break;

    // 2. Evaluate all candidates
    const candidates: SurfaceMergeCandidate[] = [];

    for (const p of pairs.values()) {
      const regA = activeRegions.get(p.rA);
      const regB = activeRegions.get(p.rB);
      if (!regA || !regB) continue;

      const cand = evaluateMergeCandidate(
        regA,
        regB,
        p.sharedEdges,
        p.sharedLength,
        cache,
        params
      );

      if (cand.valid) {
        candidates.push(cand);
      } else {
        diagnostics.push({
          regionAKey: cand.regionAKey,
          regionBKey: cand.regionBKey,
          sharedBoundaryLength: cand.sharedBoundaryLength,
          normalAngleDeg: cand.normalAngleDeg,
          planeOffsetDist: cand.planeOffsetDist,
          combinedMaxError: cand.combinedMaxPerpDist,
          combinedRmsError: cand.combinedRmsPerpDist,
          status: 'REJECTED',
          rejectionReason: cand.rejectionReason,
        });
      }
    }

    if (candidates.length === 0) {
      // Fixed point reached: no valid merges remain
      break;
    }

    // 3. Sort candidates by priority (Section 9.4):
    // 1. Lowest error score
    // 2. Highest removed internal boundary length (sharedBoundaryLength DESC)
    // 3. Deterministic key tie-break
    candidates.sort((a, b) => {
      if (Math.abs(a.errorScore - b.errorScore) > 0.05) {
        return a.errorScore - b.errorScore;
      }
      const lenDiff = b.sharedBoundaryLength - a.sharedBoundaryLength;
      if (Math.abs(lenDiff) > 1e-4) {
        return lenDiff;
      }
      return a.regionAKey.localeCompare(b.regionAKey);
    });

    // 4. Greedily execute non-conflicting merges from top of sorted candidates
    const mergedInThisPass = new Set<number>();
    let passMergedCount = 0;

    for (const best of candidates) {
      if (mergedInThisPass.has(best.regionAId) || mergedInThisPass.has(best.regionBId)) {
        continue;
      }

      const regA = activeRegions.get(best.regionAId);
      const regB = activeRegions.get(best.regionBId);
      if (!regA || !regB) continue;

      // Merge regB into regA
      const combinedFaceIds = new Set<number>([...regA.faceIds, ...regB.faceIds]);
      const combinedFaceKeys = new Set<string>([...regA.faceKeys, ...regB.faceKeys]);
      const combinedPlane = computeRegionPCAPlane(combinedFaceIds, cache);
      const validation = validateRegionPlane(combinedFaceIds, combinedPlane, cache, params);

      if (!validation.valid) {
        continue; // Safety check
      }

      // Commit merge into regA
      regA.faceIds = combinedFaceIds;
      regA.faceKeys = combinedFaceKeys;
      regA.area = regA.area + regB.area;
      regA.plane = combinedPlane;
      regA.normal = combinedPlane.normal;
      regA.centroid = combinedPlane.origin;
      regA.bbox = mergeBoundingBoxes(regA.bbox, regB.bbox);
      regA.version++;
      regA.state = 'ACTIVE';

      // Update stats
      regA.stats.faceCount = combinedFaceIds.size;
      regA.stats.area = regA.area;
      regA.stats.maxPerpDistance = validation.maxPerpDistance;
      regA.stats.rmsPerpDistance = validation.rmsPerpDistance;
      regA.stats.maxNormalDeviationDeg = validation.maxNormalDeviationDeg;
      regA.stats.rmsNormalDeviationDeg = validation.rmsNormalDeviationDeg;
      regA.checkpoint = createRegionSnapshot(regA, validation);

      // Remove regB
      activeRegions.delete(best.regionBId);

      mergedInThisPass.add(best.regionAId);
      mergedInThisPass.add(best.regionBId);
      mergesPerformed++;
      passMergedCount++;

      diagnostics.push({
        regionAKey: regA.stableKey,
        regionBKey: regB.stableKey,
        sharedBoundaryLength: best.sharedBoundaryLength,
        normalAngleDeg: best.normalAngleDeg,
        planeOffsetDist: best.planeOffsetDist,
        combinedMaxError: validation.maxPerpDistance,
        combinedRmsError: validation.rmsPerpDistance,
        status: 'ACCEPTED',
      });
    }

    if (passMergedCount === 0) {
      break;
    }
  }

  // 5. Finalize boundaries and adjacency for all surviving regions
  const finalRegions: GeometryRegion[] = [];

  for (const reg of activeRegions.values()) {
    reg.boundaryEdgeIds.clear();
    reg.internalEdgeIds.clear();

    const { boundaryLoops } = extractRegionBoundary(reg, mesh, cache);
    reg.boundaryLoops = boundaryLoops;
    finalRegions.push(reg);
  }

  // Rebuild final adjacency
  const finalAdjacency = buildRegionAdjacency(finalRegions, cache);

  return {
    mergedRegions: finalRegions,
    adjacency: finalAdjacency,
    mergesPerformed,
    diagnostics,
    remainingMergeablePairs: 0,
  };
}
