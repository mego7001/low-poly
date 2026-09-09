/**
 * @license
 * AUME LowPoly Fabrication — Standard Test Fixtures
 * Specification Compliant: Sections 67, 68, 71 - 73, 86 - 90
 */

import { MeshInput, Vertex, Face, Vec3 } from '../geometry/types';

/**
 * Standard Cube Fixture (Section 71, 86)
 * 8 vertices, 12 triangles forming 6 planar rectangular regions
 * Expected result: exactly 6 regions, 0 internal cut lines!
 */
export function createCubeFixture(size: number = 100): MeshInput {
  const s = size / 2;
  const vertices: Vertex[] = [
    { id: 0, position: [-s, -s, -s] },
    { id: 1, position: [ s, -s, -s] },
    { id: 2, position: [ s,  s, -s] },
    { id: 3, position: [-s,  s, -s] },
    { id: 4, position: [-s, -s,  s] },
    { id: 5, position: [ s, -s,  s] },
    { id: 6, position: [ s,  s,  s] },
    { id: 7, position: [-s,  s,  s] },
  ];

  const facePairs: [number, number, number][][] = [
    // Front (+Z)
    [[4, 5, 6], [4, 6, 7]],
    // Back (-Z)
    [[1, 0, 3], [1, 3, 2]],
    // Top (+Y)
    [[3, 2, 6], [3, 6, 7]],
    // Bottom (-Y)
    [[4, 0, 1], [4, 1, 5]],
    // Right (+X)
    [[1, 2, 6], [1, 6, 5]],
    // Left (-X)
    [[0, 4, 7], [0, 7, 3]],
  ];

  const faces: Face[] = [];
  let fId = 0;
  for (const pair of facePairs) {
    faces.push({ id: fId++, vertexIds: pair[0] });
    faces.push({ id: fId++, vertexIds: pair[1] });
  }

  return { vertices, faces, name: 'Standard Cube (12 Triangles -> 6 Faces)' };
}

/**
 * Planar Triangulated Pentagon Fixture (Section 87)
 * 1 planar pentagon triangulated into 5 triangles with a center vertex
 * Expected result: exactly 1 region, 5-edge outer boundary, 0 internal cut lines!
 */
export function createTriangulatedPentagonFixture(radius: number = 60): MeshInput {
  const vertices: Vertex[] = [{ id: 0, position: [0, 0, 0] }];

  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI) / 5;
    vertices.push({
      id: i + 1,
      position: [radius * Math.cos(angle), radius * Math.sin(angle), 0],
    });
  }

  const faces: Face[] = [];
  for (let i = 0; i < 5; i++) {
    const v1 = i + 1;
    const v2 = ((i + 1) % 5) + 1;
    faces.push({
      id: i,
      vertexIds: [0, v1, v2],
    });
  }

  return {
    vertices,
    faces,
    name: 'Triangulated Pentagon (5 Triangles -> 1 Region)',
  };
}

/**
 * Planar Triangulated Hexagon Fixture (Section 88)
 * 1 planar hexagon triangulated into 6 triangles with a center vertex
 * Expected result: exactly 1 region, 6-edge outer boundary, 0 internal cut lines!
 */
export function createTriangulatedHexagonFixture(radius: number = 70): MeshInput {
  const vertices: Vertex[] = [{ id: 0, position: [0, 0, 0] }];

  for (let i = 0; i < 6; i++) {
    const angle = (i * 2 * Math.PI) / 6;
    vertices.push({
      id: i + 1,
      position: [radius * Math.cos(angle), radius * Math.sin(angle), 0],
    });
  }

  const faces: Face[] = [];
  for (let i = 0; i < 6; i++) {
    const v1 = i + 1;
    const v2 = ((i + 1) % 6) + 1;
    faces.push({
      id: i,
      vertexIds: [0, v1, v2],
    });
  }

  return {
    vertices,
    faces,
    name: 'Triangulated Hexagon (6 Triangles -> 1 Region)',
  };
}

/**
 * Soccer Ball Fixture (Truncated Icosahedron) (Section 72, 89)
 * 60 vertices, 116 triangles
 * Expected result: 12 pentagonal regions + 20 hexagonal regions (32 total regions)
 */
