/**
 * @license
 * AUME LowPoly Fabrication — Geometry Core V2 (Large Face Reconstruction V2)
 * Specification Compliant: Sections 8 - 20, 27 - 51, 62 - 70, 81 - 85, 89 - 95
 */

import {
  MeshInput,
  GeometryV2Cache,
  GeometryV2Params,
  GeometryRegion,
  GeometryReconstructionResult,
  DEFAULT_GEOMETRY_V2_PARAMS,
  RegionSummary,
  GeometryDiagnostics,
  CandidateRejectReason,
  RegionNeighbor,
} from './types';
import { buildGeometryV2Cache } from './cache';
import { CandidatePriorityQueue } from './priorityQueue';
import { RejectionMemory } from './rejectionMemory';
import {
  evaluateCandidate,
  computeRegionPCAPlane,
  validateRegionPlane,
  createRegionSnapshot,
  isCheckpointFaceCount,
} from './gates';
import { extractRegionBoundary } from './boundaries';
import { buildRegionAdjacency } from './adjacency';
import { makeStableRegionKey, mergeBoundingBoxes } from './math';

export function reconstructGeometryV2(
  mesh: MeshInput,
  userParams?: Partial<GeometryV2Params>
): GeometryReconstructionResult {
  const startTime = performance.now();
  const params: GeometryV2Params = {
    ...DEFAULT_GEOMETRY_V2_PARAMS,
    ...userParams,
  };

  // 1. Build Geometry Cache (precalculated once, O(F))
  const cache = buildGeometryV2Cache(mesh);

  // 2. Initialize tracking structures
  const unassignedFaces = new Set<number>(cache.stableFaceOrder);
  const rejectionMemory = new RejectionMemory();
  const priorityQueue = new CandidatePriorityQueue();

  const regions: GeometryRegion[] = [];
  const regionMap = new Map<number, GeometryRegion>();
  let nextRegionId = 1;

  const rejectionReasonCounts: Record<CandidateRejectReason, number> = {
    DISTANCE: 0,
    NORMAL: 0,
    DEGENERATE: 0,
    NOT_ADJACENT: 0,
    ALREADY_ASSIGNED: 0,
    REJECTION_MEMORY: 0,
    STALE_REGION: 0,
    FROZEN_REGION: 0,
    CHECKPOINT_FAILURE: 0,
  };

  let totalRollbacks = 0;
  let totalFrozen = 0;

  // Helper: creates a new seed region (Section 20)
  const createSeed = (seedFaceId: number): GeometryRegion => {
    const face = cache.faces.get(seedFaceId)!;
    const regionId = nextRegionId++;
    const stableKey = makeStableRegionKey(face.stableKey);

    const initialValidation = validateRegionPlane(
      [seedFaceId],
      { origin: face.centroid, normal: face.normal },
      cache,
      params
    );

    const reg: GeometryRegion = {
      id: regionId,
      stableKey,
      seedFaceId,
      faceIds: new Set<number>([seedFaceId]),
      faceKeys: new Set<string>([face.stableKey]),
      area: face.area,
      plane: { origin: face.centroid, normal: face.normal },
      normal: face.normal,
      centroid: face.centroid,
      bbox: {
        min: [...face.bbox.min],
        max: [...face.bbox.max],
      },
      boundaryEdgeIds: new Set<number>(),
      internalEdgeIds: new Set<number>(),
      boundaryLoops: [],
      neighbors: [],
      state: 'ACTIVE',
      version: 0,
      checkpoint: null,
      stats: {
        faceCount: 1,
        area: face.area,
        maxPerpDistance: 0,
        rmsPerpDistance: 0,
        maxNormalDeviationDeg: 0,
        rmsNormalDeviationDeg: 0,
        acceptedCandidates: 0,
        rejectedCandidates: 0,
        checkpointCount: 0,
        rollbackCount: 0,
      },
    };

    reg.checkpoint = createRegionSnapshot(reg, initialValidation);
    unassignedFaces.delete(seedFaceId);
    regions.push(reg);
    regionMap.set(regionId, reg);

    // Push initial neighbor candidates into the Global Priority Queue
    pushNeighborsToQueue(reg, [seedFaceId]);

    return reg;
  };

  // Helper: push candidates for newly added face(s)
  const pushNeighborsToQueue = (region: GeometryRegion, newFaceIds: number[]) => {
    if (region.state === 'FROZEN') return;

    for (const fId of newFaceIds) {
      const neighbors = cache.faceNeighbors.get(fId) || [];
      const edges = cache.faceToEdges.get(fId) || [];

      for (let i = 0; i < neighbors.length; i++) {
        const nbId = neighbors[i];
        if (!unassignedFaces.has(nbId)) continue;

        const candidateFaceKey = cache.faceKeys.get(nbId) || '';
        if (rejectionMemory.hasRejected(candidateFaceKey, region.stableKey)) {
          rejectionReasonCounts.REJECTION_MEMORY++;
          continue;
        }

        const edgeId = edges[i] ?? 0;
        const candidate = evaluateCandidate(
          nbId,
          region,
          cache,
          params,
          edgeId,
          fId
        );

        if (candidate.status === 'REJECTED') {
          rejectionMemory.rememberRejected(candidateFaceKey, region.stableKey);
          region.stats.rejectedCandidates++;
          if (candidate.reason) {
            rejectionReasonCounts[candidate.reason]++;
          }
        } else {
          priorityQueue.push(candidate);
        }
      }
    }
  };

  // Helper: select next deterministic seed face (Section 19)
  const selectNextSeedFace = (): number | null => {
    for (const faceId of cache.stableFaceOrder) {
      if (unassignedFaces.has(faceId)) {
        return faceId;
      }
    }
    return null;
  };

  // 3. Main Global Priority Queue Execution Loop (Sections 43 - 50)
  while (true) {
    // If priority queue is exhausted, pick next unassigned seed
    if (priorityQueue.isEmpty()) {
      if (unassignedFaces.size === 0) {
        break; // All faces successfully assigned or exhausted
      }

      const nextSeed = selectNextSeedFace();
      if (nextSeed === null) break;

      createSeed(nextSeed);
      continue;
    }

    const candidate = priorityQueue.pop();
    if (!candidate) continue;

    // Check if face was already claimed by another winning region in competition
    if (!unassignedFaces.has(candidate.faceId)) {
      rejectionReasonCounts.ALREADY_ASSIGNED++;
      continue;
    }

    const region = regionMap.get(candidate.regionId);
    if (!region || region.state === 'FROZEN') {
      rejectionReasonCounts.FROZEN_REGION++;
      continue;
    }

    // Version staleness check (Section 10, 47)
    // If the region's plane updated since candidate was queued, re-evaluate against updated reference plane
    if (candidate.regionVersion !== region.version) {
      rejectionReasonCounts.STALE_REGION++;
      const reEvaluated = evaluateCandidate(
        candidate.faceId,
        region,
        cache,
        params,
        candidate.sourceEdgeId,
        candidate.sourceFaceId
      );

      if (reEvaluated.status === 'REJECTED') {
        rejectionMemory.rememberRejected(candidate.faceKey, region.stableKey);
        region.stats.rejectedCandidates++;
        if (reEvaluated.reason) {
          rejectionReasonCounts[reEvaluated.reason]++;
        }
      } else {
        priorityQueue.push(reEvaluated);
      }
      continue;
    }

    // Check rejection memory
    if (rejectionMemory.hasRejected(candidate.faceKey, region.stableKey)) {
      rejectionReasonCounts.REJECTION_MEMORY++;
      continue;
    }

    // Accept candidate into region (Section 29)
    const face = cache.faces.get(candidate.faceId)!;
    region.faceIds.add(candidate.faceId);
    region.faceKeys.add(candidate.faceKey);
    unassignedFaces.delete(candidate.faceId);
    region.area += face.area;
    region.bbox = mergeBoundingBoxes(region.bbox, face.bbox);
    region.stats.faceCount = region.faceIds.size;
    region.stats.acceptedCandidates++;

    // Checkpoint Schedule: Powers of 2 (Section 13, 30, 38)
    if (isCheckpointFaceCount(region.faceIds.size, params.checkpointStart)) {
      region.stats.checkpointCount++;
      const candidatePCAPlane = computeRegionPCAPlane(region.faceIds, cache);
      const validation = validateRegionPlane(
        region.faceIds,
        candidatePCAPlane,
        cache,
        params
      );

      if (validation.valid) {
        // Success: commit new plane & snapshot (Section 16)
        region.version++;
        region.plane = candidatePCAPlane;
        region.normal = candidatePCAPlane.normal;
        region.checkpoint = createRegionSnapshot(region, validation);
        region.stats.maxPerpDistance = validation.maxPerpDistance;
        region.stats.rmsPerpDistance = validation.rmsPerpDistance;
        region.stats.maxNormalDeviationDeg = validation.maxNormalDeviationDeg;
        region.stats.rmsNormalDeviationDeg = validation.rmsNormalDeviationDeg;
      } else {
        // Failure: Rollback to last valid snapshot & Freeze region! (Section 16, 39, 40)
        rejectionReasonCounts.CHECKPOINT_FAILURE++;
        totalRollbacks++;
        region.stats.rollbackCount++;

        const snapshot = region.checkpoint;
        if (snapshot) {
          const snapshotFaceSet = new Set(snapshot.faceIds);
          for (const fId of region.faceIds) {
            if (!snapshotFaceSet.has(fId)) {
              // Return rolled back faces to global unassigned pool
              region.faceIds.delete(fId);
              const fKey = cache.faceKeys.get(fId) || '';
              region.faceKeys.delete(fKey);
              unassignedFaces.add(fId);
              // Store in rejection memory so this face doesn't attempt this region again
              rejectionMemory.rememberRejected(fKey, region.stableKey);
            }
          }

          region.area = snapshot.cumulativeArea;
          region.plane = snapshot.plane;
          region.normal = snapshot.plane.normal;
          region.centroid = snapshot.centroid;
          region.bbox = snapshot.bbox;
          region.stats.faceCount = region.faceIds.size;
        }

        region.state = 'FROZEN';
        totalFrozen++;
        continue;
      }
    }

    // Discover new neighbor candidates for the accepted face
    pushNeighborsToQueue(region, [candidate.faceId]);
  }

  // 4. Finalize Regions (Section 20, 21, 51)
  const faceRegionMap = new Map<number, number>();
  let totalReconstructedArea = 0;
  let maxRegionDeviation = 0;
  let singletons = 0;

  for (const reg of regions) {
    if (reg.faceIds.size === 1) singletons++;

    // Compute final PCA plane for verified region
    const finalPlane = computeRegionPCAPlane(reg.faceIds, cache);
    const finalValidation = validateRegionPlane(
      reg.faceIds,
      finalPlane,
      cache,
      params
    );

    if (finalValidation.valid) {
      reg.plane = finalPlane;
      reg.normal = finalPlane.normal;
      reg.centroid = finalPlane.origin;
      reg.stats.maxPerpDistance = finalValidation.maxPerpDistance;
      reg.stats.rmsPerpDistance = finalValidation.rmsPerpDistance;
      reg.stats.maxNormalDeviationDeg = finalValidation.maxNormalDeviationDeg;
      reg.stats.rmsNormalDeviationDeg = finalValidation.rmsNormalDeviationDeg;
    }

    if (reg.stats.maxPerpDistance > maxRegionDeviation) {
      maxRegionDeviation = reg.stats.maxPerpDistance;
    }

    // Extract boundary loops & classify internal triangulation
    const { boundaryLoops, boundaryEdges } = extractRegionBoundary(
      reg,
      mesh,
      cache
    );
    reg.boundaryLoops = boundaryLoops;

    reg.state = 'FINALIZED';
    totalReconstructedArea += reg.area;

    for (const fId of reg.faceIds) {
      faceRegionMap.set(fId, reg.id);
    }
  }

  // 5. Build Inter-Region Adjacency (Section 27, 58 - 60)
  const adjacencies = buildRegionAdjacency(regions, cache);

  // 6. Diagnostics & Telemetry (Section 64, 65, 66)
  const endTime = performance.now();
  const elapsedMs = endTime - startTime;

  let totalMeshArea = 0;
  for (const f of cache.faces.values()) {
    totalMeshArea += f.area;
  }

  // Face count histogram
  const faceCounts = regions.map((r) => r.faceIds.size);
  const maxFacesInRegion = Math.max(...faceCounts, 1);
  const histogramBins = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];
  const regionFaceHistogram = histogramBins.map(
    (bin, idx) =>
      faceCounts.filter((c) => {
        const nextBin = histogramBins[idx + 1] ?? Infinity;
        return c >= bin && c < nextBin;
      }).length
  );

  // Largest regions summary
  const sortedByArea = [...regions].sort((a, b) => b.area - a.area);
  const largestRegions: RegionSummary[] = sortedByArea.slice(0, 10).map((r) => ({
    regionId: r.id,
    stableKey: r.stableKey,
    faceCount: r.faceIds.size,
    area: r.area,
    boundaryLength: r.boundaryLoops.reduce((acc, loop) => acc + loop.perimeter, 0),
    maxPerpDistance: r.stats.maxPerpDistance,
    maxNormalDeviationDeg: r.stats.maxNormalDeviationDeg,
  }));

  // Deterministic signature hash (Section 66)
  const hashSource = regions
    .map((r) => `${r.stableKey}_f${r.faceIds.size}_a${Math.round(r.area * 1000)}`)
    .sort()
    .join(';');
  let hashVal = 5381;
  for (let i = 0; i < hashSource.length; i++) {
    hashVal = (hashVal * 33) ^ hashSource.charCodeAt(i);
  }
  const deterministicHash = `H:${(hashVal >>> 0).toString(16)}`;

  const diagnostics: GeometryDiagnostics = {
    inputFaceCount: mesh.faces.length,
    inputVertexCount: mesh.vertices.length,
    outputRegionCount: regions.length,
    singletonRegionCount: singletons,
    regionFaceHistogram,
    largestRegions,
    totalArea: totalMeshArea,
    reconstructedArea: totalReconstructedArea,
    unresolvedFaceCount: unassignedFaces.size,
    rejectedCandidateCount: rejectionMemory.size(),
    rollbackCount: totalRollbacks,
    frozenRegionCount: totalFrozen,
    maxRegionDeviation,
    elapsedMs,
    deterministicHash,
    rejectionReasonCounts,
  };

  return {
    version: 'GeometryV2',
    regions,
    adjacency: adjacencies,
    adjacencyGraph: {
      nodes: regions.map((r) => r.id),
      adjacencies,
    },
    faceRegionMap,
    diagnostics,
    elapsedMs,
  };
}
