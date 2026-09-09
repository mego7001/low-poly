/**
 * @license
 * AUME LowPoly Fabrication — Bill of Materials (BOM) Generator
 * Specification Compliant: Sections 49, 59
 */

import {
  BendEdgeInfo,
  BOMItem,
  ManufacturingSettings,
  NestingResult,
  SmartPanel,
} from './types';

/**
 * Computes exact 2D perimeter of polygon vertices
 */
function computePolygonPerimeter(vertices: [number, number][]): number {
  if (vertices.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < vertices.length; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % vertices.length];
    const dx = v2[0] - v1[0];
    const dy = v2[1] - v1[1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

export function generateBOM(
  panels: SmartPanel[],
  nesting: NestingResult,
  settings: ManufacturingSettings,
  bends?: BendEdgeInfo[]
): BOMItem[] {
  // Map panelId -> sheet assignment
  const panelToSheet = new Map<string, string>();
  for (const sheet of nesting.sheets) {
    for (const p of sheet.placedParts) {
      panelToSheet.set(p.panelId, `Sheet ${sheet.sheetIndex}`);
    }
  }

  // Count bends per panel if provided
  const panelBendCounts = new Map<string, number>();
  if (bends) {
    for (const b of bends) {
      panelBendCounts.set(b.panelAId, (panelBendCounts.get(b.panelAId) || 0) + 1);
      panelBendCounts.set(b.panelBId, (panelBendCounts.get(b.panelBId) || 0) + 1);
    }
  }

  return panels.map((panel, idx) => {
    const areaMm2 = Math.round(panel.area * 100) / 100;
    // Volume in cm3 = (areaMm2 / 100) * (thickness / 10)
    // Mass in grams = volume * density
    const volumeCm3 = (areaMm2 / 100) * (settings.materialThickness / 10);
    const estimatedMassGrams = Math.round(volumeCm3 * settings.density * 10) / 10;

    const perimeter = computePolygonPerimeter(panel.outerVertices2D);
    const bendCount =
      panelBendCounts.get(panel.id) ??
      Math.min(3, Math.max(1, panel.boundaryVertexCount - 2));

    return {
      partId: `PART-${panel.id}`,
      panelId: panel.id,
      type: panel.type,
      areaMm2,
      quantity: 1,
      material: settings.material,
      thicknessMm: settings.materialThickness,
      estimatedMassGrams,
      sheetAssignment: panelToSheet.get(panel.id) || 'Unassigned',
      assemblyOrder: idx + 1,
      bendCount,
      weldLengthMm: Math.round(perimeter * 10) / 10,
    };
  });
}

export interface BOMTotals {
  totalPanels: number;
  totalAreaM2: number;
  totalMassKg: number;
  totalWeldLengthM: number;
  totalBendCount: number;
}

export function calculateBOMTotals(bom: BOMItem[]): BOMTotals {
  const totalAreaMm2 = bom.reduce((acc, item) => acc + item.areaMm2, 0);
  const totalMassGrams = bom.reduce((acc, item) => acc + item.estimatedMassGrams, 0);
  const totalWeldMm = bom.reduce((acc, item) => acc + item.weldLengthMm, 0);
  const totalBendCount = bom.reduce((acc, item) => acc + item.bendCount, 0);

  return {
    totalPanels: bom.length,
    totalAreaM2: Math.round((totalAreaMm2 / 1_000_000) * 1000) / 1000,
    totalMassKg: Math.round((totalMassGrams / 1_000) * 100) / 100,
    totalWeldLengthM: Math.round((totalWeldMm / 1_000) * 100) / 100,
    totalBendCount,
  };
}

export function bomToCSV(bom: BOMItem[]): string {
  const headers = [
    'Part ID',
    'Panel ID',
    'Geometry Type',
    'Area (mm²)',
    'Quantity',
    'Material',
    'Thickness (mm)',
    'Mass (g)',
    'Sheet Assignment',
    'Assembly Order',
    'Bends',
    'Weld Length (mm)',
  ];

  const rows = bom.map((item) => [
    item.partId,
    item.panelId,
    item.type,
    item.areaMm2,
    item.quantity,
    `"${item.material}"`,
    item.thicknessMm,
    item.estimatedMassGrams,
    item.sheetAssignment,
    item.assemblyOrder,
    item.bendCount,
    item.weldLengthMm,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
