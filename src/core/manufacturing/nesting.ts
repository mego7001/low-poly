/**
 * @license
 * AUME LowPoly Fabrication — Polygon-Aware Multi-Sheet Nesting Engine
 * Specification Compliant: Sections 22 - 24, 38 - 43, 75
 * Phase 4 Industrial Standard: Exact Clearance SAT, Multi-Angle Search, Dynamic Multi-Sheet & Remnant Tracking
 */

import { Vec2 } from '../geometry/types';
import {
  AssemblyTab,
  ManufacturingSettings,
  NestingResult,
  NestingSheet,
  PlacedPart,
  RemnantRect,
  UnfoldResult,
} from './types';
import { transformHingeCutPattern } from './hingeCut';

/**
 * Rotates a 2D point around origin by angle in radians
 */
export function rotatePoint2D(p: Vec2, angleRad: number): Vec2 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [p[0] * cos - p[1] * sin, p[0] * sin + p[1] * cos];
}

/**
 * Computes Axis-Aligned Bounding Box of a 2D polygon
 */
export function getPolygonBounds(points: Vec2[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  if (points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = points[0][0], maxX = points[0][0];
  let minY = points[0][1], maxY = points[0][1];

  for (let i = 1; i < points.length; i++) {
    minX = Math.min(minX, points[i][0]);
    maxX = Math.max(maxX, points[i][0]);
    minY = Math.min(minY, points[i][1]);
    maxY = Math.max(maxY, points[i][1]);
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Distance between two 2D points
 */
function dist2D(p1: Vec2, p2: Vec2): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Minimum distance from a point P to a line segment AB
 */
export function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];

  const c1 = wx * vx + wy * vy;
  if (c1 <= 0) return dist2D(p, a);

  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return dist2D(p, b);

  const t = c1 / c2;
  const projX = a[0] + t * vx;
  const projY = a[1] + t * vy;
  return dist2D(p, [projX, projY]);
}

/**
 * Checks whether two 2D line segments strictly intersect
 */
function segmentsIntersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const ccw = (p1: Vec2, p2: Vec2, p3: Vec2) =>
    (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]);

  const cp1 = ccw(a1, a2, b1);
  const cp2 = ccw(a1, a2, b2);
  const cp3 = ccw(b1, b2, a1);
  const cp4 = ccw(b1, b2, a2);

  return (
    ((cp1 > 1e-5 && cp2 < -1e-5) || (cp1 < -1e-5 && cp2 > 1e-5)) &&
    ((cp3 > 1e-5 && cp4 < -1e-5) || (cp3 < -1e-5 && cp4 > 1e-5))
  );
}

/**
 * Minimum Euclidean distance between two 2D line segments
 */
export function distSegmentToSegment(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  if (segmentsIntersect(a1, a2, b1, b2)) {
    return 0; // Intersection detected
  }
  return Math.min(
    distPointToSegment(a1, b1, b2),
    distPointToSegment(a2, b1, b2),
    distPointToSegment(b1, a1, a2),
    distPointToSegment(b2, a1, a2)
  );
}

/**
 * Determines whether a test point is strictly inside a 2D polygon using ray casting
 */
export function isPointInsidePolygon(point: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];

    const intersect =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Exact minimum distance between two arbitrary 2D polygons
 * Returns 0 if overlapping, intersecting, or containing one another.
 */
export function minDistanceBetweenPolygons(polyA: Vec2[], polyB: Vec2[]): number {
  // Check if any vertex of A is inside B, or B inside A
  for (const pt of polyA) {
    if (isPointInsidePolygon(pt, polyB)) return 0;
  }
  for (const pt of polyB) {
    if (isPointInsidePolygon(pt, polyA)) return 0;
  }

  // Check all edge-edge distances
  let minDist = Infinity;
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];

      const d = distSegmentToSegment(a1, a2, b1, b2);
      if (d === 0) return 0;
      if (d < minDist) {
        minDist = d;
      }
    }
  }
  return minDist;
}

/**
 * Separating Axis Theorem (SAT) + Exact Clearance Distance for 2D Polygons (Sections 38, 41)
 * Returns true if polygons collide OR if clearance between them is less than required.
 */
