/**
 * @license
 * AUME LowPoly Fabrication — Clean DXF Generation
 * Specification Compliant: Sections 2.2, 22, 45, 46, 59, 74
 * Strict Mandate: ZERO internal triangulation in DXF!
 */

import { ManufacturingSettings, NestingSheet, PlacedPart } from './types';
import { Vec2 } from '../geometry/types';

export interface DXFExportOptions {
  includeSheets?: boolean;
  sheetIndex?: number; // export specific sheet or all sheets
  textHeight?: number;
}

/**
 * Generates valid AutoCAD DXF R12 / ASCII format with layered geometry.
 * Layers:
 * - CUT: Outer contour lines for laser/plasma/waterjet cutting (White/Black)
 * - BEND: Mountain/Valley fold lines for press brake (Red / Yellow)
 * - SCORE: Scoring / etching reference lines (Green)
 * - MARK: Alignment marks / notches (Cyan)
 * - ID: Panel/Part ID annotations (Magenta)
 */
export function generateDXF(
  sheets: NestingSheet[],
  settings: ManufacturingSettings,
  options?: DXFExportOptions
): string {
  const targetSheets =
    options?.sheetIndex !== undefined
      ? sheets.filter((s) => s.sheetIndex === options.sheetIndex)
      : sheets;

  const textHeight =
    options?.textHeight ??
    (settings.textSize === 'Small'
      ? 3.0
      : settings.textSize === 'Large'
        ? 8.0
        : settings.customTextHeight || 5.0);

  const lines: string[] = [];

  const add = (groupCode: number, value: string | number) => {
    lines.push(groupCode.toString().padStart(3, ' '));
    lines.push(value.toString());
  };

  // 1. HEADER SECTION
  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1009'); // AutoCAD R12 DXF format (maximum CNC compatibility)
  add(9, '$MEASUREMENT');
  add(70, 1); // Metric (mm)
  add(0, 'ENDSEC');

  // 2. TABLES SECTION (Define Layers)
  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, 7);

  const layers = [
    { name: 'CUT', color: 7 }, // White
    { name: 'BEND', color: 1 }, // Red
    { name: 'SCORE', color: 3 }, // Green
    { name: 'MARK', color: 4 }, // Cyan
    { name: 'ID', color: 6 }, // Magenta
    { name: 'SHEET_BORDER', color: 8 }, // Gray
    { name: 'REMNANT', color: 4 }, // Cyan
  ];

  for (const l of layers) {
    add(0, 'LAYER');
    add(2, l.name);
    add(70, 0);
    add(62, l.color);
    add(6, 'CONTINUOUS');
  }

  add(0, 'ENDTAB');
  add(0, 'ENDSEC');

  // 3. ENTITIES SECTION
  add(0, 'SECTION');
  add(2, 'ENTITIES');

  let sheetOffsetX = 0;

  for (const sheet of targetSheets) {
    // Draw sheet boundary if multi-sheet
    if (sheets.length > 1 || options?.includeSheets) {
      drawPolyline(
        [
          [sheetOffsetX, 0],
          [sheetOffsetX + sheet.width, 0],
          [sheetOffsetX + sheet.width, sheet.height],
          [sheetOffsetX, sheet.height],
          [sheetOffsetX, 0],
        ],
        'SHEET_BORDER',
        add
      );

      // Sheet label
      addText(
        `SHEET ${sheet.sheetIndex} (${sheet.width}x${sheet.height}mm - Util: ${sheet.utilizationPercent}%)`,
        [sheetOffsetX + 20, sheet.height - 20],
        textHeight * 1.5,
        'ID',
        add
      );
    }

    // Place parts
    for (const part of sheet.placedParts) {
      const shiftedPolygon: Vec2[] = part.polygon.map(([x, y]) => [
        x + sheetOffsetX,
        y,
      ]);

      // 1. Draw outer cutting boundary (Closed polyline on CUT layer)
      // Strictly outer contour - NEVER internal triangulation!
      drawPolyline(shiftedPolygon, 'CUT', add, true);

      // 2. Draw bend lines (on BEND layer)
      for (const bl of part.bendLines) {
        drawLine(
          [bl.start[0] + sheetOffsetX, bl.start[1]],
          [bl.end[0] + sheetOffsetX, bl.end[1]],
          'BEND',
          add
        );
      }

      // 3. Draw Part & Panel ID Text (on ID layer)
      const center = computePolygonCenter(shiftedPolygon);
      addText(part.panelId, center, textHeight, 'ID', add);

      // 4. Draw Assembly Tabs (if attached to part)
      if (part.tabs && part.tabs.length > 0) {
        for (const tab of part.tabs) {
          // Tab 3 outer contour edges on CUT layer
          const shiftedTabPoly: Vec2[] = tab.tabPolygon2D.map(([tx, ty]) => [
            tx + sheetOffsetX,
            ty,
          ]);
          drawLine(shiftedTabPoly[0], shiftedTabPoly[1], 'CUT', add);
          drawLine(shiftedTabPoly[1], shiftedTabPoly[2], 'CUT', add);
          drawLine(shiftedTabPoly[2], shiftedTabPoly[3], 'CUT', add);

          // Tab base fold line on SCORE layer
          drawLine(
            [tab.foldLine2D[0][0] + sheetOffsetX, tab.foldLine2D[0][1]],
            [tab.foldLine2D[1][0] + sheetOffsetX, tab.foldLine2D[1][1]],
            'SCORE',
            add
          );

          // Tab pair ID label on ID layer
          addText(
            `#${tab.pairLabel}`,
            [tab.labelPosition2D[0] + sheetOffsetX, tab.labelPosition2D[1]],
            textHeight * 0.7,
            'ID',
            add
          );
        }
      }
    }

    // Draw Remnant Rectangles for scrap recovery (Section 43)
    if (sheet.remnants && sheet.remnants.length > 0) {
      for (const rem of sheet.remnants) {
        drawPolyline(
          [
            [sheetOffsetX + rem.x, rem.y],
            [sheetOffsetX + rem.x + rem.width, rem.y],
            [sheetOffsetX + rem.x + rem.width, rem.y + rem.height],
            [sheetOffsetX + rem.x, rem.y + rem.height],
            [sheetOffsetX + rem.x, rem.y],
          ],
          'REMNANT',
          add
        );
        addText(
          `REMNANT ${rem.width}x${rem.height}mm`,
          [sheetOffsetX + rem.x + 10, rem.y + 10],
          textHeight * 0.8,
          'REMNANT',
          add
        );
      }
    }

    sheetOffsetX += sheet.width + 100; // Offset next sheet
  }

  add(0, 'ENDSEC');
  add(0, 'EOF');

  return lines.join('\n');
}