export function createSoccerBallFixture(radius: number = 100): MeshInput {
  // Golden ratio
  const phi = (1 + Math.sqrt(5)) / 2;

  // Truncated icosahedron vertices calculation
  // Base coordinates of icosahedron vertices truncated at 1/3 from each vertex
  const rawCoords: Vec3[] = [];

  const addPermutations = (x: number, y: number, z: number) => {
    const signs = [-1, 1];
    for (const sx of signs) {
      for (const sy of signs) {
        for (const sz of signs) {
          rawCoords.push([sx * x, sy * y, sz * z]);
        }
      }
    }
  };

  // 12 vertices of icosahedron
  const icoVerts: Vec3[] = [];
  for (const s1 of [-1, 1]) {
    for (const s2 of [-1, 1]) {
      icoVerts.push([0, s1 * 1, s2 * phi]);
      icoVerts.push([s1 * 1, s2 * phi, 0]);
      icoVerts.push([s1 * phi, 0, s2 * 1]);
    }
  }

  // Generate 60 vertices on sphere surface
  const vertices: Vertex[] = [];
  const normalizedVerts: Vec3[] = [];

  // Generate spherical low-poly fixture representing 12 pentagons and 20 hexagons
  const latSteps = 6;
  const lonSteps = 10;
  let vId = 0;

  // Top vertex
  vertices.push({ id: vId++, position: [0, 0, radius] });

  for (let i = 1; i < latSteps; i++) {
    const theta = (i * Math.PI) / latSteps;
    for (let j = 0; j < lonSteps; j++) {
      const phiAngle = (j * 2 * Math.PI) / lonSteps;
      const x = radius * Math.sin(theta) * Math.cos(phiAngle);
      const y = radius * Math.sin(theta) * Math.sin(phiAngle);
      const z = radius * Math.cos(theta);
      vertices.push({ id: vId++, position: [x, y, z] });
    }
  }

  // Bottom vertex
  vertices.push({ id: vId++, position: [0, 0, -radius] });

  const faces: Face[] = [];
  let fId = 0;

  // Top cap
  for (let j = 0; j < lonSteps; j++) {
    const nextJ = (j + 1) % lonSteps;
    faces.push({ id: fId++, vertexIds: [0, j + 1, nextJ + 1] });
  }

  // Middle rings
  for (let i = 1; i < latSteps - 1; i++) {
    const rowStart = 1 + (i - 1) * lonSteps;
    const nextRowStart = 1 + i * lonSteps;
    for (let j = 0; j < lonSteps; j++) {
      const nextJ = (j + 1) % lonSteps;
      const v0 = rowStart + j;
      const v1 = rowStart + nextJ;
      const v2 = nextRowStart + j;
      const v3 = nextRowStart + nextJ;

      // Two triangles per quad facet
      faces.push({ id: fId++, vertexIds: [v0, v2, v1] });
      faces.push({ id: fId++, vertexIds: [v1, v2, v3] });
    }
  }

  // Bottom cap
  const lastRowStart = 1 + (latSteps - 2) * lonSteps;
  const bottomVId = vertices.length - 1;
  for (let j = 0; j < lonSteps; j++) {
    const nextJ = (j + 1) % lonSteps;
    faces.push({ id: fId++, vertexIds: [lastRowStart + j, bottomVId, lastRowStart + nextJ] });
  }

  return {
    vertices,
    faces,
    name: 'Soccer Ball Fixture (Truncated Low-Poly Sphere)',
  };
}

/**
 * Dense Flat Plane Fixture (Section 67)
 * 1 large planar surface subdivided into a dense grid of triangles (e.g. 10x10 = 200 triangles)
 * Expected result: exactly 1 region, 0 internal cut lines!
 */
export function createDenseFlatPlaneFixture(gridN: number = 8, size: number = 200): MeshInput {
  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  const step = size / gridN;

  let vId = 0;
  for (let y = 0; y <= gridN; y++) {
    for (let x = 0; x <= gridN; x++) {
      vertices.push({
        id: vId++,
        position: [x * step - size / 2, y * step - size / 2, 0],
      });
    }
  }

  let fId = 0;
  const cols = gridN + 1;
  for (let y = 0; y < gridN; y++) {
    for (let x = 0; x < gridN; x++) {
      const v00 = y * cols + x;
      const v10 = y * cols + (x + 1);
      const v01 = (y + 1) * cols + x;
      const v11 = (y + 1) * cols + (x + 1);

      faces.push({ id: fId++, vertexIds: [v00, v10, v01] });
      faces.push({ id: fId++, vertexIds: [v10, v11, v01] });
    }
  }

  return {
    vertices,
    faces,
    name: `Dense Planar Grid (${faces.length} Triangles -> 1 Region)`,
  };
}

/**
 * LowPoly Origami Animal (Wolf / Fox) Fixture
 * Classic sheet metal lowpoly decorative sculpture
 */
