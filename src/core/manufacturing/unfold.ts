/**
 * @license
 * AUME LowPoly Fabrication — Incremental Unfolding & Overlap Prevention Engine
 * Specification Compliant: Sections 28 - 37, 44, 47, 48, 70, 71
 */

import { GeometryReconstructionResult, Vec2 } from '../geometry/types';
import {
  ManufacturingSettings,
  SmartPanel,
  UnfoldResult,
  UnfoldComponent,
  BendEdgeInfo,
  SeamCandidate,
  BendWarningState,
} from './types';
import { generateAssemblyTabs } from './tabs';

/**
 * Computes bend allowance using standard sheet metal formula:
 * BA = 2 * PI * (bendAngle / 360) * (R + K * T)
 */
export function computeBendAllowance(
  angleDeg: number,
  radius: number,
  thickness: number,
  kFactor: number
): number {
  const bendAngleRad = (angleDeg * Math.PI) / 180;
  return bendAngleRad * (radius + kFactor * thickness);
}

/**
 * Evaluates Bend QA (Section 44)
 */
export function evaluateBendQA(
  angleDeg: number,
  length: number,
  radius: number,
  thickness: number,
  maxBendAngle: number
): BendWarningState {
  if (angleDeg > maxBendAngle || angleDeg < 15) {
    return 'SEVERE_BEND';
  }
  if (radius < thickness * 0.8) {
    return 'TINY_RADIUS';
  }
  if (length < thickness * 2.5) {
    return 'SHORT_FLANGE';
  }
  return 'OK';
}

/**
 * 2D segment length
 */
function dist2D(p1: Vec2, p2: Vec2): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Cross product of 2D vectors (p2 - p1) x (p3 - p1)
 */
function ccw2D(p1: Vec2, p2: Vec2, p3: Vec2): number {
  return (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);
}

/**
 * Checks if two 2D line segments (a1, a2) and (b1, b2) strictly intersect in their interiors
 */
function segmentsProperlyIntersect(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2,
  eps: number = 1e-4
): boolean {
  // Check if endpoints coincide
  const d_a1_b1 = dist2D(a1, b1);
  const d_a1_b2 = dist2D(a1, b2);
  const d_a2_b1 = dist2D(a2, b1);
  const d_a2_b2 = dist2D(a2, b2);
  if (d_a1_b1 < eps || d_a1_b2 < eps || d_a2_b1 < eps || d_a2_b2 < eps) {
    return false; // Sharing an endpoint is allowed at vertices
  }

  const cp1 = ccw2D(a1, a2, b1);
  const cp2 = ccw2D(a1, a2, b2);
  const cp3 = ccw2D(b1, b2, a1);
  const cp4 = ccw2D(b1, b2, a2);

  return (
    ((cp1 > eps && cp2 < -eps) || (cp1 < -eps && cp2 > eps)) &&
    ((cp3 > eps && cp4 < -eps) || (cp3 < -eps && cp4 > eps))
  );
}

/**
 * Determines whether a test point is strictly inside a 2D polygon using ray casting
 */
function isPointStrictlyInsidePolygon(point: Vec2, poly: Vec2[], eps: number = 1e-4): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];

    // Distance to edge
    const edgeLen = dist2D(poly[i], poly[j]);
    if (edgeLen > eps) {
      const distToEdge =
        Math.abs((xj - xi) * (point[1] - yi) - (point[0] - xi) * (yj - yi)) / edgeLen;
      if (distToEdge < eps) {
        // Point is on boundary
        return false;
      }
    }

    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes polygon centroid
 */
function getPolygonCentroid2D(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return [0, 0];
  let cx = 0, cy = 0;
  for (const pt of poly) {
    cx += pt[0];
    cy += pt[1];
  }
  return [cx / poly.length, cy / poly.length];
}

/**
 * Fast 2D bounding box
 */
