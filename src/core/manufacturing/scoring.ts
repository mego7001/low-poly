/**
 * @license
 * AUME LowPoly Fabrication — Manufacturability Scoring Engine
 * Specification Compliant: Section 52
 */

import {
  ManufacturabilityScore,
  NestingResult,
  ScoreDeduction,
  SmartPanel,
  UnfoldResult,
} from './types';

export function evaluateManufacturabilityScore(
  panels: SmartPanel[],
  unfold: UnfoldResult,
  nesting: NestingResult
): ManufacturabilityScore {
  let score = 100;
  const deductions: ScoreDeduction[] = [];

  // 1. Residual overlaps (Critical deduction)
  if (unfold.residualOverlaps > 0) {
    const points = Math.min(30, unfold.residualOverlaps * 15);
    score -= points;
    deductions.push({
      reason: 'Residual 2D Overlaps',
      points,
      detail: `${unfold.residualOverlaps} overlaps detected in flat patterns requiring additional seams.`,
    });
  }

  // 2. Unplaced parts
  if (nesting.unplacedPartsCount > 0) {
    const points = Math.min(25, nesting.unplacedPartsCount * 10);
    score -= points;
    deductions.push({
      reason: 'Unplaced Parts in Nesting',
      points,
      detail: `${nesting.unplacedPartsCount} parts could not fit within the configured sheet constraints.`,
    });
  }

  // 3. Extreme bend warnings
  const extremeBends = unfold.allBends.filter(
    (b) => b.warningState === 'SEVERE_BEND' || b.warningState === 'TINY_RADIUS'
  );
  if (extremeBends.length > 0) {
    const points = Math.min(15, extremeBends.length * 3);
    score -= points;
    deductions.push({
      reason: 'Extreme Bend Warnings',
      points,
      detail: `${extremeBends.length} fold lines exceed press-brake radius or maximum angle limits.`,
    });
  }

  // 4. Multiple sheet penalty
  if (nesting.sheets.length > 1) {
    const points = Math.min(10, (nesting.sheets.length - 1) * 3);
    score -= points;
    deductions.push({
      reason: 'Multi-Sheet Distribution',
      points,
      detail: `Model requires ${nesting.sheets.length} raw sheets to nest completely.`,
    });
  }

  // 5. Low panel confidence check
  const lowConfPanels = panels.filter((p) => p.confidence < 60);
  if (lowConfPanels.length > 0) {
    const points = Math.min(10, lowConfPanels.length * 2);
    score -= points;
    deductions.push({
      reason: 'Low Planarity Confidence',
      points,
      detail: `${lowConfPanels.length} panels exhibit minor planarity deviation from mathematical flat planes.`,
    });
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let rating: ManufacturabilityScore['rating'] = 'EXCELLENT';
  if (finalScore < 60) rating = 'CRITICAL_ISSUES';
  else if (finalScore < 80) rating = 'NEEDS_REVIEW';
  else if (finalScore < 90) rating = 'GOOD';

  return {
    score: finalScore,
    rating,
    deductions,
    weldEfficiency: Math.min(100, Math.round(85 + (100 - panels.length) * 0.1)),
    nestingEfficiency: Math.round(nesting.overallUtilization),
    bendSafety: Math.round(
      ((unfold.allBends.length - extremeBends.length) /
        Math.max(1, unfold.allBends.length)) *
        100
    ),
  };
}
