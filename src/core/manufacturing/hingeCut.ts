/**
 * @license
 * AUME LowPoly Fabrication — Hand-Bend Hinge Cut Pattern Generator
 * Replaces continuous press-brake bend lines with laser-cut dash+tab hinges
 * Specification Compliant: Perforated Hinge Cut / Wave-Dot Pattern
 */

import { Vec2 } from '../geometry/types';
import { HingeCutPattern, HingeDash, ManufacturingSettings } from './types';

function dist2D(p1: Vec2, p2: Vec2): number {
  return Math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2);
}

function lerp2D(p1: Vec2, p2: Vec2, t: number): Vec2 {
  return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
}

/**
 * Computes how many tabs an edge of given length should have,
 * given target spacing (hingeTabDensityMm) and a hard minimum (hingeMinTabCount).
 */
export function computeTabCount(length: number, settings: ManufacturingSettings): number {
  const density = settings.hingeTabDensityMm > 0 ? settings.hingeTabDensityMm : 18;
  const minCount = settings.hingeMinTabCount >= 1 ? settings.hingeMinTabCount : 2;
  const bySpacing = Math.floor(length / density);
  return Math.max(minCount, bySpacing);
}

/**
 * Generates the dash+tab hinge cut pattern along a straight edge (start -> end).
 * Returns actual laser-cut dash segments (for CUT layer) and tab gap segments
 * (for reference/visualization only — these must NOT be cut).
 */
export function generateHingeCutPattern(
  edgeId: number,
  start: Vec2,
  end: Vec2,
  bendType: 'MOUNTAIN' | 'VALLEY',
  settings: ManufacturingSettings
): HingeCutPattern {
  const totalLength = dist2D(start, end);
  if (totalLength < 1e-4) {
    return {
      edgeId,
      bendType,
      dashes: [],
      tabGaps: [],
      totalLength: 0,
      tabCount: 0,
    };
  }

  const tabCount = computeTabCount(totalLength, settings);

  // Distribute tabs evenly along the line, always reserving tabs at both ends
  // if hingeEdgeTabRequired is true to prevent premature part separation on laser bed.
  const tabPositions: number[] = [];

  if (settings.hingeEdgeTabRequired) {
    const endInset = Math.min(0.5, Math.max(0.02, settings.hingeTabLength)) / totalLength;
    tabPositions.push(Math.min(0.15, endInset));
    tabPositions.push(Math.max(0.85, 1 - endInset));
  }

  const remaining = tabCount - tabPositions.length;
  for (let i = 1; i <= remaining; i++) {
    tabPositions.push(i / (remaining + 1));
  }
  tabPositions.sort((a, b) => a - b);

  // Convert tab centers (parametric t in [0,1]) into actual tab start/end spans
  const tabHalfLenT = (settings.hingeTabLength / 2) / totalLength;
  const tabs: { t0: number; t1: number }[] = tabPositions.map((t) => ({
    t0: Math.max(0, t - tabHalfLenT),
    t1: Math.min(1, t + tabHalfLenT),
  }));

  // Build dash segments = everything BETWEEN consecutive tabs (and before first / after last)
  const dashes: HingeDash[] = [];
  const tabGaps: HingeDash[] = [];

  let cursor = 0;
  for (const tab of tabs) {
    if (tab.t0 > cursor + 1e-6) {
      dashes.push({
        start: lerp2D(start, end, cursor),
        end: lerp2D(start, end, tab.t0),
      });
    }
    tabGaps.push({
      start: lerp2D(start, end, tab.t0),
      end: lerp2D(start, end, tab.t1),
    });
    cursor = tab.t1;
  }
  if (cursor < 1 - 1e-6) {
    dashes.push({
      start: lerp2D(start, end, cursor),
      end: lerp2D(start, end, 1),
    });
  }

  // Safety: further split any dash longer than hingeDashLength into multiple
  // dash segments so that we maintain the regular dashed cut rhythm
  const maxDashLen = settings.hingeDashLength > 0 ? settings.hingeDashLength : 4.0;
  const finalDashes: HingeDash[] = [];
  for (const d of dashes) {
    const dLen = dist2D(d.start, d.end);
    if (dLen <= maxDashLen * 1.5) {
      finalDashes.push(d);
      continue;
    }
    const nSplits = Math.ceil(dLen / maxDashLen);
    for (let i = 0; i < nSplits; i++) {
      finalDashes.push({
        start: lerp2D(d.start, d.end, i / nSplits),
        end: lerp2D(d.start, d.end, (i + 1) / nSplits),
      });
    }
  }

  return {
    edgeId,
    bendType,
    dashes: finalDashes,
    tabGaps,
    totalLength: Math.round(totalLength * 100) / 100,
    tabCount: tabs.length,
  };
}

/**
 * Transforms a HingeCutPattern by applying a 2D transform function to all coordinates
 */
export function transformHingeCutPattern(
  pattern: HingeCutPattern,
  transformPoint: (pt: Vec2) => Vec2
): HingeCutPattern {
  return {
    ...pattern,
    dashes: pattern.dashes.map((d) => ({
      start: transformPoint(d.start),
      end: transformPoint(d.end),
    })),
    tabGaps: pattern.tabGaps.map((g) => ({
      start: transformPoint(g.start),
      end: transformPoint(g.end),
    })),
  };
}
