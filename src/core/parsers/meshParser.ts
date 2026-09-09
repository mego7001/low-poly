/**
 * @license
 * AUME LowPoly Fabrication — STL & OBJ Importer with Mesh Repair & Topology Validation
 * Specification Compliant: Phase 1 (Sections 4.1 - 4.3, 5.1 - 5.3, 6.1 - 6.3)
 */

import { MeshInput, Vertex, Face, Vec3 } from '../geometry/types';
import { formatCoord, norm, sub, cross, normalize, calculateBoundingBox, makeStableFaceKey } from '../geometry/math';

export interface MeshValidationReport {
  isValid: boolean;
  isManifold: boolean;
  isClosed: boolean;
  eulerCharacteristic: number;
  genus: number | null;
  connectedComponentsCount: number;
  triangleCount: number;
  vertexCount: number;
  edgeCount: number;
  openBoundaryCount: number;
  boundaryLoopCount: number;
  nonManifoldEdgeCount: number;
  nonManifoldVertexCount: number;
  duplicateFaceCount: number;
  degenerateFaceCount: number;
  mergedVertexCount: number;
  inconsistentWindingCount: number;
  bounds: {
    min: Vec3;
    max: Vec3;
    dimensions: Vec3;
  };
  totalSurfaceArea: number;
  warnings: string[];
  errors: string[];
}

export interface ImportMetadata extends MeshValidationReport {
  fileName: string;
  fileType: 'STL_ASCII' | 'STL_BINARY' | 'OBJ' | 'SYNTHETIC';
  estimatedArea: number;
}

/**
 * Main parser entry point: parses STL (ASCII or Binary) or OBJ
 */
export function parseMeshFile(
  content: ArrayBuffer | string,
  fileName: string,
  weldTolerance: number = 0.001
): { mesh: MeshInput; metadata: ImportMetadata } {
  if (typeof content === 'string') {
    if (fileName.toLowerCase().endsWith('.obj')) {
      return parseOBJ(content, fileName, weldTolerance);
    }
    // Check if ASCII STL or Binary
    if (content.trim().startsWith('solid')) {
      return parseSTLAscii(content, fileName, weldTolerance);
    }
  }

  if (content instanceof ArrayBuffer) {
    if (fileName.toLowerCase().endsWith('.obj')) {
      const text = new TextDecoder('utf-8').decode(content);
      return parseOBJ(text, fileName, weldTolerance);
    }

    // Distinguish Binary STL from ASCII STL robustly (Section 4.1)
    const isBinary = isBinarySTLBuffer(content);
    if (isBinary) {
      return parseSTLBinary(content, fileName, weldTolerance);
    } else {
      const text = new TextDecoder('utf-8').decode(content);
      return parseSTLAscii(text, fileName, weldTolerance);
    }
  }

  return parseSTLAscii(content as string, fileName, weldTolerance);
}

/**
 * Robustly determines if an ArrayBuffer represents a Binary STL or ASCII STL
 * Specification Section 4.1:
 * Binary STL format: 80 bytes header, 4-byte uint32 count N, followed by N * 50 bytes.
 * Expected total byte length = 84 + 50 * N.
 * Some binary STL files start with "solid" in the 80-byte header, so checking
 * file size is the authoritative discriminator.
 */
export function isBinarySTLBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 84) return false;

  const dataView = new DataView(buffer);
  const triangleCount = dataView.getUint32(80, true);
  const expectedBinaryLength = 84 + triangleCount * 50;

  if (buffer.byteLength === expectedBinaryLength) {
    return true;
  }

  // If size doesn't match formula, check if it starts with "solid"
  const headerBytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 256));
  const headerStr = new TextDecoder('ascii').decode(headerBytes);
  if (headerStr.trim().toLowerCase().startsWith('solid') && headerStr.includes('facet')) {
    return false;
  }

  // If it doesn't look like ASCII, fallback to binary if triangle count is reasonable
  return triangleCount > 0 && buffer.byteLength >= 84;
}

