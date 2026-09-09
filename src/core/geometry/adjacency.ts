/**
 * @license
 * AUME LowPoly Fabrication — Region Adjacency Graph
 * Specification Compliant: Sections 27, 58 - 60
 */

import {
  GeometryRegion,
  GeometryV2Cache,
  RegionNeighbor,
  AdjacencyClassification,
} from './types';
import { angleBetweenNormalsDeg } from './math';

export function buildRegionAdjacency(
  regions: GeometryRegion[],
  cache: GeometryV2Cache
): RegionNeighbor[] {
  // Map faceId -> regionId
  const faceToRegion = new Map<number, number>();
  const regionMap = new Map<number, GeometryRegion>();

  for (const reg of regions) {
    regionMap.set(reg.id, reg);
    for (const fId of reg.faceIds) {
      faceToRegion.set(fId, reg.id);
    }
  }

  // Key: min(regA, regB) + '_' + max(regA, regB)
  const pairMap = new Map<
    string,
    {
      regA: number;
      regB: number;
      sharedEdges: number[];
      sharedLength: number;
    }
  >();

  for (const edge of cache.edges.values()) {
    if (edge.faceIds.length !== 2) continue;

    const rA = faceToRegion.get(edge.faceIds[0]);
    const rB = faceToRegion.get(edge.faceIds[1]);

    if (rA === undefined || rB === undefined || rA === rB) continue;

    const minR = Math.min(rA, rB);
    const maxR = Math.max(rA, rB);
    const pairKey = `${minR}_${maxR}`;

    let entry = pairMap.get(pairKey);
    if (!entry) {
      entry = {
        regA: minR,
        regB: maxR,
        sharedEdges: [],
        sharedLength: 0,
      };
      pairMap.set(pairKey, entry);
    }

    entry.sharedEdges.push(edge.edgeId);
    entry.sharedLength += edge.length;
  }

  const result: RegionNeighbor[] = [];

  for (const pair of pairMap.values()) {
    const regA = regionMap.get(pair.regA);
    const regB = regionMap.get(pair.regB);
    if (!regA || !regB) continue;

    const angleDeg = angleBetweenNormalsDeg(regA.normal, regB.normal);

    let classification: AdjacencyClassification = 'FOLD';
    if (angleDeg < 0.5) {
      classification = 'COPLANAR';
    } else if (angleDeg > 165) {
      classification = 'SHARP';
    }

    const neighborEntryA: RegionNeighbor = {
      regionId: pair.regA,
      neighborRegionId: pair.regB,
      sharedEdgeIds: pair.sharedEdges,
      sharedBoundaryLength: pair.sharedLength,
      angleDeg,
      classification,
    };

    const neighborEntryB: RegionNeighbor = {
      regionId: pair.regB,
      neighborRegionId: pair.regA,
      sharedEdgeIds: pair.sharedEdges,
      sharedBoundaryLength: pair.sharedLength,
      angleDeg,
      classification,
    };

    regA.neighbors.push(neighborEntryA);
    regB.neighbors.push(neighborEntryB);

    result.push(neighborEntryA);
  }

  return result;
}
