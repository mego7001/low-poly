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

  // 6. Excessive Panel Fragmentation & Singleton Explosion (Section 17, 18)
  const singletonPanels = panels.filter((p) => p.faceCount === 1);
  if (panels.length > 40 || singletonPanels.length > 15) {
    const fragPenalty = Math.min(
      20,
      Math.max(0, Math.floor((panels.length - 30) * 0.4) + Math.floor(singletonPanels.length * 0.5))
    );
    if (fragPenalty > 0) {
      score -= fragPenalty;
      deductions.push({
        reason: 'Panel Fragmentation & Singletons',
        points: fragPenalty,
        detail: `High panel count (${panels.length} panels, ${singletonPanels.length} singletons) increases assembly time and seam count.`,
      });
    }
  }

  // 7. Low Material Utilization Penalty (Section 17)
  if (nesting.overallUtilization < 45 && nesting.sheets.length > 0) {
    const utilPenalty = Math.min(15, Math.round((45 - nesting.overallUtilization) * 0.4));
    if (utilPenalty > 0) {
      score -= utilPenalty;
      deductions.push({
        reason: 'Low Sheet Nesting Utilization',
        points: utilPenalty,
        detail: `Material nesting utilization is only ${nesting.overallUtilization.toFixed(1)}%, resulting in high raw stock scrap.`,
      });
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));

  let rating: ManufacturabilityScore['rating'] = 'EXCELLENT';
  if (finalScore < 60) rating = 'CRITICAL_ISSUES';
  else if (finalScore < 80) rating = 'NEEDS_REVIEW';
  else if (finalScore < 90) rating = 'GOOD';

  // Real Weld Efficiency Metric (Section 17, 18):
  // Measures the ratio of folded joints (zero-weld) vs total joints requiring manual welding
  const totalBendLength = unfold.allBends.reduce((acc, b) => acc + b.length, 0);
  const totalSeamLength = (unfold.allSeams || []).reduce((acc, s) => acc + s.length, 0);
  const totalJointLength = totalBendLength + totalSeamLength;

  const realWeldEfficiency =
    totalJointLength > 0
      ? Math.max(0, Math.min(100, Math.round((totalBendLength / totalJointLength) * 100)))
      : 100;

  return {
    score: finalScore,
    rating,
    deductions,
    weldEfficiency: realWeldEfficiency,
    nestingEfficiency: Math.max(0, Math.min(100, Math.round(nesting.overallUtilization))),
    bendSafety: Math.round(
      ((unfold.allBends.length - extremeBends.length) /
        Math.max(1, unfold.allBends.length)) *
        100
    ),
  };
}
