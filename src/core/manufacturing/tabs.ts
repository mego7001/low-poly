/**
 * @license
 * AUME LowPoly Fabrication — Assembly Tabs, Slits & Edge Matching
 * Specification Compliant: Sections 30 - 33, 49, 50, 71
 */

import { Vec2 } from '../geometry/types';
import {
  AssemblyTab,
  SeamCandidate,
  SmartPanel,
  TabSettings,
  UnfoldComponent,
} from './types';

export const DEFAULT_TAB_SETTINGS: TabSettings = {
  tabHeight: 8.0, // mm
  chamferAngleDeg: 45.0, // degrees
  minEdgeLength: 6.0, // mm
  tabSpacing: 1.0, // mm clearance from vertices
};

/**
 * Computes 2D segment length
 */
function segLen(p1: Vec2, p2: Vec2): number {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates outward normal for a 2D directed edge (p1 -> p2) on a CCW polygon
 */
function outwardNormal(p1: Vec2, p2: Vec2): Vec2 {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-7) return [0, 1];
  // For CCW polygon, outward normal is (dy, -dx) normalized
  return [dy / len, -dx / len];
}

/**
 * Generates assembly glue tabs and matching edge pair labels for all seams
 */
export function generateAssemblyTabs(
  seams: SeamCandidate[],
  panels: SmartPanel[],
  components: UnfoldComponent[],
  settings: TabSettings = DEFAULT_TAB_SETTINGS
): AssemblyTab[] {
  const panelMap = new Map<number, SmartPanel>();
  panels.forEach((p) => panelMap.set(p.regionId, p));

  // Map each panelId to its placed 2D vertices in its unfold component
  const placedPanelMap = new Map<string, { vertices2D: Vec2[]; componentId: number }>();
  for (const comp of components) {
    for (const p2d of comp.panels2D) {
      placedPanelMap.set(p2d.panelId, {
        vertices2D: p2d.vertices2D,
        componentId: comp.componentId,
      });
    }
  }

  const tabs: AssemblyTab[] = [];
  let pairCounter = 1;

  for (const seam of seams) {
    const pA = panelMap.get(seam.regionA);
    const pB = panelMap.get(seam.regionB);
    if (!pA || !pB) continue;

    const placedA = placedPanelMap.get(pA.id);
    const placedB = placedPanelMap.get(pB.id);

    // If either panel is not placed, use local 2D vertices as fallback
    const vertsA = placedA ? placedA.vertices2D : pA.outerVertices2D;
    const vertsB = placedB ? placedB.vertices2D : pB.outerVertices2D;

    // Find the boundary edge on panel A that best matches seam length
    let bestEdgeA: [Vec2, Vec2] | null = null;
    let bestLenDiffA = Infinity;
    for (let i = 0; i < vertsA.length; i++) {
      const v1 = vertsA[i];
      const v2 = vertsA[(i + 1) % vertsA.length];
      const len = segLen(v1, v2);
      const diff = Math.abs(len - seam.length);
      if (diff < bestLenDiffA) {
        bestLenDiffA = diff;
        bestEdgeA = [v1, v2];
      }
    }

    // Find the boundary edge on panel B that best matches seam length
    let bestEdgeB: [Vec2, Vec2] | null = null;
    let bestLenDiffB = Infinity;
    for (let i = 0; i < vertsB.length; i++) {
      const v1 = vertsB[i];
      const v2 = vertsB[(i + 1) % vertsB.length];
      const len = segLen(v1, v2);
      const diff = Math.abs(len - seam.length);
      if (diff < bestLenDiffB) {
        bestLenDiffB = diff;
        bestEdgeB = [v1, v2];
      }
    }

    if (!bestEdgeA || !bestEdgeB) continue;

    // Alternate hosting side or choose smaller panel
    const hostA = pairCounter % 2 === 1;
    const hostPanelId = hostA ? pA.id : pB.id;
    const targetPanelId = hostA ? pB.id : pA.id;
    const hostEdge = hostA ? bestEdgeA : bestEdgeB;
    const matingEdge = hostA ? bestEdgeB : bestEdgeA;

    const [e1, e2] = hostEdge;
    const edgeL = segLen(e1, e2);
    if (edgeL < settings.minEdgeLength) {
      continue; // edge too short for glue tab
    }

    // Tangent vector
    const tx = (e2[0] - e1[0]) / edgeL;
    const ty = (e2[1] - e1[1]) / edgeL;

    // Outward normal
    const [nx, ny] = outwardNormal(e1, e2);

    // Tab height (capped at 30% of edge length)
    const tabH = Math.min(settings.tabHeight, edgeL * 0.35);

    // Chamfer setback (45 deg = tan(45)*H = H)
    const rad = (settings.chamferAngleDeg * Math.PI) / 180;
    const cot = 1.0 / Math.tan(rad);
    let setback = tabH * cot;

    // Ensure tab top edge has minimum length
    const clearance = settings.tabSpacing;
    const availableL = edgeL - 2 * clearance;
    if (2 * setback > availableL * 0.7) {
      setback = availableL * 0.3;
    }

    // Base points along edge
    const b0: Vec2 = [e1[0] + tx * clearance, e1[1] + ty * clearance];
    const b3: Vec2 = [e2[0] - tx * clearance, e2[1] - ty * clearance];

    // Top points extruded outward with chamfer
    const b1: Vec2 = [
      b0[0] + tx * setback + nx * tabH,
      b0[1] + ty * setback + ny * tabH,
    ];
    const b2: Vec2 = [
      b3[0] - tx * setback + nx * tabH,
      b3[1] - ty * setback + ny * tabH,
    ];

    const tabPolygon2D: Vec2[] = [b0, b1, b2, b3];
    const foldLine2D: [Vec2, Vec2] = [b0, b3];

    // Label position inside tab
    const labelPos: Vec2 = [
      (b0[0] + b1[0] + b2[0] + b3[0]) / 4,
      (b0[1] + b1[1] + b2[1] + b3[1]) / 4,
    ];

    // Mating label position: inset into mating panel along inward normal
    const [m1, m2] = matingEdge;
    const [mnx, mny] = outwardNormal(m1, m2);
    const mCenter: Vec2 = [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2];
    const matingLabelPos: Vec2 = [
      mCenter[0] - mnx * 4.0, // 4mm inside the panel
      mCenter[1] - mny * 4.0,
    ];

    const pairLabel = `${pairCounter}`;
    const tabId = `TAB-${pairCounter.toString().padStart(3, '0')}`;

    tabs.push({
      id: tabId,
      seamEdgeId: seam.edgeId,
      matchingEdgeId: seam.edgeId,
      pairIndex: pairCounter,
      pairLabel,
      sourcePanelId: hostPanelId,
      targetPanelId,
      baseEdge2D: [b0, b3],
      tabPolygon2D,
      foldLine2D,
      height: tabH,
      chamferAngleDeg: settings.chamferAngleDeg,
      labelPosition2D: labelPos,
      matchingLabelPosition2D: matingLabelPos,
      type: 'GLUE_TAB',
    });

    pairCounter++;
  }

  return tabs;
}