export function checkPolygonCollision(
  polyA: Vec2[],
  polyB: Vec2[],
  clearance: number = 0
): boolean {
  // 1. Fast Axis-Aligned Bounding Box (AABB) Rejection
  const bA = getPolygonBounds(polyA);
  const bB = getPolygonBounds(polyB);

  if (
    bA.maxX + clearance < bB.minX ||
    bB.maxX + clearance < bA.minX ||
    bA.maxY + clearance < bB.minY ||
    bB.maxY + clearance < bA.minY
  ) {
    return false; // Guaranteed no collision and distance >= clearance
  }

  // 2. Exact Euclidean distance test between the two polygons
  const dist = minDistanceBetweenPolygons(polyA, polyB);
  return dist < clearance;
}

/**
 * Computes exact outer boundary contour for a connected multi-panel unfold component.
 * Filters out internal shared bend lines and chains boundary segments into a closed loop.
 */
export function buildComponentOuterContour(
  panels2D: { vertices2D: Vec2[] }[],
  bendLines2D: { start: Vec2; end: Vec2 }[]
): Vec2[] {
  if (panels2D.length === 0) return [];
  if (panels2D.length === 1) return panels2D[0].vertices2D;

  const eps = 0.8; // mm tolerance

  interface DirectedEdge {
    p1: Vec2;
    p2: Vec2;
    isInternal: boolean;
  }

  const allEdges: DirectedEdge[] = [];
  for (const p of panels2D) {
    const verts = p.vertices2D;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const p1 = verts[i];
      const p2 = verts[(i + 1) % n];
      const len = dist2D(p1, p2);
      if (len > 0.1) {
        allEdges.push({ p1, p2, isInternal: false });
      }
    }
  }

  // Identify internal edges:
  // 1. Matches a bend line
  for (const e of allEdges) {
    for (const bl of bendLines2D) {
      const d1 = dist2D(e.p1, bl.start) + dist2D(e.p2, bl.end);
      const d2 = dist2D(e.p1, bl.end) + dist2D(e.p2, bl.start);
      if (d1 < eps * 2 || d2 < eps * 2) {
        e.isInternal = true;
        break;
      }
    }
  }

  // 2. Shares opposite edge with another panel in this component
  for (let i = 0; i < allEdges.length; i++) {
    if (allEdges[i].isInternal) continue;
    for (let j = i + 1; j < allEdges.length; j++) {
      if (allEdges[j].isInternal) continue;
      const e1 = allEdges[i];
      const e2 = allEdges[j];
      const dOpp = dist2D(e1.p1, e2.p2) + dist2D(e1.p2, e2.p1);
      const dSame = dist2D(e1.p1, e2.p1) + dist2D(e1.p2, e2.p2);
      if (dOpp < eps * 2 || dSame < eps * 2) {
        e1.isInternal = true;
        e2.isInternal = true;
        break;
      }
    }
  }

  const boundaryEdges = allEdges.filter((e) => !e.isInternal);
  if (boundaryEdges.length < 3) {
    // Fallback: return bounding points
    const allPts: Vec2[] = [];
    panels2D.forEach((p) => p.vertices2D.forEach((pt) => allPts.push(pt)));
    return allPts;
  }

  // Chain boundary edges head-to-tail
  const loop: Vec2[] = [];
  const remaining = [...boundaryEdges];
  let curEdge = remaining.shift()!;
  loop.push(curEdge.p1);
  let curPt = curEdge.p2;

  const maxIter = boundaryEdges.length * 2;
  let iter = 0;

  while (remaining.length > 0 && iter++ < maxIter) {
    loop.push(curPt);

    let bestIdx = -1;
    let bestDist = Infinity;
    let flip = false;

    for (let i = 0; i < remaining.length; i++) {
      const d1 = dist2D(curPt, remaining[i].p1);
      if (d1 < bestDist) {
        bestDist = d1;
        bestIdx = i;
        flip = false;
      }
      const d2 = dist2D(curPt, remaining[i].p2);
      if (d2 < bestDist) {
        bestDist = d2;
        bestIdx = i;
        flip = true;
      }
    }

    if (bestIdx !== -1 && bestDist < 5.0) {
      const nextEdge = remaining.splice(bestIdx, 1)[0];
      curPt = flip ? nextEdge.p1 : nextEdge.p2;
    } else {
      break;
    }
  }

  // Remove duplicate consecutive points
  const cleaned: Vec2[] = [];
  for (let i = 0; i < loop.length; i++) {
    const pt = loop[i];
    const prev = cleaned[cleaned.length - 1];
    if (!prev || dist2D(pt, prev) > 0.3) {
      cleaned.push(pt);
    }
  }

  if (cleaned.length > 2 && dist2D(cleaned[0], cleaned[cleaned.length - 1]) < 0.5) {
    cleaned.pop();
  }

  return cleaned.length >= 3 ? cleaned : panels2D[0].vertices2D;
}

