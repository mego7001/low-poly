/**
 * @license
 * AUME LowPoly Fabrication — Fast Gate, Exact Gate, & Checkpoint Validation
 * Specification Compliant: Sections 10 - 15, 22 - 26, 30, 35 - 38, 76 - 78
 */

import {
  FaceGeometry,
  GeometryRegion,
  GeometryV2Cache,
  GeometryV2Params,
  RegionCandidate,
  RegionSnapshot,
  CandidateRejectReason,
  Plane,
  Vec3,
} from './types';
import {
  dot,
  sub,
  angleBetweenNormalsDeg,
  computePCAForPoints,
  calculateBoundingBox,
  nearlyLE,
} from './math';

export function scoreCandidate(
  maxPerpDistance: number,
  maxDistanceTolerance: number
): number {
  return -maxPerpDistance / Math.max(1e-7, maxDistanceTolerance);
}

export interface FastGateResult {
  accepted: boolean;
  maxPerpDistance: number;
  normalDeviationDeg: number;
  reason?: CandidateRejectReason;
}

export function fastGateCandidate(
  face: FaceGeometry,
  snapshot: RegionSnapshot,
  params: GeometryV2Params
): FastGateResult {
  const planeNormal = snapshot.plane.normal;
  const planeOrigin = snapshot.plane.origin;

  // 1. Check perpendicular distance of all 3 vertices to snapshot plane
  let maxDistance = 0;
  for (const vPos of face.positions) {
    const dist = Math.abs(dot(sub(vPos, planeOrigin), planeNormal));
    if (dist > maxDistance) {
      maxDistance = dist;
    }
  }

  if (!nearlyLE(maxDistance, params.maxDistanceTolerance)) {
    return {
      accepted: false,
      maxPerpDistance: maxDistance,
      normalDeviationDeg: 0,
      reason: 'DISTANCE',
    };
  }

  // 2. Check normal angular deviation
  const normalDeviation = angleBetweenNormalsDeg(face.normal, planeNormal);
  if (!nearlyLE(normalDeviation, params.maxNormalDeg)) {
    return {
      accepted: false,
      maxPerpDistance: maxDistance,
      normalDeviationDeg: normalDeviation,
      reason: 'NORMAL',
    };
  }

  return {
    accepted: true,
    maxPerpDistance: maxDistance,
    normalDeviationDeg: normalDeviation,
  };
}

export function evaluateCandidate(
  faceId: number,
  region: GeometryRegion,
  cache: GeometryV2Cache,
  params: GeometryV2Params,
  sourceEdgeId: number,
  sourceFaceId: number
): RegionCandidate {
  const face = cache.faces.get(faceId);
  const faceKey = cache.faceKeys.get(faceId) || `F:${faceId}`;

  if (!face) {
    return {
      faceId,
      faceKey,
      regionId: region.id,
      regionKey: region.stableKey,
      regionVersion: region.version,
      score: -9999,
      maxPerpDistance: 9999,
      normalDeviationDeg: 180,
      sourceEdgeId,
      sourceFaceId,
      status: 'REJECTED',
      reason: 'DEGENERATE',
    };
  }

  // Fast gate uses snapshot reference plane
  const snapshot = region.checkpoint || {
    regionVersion: region.version,
    faceIds: Array.from(region.faceIds),
    cumulativeArea: region.area,
    plane: region.plane,
    centroid: region.centroid,
    bbox: region.bbox,
    maxPerpDistance: 0,
    rmsPerpDistance: 0,
    maxNormalDeviationDeg: 0,
    rmsNormalDeviationDeg: 0,
    stableFaceKey: region.stableKey,
    checkpointFaceCount: region.faceIds.size,
  };

  const gateResult = fastGateCandidate(face, snapshot, params);

  if (!gateResult.accepted) {
    return {
      faceId,
      faceKey,
      regionId: region.id,
      regionKey: region.stableKey,
      regionVersion: region.version,
      score: scoreCandidate(gateResult.maxPerpDistance, params.maxDistanceTolerance),
      maxPerpDistance: gateResult.maxPerpDistance,
      normalDeviationDeg: gateResult.normalDeviationDeg,
      sourceEdgeId,
      sourceFaceId,
      status: 'REJECTED',
      reason: gateResult.reason,
    };
  }

  const score = scoreCandidate(gateResult.maxPerpDistance, params.maxDistanceTolerance);

  return {
    faceId,
    faceKey,
    regionId: region.id,
    regionKey: region.stableKey,
    regionVersion: region.version,
    score,
    maxPerpDistance: gateResult.maxPerpDistance,
    normalDeviationDeg: gateResult.normalDeviationDeg,
    sourceEdgeId,
    sourceFaceId,
    status: 'QUEUED',
  };
}