function drawLine(
  p1: Vec2,
  p2: Vec2,
  layer: string,
  add: (code: number, val: string | number) => void
) {
  add(0, 'LINE');
  add(8, layer);
  add(10, p1[0].toFixed(4));
  add(20, p1[1].toFixed(4));
  add(30, 0);
  add(11, p2[0].toFixed(4));
  add(21, p2[1].toFixed(4));
  add(31, 0);
}

function drawPolyline(
  points: Vec2[],
  layer: string,
  add: (code: number, val: string | number) => void,
  closed: boolean = false
) {
  if (points.length < 2) return;

  add(0, 'POLYLINE');
  add(8, layer);
  add(66, 1);
  add(70, closed ? 1 : 0);

  for (const pt of points) {
    add(0, 'VERTEX');
    add(8, layer);
    add(10, pt[0].toFixed(4));
    add(20, pt[1].toFixed(4));
    add(30, 0);
  }

  add(0, 'SEQEND');
}

function addText(
  text: string,
  point: Vec2,
  height: number,
  layer: string,
  add: (code: number, val: string | number) => void
) {
  add(0, 'TEXT');
  add(8, layer);
  add(10, point[0].toFixed(4));
  add(20, point[1].toFixed(4));
  add(30, 0);
  add(40, height.toFixed(2));
  add(1, text);
}

function computePolygonCenter(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return [0, 0];
  let sumX = 0, sumY = 0;
  for (const p of pts) {
    sumX += p[0];
    sumY += p[1];
  }
  return [sumX / pts.length, sumY / pts.length];
}
