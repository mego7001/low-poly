/**
 * @license
 * AUME LowPoly Fabrication — Assembly Map & Order Generator
 * Specification Compliant: Sections 50, 51
 */

import { GeometryReconstructionResult } from '../geometry/types';
import {
  AssemblyConnection,
  AssemblyMap,
  AssemblyNode,
  BendEdgeInfo,
  SeamCandidate,
  SmartPanel,
} from './types';

export function buildAssemblyMap(
  panels: SmartPanel[],
  bends: BendEdgeInfo[],
  reconstruction: GeometryReconstructionResult,
  seams?: SeamCandidate[]
): AssemblyMap {
  const panelMap = new Map<number, SmartPanel>();
  panels.forEach((p) => panelMap.set(p.regionId, p));

  const connections: AssemblyConnection[] = [];

  // Group bends and adjacencies
  for (const bend of bends) {
    connections.push({
      fromPanelId: bend.panelAId,
      toPanelId: bend.panelBId,
      edgeId: bend.edgeId,
      type: 'bend',
      length: Math.round(bend.length * 10) / 10,
      angleDeg: Math.round(bend.bendAngleDeg * 10) / 10,
    });
  }

  // Also include seams if provided (Section 50, 51)
  if (seams && seams.length > 0) {
    for (const seam of seams) {
      const pA = panelMap.get(seam.regionA);
      const pB = panelMap.get(seam.regionB);
      if (pA && pB) {
        connections.push({
          fromPanelId: pA.id,
          toPanelId: pB.id,
          edgeId: seam.edgeId,
          type: 'seam',
          length: Math.round(seam.length * 10) / 10,
          angleDeg: 0,
        });
      }
    }
  }

  // Sort panels by area descending to start assembly from largest base panel (Section 51)
  const sortedPanels = [...panels].sort((a, b) => b.area - a.area);
  const assemblySequence: string[] = sortedPanels.map((p) => p.id);

  const assembledSet = new Set<string>();

  const nodes: AssemblyNode[] = sortedPanels.map((panel, idx) => {
    const nodeConnections = connections.filter(
      (c) => c.fromPanelId === panel.id || c.toPanelId === panel.id
    );

    // Generate step instruction
    let instruction = '';
    if (idx === 0) {
      instruction = `تثبيت لوح الأساس الأكبر (${panel.id}) كقاعدة مرجعية للتجميع (Base Datum).`;
    } else {
      // Find connection to previously assembled panel
      const existingConn = nodeConnections.find(
        (c) =>
          (c.fromPanelId === panel.id && assembledSet.has(c.toPanelId)) ||
          (c.toPanelId === panel.id && assembledSet.has(c.fromPanelId))
      );

      if (existingConn) {
        const targetId =
          existingConn.fromPanelId === panel.id
            ? existingConn.toPanelId
            : existingConn.fromPanelId;
        if (existingConn.type === 'bend') {
          instruction = `ثني وربط اللوح ${panel.id} مع اللوح ${targetId} بزاوية ${existingConn.angleDeg}° بطول ${existingConn.length} مم.`;
        } else {
          instruction = `تثبيت اللوح ${panel.id} باللوح ${targetId} عبر درز اللحام/اللسان المشترك بطول ${existingConn.length} مم.`;
        }
      } else {
        instruction = `تجميع اللوح ${panel.id} ضمن القطاع #${panel.sectorId} ومحاذاة الحواف الخارجية.`;
      }
    }

    assembledSet.add(panel.id);

    return {
      panelId: panel.id,
      regionId: panel.regionId,
      type: panel.type,
      area: Math.round(panel.area * 100) / 100,
      sector: panel.sectorId,
      order: idx + 1,
      connections: nodeConnections,
      instruction,
    };
  });

  return {
    nodes,
    connections,
    assemblySequence,
  };
}