/**
 * Parses Wavefront OBJ format (Section 4.2)
 * Supports:
 * - v x y z [w]
 * - vn nx ny nz
 * - vt u v [w]
 * - f v, f v/vt, f v/vt/vn, f v//vn
 * - Negative vertex indices
 * - Convex polygon triangulation (fan triangulation)
 */
export function parseOBJ(
  objText: string,
  fileName: string,
  weldTolerance: number = 0.001
): { mesh: MeshInput; metadata: ImportMetadata } {
  const rawVertices: Vec3[] = [];
  const rawTriangles: [number, number, number][] = [];

  const lines = objText.split(/\r?\n/);
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx].trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const tokens = line.split(/\s+/);
    const type = tokens[0];

    if (type === 'v') {
      const x = parseFloat(tokens[1]);
      const y = parseFloat(tokens[2]);
      const z = parseFloat(tokens[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        rawVertices.push([x, y, z]);
      }
    } else if (type === 'f') {
      const faceVertexIndices: number[] = [];
      for (let i = 1; i < tokens.length; i++) {
        const token = tokens[i];
        if (!token) continue;
        const vPart = token.split('/')[0];
        const rawIdx = parseInt(vPart, 10);
        if (isNaN(rawIdx)) continue;

        // OBJ indices are 1-based, negative indices refer back from current vertex count
        const resolvedIdx = rawIdx < 0 ? rawVertices.length + rawIdx : rawIdx - 1;
        if (resolvedIdx >= 0 && resolvedIdx < rawVertices.length) {
          faceVertexIndices.push(resolvedIdx);
        }
      }

      // Fan triangulation for N-gon polygons (triangles, quads, pentagons, etc.)
      if (faceVertexIndices.length >= 3) {
        for (let i = 1; i < faceVertexIndices.length - 1; i++) {
          rawTriangles.push([
            faceVertexIndices[0],
            faceVertexIndices[i],
            faceVertexIndices[i + 1],
          ]);
        }
      }
    }
  }

  return assembleAndRepairMesh(rawVertices, rawTriangles, fileName, 'OBJ', weldTolerance);
}

/**
 * Parses ASCII STL file (Section 4.1)
 * Supports exponential notation, varying whitespace, and solid naming
 */
export function parseSTLAscii(
  stlText: string,
  fileName: string,
  weldTolerance: number = 0.001
): { mesh: MeshInput; metadata: ImportMetadata } {
  const rawVertices: Vec3[] = [];
  const rawTriangles: [number, number, number][] = [];

  // Regex matching vertex with float and scientific notation (e.g., -1.234e-05)
  const vertexRegex = /vertex\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/gi;

  let match: RegExpExecArray | null;
  let currentTriangle: number[] = [];

  while ((match = vertexRegex.exec(stlText)) !== null) {
    const v: Vec3 = [
      parseFloat(match[1]) || 0,
      parseFloat(match[2]) || 0,
      parseFloat(match[3]) || 0,
    ];
    const vIdx = rawVertices.length;
    rawVertices.push(v);
    currentTriangle.push(vIdx);

    if (currentTriangle.length === 3) {
      rawTriangles.push([currentTriangle[0], currentTriangle[1], currentTriangle[2]]);
      currentTriangle = [];
    }
  }

  return assembleAndRepairMesh(rawVertices, rawTriangles, fileName, 'STL_ASCII', weldTolerance);
}

/**
 * Parses Binary STL file format (Section 4.1)
 */
