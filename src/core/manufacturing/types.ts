/**
 * @license
 * AUME LowPoly Fabrication — Manufacturing & Phase 3 Types
 * Specification Compliant: Sections 23 - 33, 38 - 52, 58 - 60
 */

import { Vec2, Vec3 } from '../geometry/types';

export interface ManufacturingSettings {
  sheetWidth: number; // mm
  sheetHeight: number; // mm
  materialThickness: number; // mm
  kerf: number; // mm
  edgeMargin: number; // mm
  partSpacing: number; // mm
  allowedRotations: number[]; // [0, 90] or [0, 90, 180, 270]
  material: string;
  density: number; // g/cm3 (7.85 for steel)
  bendRadius: number; // mm
  kFactor: number; // 0.44 typical
  textSize: 'Small' | 'Medium' | 'Large' | 'Custom';
  customTextHeight: number; // mm
  maxBendAngle: number; // degrees
}

export const DEFAULT_MANUFACTURING_SETTINGS: ManufacturingSettings = {
  sheetWidth: 1200,
  sheetHeight: 800,
  materialThickness: 1.5,
  kerf: 0.2,
  edgeMargin: 15,
  partSpacing: 8,
  allowedRotations: [0, 90, 180, 270],
  material: 'Mild Steel (CR4)',
  density: 7.85,
  bendRadius: 1.5,
  kFactor: 0.44,
  textSize: 'Medium',
  customTextHeight: 5,
  maxBendAngle: 150,
};

export type PanelType =
  | 'Triangle'
  | 'Quad'
  | 'Pentagon'
  | 'Hexagon'
  | 'Composite'
  | 'Other';

export interface SmartPanel {
  id: string; // P-XXXXXXXX
  regionId: number;
  type: PanelType;
  confidence: number; // 0 - 100
  area: number; // mm²
  faceCount: number;
  boundaryVertexCount: number;
  outerVertices2D: Vec2[];
  outerVertices3D: Vec3[];
  holeLoops2D: Vec2[][];
  normal: Vec3;
  centroid3D: Vec3;
  sectorId: number;
  composite: boolean;
}

export type BendWarningState =
  | 'OK'
  | 'SEVERE_BEND'
  | 'TINY_RADIUS'
  | 'SHORT_FLANGE'
  | 'OUT_OF_RANGE';

export interface BendEdgeInfo {
  edgeId: number;
  regionA: number;
  regionB: number;
  panelAId: string;
  panelBId: string;
  length: number; // mm
  bendAngleDeg: number;
  bendType: 'MOUNTAIN' | 'VALLEY';
  allowance: number; // mm
  radius: number; // mm
  warningState: BendWarningState;
  startPoint2D?: Vec2;
  endPoint2D?: Vec2;
}

export interface SeamCandidate {
  edgeId: number;
  regionA: number;
  regionB: number;
  length: number;
  angleDeg: number;
  boundaryStatus: string;
  overlapImpact: number;
  score: number;
  reason: string;
  selected: boolean;
}

export interface TabSettings {
  tabHeight: number; // mm (default 8)
  chamferAngleDeg: number; // default 45
  minEdgeLength: number; // mm (default 10)
  tabSpacing: number; // mm clearance from corners (default 1.5)
}

export interface AssemblyTab {
  id: string; // TAB-001
  seamEdgeId: number;
  matchingEdgeId: number;
  pairIndex: number;
  pairLabel: string; // e.g. "1", "2", "3"
  sourcePanelId: string;
  targetPanelId: string;
  baseEdge2D: [Vec2, Vec2];
  tabPolygon2D: Vec2[]; // trapezoid (4 points)
  foldLine2D: [Vec2, Vec2];
  height: number;
  chamferAngleDeg: number;
  labelPosition2D: Vec2;
  matchingLabelPosition2D: Vec2;
  type: 'GLUE_TAB' | 'INTERLOCKING' | 'WELD_JOINT';
}