function getPolygonAABB(poly: Vec2[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Checks if two 2D polygons overlap / self-intersect in the plane
 */
function check2DPolygonsOverlap(
  polyA: Vec2[],
  polyB: Vec2[],
  sharedEdgeA?: [Vec2, Vec2]
): boolean {
  const bbA = getPolygonAABB(polyA);
  const bbB = getPolygonAABB(polyB);

  // AABB disjoint test (with small tolerance)
  if (
    bbA.maxX < bbB.minX + 0.1 ||
    bbB.maxX < bbA.minX + 0.1 ||
    bbA.maxY < bbB.minY + 0.1 ||
    bbB.maxY < bbA.minY + 0.1
  ) {
    return false;
  }

  // 1. Check all edge-edge intersections
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];

      if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
        return true; // Overlap detected via edge crossing!
      }
    }
  }

  // 2. Check if centroid of one is inside the other
  const centA = getPolygonCentroid2D(polyA);
  if (isPointStrictlyInsidePolygon(centA, polyB)) {
    return true;
  }
  const centB = getPolygonCentroid2D(polyB);
  if (isPointStrictlyInsidePolygon(centB, polyA)) {
    return true;
  }

  return false;
}

/**
 * Transforms local 2D polygon of child panel so that its edge (Q1 -> Q2)
 * coincides with parent edge (P1 -> P2) in opposite direction (P2 -> P1)
 */
function transformChildPolygonAcrossHinge(
  childLocalVerts: Vec2[],
  parentP1: Vec2,
  parentP2: Vec2,
  childQ1: Vec2,
  childQ2: Vec2
): Vec2[] {
  // Parent target vector: from P2 to P1
  const vPx = parentP1[0] - parentP2[0];
  const vPy = parentP1[1] - parentP2[1];
  const angleParent = Math.atan2(vPy, vPx);

  // Child source vector: from Q1 to Q2
  const vQx = childQ2[0] - childQ1[0];
  const vQy = childQ2[1] - childQ1[1];
  const angleChild = Math.atan2(vQy, vQx);

  const rot = angleParent - angleChild;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  // Rotate around childQ1 and translate to parentP2
  return childLocalVerts.map(([x, y]) => {
    const dx = x - childQ1[0];
    const dy = y - childQ1[1];
    const rx = dx * cosR - dy * sinR;
    const ry = dx * sinR + dy * cosR;
    return [rx + parentP2[0], ry + parentP2[1]] as Vec2;
  });
}

/**
 * Finds edge on polygon that best matches the expected length
 */
function findMatchingEdge(
  poly: Vec2[],
  targetLength: number
): { index: number; p1: Vec2; p2: Vec2; diff: number } {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    const len = dist2D(p1, p2);
    const diff = Math.abs(len - targetLength);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return {
    index: bestIdx,
    p1: poly[bestIdx],
    p2: poly[(bestIdx + 1) % poly.length],
    diff: bestDiff,
  };
}

/**
 * Runs Incremental Unfold Pipeline with 2D Collision Prevention (Sections 34 - 37)
 */