export function parseSTLBinary(
  buffer: ArrayBuffer,
  fileName: string,
  weldTolerance: number = 0.001
): { mesh: MeshInput; metadata: ImportMetadata } {
  const dataView = new DataView(buffer);
  const triangleCount = dataView.getUint32(80, true);

  const rawVertices: Vec3[] = [];
  const rawTriangles: [number, number, number][] = [];

  let offset = 84;
  for (let i = 0; i < triangleCount; i++) {
    if (offset + 50 > buffer.byteLength) break;

    // Skip 12 bytes of normal (we calculate exact normal via right-hand rule)
    offset += 12;

    const v0: Vec3 = [
      dataView.getFloat32(offset, true),
      dataView.getFloat32(offset + 4, true),
      dataView.getFloat32(offset + 8, true),
    ];
    offset += 12;

    const v1: Vec3 = [
      dataView.getFloat32(offset, true),
      dataView.getFloat32(offset + 4, true),
      dataView.getFloat32(offset + 8, true),
    ];
    offset += 12;

    const v2: Vec3 = [
      dataView.getFloat32(offset, true),
      dataView.getFloat32(offset + 4, true),
      dataView.getFloat32(offset + 8, true),
    ];
    offset += 12;

    // 2-byte attribute count
    offset += 2;

    const baseIdx = rawVertices.length;
    rawVertices.push(v0, v1, v2);
    rawTriangles.push([baseIdx, baseIdx + 1, baseIdx + 2]);
  }

  return assembleAndRepairMesh(rawVertices, rawTriangles, fileName, 'STL_BINARY', weldTolerance);
}

/**
 * Welds vertices within tolerance using 27-neighborhood spatial hashing,
 * removes degenerate and duplicate faces, applies deterministic face sorting,
 * and produces a complete Phase 1 topology validation report.
 * (Specification Sections 4.3, 5.1, 5.2, 6.1, 6.2)
 */
