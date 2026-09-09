/**
 * @license
 * AUME LowPoly Fabrication — Geometry Core V2 Types
 * Specification Compliant: Sections 3 - 12, 53 - 65
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface Plane {
  origin: Vec3;
  normal: Vec3;
}

export interface BoundingBox3D {
  min: Vec3;
  max: Vec3;
}

export interface BoundingBox2D {
  min: Vec2;
  max: Vec2;
}

export interface Vertex {
  id: number;
  position: Vec3;
}

export interface Face {
  id: number;
  vertexIds: [number, number, number];
  edgeIds?: [number, number, number];
}

export interface Edge {
  id: number;
  vertexIds: [number, number];
  faceIds: number[];
}

export interface MeshInput {
  vertices: Vertex[];
  faces: Face[];
  edges?: Edge[];
  name?: string;
}

export interface FaceGeometry {
  faceId: number;
  vertexIds: [number, number, number];
  positions: [Vec3, Vec3, Vec3];
  centroid: Vec3;
  normal: Vec3;
  area: number;
  bbox: BoundingBox3D;
  edgeIds: number[];
  stableKey: string;
}

export interface EdgeGeometry {
  edgeId: number;
  vertexIds: [number, number];
  faceIds: number[];
  length: number;
  stableKey: string;
}

export interface GeometryV2Cache {
  faces: Map<number, FaceGeometry>;
  edges: Map<number, EdgeGeometry>;
  faceNeighbors: Map<number, number[]>;
  faceToEdges: Map<number, number[]>;
  stableFaceOrder: number[];
  faceKeys: Map<number, string>;
  degenerateFaceIds: Set<number>;
  nonManifoldEdgeIds: Set<number>;
}

export interface GeometryV2Params {
  maxDistanceTolerance: number;
  maxNormalDeg: number;
  checkpointStart: number;
  maxCandidateQueueSize: number;
  enableFastGate: boolean;
  enableExactValidation: boolean;
  minRegionFaces: number;
  minRegionArea: number;
  collinearTolerance: number;
  boundaryDistanceTolerance: number;
  collectDiagnostics: boolean;
}

export const DEFAULT_GEOMETRY_V2_PARAMS: GeometryV2Params = {
  maxDistanceTolerance: 0.001,
  maxNormalDeg: 6,
  checkpointStart: 4,
  maxCandidateQueueSize: 100000,
  enableFastGate: true,
  enableExactValidation: true,
  minRegionFaces: 1,
  minRegionArea: 0,
  collinearTolerance: 1e-8,
  boundaryDistanceTolerance: 1e-7,
  collectDiagnostics: true,
};

export type RegionState = 'ACTIVE' | 'FROZEN' | 'FINALIZED';

export interface RegionStats {
  faceCount: number;
  area: number;
  maxPerpDistance: number;
  rmsPerpDistance: number;
  maxNormalDeviationDeg: number;
  rmsNormalDeviationDeg: number;
  acceptedCandidates: number;
  rejectedCandidates: number;
  checkpointCount: number;
  rollbackCount: number;
}

export interface RegionSnapshot {
  regionVersion: number;
  faceIds: number[];
  cumulativeArea: number;
  plane: Plane;
  centroid: Vec3;
  bbox: BoundingBox3D;
  maxPerpDistance: number;
  rmsPerpDistance: number;
  maxNormalDeviationDeg: number;
  rmsNormalDeviationDeg: number;
  stableFaceKey: string;
  checkpointFaceCount: number;
}

export interface BoundaryLoop {
  vertexIds: number[];
  edgeIds: number[];
  closed: boolean;
  perimeter: number;
  signedArea2D?: number;
  isOuter: boolean;
  nestingLevel: number;
}

export type EdgeClassification = 'OUTER' | 'INTERNAL_TRIANGULATION' | 'REGION_ADJACENCY';

export interface RegionBoundaryEdge {
  edgeId: number;
  startVertexId: number;
  endVertexId: number;
  length: number;
  sourceMeshEdgeId: number;
  classification: EdgeClassification;
}

export type AdjacencyClassification = 'COPLANAR' | 'FOLD' | 'SHARP' | 'UNKNOWN';

export interface RegionNeighbor {
  regionId: number;
  neighborRegionId: number;
  sharedEdgeIds: number[];
  sharedBoundaryLength: number;
  angleDeg: number;
  classification: AdjacencyClassification;
}

export interface GeometryRegion {
  id: number;
  stableKey: string;
  seedFaceId: number;
  faceIds: Set<number>;
  faceKeys: Set<string>;
  area: number;
  plane: Plane;
  normal: Vec3;
  centroid: Vec3;
  bbox: BoundingBox3D;
  boundaryEdgeIds: Set<number>;
  internalEdgeIds: Set<number>;
  boundaryLoops: BoundaryLoop[];
  neighbors: RegionNeighbor[];
  state: RegionState;
  version: number;
  checkpoint: RegionSnapshot | null;
  stats: RegionStats;
}

export type CandidateStatus = 'QUEUED' | 'ACCEPTED' | 'REJECTED' | 'STALE';

export type CandidateRejectReason =
  | 'DISTANCE'
  | 'NORMAL'
  | 'DEGENERATE'
  | 'NOT_ADJACENT'
  | 'ALREADY_ASSIGNED'
  | 'REJECTION_MEMORY'
  | 'STALE_REGION'
  | 'FROZEN_REGION'
  | 'CHECKPOINT_FAILURE';

export interface RegionCandidate {
  faceId: number;
  faceKey: string;
  regionId: number;
  regionKey: string;
  regionVersion: number;
  score: number;
  maxPerpDistance: number;
  normalDeviationDeg: number;
  sourceEdgeId: number;
  sourceFaceId: number;
  status: CandidateStatus;
  reason?: CandidateRejectReason;
}

export interface RegionSummary {
  regionId: number;
  stableKey: string;
  faceCount: number;
  area: number;
  boundaryLength: number;
  maxPerpDistance: number;
  maxNormalDeviationDeg: number;
}

export interface GeometryDiagnostics {
  inputFaceCount: number;
  inputVertexCount: number;
  outputRegionCount: number;
  singletonRegionCount: number;
  regionFaceHistogram: number[];
  largestRegions: RegionSummary[];
  totalArea: number;
  reconstructedArea: number;
  unresolvedFaceCount: number;
  rejectedCandidateCount: number;
  rollbackCount: number;
  frozenRegionCount: number;
  maxRegionDeviation: number;
  elapsedMs: number;
  deterministicHash: string;
  rejectionReasonCounts: Record<CandidateRejectReason, number>;
}

export interface RegionAdjacencyGraph {
  nodes: number[];
  adjacencies: RegionNeighbor[];
}

export interface GeometryReconstructionResult {
  version: 'GeometryV2';
  regions: GeometryRegion[];
  adjacency: RegionNeighbor[];
  adjacencyGraph: RegionAdjacencyGraph;
  faceRegionMap: Map<number, number>;
  diagnostics: GeometryDiagnostics;
  elapsedMs: number;
}

export interface GeometryValidationReport {
  valid: boolean;
  invariantViolations: string[];
  maxPerpDistance: number;
  maxNormalDeviationDeg: number;
  unassignedFaces: number[];
  overlapFaces: number[];
}
