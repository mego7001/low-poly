/**
 * @license
 * AUME LowPoly Fabrication — Phase 6: CNC G-Code Post-Processor
 * Specification Compliant: Sections 61, 75, 76 (ISO 6983 / RS-274D Standard)
 */

import { CNCSettings, SheetToolpath, ToolpathPlan } from './types';

/**
 * Formats a coordinate number to 3 decimal places
 */
function fmt(n: number): string {
  return n.toFixed(3);
}

/**
 * Generates ISO 6983 compliant G-Code for a single nested sheet
 */
export function generateSheetGCode(
  sheet: SheetToolpath,
  cncSettings: CNCSettings,
  sheetIndex: number = 1
): string {
  const lines: string[] = [];

  // --- Header Block ---
  lines.push(`%`);
  lines.push(`(=======================================================)`);
  lines.push(`( AUME LowPoly Fabrication CAM - Laser Post-Processor   )`);
  lines.push(`( Sheet: ${sheet.sheetId} - Program #${sheetIndex}                   )`);
  lines.push(`( Date: ${new Date().toISOString()}                  )`);
  lines.push(`( Assist Gas: ${cncSettings.assistGas} @ ${cncSettings.assistGasPressureBar} Bar )`);
  lines.push(`( Cutting Feedrate: ${cncSettings.cuttingFeedrateMmMin} mm/min                   )`);
  lines.push(`( Rapid Feedrate: ${cncSettings.rapidFeedrateMmMin} mm/min                    )`);
  lines.push(`( Laser Power: ${cncSettings.laserPowerWatt} Watts                       )`);
  lines.push(`( Pierce Delay: ${cncSettings.pierceDelaySec} sec                        )`);
  lines.push(`( Total Pierces: ${sheet.sheetPierceCount} | Cut Distance: ${sheet.sheetCutDistanceMm} mm )`);
  lines.push(`( Est. Cycle Time: ${sheet.sheetTotalEstimatedTimeSec} sec                    )`);
  lines.push(`(=======================================================)`);
  lines.push(``);

  // Safety & Modal Initialization
  lines.push(`G21 (Metric Units - mm)`);
  lines.push(`G90 (Absolute Programming)`);
  lines.push(`G54 (Work Coordinate System #1)`);
  lines.push(`G40 (Tool Radius Compensation Cancel)`);
  lines.push(`G80 (Cancel Canned Cycles)`);
  lines.push(`G94 (Feedrate per Minute)`);
  lines.push(``);

  // Home Laser Head & Safe Clearance
  lines.push(`G00 Z${fmt(cncSettings.safeZMm)} (Retract to Safe Z)`);
  lines.push(`G00 X0.000 Y0.000 F${cncSettings.rapidFeedrateMmMin} (Rapid to Home)`);
  lines.push(`M08 (Assist Gas ON)`);
  lines.push(``);

  // Iterate over contours in optimized sequence
  sheet.contours.forEach((contour, idx) => {
    lines.push(`(-------------------------------------------------------)`);
    lines.push(`( Contour #${contour.cutOrder} - Type: ${contour.contourType} [${contour.id}] )`);
    lines.push(`(-------------------------------------------------------)`);

    const piercePt = contour.leadInPoint || contour.points[0];

    // Rapid to pierce location at Safe Z
    lines.push(`G00 X${fmt(piercePt[0])} Y${fmt(piercePt[1])} (Rapid to Pierce Position)`);
    lines.push(`G00 Z${fmt(cncSettings.cutZMm)} (Lower Torch to Cutting Height)`);

    // Pierce cycle
    lines.push(
      `M03 S${cncSettings.laserPowerWatt} (Laser ON at ${cncSettings.laserPowerWatt}W)`
    );
    if (cncSettings.pierceDelaySec > 0) {
      lines.push(`G04 P${fmt(cncSettings.pierceDelaySec)} (Dwell / Pierce Delay)`);
    }

    // Lead-in movement if present
    if (contour.leadInPoint && contour.points.length > 0) {
      const firstCutPt = contour.points[0];
      lines.push(
        `G01 X${fmt(firstCutPt[0])} Y${fmt(firstCutPt[1])} F${cncSettings.cuttingFeedrateMmMin} (Lead-in cut)`
      );
    }

    // Cut contour points
    for (let i = 1; i < contour.points.length; i++) {
      const pt = contour.points[i];
      lines.push(`G01 X${fmt(pt[0])} Y${fmt(pt[1])}`);
    }

    // If closed contour, close loop to first point
    if (contour.isClosed && contour.points.length > 2) {
      const firstPt = contour.points[0];
      lines.push(`G01 X${fmt(firstPt[0])} Y${fmt(firstPt[1])} (Close perimeter loop)`);
    }

    // Laser OFF & Retract Torch
    lines.push(`M05 (Laser OFF)`);
    lines.push(`G00 Z${fmt(cncSettings.safeZMm)} (Torch Retract to Safe Z)`);
    lines.push(``);
  });

  // Footer & Machine Shutdown
  lines.push(`(=======================================================)`);
  lines.push(`( End of Sheet Program                                  )`);
  lines.push(`(=======================================================)`);
  lines.push(`M09 (Assist Gas OFF)`);
  lines.push(`G00 X0.000 Y0.000 (Return to Unload / Home Position)`);
  lines.push(`M30 (Program End and Rewind)`);
  lines.push(`%`);

  return lines.join('\n');
}

/**
 * Generates full multi-sheet CNC G-Code program
 */
export function generateProjectGCode(
  plan: ToolpathPlan,
  cncSettings: CNCSettings
): string {
  const parts: string[] = [];
  plan.sheets.forEach((sheet, idx) => {
    parts.push(generateSheetGCode(sheet, cncSettings, idx + 1));
  });
  return parts.join('\n\n\n');
}