export function assembleAndRepairMesh(
  rawVertices: Vec3[],
  rawTriangles: [number, number, number][],
  fileName: string,
  fileType: ImportMetadata['fileType'],
  tolerance: number = 0.001
): { mesh: MeshInput; metadata: ImportMetadata } {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (rawVertices.length === 0 || rawTriangles.length === 0) {
    errors.push('الملف فارغ أو لا يحتوي على مثلثات صالحة.');
  }

  // =========================================================================
  // Section 5.1: 27-Neighborhood Spatial Hashing Grid for Vertex Welding
  // =========================================================================
  const cellSize = Math.max(1e-6, tolerance);
  const grid = new Map<string, number[]>();
  const uniqueVertices: Vertex[] = [];
  const rawToUniqueMap = new Map<number, number>();

  const getCellCoord = (v: number) => Math.floor(v / cellSize);
  const getCellKey = (ix: number, iy: number, iz: number) => `${ix}_${iy}_${iz}`;

  let mergedCount = 0;
  const tolSq = tolerance * tolerance;

  for (let i = 0; i < rawVertices.length; i++) {
    const p = rawVertices[i];
    const ix = getCellCoord(p[0]);
    const iy = getCellCoord(p[1]);
    const iz = getCellCoord(p[2]);

    let bestCandidateId = -1;
    let minDistanceSq = tolSq;

    // Search in all 27 adjacent cells [-1, 0, 1]^3 to catch vertices across cell boundaries
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborKey = getCellKey(ix + dx, iy + dy, iz + dz);
          const bucket = grid.get(neighborKey);
          if (!bucket) continue;

          for (let b = 0; b < bucket.length; b++) {
            const candId = bucket[b];
            const candP = uniqueVertices[candId].position;
            const dSq =
              (p[0] - candP[0]) ** 2 +
              (p[1] - candP[1]) ** 2 +
              (p[2] - candP[2]) ** 2;

            if (dSq <= minDistanceSq) {
              if (
                dSq < minDistanceSq ||
                (dSq === minDistanceSq &&
                  (bestCandidateId === -1 || candId < bestCandidateId))
              ) {
                minDistanceSq = dSq;
                bestCandidateId = candId;
              }
            }
          }
        }
      }
    }

    if (bestCandidateId !== -1) {
      // Weld to existing canonical vertex
      rawToUniqueMap.set(i, bestCandidateId);
      mergedCount++;
    } else {
      // Add new unique vertex
      const newId = uniqueVertices.length;
      uniqueVertices.push({ id: newId, position: p });
      const currentCellKey = getCellKey(ix, iy, iz);
      let bucket = grid.get(currentCellKey);
      if (!bucket) {
        bucket = [];
        grid.set(currentCellKey, bucket);
      }
      bucket.push(newId);
      rawToUniqueMap.set(i, newId);
    }
  }

  // =========================================================================
  // Section 5.2: Degenerate and Duplicate Face Removal
  // =========================================================================
  interface PreFace {
    vertexIds: [number, number, number];
    centroid: Vec3;
    normal: Vec3;
    area: number;
    stableKey: string;
  }

  const preFaces: PreFace[] = [];
  const seenFaceSignatures = new Set<string>();
  let degenerateCount = 0;
  let duplicateCount = 0;

  for (const [r0, r1, r2] of rawTriangles) {
    const u0 = rawToUniqueMap.get(r0);
    const u1 = rawToUniqueMap.get(r1);
    const u2 = rawToUniqueMap.get(r2);

    if (u0 === undefined || u1 === undefined || u2 === undefined) continue;

    // Check for collapsed vertices in face
    if (u0 === u1 || u1 === u2 || u2 === u0) {
      degenerateCount++;
      continue;
    }

    const p0 = uniqueVertices[u0].position;
    const p1 = uniqueVertices[u1].position;
    const p2 = uniqueVertices[u2].position;

    // Check for collinearity / near-zero area
    const e1 = sub(p1, p0);
    const e2 = sub(p2, p0);
    const cr = cross(e1, e2);
    const area = norm(cr) * 0.5;

    if (area <= 1e-12) {
      degenerateCount++;
      continue;
    }

    // Check duplicate face signature (sorted vertex IDs)
    const sortedIds = [u0, u1, u2].sort((a, b) => a - b);
    const signature = `${sortedIds[0]}_${sortedIds[1]}_${sortedIds[2]}`;

    if (seenFaceSignatures.has(signature)) {
      duplicateCount++;
      continue;
    }
    seenFaceSignatures.add(signature);

    const normal = normalize(cr);
    const centroid: Vec3 = [
      (p0[0] + p1[0] + p2[0]) / 3,
      (p0[1] + p1[1] + p2[1]) / 3,
      (p0[2] + p1[2] + p2[2]) / 3,
    ];

    const stableKey = makeStableFaceKey(
      { id: 0, vertexIds: [u0, u1, u2] },
      uniqueVertices
    );

    preFaces.push({
      vertexIds: [u0, u1, u2],
      centroid,
      normal,
      area,
      stableKey,
    });
  }

  // =========================================================================
  // Section 6.2: Deterministic Stable Face Sorting (Order Invariance)
  // =========================================================================
  preFaces.sort((fA, fB) => {
    // 1. Primary: Centroid coordinates (z, then y, then x, rounded to 5 decimals)
    const zDiff = Math.round(fA.centroid[2] * 100000) - Math.round(fB.centroid[2] * 100000);
    if (zDiff !== 0) return zDiff;

    const yDiff = Math.round(fA.centroid[1] * 100000) - Math.round(fB.centroid[1] * 100000);
    if (yDiff !== 0) return yDiff;

    const xDiff = Math.round(fA.centroid[0] * 100000) - Math.round(fB.centroid[0] * 100000);
    if (xDiff !== 0) return xDiff;

    // 2. Secondary: Area (descending)
    const areaDiff = Math.round(fB.area * 10000) - Math.round(fA.area * 10000);
    if (areaDiff !== 0) return areaDiff;

    // 3. Tertiary: Geometric Stable Key (lexicographical)
    return fA.stableKey.localeCompare(fB.stableKey);
  });

  // Assign deterministic sequential Face IDs
  const finalFaces: Face[] = preFaces.map((pf, idx) => ({
    id: idx,
    vertexIds: pf.vertexIds,
  }));

  const assembledMesh: MeshInput = {
    vertices: uniqueVertices,
    faces: finalFaces,
    name: fileName,
  };

  // =========================================================================
  // Section 4.3: Deep Topology Validation & Manifold Analysis
  // =========================================================================
  const topoReport = validateMeshTopology(assembledMesh);

  // Combine report with file metadata
  const metadata: ImportMetadata = {
    ...topoReport,
    fileName,
    fileType,
    estimatedArea: topoReport.totalSurfaceArea,
    mergedVertexCount: mergedCount,
    duplicateFaceCount: duplicateCount,
    degenerateFaceCount: degenerateCount,
  };

  if (mergedCount > 0) {
    metadata.warnings.push(
      `تم دمج ${mergedCount.toLocaleString()} نقطة متطابقة أو متقاربة ضمن التفاوت (${tolerance} مم).`
    );
  }
  if (degenerateCount > 0) {
    metadata.warnings.push(
      `تم استبعاد ${degenerateCount} مثلث تالف (منعدم المساحة أو منهار الأضلاع).`
    );
  }
  if (duplicateCount > 0) {
    metadata.warnings.push(`تم استبعاد ${duplicateCount} مثلث مكرر هندسياً.`);
  }

  return { mesh: assembledMesh, metadata };
}

