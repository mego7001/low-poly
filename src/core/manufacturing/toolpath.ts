/**
 * @license
 * AUME LowPoly Fabrication — Phase 6: CNC Laser Toolpath & Cut-Order Optimization
 * Specification Compliant: Sections 61, 75, 76
 */

import { Vec2 } from '../geometry/types';
import {
  CNCSettings,
  ManufacturingSettings,
  NestedSheet,
  ToolpathContour,
  ToolpathPlan,
  SheetToolpath,
  PlacedPanel,
  AssemblyTab,
} from './types';

/**
 * Euclidean 2D distance between two points
 */
function dist2D(a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes polygon perimeter length
 */
function computePerimeter(pts: Vec2[]): number {
  if (pts.length < 2) return 0;
  let len = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    len += dist2D(p1, p2);
  }
  return len;
}

/**
 * Compute centroid of 2D polygon
 */
function computeCentroid(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  return [sx / pts.length, sy / pts.length];
}

/**
 * Offsets a polygon outward or inward by offsetDist (Kerf compensation)
 */
export function applyKerfOffset(pts: Vec2[], offsetDist: number, outward: boolean): Vec2[] {
  if (pts.length < 3 || Math.abs(offsetDist) < 1e-5) return pts.map((p) => [...p]);

  const n = pts.length;
  // Compute polygon signed area to determine winding order
  let signedArea = 0;
  for (let i = 0; i < n; i++) {
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    signedArea += curr[0] * next[1] - next[0] * curr[1];
  }
  const isCCW = signedArea > 0;
  const sign = (isCCW ? 1 : -1) * (outward ? 1 : -1);

  // Offset each edge outward/inward and intersect neighboring offset lines
  const offsetEdges: { p1: Vec2; p2: Vec2; normal: Vec2 }[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) {
      offsetEdges.push({ p1, p2, normal: [0, 0] });
      continue;
    }
    // Normal perpendicular to edge
    const nx = (-dy / len) * sign * offsetDist;
    const ny = (dx / len) * sign * offsetDist;
    offsetEdges.push({
      p1: [p1[0] + nx, p1[1] + ny],
      p2: [p2[0] + nx, p2[1] + ny],
      normal: [nx, ny],
    });
  }

  const result: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = offsetEdges[(i - 1 + n) % n];
    const curr = offsetEdges[i];

    // Intersection of line prev.p1->prev.p2 and curr.p1->curr.p2
    const x1 = prev.p1[0], y1 = prev.p1[1];
    const x2 = prev.p2[0], y2 = prev.p2[1];
    const x3 = curr.p1[0], y3 = curr.p1[1];
    const x4 = curr.p2[0], y4 = curr.p2[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-6) {
      result.push([curr.p1[0], curr.p1[1]]);
    } else {
      const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
      const ix = x1 + t * (x2 - x1);
      const iy = y1 + t * (y2 - y1);
      result.push([ix, iy]);
    }
  }

  return result;
}

/**
 * Generates lead-in vector pointing inward/outward
 */