export interface UnfoldComponent {
  componentId: number;
  panelIds: string[];
  regionIds: number[];
  panels2D: {
    panelId: string;
    regionId: number;
    vertices2D: Vec2[];
    center2D: Vec2;
    rotationRad: number;
  }[];
  bendLines2D: {
    edgeId: number;
    start: Vec2;
    end: Vec2;
    angleDeg: number;
    bendType: 'MOUNTAIN' | 'VALLEY';
  }[];
  tabs: AssemblyTab[];
  outerContour2D: Vec2[];
  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  };
  hasOverlap: boolean;
}

export interface UnfoldResult {
  components: UnfoldComponent[];
  allBends: BendEdgeInfo[];
  allSeams: SeamCandidate[];
  allTabs: AssemblyTab[];
  residualOverlaps: number;
  overlapAvoidanceSeams: number;
  totalUnfoldedArea: number;
}

export interface PlacedPart {
  partId: string;
  panelId: string;
  componentId: number;
  x: number;
  y: number;
  rotationDeg: number;
  polygon: Vec2[];
  bendLines: {
    start: Vec2;
    end: Vec2;
    angleDeg: number;
    bendType: 'MOUNTAIN' | 'VALLEY';
  }[];
  tabs?: AssemblyTab[];
  bounds: {
    width: number;
    height: number;
    minX?: number;
    minY?: number;
    maxX?: number;
    maxY?: number;
  };
}

export interface RemnantRect {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  orientation: 'RIGHT_COLUMN' | 'TOP_ROW';
}

export interface NestingSheet {
  sheetIndex: number;
  width: number;
  height: number;
  placedParts: PlacedPart[];
  usedArea: number;
  sheetArea: number;
  utilizationPercent: number;
  scrapArea: number;
  remnants: RemnantRect[];
}

export interface NestingResult {
  sheets: NestingSheet[];
  totalParts: number;
  placedPartsCount: number;
  unplacedPartsCount: number;
  unplacedPartIds: string[];
  totalSheetArea: number;
  totalPartArea: number;
  totalScrapArea: number;
  overallUtilization: number;
  totalEstimatedMassGrams: number;
}

export interface BOMItem {
  partId: string;
  panelId: string;
  type: PanelType;
  areaMm2: number;
  quantity: number;
  material: string;
  thicknessMm: number;
  estimatedMassGrams: number;
  sheetAssignment: string;
  assemblyOrder: number;
  bendCount: number;
  weldLengthMm: number;
}

export interface AssemblyConnection {
  fromPanelId: string;
  toPanelId: string;
  edgeId: number;
  type: 'bend' | 'seam' | 'join';
  length: number;
  angleDeg: number;
}

export interface AssemblyNode {
  panelId: string;
  regionId: number;
  type: PanelType;
  area: number;
  sector: number;
  order: number;
  connections: AssemblyConnection[];
  instruction?: string;
}

export interface AssemblyMap {
  nodes: AssemblyNode[];
  connections: AssemblyConnection[];
  assemblySequence: string[];
}

export interface ScoreDeduction {
  reason: string;
  points: number;
  detail: string;
}

export interface ManufacturabilityScore {
  score: number; // 0 - 100
  rating: 'EXCELLENT' | 'GOOD' | 'NEEDS_REVIEW' | 'CRITICAL_ISSUES';
  deductions: ScoreDeduction[];
  weldEfficiency: number; // 0 - 100%
  nestingEfficiency: number; // 0 - 100%
  bendSafety: number; // 0 - 100%
}

// -------------------------------------------------------------
// Phase 6: CNC Laser Toolpath, G-Code & Kinematics Types (Sections 61, 75, 76)
// -------------------------------------------------------------

