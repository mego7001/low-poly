/**
 * @license
 * AUME LowPoly Fabrication — Geometry Math & PCA Utilities
 * Specification Compliant: Sections 7, 10, 14, 31 - 34, 60, 72
 */

import { Vec3, Plane, BoundingBox3D, Face, Vertex } from './types';

export const EPSILON = 1e-9;

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function normSq(v: Vec3): number {
  return v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
}

export function norm(v: Vec3): number {
  return Math.sqrt(normSq(v));
}

export function normalize(v: Vec3): Vec3 {
  const len = norm(v);
  if (len < EPSILON) {
    return [0, 0, 1];
  }
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function distance(a: Vec3, b: Vec3): number {
  return norm(sub(a, b));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function angleBetweenNormalsDeg(a: Vec3, b: Vec3): number {
  const d = clamp(dot(a, b), -1, 1);
  return (Math.acos(d) * 180) / Math.PI;
}

export function nearlyLE(a: number, b: number, epsilon: number = EPSILON): boolean {
  return a <= b + epsilon;
}

export function pointPlanePerpDistance(p: Vec3, plane: Plane): number {
  return Math.abs(dot(sub(p, plane.origin), plane.normal));
}

/**
 * Deterministic Normal Orientation (Specification Section 34):
 * PCA eigenvectors have sign ambiguity (N and -N are mathematically equivalent).
 * To guarantee determinism across runs, orient normal such that its largest absolute
 * coordinate component is strictly positive. If tied, next component breaks tie.
 */
export function orientPlaneNormalDeterministically(normal: Vec3): Vec3 {
  const absX = Math.abs(normal[0]);
  const absY = Math.abs(normal[1]);
  const absZ = Math.abs(normal[2]);

  let primaryIdx = 2;
  if (absX >= absY && absX >= absZ) {
    primaryIdx = 0;
  } else if (absY >= absX && absY >= absZ) {
    primaryIdx = 1;
  }

  if (normal[primaryIdx] < -EPSILON) {
    return [-normal[0], -normal[1], -normal[2]];
  }
  return [normal[0], normal[1], normal[2]];
}

export function calculateBoundingBox(positions: Vec3[]): BoundingBox3D {
  if (positions.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }
  const min: Vec3 = [...positions[0]];
  const max: Vec3 = [...positions[0]];

  for (let i = 1; i < positions.length; i++) {
    const p = positions[i];
    min[0] = Math.min(min[0], p[0]);
    min[1] = Math.min(min[1], p[1]);
    min[2] = Math.min(min[2], p[2]);

    max[0] = Math.max(max[0], p[0]);
    max[1] = Math.max(max[1], p[1]);
    max[2] = Math.max(max[2], p[2]);
  }
  return { min, max };
}

export function mergeBoundingBoxes(a: BoundingBox3D, b: BoundingBox3D): BoundingBox3D {
  return {
    min: [
      Math.min(a.min[0], b.min[0]),
      Math.min(a.min[1], b.min[1]),
      Math.min(a.min[2], b.min[2]),
    ],
    max: [
      Math.max(a.max[0], b.max[0]),
      Math.max(a.max[1], b.max[1]),
      Math.max(a.max[2], b.max[2]),
    ],
  };
}

/**
 * Format coordinate rounded to 6 decimal places for stable geometric keys
 */
export function formatCoord(v: number): string {
  const fixed = Math.abs(v) < 1e-7 ? 0 : v;
  return fixed.toFixed(6);
}

/**
 * Stable geometric key for face (Section 7, 57)
 */
export function makeStableFaceKey(face: Face, vertices: Vertex[]): string {
  // Sort vertex positions deterministically to create geometric signature
  const vPositions = face.vertexIds.map((vId) => {
    const v = vertices[vId];
    return v ? `${formatCoord(v.position[0])},${formatCoord(v.position[1])},${formatCoord(v.position[2])}` : `v${vId}`;
  });
  vPositions.sort();
  return `F:${vPositions.join('|')}`;
}

export function makeStableRegionKey(seedFaceKey: string): string {
  return `R:${seedFaceKey.replace('F:', '')}`;
}

/**
 * PCA Best-Fit Plane for 3D point cloud (Section 14, 31-33).
 * Given an array of 3D points, computes:
 * 1. Centroid C
 * 2. 3x3 Covariance matrix M
 * 3. Eigen-decomposition via Jacobi iteration (guaranteed convergence for real symmetric 3x3)
 * 4. Eigenvector corresponding to the smallest eigenvalue is the best-fit plane normal.
 */
export function computePCAForPoints(points: Vec3[]): Plane {
  if (points.length < 3) {
    return { origin: points[0] || [0, 0, 0], normal: [0, 0, 1] };
  }

  // 1. Centroid
  let cX = 0;
  let cY = 0;
  let cZ = 0;
  for (const p of points) {
    cX += p[0];
    cY += p[1];
    cZ += p[2];
  }
  const n = points.length;
  const centroid: Vec3 = [cX / n, cY / n, cZ / n];

  // 2. Covariance matrix (3x3 symmetric)
  let c00 = 0, c01 = 0, c02 = 0;
  let c11 = 0, c12 = 0, c22 = 0;

  for (const p of points) {
    const dx = p[0] - centroid[0];
    const dy = p[1] - centroid[1];
    const dz = p[2] - centroid[2];

    c00 += dx * dx;
    c01 += dx * dy;
    c02 += dx * dz;
    c11 += dy * dy;
    c12 += dy * dz;
    c22 += dz * dz;
  }

  const cov: number[][] = [
    [c00 / n, c01 / n, c02 / n],
    [c01 / n, c11 / n, c12 / n],
    [c02 / n, c12 / n, c22 / n],
  ];

  // 3. Jacobi eigen-decomposition for 3x3 symmetric matrix
  const { eigenvalues, eigenvectors } = jacobiEigen3x3(cov);

  // 4. Find index of smallest eigenvalue
  let minIdx = 0;
  let minVal = eigenvalues[0];
  for (let i = 1; i < 3; i++) {
    if (eigenvalues[i] < minVal) {
      minVal = eigenvalues[i];
      minIdx = i;
    }
  }

  // Column minIdx of eigenvectors matrix is the normal
  const rawNormal: Vec3 = [
    eigenvectors[0][minIdx],
    eigenvectors[1][minIdx],
    eigenvectors[2][minIdx],
  ];

  const normal = orientPlaneNormalDeterministically(normalize(rawNormal));
  return { origin: centroid, normal };
}

/**
 * Standard Jacobi eigenvalue algorithm for 3x3 real symmetric matrix.
 * Very fast, numerically stable, deterministic.
 */
function jacobiEigen3x3(aIn: number[][]): { eigenvalues: number[]; eigenvectors: number[][] } {
  const a = [
    [aIn[0][0], aIn[0][1], aIn[0][2]],
    [aIn[1][0], aIn[1][1], aIn[1][2]],
    [aIn[2][0], aIn[2][1], aIn[2][2]],
  ];

  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 50; iter++) {
    // Find largest off-diagonal element
    let p = 0, q = 1;
    let maxOff = Math.abs(a[0][1]);
    if (Math.abs(a[0][2]) > maxOff) {
      p = 0;
      q = 2;
      maxOff = Math.abs(a[0][2]);
    }
    if (Math.abs(a[1][2]) > maxOff) {
      p = 1;
      q = 2;
      maxOff = Math.abs(a[1][2]);
    }

    if (maxOff < 1e-12) {
      break;
    }

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];

    const theta = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(theta);
    const s = Math.sin(theta);

    // Givens rotation on a
    const aNewPP = c * c * app - 2 * s * c * apq + s * s * aqq;
    const aNewQQ = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][p] = aNewPP;
    a[q][q] = aNewQQ;
    a[p][q] = 0;
    a[q][p] = 0;

    for (let r = 0; r < 3; r++) {
      if (r !== p && r !== q) {
        const arp = a[r][p];
        const arq = a[r][q];
        a[r][p] = c * arp - s * arq;
        a[p][r] = a[r][p];
        a[r][q] = s * arp + c * arq;
        a[q][r] = a[r][q];
      }
    }

    // Accumulate in eigenvectors matrix
    for (let r = 0; r < 3; r++) {
      const vrp = v[r][p];
      const vrq = v[r][q];
      v[r][p] = c * vrp - s * vrq;
      v[r][q] = s * vrp + c * vrq;
    }
  }

  return {
    eigenvalues: [a[0][0], a[1][1], a[2][2]],
    eigenvectors: v,
  };
}