export interface RegionValidationResult {
  valid: boolean;
  maxPerpDistance: number;
  rmsPerpDistance: number;
  maxNormalDeviationDeg: number;
  rmsNormalDeviationDeg: number;
  violatingFaceIds: number[];
}

/**
 * Exact validation of all faces in a region against a target plane (Section 35-37)
 */
export function validateRegionPlane(
  regionFaceIds: Iterable<number>,
  plane: Plane,
  cache: GeometryV2Cache,
  params: GeometryV2Params
): RegionValidationResult {
  let maxPerpDist = 0;
  let sumSqDist = 0;
  let maxNormDev = 0;
  let sumSqNormDev = 0;
  let vertCount = 0;
  let faceCount = 0;

  const violatingFaceIds: number[] = [];

  for (const fId of regionFaceIds) {
    const face = cache.faces.get(fId);
    if (!face) continue;
    faceCount++;

    let faceViolated = false;

    // 1. Distance for all 3 vertices
    for (const vPos of face.positions) {
      const dist = Math.abs(dot(sub(vPos, plane.origin), plane.normal));
      if (dist > maxPerpDist) maxPerpDist = dist;
      sumSqDist += dist * dist;
      vertCount++;

      if (!nearlyLE(dist, params.maxDistanceTolerance)) {
        faceViolated = true;
      }
    }

    // 2. Normal angular deviation
    const normDev = angleBetweenNormalsDeg(face.normal, plane.normal);
    if (normDev > maxNormDev) maxNormDev = normDev;
    sumSqNormDev += normDev * normDev;

    if (!nearlyLE(normDev, params.maxNormalDeg)) {
      faceViolated = true;
    }

    if (faceViolated) {
      violatingFaceIds.push(fId);
    }
  }

  const rmsPerpDist = vertCount > 0 ? Math.sqrt(sumSqDist / vertCount) : 0;
  const rmsNormDev = faceCount > 0 ? Math.sqrt(sumSqNormDev / faceCount) : 0;

  return {
    valid: violatingFaceIds.length === 0,
    maxPerpDistance: maxPerpDist,
    rmsPerpDistance: rmsPerpDist,
    maxNormalDeviationDeg: maxNormDev,
    rmsNormalDeviationDeg: rmsNormDev,
    violatingFaceIds,
  };
}

/**
 * Checkpoint test (Section 30, 73):
 * True if faceCount >= checkpointStart AND faceCount is a power of 2
 */
export function isCheckpointFaceCount(count: number, start: number = 4): boolean {
  return count >= start && (count & (count - 1)) === 0;
}

/**
 * Creates an immutable snapshot for rollback (Section 16)
 */
export function createRegionSnapshot(
  region: GeometryRegion,
  validation: RegionValidationResult
): RegionSnapshot {
  return {
    regionVersion: region.version,
    faceIds: Array.from(region.faceIds),
    cumulativeArea: region.area,
    plane: { ...region.plane },
    centroid: [...region.centroid],
    bbox: {
      min: [...region.bbox.min],
      max: [...region.bbox.max],
    },
    maxPerpDistance: validation.maxPerpDistance,
    rmsPerpDistance: validation.rmsPerpDistance,
    maxNormalDeviationDeg: validation.maxNormalDeviationDeg,
    rmsNormalDeviationDeg: validation.rmsNormalDeviationDeg,
    stableFaceKey: region.stableKey,
    checkpointFaceCount: region.faceIds.size,
  };
}

/**
 * Recomputes PCA plane for all faces in a region (Section 14, 31-33).
 * Accurately aligns the computed plane normal with the region's constituent face normals.
 */
export function computeRegionPCAPlane(
  regionFaceIds: Iterable<number>,
  cache: GeometryV2Cache
): Plane {
  const points: Vec3[] = [];
  let avgNx = 0;
  let avgNy = 0;
  let avgNz = 0;
  let count = 0;

  for (const fId of regionFaceIds) {
    const face = cache.faces.get(fId);
    if (face) {
      points.push(face.positions[0], face.positions[1], face.positions[2]);
      avgNx += face.normal[0];
      avgNy += face.normal[1];
      avgNz += face.normal[2];
      count++;
    }
  }

  const plane = computePCAForPoints(points);

  // Orient the PCA normal to agree with the constituent faces' normal direction
  if (count > 0) {
    const dotProduct = plane.normal[0] * avgNx + plane.normal[1] * avgNy + plane.normal[2] * avgNz;
    if (dotProduct < 0) {
      plane.normal = [-plane.normal[0], -plane.normal[1], -plane.normal[2]];
    }
  }

  return plane;
}