/**
 * Deep Topology Validation (Section 4.3):
 * Computes Manifoldness, Euler characteristic χ = V - E + F,
 * connected components, open boundary edges, boundary loops,
 * and winding consistency.
 */
export function validateMeshTopology(mesh: MeshInput): MeshValidationReport {
  const warnings: string[] = [];
  const errors: string[] = [];

  const vertexCount = mesh.vertices.length;
  const triangleCount = mesh.faces.length;

  if (vertexCount === 0 || triangleCount === 0) {
    return {
      isValid: false,
      isManifold: false,
      isClosed: false,
      eulerCharacteristic: 0,
      genus: null,
      connectedComponentsCount: 0,
      triangleCount: 0,
      vertexCount: 0,
      edgeCount: 0,
      openBoundaryCount: 0,
      boundaryLoopCount: 0,
      nonManifoldEdgeCount: 0,
      nonManifoldVertexCount: 0,
      duplicateFaceCount: 0,
      degenerateFaceCount: 0,
      mergedVertexCount: 0,
      inconsistentWindingCount: 0,
      bounds: { min: [0, 0, 0], max: [0, 0, 0], dimensions: [0, 0, 0] },
      totalSurfaceArea: 0,
      warnings: ['الشبكة الهندسية فارغة.'],
      errors: ['لا توجد رؤوس أو مثلثات صالحة.'],
    };
  }

  // 1. Calculate bounding box & total surface area
  const positions: Vec3[] = mesh.vertices.map((v) => v.position);
  const bbox = calculateBoundingBox(positions);
  const dimensions: Vec3 = [
    Math.max(0, bbox.max[0] - bbox.min[0]),
    Math.max(0, bbox.max[1] - bbox.min[1]),
    Math.max(0, bbox.max[2] - bbox.min[2]),
  ];

  let totalSurfaceArea = 0;
  for (const f of mesh.faces) {
    const p0 = mesh.vertices[f.vertexIds[0]]?.position;
    const p1 = mesh.vertices[f.vertexIds[1]]?.position;
    const p2 = mesh.vertices[f.vertexIds[2]]?.position;
    if (p0 && p1 && p2) {
      const e1 = sub(p1, p0);
      const e2 = sub(p2, p0);
      totalSurfaceArea += norm(cross(e1, e2)) * 0.5;
    }
  }

  // 2. Edge topology analysis
  interface EdgeRecord {
    vMin: number;
    vMax: number;
    faces: number[];
    directions: number[]; // +1 if vMin -> vMax, -1 if vMax -> vMin
  }

  const edgeMap = new Map<string, EdgeRecord>();
  const vertexToFaces = new Map<number, number[]>();

  for (const face of mesh.faces) {
    const vIds = face.vertexIds;
    const pairs: [number, number][] = [
      [vIds[0], vIds[1]],
      [vIds[1], vIds[2]],
      [vIds[2], vIds[0]],
    ];

    for (const [va, vb] of pairs) {
      const vMin = Math.min(va, vb);
      const vMax = Math.max(va, vb);
      const key = `${vMin}_${vMax}`;
      const dir = va < vb ? 1 : -1;

      let edge = edgeMap.get(key);
      if (!edge) {
        edge = { vMin, vMax, faces: [], directions: [] };
        edgeMap.set(key, edge);
      }
      edge.faces.push(face.id);
      edge.directions.push(dir);
    }

    // Vertex to faces mapping
    for (const vId of vIds) {
      let fList = vertexToFaces.get(vId);
      if (!fList) {
        fList = [];
        vertexToFaces.set(vId, fList);
      }
      fList.push(face.id);
    }
  }

  const edgeCount = edgeMap.size;
  let openBoundaryCount = 0;
  let nonManifoldEdgeCount = 0;
  let inconsistentWindingCount = 0;

  const boundaryEdges: { vMin: number; vMax: number }[] = [];
  const boundaryAdjacency = new Map<number, number[]>();

  for (const edge of edgeMap.values()) {
    if (edge.faces.length === 1) {
      openBoundaryCount++;
      boundaryEdges.push({ vMin: edge.vMin, vMax: edge.vMax });

      if (!boundaryAdjacency.has(edge.vMin)) boundaryAdjacency.set(edge.vMin, []);
      if (!boundaryAdjacency.has(edge.vMax)) boundaryAdjacency.set(edge.vMax, []);
      boundaryAdjacency.get(edge.vMin)!.push(edge.vMax);
      boundaryAdjacency.get(edge.vMax)!.push(edge.vMin);
    } else if (edge.faces.length > 2) {
      nonManifoldEdgeCount++;
    } else if (edge.faces.length === 2) {
      // In consistent orientable manifold, opposite traversal is required (+1 and -1)
      if (edge.directions[0] === edge.directions[1]) {
        inconsistentWindingCount++;
      }
    }
  }

  // 3. Boundary loops extraction (tracing open boundary cycles)
  let boundaryLoopCount = 0;
  const visitedBoundaryVertices = new Set<number>();

  for (const startVertex of boundaryAdjacency.keys()) {
    if (visitedBoundaryVertices.has(startVertex)) continue;

    boundaryLoopCount++;
    let current: number | null = startVertex;
    let prev: number | null = null;

    while (current !== null) {
      visitedBoundaryVertices.add(current);
      const neighbors = boundaryAdjacency.get(current) || [];
      const next: number | undefined = neighbors.find((n) => n !== prev && !visitedBoundaryVertices.has(n));

      if (next !== undefined) {
        prev = current;
        current = next;
      } else {
        break;
      }
    }
  }

  // 4. Non-manifold vertices check (pinch / bowtie vertices)
  let nonManifoldVertexCount = 0;
  for (const [vId, incidentFaces] of vertexToFaces.entries()) {
    if (incidentFaces.length < 2) continue;

    // Traverse faces connected by edges incident to vId
    const faceSet = new Set(incidentFaces);
    const firstFace = incidentFaces[0];
    const visitedFan = new Set<number>();
    const queue = [firstFace];
    visitedFan.add(firstFace);

    while (queue.length > 0) {
      const curF = queue.shift()!;
      // Find neighbors of curF sharing an edge that contains vId
      const curFaceObj = mesh.faces[curF];
      if (!curFaceObj) continue;

      const pairs: [number, number][] = [
        [curFaceObj.vertexIds[0], curFaceObj.vertexIds[1]],
        [curFaceObj.vertexIds[1], curFaceObj.vertexIds[2]],
        [curFaceObj.vertexIds[2], curFaceObj.vertexIds[0]],
      ];

      for (const [va, vb] of pairs) {
        if (va === vId || vb === vId) {
          const key = `${Math.min(va, vb)}_${Math.max(va, vb)}`;
          const edge = edgeMap.get(key);
          if (edge) {
            for (const nF of edge.faces) {
              if (faceSet.has(nF) && !visitedFan.has(nF)) {
                visitedFan.add(nF);
                queue.push(nF);
              }
            }
          }
        }
      }
    }

    // If not all incident faces were visited from one fan, vertex is a non-manifold pinch point
    if (visitedFan.size !== incidentFaces.length) {
      nonManifoldVertexCount++;
    }
  }

  // 5. Connected components calculation (BFS via manifold edges)
  let connectedComponentsCount = 0;
  const visitedFaces = new Set<number>();

  for (const face of mesh.faces) {
    if (visitedFaces.has(face.id)) continue;

    connectedComponentsCount++;
    const queue: number[] = [face.id];
    visitedFaces.add(face.id);

    while (queue.length > 0) {
      const curId = queue.shift()!;
      const curFace = mesh.faces[curId];
      if (!curFace) continue;

      const pairs: [number, number][] = [
        [curFace.vertexIds[0], curFace.vertexIds[1]],
        [curFace.vertexIds[1], curFace.vertexIds[2]],
        [curFace.vertexIds[2], curFace.vertexIds[0]],
      ];

      for (const [va, vb] of pairs) {
        const key = `${Math.min(va, vb)}_${Math.max(va, vb)}`;
        const edge = edgeMap.get(key);
        if (edge) {
          for (const neighborFaceId of edge.faces) {
            if (!visitedFaces.has(neighborFaceId)) {
              visitedFaces.add(neighborFaceId);
              queue.push(neighborFaceId);
            }
          }
        }
      }
    }
  }

  // 6. Euler Characteristic: χ = V - E + F
  const eulerCharacteristic = vertexCount - edgeCount + triangleCount;

  // Genus calculation for closed 2-manifold: χ = 2 - 2g => g = (2 - χ) / 2
  const isClosed = openBoundaryCount === 0;
  const isManifold = nonManifoldEdgeCount === 0 && nonManifoldVertexCount === 0;
  let genus: number | null = null;
  if (isClosed && isManifold && connectedComponentsCount === 1) {
    genus = Math.round((2 - eulerCharacteristic) / 2);
  }

  // 7. Assemble Warnings & Errors
  if (!isManifold) {
    errors.push(
      `الشبكة غير متعددة الشعب (Non-Manifold): يوجد ${nonManifoldEdgeCount} حافة غير نظامية و ${nonManifoldVertexCount} نقطة تفرع غير صالحة.`
    );
  }

  if (openBoundaryCount > 0) {
    warnings.push(
      `الشبكة تحتوي على ${openBoundaryCount} حافة حدودية مفتوحة ضمن ${boundaryLoopCount} مسار حدودي (Open Surface / Sheet).`
    );
  }

  if (inconsistentWindingCount > 0) {
    warnings.push(
      `تم رصد ${inconsistentWindingCount} حافة ذات اتجاه دوران متعاكس (Inconsistent Normal Winding).`
    );
  }

  if (connectedComponentsCount > 1) {
    warnings.push(
      `الشبكة تتكون من ${connectedComponentsCount} مجسمات منفصلة (Disconnected Components).`
    );
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    isManifold,
    isClosed,
    eulerCharacteristic,
    genus,
    connectedComponentsCount,
    triangleCount,
    vertexCount,
    edgeCount,
    openBoundaryCount,
    boundaryLoopCount,
    nonManifoldEdgeCount,
    nonManifoldVertexCount,
    duplicateFaceCount: 0,
    degenerateFaceCount: 0,
    mergedVertexCount: 0,
    inconsistentWindingCount,
    bounds: {
      min: bbox.min,
      max: bbox.max,
      dimensions,
    },
    totalSurfaceArea,
    warnings,
    errors,
  };
}