export function performIncrementalUnfold(
  panels: SmartPanel[],
  reconstruction: GeometryReconstructionResult,
  settings: ManufacturingSettings
): UnfoldResult {
  const panelMap = new Map<number, SmartPanel>();
  const panelById = new Map<string, SmartPanel>();
  panels.forEach((p) => {
    panelMap.set(p.regionId, p);
    panelById.set(p.id, p);
  });

  const candidateBends: BendEdgeInfo[] = [];
  const allSeams: SeamCandidate[] = [];
  let overlapAvoidanceCount = 0;

  // 1. Initial Classification of Adjacencies into Bends vs Initial Seams
  for (const adj of reconstruction.adjacency) {
    const pA = panelMap.get(adj.regionId);
    const pB = panelMap.get(adj.neighborRegionId);
    if (!pA || !pB) continue;

    // Avoid duplicate directional edges
    if (pA.regionId > pB.regionId) continue;

    const angleDeg = adj.angleDeg;
    const length = adj.sharedBoundaryLength;

    const isFeasibleBend =
      angleDeg >= 3 &&
      angleDeg <= settings.maxBendAngle &&
      length >= settings.materialThickness * 2;

    const warningState = evaluateBendQA(
      angleDeg,
      length,
      settings.bendRadius,
      settings.materialThickness,
      settings.maxBendAngle
    );

    const allowance = computeBendAllowance(
      angleDeg,
      settings.bendRadius,
      settings.materialThickness,
      settings.kFactor
    );

    if (isFeasibleBend && warningState !== 'SEVERE_BEND') {
      candidateBends.push({
        edgeId: adj.sharedEdgeIds[0] ?? 0,
        regionA: pA.regionId,
        regionB: pB.regionId,
        panelAId: pA.id,
        panelBId: pB.id,
        length,
        bendAngleDeg: angleDeg,
        bendType: 'MOUNTAIN',
        allowance,
        radius: settings.bendRadius,
        warningState,
      });
    } else {
      allSeams.push({
        edgeId: adj.sharedEdgeIds[0] ?? 0,
        regionA: pA.regionId,
        regionB: pB.regionId,
        length,
        angleDeg,
        boundaryStatus: 'SEAM_CUT',
        overlapImpact: angleDeg > 90 ? 2 : 1,
        score: length * (180 - angleDeg),
        reason:
          angleDeg > settings.maxBendAngle
            ? 'Exceeds maximum press brake angle'
            : angleDeg < 3
              ? 'Near planar seam'
              : 'Flange geometry clearance',
        selected: true,
      });
    }
  }

  // 2. Build Adjacency Graph for Bends
  const bendAdjMap = new Map<number, { neighborId: number; bend: BendEdgeInfo }[]>();
  panels.forEach((p) => bendAdjMap.set(p.regionId, []));

  for (const bend of candidateBends) {
    bendAdjMap.get(bend.regionA)?.push({ neighborId: bend.regionB, bend });
    bendAdjMap.get(bend.regionB)?.push({ neighborId: bend.regionA, bend });
  }

  // 3. Incremental Spanning Tree Unfolding with Real 2D Overlap Detection
  // Sort seed panels by area descending (largest stable base first)
  const sortedSeedPanels = [...panels].sort((a, b) => b.area - a.area);
  const visited = new Set<number>();
  const finalizedBends: BendEdgeInfo[] = [];
  const components: UnfoldComponent[] = [];
  let componentIdCounter = 1;

  for (const rootPanel of sortedSeedPanels) {
    if (visited.has(rootPanel.regionId)) continue;

    // Component placement state
    const placedPanels2D: UnfoldComponent['panels2D'] = [];
    const componentBends2D: UnfoldComponent['bendLines2D'] = [];

    // Place root panel at origin
    visited.add(rootPanel.regionId);
    placedPanels2D.push({
      panelId: rootPanel.id,
      regionId: rootPanel.regionId,
      vertices2D: rootPanel.outerVertices2D,
      center2D: getPolygonCentroid2D(rootPanel.outerVertices2D),
      rotationRad: 0,
    });

    // BFS queue: { regionId }
    const queue: number[] = [rootPanel.regionId];

    while (queue.length > 0) {
      const parentRegId = queue.shift()!;
      const parentPlaced = placedPanels2D.find((p) => p.regionId === parentRegId)!;
      const neighbors = bendAdjMap.get(parentRegId) || [];

      // Sort neighbors by shared boundary length descending
      neighbors.sort((a, b) => b.bend.length - a.bend.length);

      for (const { neighborId, bend } of neighbors) {
        if (visited.has(neighborId)) {
          // Already visited / placed in this or another component -> Must be a SEAM cut!
          // If not already in allSeams, add it
          if (!allSeams.some((s) => s.edgeId === bend.edgeId)) {
            allSeams.push({
              edgeId: bend.edgeId,
              regionA: bend.regionA,
              regionB: bend.regionB,
              length: bend.length,
              angleDeg: bend.bendAngleDeg,
              boundaryStatus: 'SEAM_CUT',
              overlapImpact: 1,
              score: bend.length * 10,
              reason: 'Cycle closure in unfold tree',
              selected: true,
            });
          }
          continue;
        }

        const childPanel = panelMap.get(neighborId);
        if (!childPanel) continue;

        // Find shared edge on parent in placed 2D coordinates
        const parentEdge = findMatchingEdge(parentPlaced.vertices2D, bend.length);
        // Find shared edge on child in local 2D coordinates
        const childEdge = findMatchingEdge(childPanel.outerVertices2D, bend.length);

        // Compute hinged 2D transformation
        const candidateChildVerts = transformChildPolygonAcrossHinge(
          childPanel.outerVertices2D,
          parentEdge.p1,
          parentEdge.p2,
          childEdge.p1,
          childEdge.p2
        );

        // Check 2D overlap against all currently placed panels in this component
        let hasOverlap = false;
        for (const existing of placedPanels2D) {
          if (check2DPolygonsOverlap(existing.vertices2D, candidateChildVerts)) {
            hasOverlap = true;
            break;
          }
        }

        if (hasOverlap) {
          // Overlap detected! Convert bend to seam to prevent physical clash
          overlapAvoidanceCount++;
          allSeams.push({
            edgeId: bend.edgeId,
            regionA: bend.regionA,
            regionB: bend.regionB,
            length: bend.length,
            angleDeg: bend.bendAngleDeg,
            boundaryStatus: 'SEAM_CUT',
            overlapImpact: 3,
            score: bend.length * 100,
            reason: 'Self-intersection / 2D overlap prevention',
            selected: true,
          });
          // Do NOT visit childPanel yet; it will unfold into another component
        } else {
          // Valid non-overlapping fold!
          visited.add(neighborId);
          finalizedBends.push(bend);

          placedPanels2D.push({
            panelId: childPanel.id,
            regionId: childPanel.regionId,
            vertices2D: candidateChildVerts,
            center2D: getPolygonCentroid2D(candidateChildVerts),
            rotationRad: 0,
          });

          componentBends2D.push({
            edgeId: bend.edgeId,
            start: parentEdge.p1,
            end: parentEdge.p2,
            angleDeg: bend.bendAngleDeg,
            bendType: bend.bendType,
          });

          queue.push(neighborId);
        }
      }
    }

    // Compute bounding box for component
    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    for (const p of placedPanels2D) {
      for (const [vx, vy] of p.vertices2D) {
        cMinX = Math.min(cMinX, vx);
        cMinY = Math.min(cMinY, vy);
        cMaxX = Math.max(cMaxX, vx);
        cMaxY = Math.max(cMaxY, vy);
      }
    }

    // Outer contour bounds
    const outerContour: Vec2[] =
      placedPanels2D.length === 1
        ? placedPanels2D[0].vertices2D
        : [
            [cMinX, cMinY],
            [cMaxX, cMinY],
            [cMaxX, cMaxY],
            [cMinX, cMaxY],
          ];

    components.push({
      componentId: componentIdCounter++,
      panelIds: placedPanels2D.map((p) => p.panelId),
      regionIds: placedPanels2D.map((p) => p.regionId),
      panels2D: placedPanels2D,
      bendLines2D: componentBends2D,
      tabs: [], // populated below
      outerContour2D: outerContour,
      bounds: {
        minX: cMinX,
        minY: cMinY,
        maxX: cMaxX,
        maxY: cMaxY,
        width: Math.max(1, cMaxX - cMinX),
        height: Math.max(1, cMaxY - cMinY),
      },
      hasOverlap: false,
    });
  }

  // 4. Generate Assembly Tabs and Matching IDs for all Seams
  const allTabs = generateAssemblyTabs(allSeams, panels, components);

  // Attach generated tabs to their respective unfold components
  for (const tab of allTabs) {
    for (const comp of components) {
      if (comp.panelIds.includes(tab.sourcePanelId)) {
        comp.tabs.push(tab);
        break;
      }
    }
  }

  let totalUnfoldedArea = 0;
  for (const p of panels) {
    totalUnfoldedArea += p.area;
  }

  return {
    components,
    allBends: finalizedBends,
    allSeams,
    allTabs,
    residualOverlaps: 0,
    overlapAvoidanceSeams: overlapAvoidanceCount,
    totalUnfoldedArea,
  };
}
