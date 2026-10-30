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

  // Build adjacency graph of panel connections (Section 14, 50, 51)
  const panelAdj = new Map<string, { targetId: string; conn: AssemblyConnection }[]>();
  for (const p of panels) {
    panelAdj.set(p.id, []);
  }
  for (const c of connections) {
    panelAdj.get(c.fromPanelId)?.push({ targetId: c.toPanelId, conn: c });
    panelAdj.get(c.toPanelId)?.push({ targetId: c.fromPanelId, conn: c });
  }

  // Topological wavefront assembly ordering:
  // 1. Pick primary base datum panel (highest connection count, tie-break by largest area)
  const remainingPanels = new Map<string, SmartPanel>();
  panels.forEach((p) => remainingPanels.set(p.id, p));

  const orderedPanels: SmartPanel[] = [];
  const assembledSet = new Set<string>();

  while (remainingPanels.size > 0) {
    // If starting a new connected component, pick best base datum
    let bestDatum: SmartPanel | null = null;
    let maxScore = -1;

    for (const p of remainingPanels.values()) {
      const connCount = panelAdj.get(p.id)?.length || 0;
      const score = connCount * 1000 + p.area;
      if (score > maxScore) {
        maxScore = score;
        bestDatum = p;
      }
    }

    if (!bestDatum) break;

    // BFS wavefront queue: expand along bends first, then seams
    const queue: SmartPanel[] = [bestDatum];
    remainingPanels.delete(bestDatum.id);
    assembledSet.add(bestDatum.id);
    orderedPanels.push(bestDatum);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = panelAdj.get(current.id) || [];

      // Sort neighbor connections: bends first, then seams by length descending
      const sortedNeighbors = [...neighbors].sort((a, b) => {
        if (a.conn.type !== b.conn.type) {
          return a.conn.type === 'bend' ? -1 : 1;
        }
        return b.conn.length - a.conn.length;
      });

      for (const nb of sortedNeighbors) {
        if (remainingPanels.has(nb.targetId)) {
          const nbPanel = remainingPanels.get(nb.targetId)!;
          remainingPanels.delete(nb.targetId);
          assembledSet.add(nbPanel.id);
          orderedPanels.push(nbPanel);
          queue.push(nbPanel);
        }
      }
    }
  }

  const assemblySequence: string[] = orderedPanels.map((p) => p.id);

  // Generate assembly instructions based on topological attachment
  const processedSet = new Set<string>();

  const nodes: AssemblyNode[] = orderedPanels.map((panel, idx) => {
    const nodeConnections = connections.filter(
      (c) => c.fromPanelId === panel.id || c.toPanelId === panel.id
    );

    // Generate step instruction
    let instruction = '';
    if (idx === 0) {
      instruction = `تثبيت لوح الأساس الأكبر (${panel.id}) كقاعدة مرجعية رئيسية للتجميع (Base Datum).`;
    } else {
      // Find connection to an already assembled predecessor panel (prioritize bend over seam)
      const existingConn = nodeConnections
        .filter(
          (c) =>
            (c.fromPanelId === panel.id && processedSet.has(c.toPanelId)) ||
            (c.toPanelId === panel.id && processedSet.has(c.fromPanelId))
        )
        .sort((a, b) => (a.type === 'bend' ? -1 : 1))[0];

      if (existingConn) {
        const targetId =
          existingConn.fromPanelId === panel.id
            ? existingConn.toPanelId
            : existingConn.fromPanelId;
        if (existingConn.type === 'bend') {
          instruction = `ثني وربط اللوح ${panel.id} مع اللوح ${targetId} بزاوية ${existingConn.angleDeg}° بطول ثنية ${existingConn.length} مم.`;
        } else {
          instruction = `تثبيت اللوح ${panel.id} باللوح ${targetId} عبر درز اللحام/اللسان المشترك بطول ${existingConn.length} مم.`;
        }
      } else {
        instruction = `تجميع اللوح ${panel.id} ضمن القطاع #${panel.sectorId} كقاعدة فرعية ومحاذاة الحواف الخارجية.`;
      }
    }

    processedSet.add(panel.id);

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