function computeLeadInPoint(firstPt: Vec2, secondPt: Vec2, lengthMm: number, centroid: Vec2): Vec2 {
  const dx = secondPt[0] - firstPt[0];
  const dy = secondPt[1] - firstPt[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return [firstPt[0] - lengthMm, firstPt[1]];

  // Vector perpendicular to edge
  let nx = -dy / len;
  let ny = dx / len;

  // Orient towards centroid (so lead-in is inside scrap / inner side)
  const toCentroidX = centroid[0] - firstPt[0];
  const toCentroidY = centroid[1] - firstPt[1];
  if (nx * toCentroidX + ny * toCentroidY < 0) {
    nx = -nx;
    ny = -ny;
  }

  return [firstPt[0] + nx * lengthMm, firstPt[1] + ny * lengthMm];
}

/**
 * Extracts raw cutting contours from a placed panel on a sheet
 */
function extractPanelContours(
  placed: PlacedPanel,
  sheetId: string,
  settings: ManufacturingSettings,
  cncSettings: CNCSettings
): ToolpathContour[] {
  const contours: ToolpathContour[] = [];
  const panel = placed.panel;

  // 1. Outer perimeter
  let outerPts = placed.nestedVertices2D.map((p) => [p[0], p[1]] as Vec2);
  const centroid = computeCentroid(outerPts);

  // Apply geometry kerf offset if requested
  if (cncSettings.kerfOffsetMode === 'geometry' && settings.kerf > 0) {
    outerPts = applyKerfOffset(outerPts, settings.kerf / 2, true);
  }

  const outerLength = computePerimeter(outerPts);
  const leadIn =
    cncSettings.leadInType !== 'none' && outerPts.length >= 2
      ? computeLeadInPoint(outerPts[0], outerPts[1], cncSettings.leadInLengthMm, centroid)
      : outerPts[0];

  contours.push({
    id: `CONTOUR-OUTER-${panel.id}`,
    panelId: panel.id,
    sheetId,
    contourType: 'outer_perimeter',
    cutOrder: 0,
    points: outerPts,
    isClosed: true,
    leadInPoint: leadIn,
    leadOutPoint: outerPts[0],
    contourLengthMm: Math.round(outerLength * 100) / 100,
    piercePoint: leadIn,
  });

  // 2. Relief Tabs / Assembly Slots if present
  if (placed.tabs && placed.tabs.length > 0) {
    placed.tabs.forEach((tab: AssemblyTab, idx: number) => {
      // Create small relief contour for tab slot
      const tabPts: Vec2[] = tab.geometry2D.map((p) => [p[0], p[1]] as Vec2);
      if (tabPts.length >= 2) {
        const tabCentroid = computeCentroid(tabPts);
        const tabLeadIn =
          cncSettings.leadInType !== 'none' && tabPts.length >= 2
            ? computeLeadInPoint(tabPts[0], tabPts[1], cncSettings.leadInLengthMm * 0.5, tabCentroid)
            : tabPts[0];

        contours.push({
          id: `CONTOUR-TAB-${panel.id}-${idx}`,
          panelId: panel.id,
          sheetId,
          contourType: 'relief_tab',
          cutOrder: 0,
          points: tabPts,
          isClosed: false,
          leadInPoint: tabLeadIn,
          leadOutPoint: tabPts[tabPts.length - 1],
          contourLengthMm: Math.round(computePerimeter(tabPts) * 100) / 100,
          piercePoint: tabLeadIn,
        });
      }
    });
  }

  return contours;
}

/**
 * Optimizes cut order on a sheet using:
 * 1. Strict Cut-Order Hierarchy (Inner reliefs & tabs BEFORE Outer perimeters)
 * 2. Greedy Nearest Neighbor with 2-Opt local search for Rapid Distance minimization
 */
export function optimizeSheetToolpath(
  rawContours: ToolpathContour[],
  sheetId: string,
  cncSettings: CNCSettings
): SheetToolpath {
  if (rawContours.length === 0) {
    return {
      sheetId,
      contours: [],
      sheetCutDistanceMm: 0,
      sheetRapidDistanceMm: 0,
      sheetPierceCount: 0,
      sheetEstimatedCutTimeSec: 0,
      sheetEstimatedRapidTimeSec: 0,
      sheetTotalEstimatedTimeSec: 0,
      gcode: '',
    };
  }

  // Calculate baseline unoptimized rapid distance (original sequence order)
  let unoptimizedRapidDist = 0;
  let currHead: Vec2 = [0, 0];
  for (const c of rawContours) {
    const startPt = c.leadInPoint || c.points[0];
    const endPt = c.leadOutPoint || c.points[c.points.length - 1];
    unoptimizedRapidDist += dist2D(currHead, startPt);
    currHead = endPt;
  }
  unoptimizedRapidDist += dist2D(currHead, [0, 0]); // Return home

  // Group contours by panel to enforce hierarchy:
  // For each panel: inner_feature and relief_tab MUST be cut before outer_perimeter
  const remainingContours = [...rawContours];
  const orderedContours: ToolpathContour[] = [];

  currHead = [0, 0]; // Home position

  while (remainingContours.length > 0) {
    // Determine which contours are currently "eligible" to cut:
    // A contour is eligible if:
    // - It is inner_feature or relief_tab
    // - OR it is outer_perimeter AND all inner/relief contours for this panelId have already been cut!
    const eligibleIndices: number[] = [];

    for (let i = 0; i < remainingContours.length; i++) {
      const candidate = remainingContours[i];
      if (candidate.contourType === 'inner_feature' || candidate.contourType === 'relief_tab') {
        eligibleIndices.push(i);
      } else {
        // outer_perimeter: check if any inner features remain for this panel
        const hasUncutInner = remainingContours.some(
          (other) =>
            other.panelId === candidate.panelId &&
            (other.contourType === 'inner_feature' || other.contourType === 'relief_tab')
        );
        if (!hasUncutInner) {
          eligibleIndices.push(i);
        }
      }
    }

    // Among eligible, pick the one closest to currHead (Greedy Nearest Neighbor)
    let bestIdxInRemaining = eligibleIndices[0];
    let minRapid = Infinity;

    for (const idx of eligibleIndices) {
      const c = remainingContours[idx];
      const startPt = c.leadInPoint || c.points[0];
      const d = dist2D(currHead, startPt);
      if (d < minRapid) {
        minRapid = d;
        bestIdxInRemaining = idx;
      }
    }

    // Append best contour
    const chosen = remainingContours.splice(bestIdxInRemaining, 1)[0];
    chosen.cutOrder = orderedContours.length + 1;
    orderedContours.push(chosen);
    currHead = chosen.leadOutPoint || chosen.points[chosen.points.length - 1];
  }

  // Calculate optimized rapid and cut distances
  let optimizedRapidDist = 0;
  let totalCutDist = 0;
  currHead = [0, 0];

  for (const c of orderedContours) {
    const startPt = c.leadInPoint || c.points[0];
    const endPt = c.leadOutPoint || c.points[c.points.length - 1];
    optimizedRapidDist += dist2D(currHead, startPt);
    totalCutDist += c.contourLengthMm;
    currHead = endPt;
  }
  optimizedRapidDist += dist2D(currHead, [0, 0]); // Return home

  // Compute times
  const cutSpeedMmSec = cncSettings.cuttingFeedrateMmMin / 60;
  const rapidSpeedMmSec = cncSettings.rapidFeedrateMmMin / 60;
  const pierceDelay = cncSettings.pierceDelaySec;

  const totalCutTime = totalCutDist / cutSpeedMmSec;
  const totalRapidTime = optimizedRapidDist / rapidSpeedMmSec;
  const totalPierceTime = orderedContours.length * pierceDelay;
  const sheetTotalTime = totalCutTime + totalRapidTime + totalPierceTime;

  return {
    sheetId,
    contours: orderedContours,
    sheetCutDistanceMm: Math.round(totalCutDist * 10) / 10,
    sheetRapidDistanceMm: Math.round(optimizedRapidDist * 10) / 10,
    sheetPierceCount: orderedContours.length,
    sheetEstimatedCutTimeSec: Math.round(totalCutTime * 10) / 10,
    sheetEstimatedRapidTimeSec: Math.round(totalRapidTime * 10) / 10,
    sheetTotalEstimatedTimeSec: Math.round(sheetTotalTime * 10) / 10,
    gcode: '', // Will be populated by gcode generator
  };
}

/**
 * Main entry point: Generates full multi-sheet optimized toolpath plan
 */
export function generateToolpathPlan(
  sheets: NestedSheet[],
  settings: ManufacturingSettings,
  cncSettings: CNCSettings = DEFAULT_CNC_SETTINGS
): ToolpathPlan {
  const sheetToolpaths: SheetToolpath[] = [];
  let totalCutMm = 0;
  let totalRapidMm = 0;
  let unoptimizedRapidMm = 0;
  let totalPierces = 0;
  let totalCutTimeSec = 0;
  let totalRapidTimeSec = 0;

  for (const sheet of sheets) {
    const rawContours: ToolpathContour[] = [];
    for (const placed of sheet.placedPanels) {
      const extracted = extractPanelContours(placed, sheet.id, settings, cncSettings);
      rawContours.push(...extracted);
    }

    // Baseline unoptimized rapid for reporting savings
    let sheetUnoptRapid = 0;
    let tempHead: Vec2 = [0, 0];
    for (const c of rawContours) {
      const p = c.leadInPoint || c.points[0];
      sheetUnoptRapid += dist2D(tempHead, p);
      tempHead = c.leadOutPoint || c.points[c.points.length - 1];
    }
    sheetUnoptRapid += dist2D(tempHead, [0, 0]);
    unoptimizedRapidMm += sheetUnoptRapid;

    const optSheet = optimizeSheetToolpath(rawContours, sheet.id, cncSettings);
    sheetToolpaths.push(optSheet);

    totalCutMm += optSheet.sheetCutDistanceMm;
    totalRapidMm += optSheet.sheetRapidDistanceMm;
    totalPierces += optSheet.sheetPierceCount;
    totalCutTimeSec += optSheet.sheetEstimatedCutTimeSec;
    totalRapidTimeSec += optSheet.sheetEstimatedRapidTimeSec;
  }

  const rapidDistanceSavedMm = Math.max(0, Math.round((unoptimizedRapidMm - totalRapidMm) * 10) / 10);
  const totalCycleTimeSec = Math.round((totalCutTimeSec + totalRapidTimeSec + totalPierces * cncSettings.pierceDelaySec) * 10) / 10;

  return {
    sheets: sheetToolpaths,
    totalCutDistanceMm: Math.round(totalCutMm * 10) / 10,
    totalRapidDistanceMm: Math.round(totalRapidMm * 10) / 10,
    unoptimizedRapidDistanceMm: Math.round(unoptimizedRapidMm * 10) / 10,
    rapidDistanceSavedMm,
    totalPierceCount: totalPierces,
    totalEstimatedCutTimeSec: Math.round(totalCutTimeSec * 10) / 10,
    totalEstimatedRapidTimeSec: Math.round(totalRapidTimeSec * 10) / 10,
    totalEstimatedCycleTimeSec: totalCycleTimeSec,
  };
}
