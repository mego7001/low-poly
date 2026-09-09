/**
 * @license
 * AUME LowPoly Fabrication — Phase 6: Kinematic Folding & Digital Twin Simulation
 * Specification Compliant: Sections 50, 51, 62, 70, 71
 */

import { Vec3 } from '../geometry/types';
import {
  SmartPanel,
  UnfoldResult,
  AssemblyMap,
  KinematicSimulation,
  KinematicFrame,
  KinematicStep,
  KinematicPanelState,
} from './types';

/**
 * Linear interpolation between two 3D vectors
 */
function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Compute centroid of 3D vertices
 */
function computeCentroid3D(pts: Vec3[]): Vec3 {
  if (pts.length === 0) return [0, 0, 0];
  let x = 0, y = 0, z = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
    z += p[2];
  }
  return [x / pts.length, y / pts.length, z / pts.length];
}

/**
 * Builds the kinematic folding simulation structure
 */
export function buildKinematicSimulation(
  panels: SmartPanel[],
  unfold: UnfoldResult,
  assembly: AssemblyMap
): KinematicSimulation {
  // Map panel 2D flat vertices into 3D plane (z = 0)
  // Look up placement from unfold clusters
  const panelFlat3DMap = new Map<string, Vec3[]>();

  for (const cluster of unfold.clusters) {
    for (const cp of cluster.panels) {
      const flat3DPts: Vec3[] = cp.vertices2D.map((p2) => [p2[0], p2[1], 0]);
      panelFlat3DMap.set(cp.panel.id, flat3DPts);
    }
  }

  // If any panel wasn't in unfold (fallback), project its outerVertices2D to z=0
  for (const p of panels) {
    if (!panelFlat3DMap.has(p.id)) {
      panelFlat3DMap.set(
        p.id,
        p.outerVertices2D.map((p2) => [p2[0], p2[1], 0])
      );
    }
  }

  // Prepare sequence of steps based on assembly sequence
  const steps: KinematicStep[] = [];
  const seq = assembly.assemblySequence.length > 0
    ? assembly.assemblySequence
    : panels.map((p) => p.id);

  seq.forEach((panelId, idx) => {
    const node = assembly.nodes.find((n) => n.panelId === panelId);
    const desc = node?.instruction || `ثني وتركيب اللوح رقم ${idx + 1} (${panelId})`;
    steps.push({
      stepIndex: idx,
      panelId,
      description: desc,
      fromAngleDeg: 0,
      toAngleDeg: 90, // target relative fold
    });
  });

  const totalSteps = Math.max(1, steps.length);

  /**
   * Generates a frame at normalized progress t in [0, 1]
   */
  const getFrameAtProgress = (t: number): KinematicFrame => {
    const clampedT = Math.max(0, Math.min(1, t));
    const activeStepFloat = clampedT * totalSteps;
    const activeStepIndex = Math.min(totalSteps - 1, Math.floor(activeStepFloat));
    const activePanelId = steps[activeStepIndex]?.panelId || '';

    const panelStates: KinematicPanelState[] = [];

    for (const panel of panels) {
      const flatPts = panelFlat3DMap.get(panel.id) || panel.outerVertices2D.map((p2) => [p2[0], p2[1], 0]);
      const target3DPts = panel.outerVertices3D;

      // Find where this panel sits in the assembly sequence
      const panelSeqIdx = seq.indexOf(panel.id);
      let panelProgress = 0;

      if (panelSeqIdx === -1) {
        panelProgress = clampedT;
      } else {
        // Step window for this panel:
        const stepStart = panelSeqIdx / totalSteps;
        const stepEnd = (panelSeqIdx + 1) / totalSteps;
        if (clampedT < stepStart) {
          panelProgress = 0;
        } else if (clampedT >= stepEnd) {
          panelProgress = 1;
        } else {
          // Smooth sinusoidal interpolation
          const localT = (clampedT - stepStart) / (stepEnd - stepStart);
          panelProgress = 0.5 * (1 - Math.cos(localT * Math.PI));
        }
      }

      // Interpolate vertices from flat (t=0) to 3D closed (t=1)
      const currentPts: Vec3[] = [];
      const ptCount = Math.min(flatPts.length, target3DPts.length);
      for (let i = 0; i < ptCount; i++) {
        currentPts.push(lerpVec3(flatPts[i], target3DPts[i], panelProgress));
      }

      const center = computeCentroid3D(currentPts);
      const isAssembled = panelProgress >= 0.999;

      panelStates.push({
        panelId: panel.id,
        vertices3D: currentPts,
        normal: [0, 0, 1], // default upward
        center,
        foldedAngleDeg: Math.round(panelProgress * 90 * 10) / 10,
        targetAngleDeg: 90,
        isAssembled,
      });
    }

    return {
      progress: clampedT,
      activeStepIndex,
      activePanelId,
      panels: panelStates,
    };
  };

  return {
    steps,
    frameCount: 100,
    totalAssemblyDurationSec: totalSteps * 1.5,
    getFrameAtProgress,
  };
}