export interface CNCSettings {
  laserPowerWatt: number; // e.g. 1500W
  cuttingFeedrateMmMin: number; // e.g. 2400 mm/min
  rapidFeedrateMmMin: number; // e.g. 18000 mm/min
  pierceDelaySec: number; // e.g. 0.35s dwell G04
  leadInLengthMm: number; // e.g. 2.5 mm
  leadInType: 'linear' | 'arc' | 'none';
  assistGas: 'Nitrogen (N2)' | 'Oxygen (O2)' | 'Compressed Air';
  assistGasPressureBar: number; // e.g. 12 bar
  safeZMm: number; // e.g. 10 mm
  cutZMm: number; // e.g. 0.0 mm
  kerfOffsetMode: 'geometry' | 'controller_left' | 'controller_right' | 'none';
}

export const DEFAULT_CNC_SETTINGS: CNCSettings = {
  laserPowerWatt: 1500,
  cuttingFeedrateMmMin: 2400,
  rapidFeedrateMmMin: 18000,
  pierceDelaySec: 0.35,
  leadInLengthMm: 2.5,
  leadInType: 'linear',
  assistGas: 'Nitrogen (N2)',
  assistGasPressureBar: 12.0,
  safeZMm: 10,
  cutZMm: 0.0,
  kerfOffsetMode: 'geometry',
};

export type ToolpathContourType = 'inner_feature' | 'relief_tab' | 'outer_perimeter';

export interface ToolpathContour {
  id: string;
  panelId: string;
  sheetId: string;
  contourType: ToolpathContourType;
  cutOrder: number;
  points: Vec2[];
  isClosed: boolean;
  leadInPoint?: Vec2;
  leadOutPoint?: Vec2;
  contourLengthMm: number;
  piercePoint: Vec2;
}

export interface SheetToolpath {
  sheetId: string;
  contours: ToolpathContour[];
  sheetCutDistanceMm: number;
  sheetRapidDistanceMm: number;
  sheetPierceCount: number;
  sheetEstimatedCutTimeSec: number;
  sheetEstimatedRapidTimeSec: number;
  sheetTotalEstimatedTimeSec: number;
  gcode: string;
}

export interface ToolpathPlan {
  sheets: SheetToolpath[];
  totalCutDistanceMm: number;
  totalRapidDistanceMm: number;
  unoptimizedRapidDistanceMm: number;
  rapidDistanceSavedMm: number;
  totalPierceCount: number;
  totalEstimatedCutTimeSec: number;
  totalEstimatedRapidTimeSec: number;
  totalEstimatedCycleTimeSec: number;
}

export interface KinematicPanelState {
  panelId: string;
  vertices3D: Vec3[];
  normal: Vec3;
  center: Vec3;
  foldedAngleDeg: number;
  targetAngleDeg: number;
  isAssembled: boolean;
}

export interface KinematicFrame {
  progress: number; // 0.0 (fully flat 2D) to 1.0 (fully folded 3D)
  activeStepIndex: number;
  activePanelId: string;
  panels: KinematicPanelState[];
}

export interface KinematicStep {
  stepIndex: number;
  panelId: string;
  description: string;
  fromAngleDeg: number;
  toAngleDeg: number;
  hingeAxis?: { start: Vec3; end: Vec3 };
}

export interface KinematicSimulation {
  steps: KinematicStep[];
  frameCount: number;
  totalAssemblyDurationSec: number;
  getFrameAtProgress: (t: number) => KinematicFrame;
}

export interface ManufacturingPackage {
  application: 'AUME LowPoly Fabrication';
  phase: string;
  version: '2.0.0-PROD';
  generatedAt: string;
  source: string;
  material: {
    type: string;
    thicknessMm: number;
    densityGcm3: number;
  };
  manufacturing: ManufacturingSettings;
  validation: {
    inputFaces: number;
    reconstructedRegions: number;
    planarityConfidence: number;
    zeroInternalTriangulationInDXF: boolean;
  };
  panels: SmartPanel[];
  unfold: UnfoldResult;
  bendQA: BendEdgeInfo[];
  nesting: NestingResult;
  assembly: AssemblyMap;
  bom: BOMItem[];
  manufacturabilityScore: ManufacturabilityScore;
  cncSettings?: CNCSettings;
  toolpathPlan?: ToolpathPlan;
}