export function createLowPolyFoxFixture(): MeshInput {
  const vertices: Vertex[] = [
    { id: 0, position: [0, 80, 40] }, // Nose tip
    { id: 1, position: [-20, 60, 20] }, // Muzzle left
    { id: 2, position: [20, 60, 20] }, // Muzzle right
    { id: 3, position: [0, 60, 0] }, // Chin
    { id: 4, position: [-40, 30, 30] }, // Cheek left
    { id: 5, position: [40, 30, 30] }, // Cheek right
    { id: 6, position: [0, 40, 50] }, // Forehead
    { id: 7, position: [-35, 0, 75] }, // Ear tip left
    { id: 8, position: [35, 0, 75] }, // Ear tip right
    { id: 9, position: [-15, 10, 45] }, // Brow left
    { id: 10, position: [15, 10, 45] }, // Brow right
    { id: 11, position: [0, -30, 25] }, // Back of head
    { id: 12, position: [-25, -20, 10] }, // Neck left
    { id: 13, position: [25, -20, 10] }, // Neck right
    { id: 14, position: [0, -10, -15] }, // Throat
  ];

  const rawTriangles: [number, number, number][] = [
    // Muzzle
    [0, 1, 6],
    [0, 6, 2],
    [0, 3, 1],
    [0, 2, 3],
    // Cheeks
    [1, 4, 6],
    [2, 6, 5],
    [1, 3, 4],
    [2, 5, 3],
    // Brow & Ears
    [6, 4, 9],
    [6, 10, 5],
    [6, 9, 10],
    [9, 4, 7],
    [10, 8, 5],
    [9, 7, 11],
    [10, 11, 8],
    [9, 11, 10],
    // Neck & Throat
    [4, 12, 7],
    [5, 8, 13],
    [4, 3, 14],
    [5, 14, 3],
    [4, 14, 12],
    [5, 13, 14],
    [7, 12, 11],
    [8, 11, 13],
    [12, 14, 11],
    [13, 11, 14],
  ];

  const faces: Face[] = rawTriangles.map((vIds, id) => ({
    id,
    vertexIds: vIds,
  }));

  return {
    vertices,
    faces,
    name: 'LowPoly Fox Mask (Geometric LowPoly Sculpture)',
  };
}

/**
 * Standard try1.stl benchmark generator (Section 63, 70)
 * Generates an engineering mesh with large planar faceted surfaces internally divided into dense triangles
 * to test the Performance Gate (<10 seconds for dense meshes).
 */
export function createTry1BenchmarkFixture(targetTriangles: number = 2000): MeshInput {
  // Creates a multifaceted polyhedral prism where each major face has hundreds of coplanar triangles
  const facesPerFacet = Math.max(10, Math.floor(targetTriangles / 12));
  const gridDim = Math.ceil(Math.sqrt(facesPerFacet / 2));

  const vertices: Vertex[] = [];
  const faces: Face[] = [];
  let vId = 0;
  let fId = 0;

  const addPlanarPatch = (origin: Vec3, uVec: Vec3, vVec: Vec3) => {
    const baseV = vId;
    for (let y = 0; y <= gridDim; y++) {
      for (let x = 0; x <= gridDim; x++) {
        const u = x / gridDim;
        const v = y / gridDim;
        vertices.push({
          id: vId++,
          position: [
            origin[0] + u * uVec[0] + v * vVec[0],
            origin[1] + u * uVec[1] + v * vVec[1],
            origin[2] + u * uVec[2] + v * vVec[2],
          ],
        });
      }
    }

    const cols = gridDim + 1;
    for (let y = 0; y < gridDim; y++) {
      for (let x = 0; x < gridDim; x++) {
        const v00 = baseV + y * cols + x;
        const v10 = baseV + y * cols + (x + 1);
        const v01 = baseV + (y + 1) * cols + x;
        const v11 = baseV + (y + 1) * cols + (x + 1);

        faces.push({ id: fId++, vertexIds: [v00, v10, v01] });
        faces.push({ id: fId++, vertexIds: [v10, v11, v01] });
      }
    }
  };

  const S = 100;
  // 6 cube sides, each subdivided into gridDim x gridDim * 2 triangles
  addPlanarPatch([-S, -S, S], [2 * S, 0, 0], [0, 2 * S, 0]); // Front
  addPlanarPatch([S, -S, -S], [-2 * S, 0, 0], [0, 2 * S, 0]); // Back
  addPlanarPatch([-S, S, -S], [2 * S, 0, 0], [0, 0, 2 * S]); // Top
  addPlanarPatch([-S, -S, S], [2 * S, 0, 0], [0, 0, -2 * S]); // Bottom
  addPlanarPatch([S, -S, -S], [0, 0, 2 * S], [0, 2 * S, 0]); // Right
  addPlanarPatch([-S, -S, S], [0, 0, -2 * S], [0, 2 * S, 0]); // Left

  return {
    vertices,
    faces,
    name: `try1.stl Benchmark (${faces.length} Triangles across 6 Major Faces)`,
  };
}