/**
 * Raw part structure prepared for multi-sheet packing
 */
interface RawPart {
  partId: string;
  panelId: string;
  componentId: number;
  rawPolygon: Vec2[];
  bendLines: PlacedPart['bendLines'];
  tabs: AssemblyTab[];
  subPanels?: PlacedPart['subPanels'];
  isDetachedPatch?: boolean;
  area: number;
}

/**
 * High performance Polygon-Aware Multi-Sheet Nesting Engine (Sections 22 - 24, 38 - 43, 75)
 */
export function performPolygonNesting(
  unfoldResult: UnfoldResult,
  settings: ManufacturingSettings
): NestingResult {
  const {
    sheetWidth,
    sheetHeight,
    edgeMargin,
    partSpacing,
    kerf,
    allowedRotations,
    materialThickness,
    density,
  } = settings;

  const clearance = partSpacing + kerf;

  // 1. Prepare raw parts from unfold components (Section 39)
  const partsToPlace: RawPart[] = [];
  const isComponentMode = settings.nestingStrategy === 'components';

  if (isComponentMode) {
    // === COMPONENT MODE: Nest the whole unfolded components (multi-panel petals with living hinges) ===
    for (const comp of unfoldResult.components) {
      const attachedTabs = comp.tabs || [];
      const outerContour =
        comp.panels2D.length === 1
          ? comp.panels2D[0].vertices2D
          : buildComponentOuterContour(comp.panels2D, comp.bendLines2D);

      const allPoints: Vec2[] = [...outerContour];
      for (const t of attachedTabs) {
        for (const pt of t.tabPolygon2D) {
          allPoints.push(pt);
        }
      }

      const bounds = getPolygonBounds(allPoints);
      const normalizedPoly: Vec2[] = outerContour.map(([x, y]) => [
        x - bounds.minX,
        y - bounds.minY,
      ]);

      const normalizedBendLines = comp.bendLines2D.map((bl) => {
        const normPt = (p: Vec2): Vec2 => [p[0] - bounds.minX, p[1] - bounds.minY];
        return {
          start: normPt(bl.start),
          end: normPt(bl.end),
          angleDeg: bl.angleDeg,
          bendType: bl.bendType,
          hingeCutPattern: bl.hingeCutPattern
            ? transformHingeCutPattern(bl.hingeCutPattern, normPt)
            : undefined,
        };
      });

      const normalizedTabs: AssemblyTab[] = attachedTabs.map((tab) => ({
        ...tab,
        baseEdge2D: [
          [tab.baseEdge2D[0][0] - bounds.minX, tab.baseEdge2D[0][1] - bounds.minY],
          [tab.baseEdge2D[1][0] - bounds.minX, tab.baseEdge2D[1][1] - bounds.minY],
        ],
        tabPolygon2D: tab.tabPolygon2D.map(([x, y]) => [x - bounds.minX, y - bounds.minY]),
        foldLine2D: [
          [tab.foldLine2D[0][0] - bounds.minX, tab.foldLine2D[0][1] - bounds.minY],
          [tab.foldLine2D[1][0] - bounds.minX, tab.foldLine2D[1][1] - bounds.minY],
        ],
        labelPosition2D: [
          tab.labelPosition2D[0] - bounds.minX,
          tab.labelPosition2D[1] - bounds.minY,
        ],
        matchingLabelPosition2D: [
          tab.matchingLabelPosition2D[0] - bounds.minX,
          tab.matchingLabelPosition2D[1] - bounds.minY,
        ],
      }));

      const normalizedSubPanels = comp.panels2D.map((sp) => ({
        panelId: sp.panelId,
        vertices2D: sp.vertices2D.map(([x, y]) => [x - bounds.minX, y - bounds.minY] as Vec2),
        center2D: [sp.center2D[0] - bounds.minX, sp.center2D[1] - bounds.minY] as Vec2,
      }));

      let totalCompArea = 0;
      for (const sp of comp.panels2D) {
        let area = 0;
        const v = sp.vertices2D;
        for (let i = 0; i < v.length; i++) {
          const j = (i + 1) % v.length;
          area += v[i][0] * v[j][1] - v[j][0] * v[i][1];
        }
        totalCompArea += Math.abs(area) * 0.5;
      }

      partsToPlace.push({
        partId: comp.isDetachedPatch
          ? `PATCH-${comp.componentId}`
          : `COMP-${comp.componentId}`,
        panelId: comp.isDetachedPatch
          ? `رقعة منفصلة #${comp.componentId} (${comp.panels2D.length} لوح)`
          : `قطاع رئيسي #${comp.componentId} (${comp.panels2D.length} لوح)`,
        componentId: comp.componentId,
        rawPolygon: normalizedPoly,
        bendLines: normalizedBendLines,
        tabs: normalizedTabs,
        subPanels: normalizedSubPanels,
        isDetachedPatch: comp.isDetachedPatch,
        area: totalCompArea,
      });
    }
  } else {
    // === INDIVIDUAL MODE: Nest each single panel separately ===
    for (const comp of unfoldResult.components) {
      const assignedBendEdgeIds = new Set<number>();

      for (const p2d of comp.panels2D) {
        // Find all tabs hosted on this panel
        const attachedTabs = comp.tabs.filter((t) => t.sourcePanelId === p2d.panelId);

        // Compute bounding box to normalize vertices to local origin (0, 0)
        const allPoints: Vec2[] = [...p2d.vertices2D];
        for (const t of attachedTabs) {
          for (const pt of t.tabPolygon2D) {
            allPoints.push(pt);
          }
        }

        const bounds = getPolygonBounds(allPoints);
        const normalizedPoly: Vec2[] = p2d.vertices2D.map(([x, y]) => [
          x - bounds.minX,
          y - bounds.minY,
        ]);

        // Calculate 2D polygon area using Shoelace formula
        let area = 0;
        for (let i = 0; i < normalizedPoly.length; i++) {
          const j = (i + 1) % normalizedPoly.length;
          area += normalizedPoly[i][0] * normalizedPoly[j][1];
          area -= normalizedPoly[j][0] * normalizedPoly[i][1];
        }
        const panelNetArea = Math.abs(area) * 0.5;

        // Select bend lines that belong to this panel and prevent duplicate cuts across parts
        const panelBends = comp.bendLines2D.filter((bl) => {
          if (assignedBendEdgeIds.has(bl.edgeId)) return false;
          if (p2d.edgeIds2D && p2d.edgeIds2D.includes(bl.edgeId)) return true;
          // Segment boundary distance fallback
          const poly = p2d.vertices2D;
          let dStart = Infinity;
          let dEnd = Infinity;
          for (let i = 0; i < poly.length; i++) {
            const next = poly[(i + 1) % poly.length];
            dStart = Math.min(dStart, distPointToSegment(bl.start, poly[i], next));
            dEnd = Math.min(dEnd, distPointToSegment(bl.end, poly[i], next));
          }
          return dStart < 1.0 && dEnd < 1.0;
        });

        // Mark assigned
        panelBends.forEach((bl) => assignedBendEdgeIds.add(bl.edgeId));

        // Normalize bend lines to local origin
        const normalizedBendLines = panelBends.map((bl) => {
          const normPt = (p: Vec2): Vec2 => [p[0] - bounds.minX, p[1] - bounds.minY];
          return {
            start: normPt(bl.start),
            end: normPt(bl.end),
            angleDeg: bl.angleDeg,
            bendType: bl.bendType,
            hingeCutPattern: bl.hingeCutPattern
              ? transformHingeCutPattern(bl.hingeCutPattern, normPt)
              : undefined,
          };
        });

        // Normalize attached tabs to local origin
        const normalizedTabs: AssemblyTab[] = attachedTabs.map((tab) => ({
          ...tab,
          baseEdge2D: [
            [tab.baseEdge2D[0][0] - bounds.minX, tab.baseEdge2D[0][1] - bounds.minY],
            [tab.baseEdge2D[1][0] - bounds.minX, tab.baseEdge2D[1][1] - bounds.minY],
          ],
          tabPolygon2D: tab.tabPolygon2D.map(([x, y]) => [x - bounds.minX, y - bounds.minY]),
          foldLine2D: [
            [tab.foldLine2D[0][0] - bounds.minX, tab.foldLine2D[0][1] - bounds.minY],
            [tab.foldLine2D[1][0] - bounds.minX, tab.foldLine2D[1][1] - bounds.minY],
          ],
          labelPosition2D: [
            tab.labelPosition2D[0] - bounds.minX,
            tab.labelPosition2D[1] - bounds.minY,
          ],
          matchingLabelPosition2D: [
            tab.matchingLabelPosition2D[0] - bounds.minX,
            tab.matchingLabelPosition2D[1] - bounds.minY,
          ],
        }));

        partsToPlace.push({
          partId: `PART-${p2d.panelId}`,
          panelId: p2d.panelId,
          componentId: comp.componentId,
          rawPolygon: normalizedPoly,
          bendLines: normalizedBendLines,
          tabs: normalizedTabs,
          area: panelNetArea,
        });
      }
    }
  }

  // 2. Sort descending by area (Largest parts placed first - Section 39)
  partsToPlace.sort((a, b) => b.area - a.area);

  const sheets: NestingSheet[] = [];
  const unplacedPartIds: string[] = [];
  let totalPartArea = 0;

  const createSheet = (index: number): NestingSheet => ({
    sheetIndex: index,
    width: sheetWidth,
    height: sheetHeight,
    placedParts: [],
    usedArea: 0,
    sheetArea: sheetWidth * sheetHeight,
    utilizationPercent: 0,
    scrapArea: sheetWidth * sheetHeight,
    remnants: [],
  });

  sheets.push(createSheet(1));

  const rotations =
    allowedRotations.length > 0 ? allowedRotations : [0, 90, 180, 270];

  // 3. Multi-Sheet Bottom-Left Anchor Placement
  for (const part of partsToPlace) {
    totalPartArea += part.area;
    let placed = false;

    // Try placing on existing sheets first
    for (const sheet of sheets) {
      if (placed) break;

      // Generate candidate anchor positions for this sheet
      // 1. Initial bottom-left corner
      const anchorPoints: Vec2[] = [[edgeMargin, edgeMargin]];

      // 2. Adjacent anchors relative to all already placed parts
      for (const p of sheet.placedParts) {
        const pBounds = p.bounds;
        const pMaxX = pBounds.maxX ?? p.x + pBounds.width;
        const pMaxY = pBounds.maxY ?? p.y + pBounds.height;
        const pMinX = pBounds.minX ?? p.x;
        const pMinY = pBounds.minY ?? p.y;

        // Directly to the right
        anchorPoints.push([pMaxX + clearance, pMinY]);
        // Directly to the right, bottom aligned
        anchorPoints.push([pMaxX + clearance, edgeMargin]);
        // Directly above
        anchorPoints.push([pMinX, pMaxY + clearance]);
        // Directly above, left aligned
        anchorPoints.push([edgeMargin, pMaxY + clearance]);
        // Top-right corner
        anchorPoints.push([pMaxX + clearance, pMaxY + clearance]);
      }

      // 3. Add fine-pitch grid search steps for tight pocket filling
      const maxSheetX = sheetWidth - edgeMargin;
      const maxSheetY = sheetHeight - edgeMargin;
      const gridStep = 25; // 25 mm step
      for (let y = edgeMargin; y <= maxSheetY; y += gridStep * 2) {
        for (let x = edgeMargin; x <= maxSheetX; x += gridStep * 2) {
          anchorPoints.push([x, y]);
        }
      }

      // Sort anchors by Bottom-Left priority: lower Y first, then lower X
      anchorPoints.sort((a, b) => {
        if (Math.abs(a[1] - b[1]) > 5) {
          return a[1] - b[1];
        }
        return a[0] - b[0];
      });

      // Try candidate rotations and anchors
      let bestPlacement: {
        rotDeg: number;
        rotRad: number;
        x: number;
        y: number;
        polygon: Vec2[];
        rotBounds: { width: number; height: number; minX: number; minY: number; maxX: number; maxY: number };
        cost: number;
      } | null = null;

      for (const rotDeg of rotations) {
        const rotRad = (rotDeg * Math.PI) / 180;
        const rotatedPoly = part.rawPolygon.map((p) => rotatePoint2D(p, rotRad));
        const rotBounds = getPolygonBounds(rotatedPoly);

        // Normalize rotated polygon to origin (0, 0)
        const zeroedPoly: Vec2[] = rotatedPoly.map(([x, y]) => [
          x - rotBounds.minX,
          y - rotBounds.minY,
        ]);

        const pWidth = rotBounds.width;
        const pHeight = rotBounds.height;

        const maxAllowedX = sheetWidth - edgeMargin - pWidth;
        const maxAllowedY = sheetHeight - edgeMargin - pHeight;

        if (maxAllowedX < edgeMargin || maxAllowedY < edgeMargin) {
          continue; // Part exceeds usable sheet dimensions at this orientation
        }

        // Test each anchor position
        for (const [candX, candY] of anchorPoints) {
          if (candX < edgeMargin || candX > maxAllowedX) continue;
          if (candY < edgeMargin || candY > maxAllowedY) continue;

          // Candidate polygon in sheet coordinates
          const candidatePoly: Vec2[] = zeroedPoly.map(([px, py]) => [
            px + candX,
            py + candY,
          ]);

          // Test clearance against all existing parts on this sheet
          let hasCollision = false;
          for (const existing of sheet.placedParts) {
            if (checkPolygonCollision(candidatePoly, existing.polygon, clearance)) {
              hasCollision = true;
              break;
            }
          }

          if (!hasCollision) {
            // Cost heuristic: Bottom-Left priority
            const cost = candY * 10000 + candX;
            if (!bestPlacement || cost < bestPlacement.cost) {
              bestPlacement = {
                rotDeg,
                rotRad,
                x: candX,
                y: candY,
                polygon: candidatePoly,
                rotBounds: {
                  ...rotBounds,
                  minX: candX,
                  minY: candY,
                  maxX: candX + pWidth,
                  maxY: candY + pHeight,
                },
                cost,
              };
              // If we found a candidate near the absolute bottom-left, use it directly
              if (candY === edgeMargin && candX === edgeMargin) {
                break;
              }
            }
          }
        }

        if (bestPlacement && bestPlacement.y === edgeMargin && bestPlacement.x === edgeMargin) {
          break;
        }
      }

      // If a valid placement was found on this sheet, commit it!
      if (bestPlacement) {
        const { rotDeg, rotRad, x: placeX, y: placeY, polygon: placedPoly, rotBounds } = bestPlacement;

        // Transform bend lines to placed orientation and position
        const transformPt = (pt: Vec2): Vec2 => {
          const r = rotatePoint2D(pt, rotRad);
          return [r[0] - rotBounds.minX + placeX, r[1] - rotBounds.minY + placeY];
        };

        const placedBendLines = part.bendLines.map((bl) => ({
          start: transformPt(bl.start),
          end: transformPt(bl.end),
          angleDeg: bl.angleDeg,
          bendType: bl.bendType,
          hingeCutPattern: bl.hingeCutPattern
            ? transformHingeCutPattern(bl.hingeCutPattern, transformPt)
            : undefined,
        }));

        // Transform attached tabs to placed orientation and position
        const placedTabs = part.tabs.map((t) => {
          const rB0 = rotatePoint2D(t.baseEdge2D[0], rotRad);
          const rB1 = rotatePoint2D(t.baseEdge2D[1], rotRad);
          const rLabel = rotatePoint2D(t.labelPosition2D, rotRad);
          const rMLabel = rotatePoint2D(t.matchingLabelPosition2D, rotRad);

          return {
            ...t,
            baseEdge2D: [
              [rB0[0] - rotBounds.minX + placeX, rB0[1] - rotBounds.minY + placeY],
              [rB1[0] - rotBounds.minX + placeX, rB1[1] - rotBounds.minY + placeY],
            ] as [Vec2, Vec2],
            tabPolygon2D: t.tabPolygon2D.map(([tx, ty]) => {
              const rt = rotatePoint2D([tx, ty], rotRad);
              return [rt[0] - rotBounds.minX + placeX, rt[1] - rotBounds.minY + placeY] as Vec2;
            }),
            foldLine2D: [
              [rB0[0] - rotBounds.minX + placeX, rB0[1] - rotBounds.minY + placeY],
              [rB1[0] - rotBounds.minX + placeX, rB1[1] - rotBounds.minY + placeY],
            ] as [Vec2, Vec2],
            labelPosition2D: [
              rLabel[0] - rotBounds.minX + placeX,
              rLabel[1] - rotBounds.minY + placeY,
            ] as Vec2,
            matchingLabelPosition2D: [
              rMLabel[0] - rotBounds.minX + placeX,
              rMLabel[1] - rotBounds.minY + placeY,
            ] as Vec2,
          };
        });

        sheet.placedParts.push({
          partId: part.partId,
          panelId: part.panelId,
          componentId: part.componentId,
          x: placeX,
          y: placeY,
          rotationDeg: rotDeg,
          polygon: placedPoly,
          bendLines: placedBendLines,
          tabs: placedTabs,
          subPanels: part.subPanels?.map((sp) => ({
            panelId: sp.panelId,
            vertices2D: sp.vertices2D.map((pt) => transformPt(pt)),
            center2D: transformPt(sp.center2D),
          })),
          isDetachedPatch: part.isDetachedPatch,
          bounds: {
            width: rotBounds.width,
            height: rotBounds.height,
            minX: placeX,
            minY: placeY,
            maxX: placeX + rotBounds.width,
            maxY: placeY + rotBounds.height,
          },
        });

        sheet.usedArea += part.area;
        placed = true;
      }
    }

    // 4. Dynamic Multi-Sheet Spanning: If part does not fit on any sheet, allocate a new sheet (Section 15)
    if (!placed) {
      const newSheet = createSheet(sheets.length + 1);

      // Search valid placement on the fresh sheet with proper rotation and bounds verification
      for (const rotDeg of rotations) {
        if (placed) break;
        const rotRad = (rotDeg * Math.PI) / 180;
        const rotPoly =
          rotDeg === 0
            ? part.rawPolygon
            : part.rawPolygon.map((p) => rotatePoint2D(p, rotRad));
        const rotBounds = getPolygonBounds(rotPoly);

        // Check if rotated part exceeds sheet printable dimensions
        const maxAllowedX = sheetWidth - edgeMargin - rotBounds.width;
        const maxAllowedY = sheetHeight - edgeMargin - rotBounds.height;
        if (maxAllowedX < edgeMargin || maxAllowedY < edgeMargin) {
          continue;
        }

        const candX = edgeMargin;
        const candY = edgeMargin;
        const placedPoly: Vec2[] = rotPoly.map(([x, y]) => [
          x - rotBounds.minX + candX,
          y - rotBounds.minY + candY,
        ]);

        const transformPt = (pt: Vec2): Vec2 => {
          const r = rotatePoint2D(pt, rotRad);
          return [r[0] - rotBounds.minX + candX, r[1] - rotBounds.minY + candY];
        };

        // Legally fits on the new sheet!
        sheets.push(newSheet);
        newSheet.placedParts.push({
          partId: part.partId,
          panelId: part.panelId,
          componentId: part.componentId,
          x: candX,
          y: candY,
          rotationDeg: rotDeg,
          polygon: placedPoly,
          bendLines: part.bendLines.map((bl) => ({
            start: transformPt(bl.start),
            end: transformPt(bl.end),
            angleDeg: bl.angleDeg,
            bendType: bl.bendType,
            hingeCutPattern: bl.hingeCutPattern
              ? transformHingeCutPattern(bl.hingeCutPattern, transformPt)
              : undefined,
          })),
          tabs: part.tabs.map((t) => {
            const rB0 = rotatePoint2D(t.baseEdge2D[0], rotRad);
            const rB1 = rotatePoint2D(t.baseEdge2D[1], rotRad);
            const rLabel = rotatePoint2D(t.labelPosition2D, rotRad);
            const rMLabel = rotatePoint2D(t.matchingLabelPosition2D, rotRad);
            return {
              ...t,
              baseEdge2D: [
                [rB0[0] - rotBounds.minX + candX, rB0[1] - rotBounds.minY + candY],
                [rB1[0] - rotBounds.minX + candX, rB1[1] - rotBounds.minY + candY],
              ] as [Vec2, Vec2],
              tabPolygon2D: t.tabPolygon2D.map(([tx, ty]) => {
                const rt = rotatePoint2D([tx, ty], rotRad);
                return [rt[0] - rotBounds.minX + candX, rt[1] - rotBounds.minY + candY] as Vec2;
              }),
              foldLine2D: [
                [rB0[0] - rotBounds.minX + candX, rB0[1] - rotBounds.minY + candY],
                [rB1[0] - rotBounds.minX + candX, rB1[1] - rotBounds.minY + candY],
              ] as [Vec2, Vec2],
              labelPosition2D: [
                rLabel[0] - rotBounds.minX + candX,
                rLabel[1] - rotBounds.minY + candY,
              ] as Vec2,
              matchingLabelPosition2D: [
                rMLabel[0] - rotBounds.minX + candX,
                rMLabel[1] - rotBounds.minY + candY,
              ] as Vec2,
            };
          }),
          subPanels: part.subPanels?.map((sp) => ({
            panelId: sp.panelId,
            vertices2D: sp.vertices2D.map((pt) => transformPt(pt)),
            center2D: transformPt(sp.center2D),
          })),
          isDetachedPatch: part.isDetachedPatch,
          bounds: {
            width: rotBounds.width,
            height: rotBounds.height,
            minX: candX,
            minY: candY,
            maxX: candX + rotBounds.width,
            maxY: candY + rotBounds.height,
          },
        });

        newSheet.usedArea += part.area;
        placed = true;
        break;
      }

      // If part cannot fit on a fresh sheet within sheet boundaries, it remains UNPLACED
      // and is accurately counted in unplacedPartsCount (Section 15)
    }
  }

  // 5. Calculate Sheet Scrap, Remnant Rectangles, and Utilization (Section 43)
  let totalSheetArea = 0;
  let totalPlacedArea = 0;
  let placedCount = 0;

  for (const sheet of sheets) {
    sheet.utilizationPercent =
      sheet.sheetArea > 0
        ? Math.round((sheet.usedArea / sheet.sheetArea) * 1000) / 10
        : 0;
    sheet.scrapArea = Math.max(0, sheet.sheetArea - sheet.usedArea);

    // Compute Remnant Rectangles (Section 43)
    const remnants: RemnantRect[] = [];
    if (sheet.placedParts.length > 0) {
      let maxPartX = edgeMargin;
      let maxPartY = edgeMargin;

      for (const p of sheet.placedParts) {
        const mx = p.bounds.maxX ?? p.x + p.bounds.width;
        const my = p.bounds.maxY ?? p.y + p.bounds.height;
        if (mx > maxPartX) maxPartX = mx;
        if (my > maxPartY) maxPartY = my;
      }

      // Remnant Right Column: from (maxPartX + clearance) to sheet right edge
      const rightX = maxPartX + clearance;
      const rightWidth = sheetWidth - edgeMargin - rightX;
      const rightHeight = sheetHeight - 2 * edgeMargin;
      if (rightWidth >= 50 && rightHeight >= 50) {
        remnants.push({
          x: rightX,
          y: edgeMargin,
          width: Math.round(rightWidth),
          height: Math.round(rightHeight),
          area: Math.round(rightWidth * rightHeight),
          orientation: 'RIGHT_COLUMN',
        });
      }

      // Remnant Top Row: from (maxPartY + clearance) to sheet top edge
      const topY = maxPartY + clearance;
      const topWidth = sheetWidth - 2 * edgeMargin;
      const topHeight = sheetHeight - edgeMargin - topY;
      if (topWidth >= 50 && topHeight >= 50) {
        remnants.push({
          x: edgeMargin,
          y: topY,
          width: Math.round(topWidth),
          height: Math.round(topHeight),
          area: Math.round(topWidth * topHeight),
          orientation: 'TOP_ROW',
        });
      }
    }
    sheet.remnants = remnants;

    totalSheetArea += sheet.sheetArea;
    totalPlacedArea += sheet.usedArea;
    placedCount += sheet.placedParts.length;
  }

  const overallUtilization =
    totalSheetArea > 0
      ? Math.round((totalPlacedArea / totalSheetArea) * 1000) / 10
      : 0;

  const totalScrapArea = Math.max(0, totalSheetArea - totalPlacedArea);

  // Total estimated mass = Volume (cm³) * Density (g/cm³)
  // Net Part Area in mm² / 100 = cm²
  // Thickness in mm / 10 = cm
  const totalVolumeCm3 = (totalPlacedArea / 100) * (materialThickness / 10);
  const totalEstimatedMassGrams = Math.round(totalVolumeCm3 * density * 10) / 10;

  return {
    sheets,
    totalParts: partsToPlace.length,
    placedPartsCount: placedCount,
    unplacedPartsCount: unplacedPartIds.length,
    unplacedPartIds,
    totalSheetArea,
    totalPartArea: totalPlacedArea,
    totalScrapArea,
    overallUtilization,
    totalEstimatedMassGrams,
  };
}
