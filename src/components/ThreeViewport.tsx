/**
 * @license
 * AUME LowPoly Fabrication — 3D WebGL CAD Viewport
 * Specification Compliant: Section 54
 * Modes: Original Mesh | Large Faces | Manufacturing
 * Supports: Hide/Show Internal Triangulation, Orbit/Pan/Zoom, Panel Highlighting
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MeshInput } from '../core/geometry/types';
import { SmartPanel, UnfoldResult } from '../core/manufacturing/types';
import { Eye, EyeOff, RotateCcw, Box, Layers, Hammer, Maximize2 } from 'lucide-react';

interface ThreeViewportProps {
  mesh: MeshInput | null;
  panels: SmartPanel[];
  unfold: UnfoldResult | null;
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
  showInternalTriangulation: boolean;
  onToggleInternalTriangulation: () => void;
  viewMode: 'original' | 'largeFaces' | 'manufacturing';
  onChangeViewMode: (mode: 'original' | 'largeFaces' | 'manufacturing') => void;
}

// Distinct high-contrast palette for reconstructed large faces
const REGION_COLORS = [
  0x2563eb, 0x16a34a, 0xd97706, 0x9333ea, 0x0891b2, 0xe11d48,
  0x4f46e5, 0x059669, 0xc026d3, 0xd946ef, 0xca8a04, 0x0284c7,
  0x65a30d, 0xe11d48, 0x7c3aed, 0x0d9488, 0xb45309, 0x4338ca,
  0x15803d, 0xbe123c, 0x3b82f6, 0x10b981, 0xf59e0b, 0x8b5cf6,
];

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  mesh,
  panels,
  unfold,
  selectedPanelId,
  onSelectPanel,
  showInternalTriangulation,
  onToggleInternalTriangulation,
  viewMode,
  onChangeViewMode,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const modelGroupRef = useRef<THREE.Group | null>(null);

  // Mouse interaction state
  const isDraggingRef = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);

  // Re-build 3D Scene when mesh, panels, or viewMode changes
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Initialize Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);
    sceneRef.current = scene;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 450;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(150, 150, 200);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(200, 300, 200);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
    dirLight2.position.set(-200, -100, -200);
    scene.add(dirLight2);

    // Subtle floor grid
    const grid = new THREE.GridHelper(400, 40, 0xcbd5e1, 0xe2e8f0);
    grid.position.y = -60;
    scene.add(grid);

    // Model group
    const modelGroup = new THREE.Group();
    scene.add(modelGroup);
    modelGroupRef.current = modelGroup;

    // Render loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container || !camera || !renderer) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update 3D Geometry
  useEffect(() => {
    const modelGroup = modelGroupRef.current;
    const camera = cameraRef.current;
    if (!modelGroup || !camera || !mesh) return;

    // Clear previous objects
    while (modelGroup.children.length > 0) {
      const obj = modelGroup.children[0];
      modelGroup.remove(obj);
    }

    if (mesh.faces.length === 0 || mesh.vertices.length === 0) return;

    // Map faceId -> panel
    const faceToPanel = new Map<number, SmartPanel>();
    panels.forEach((p) => {
      // Find faces belonging to this region
      p.outerVertices3D;
    });

    // 1. Build Base Mesh Geometry
    const positions: number[] = [];
    const colors: number[] = [];
    const normals: number[] = [];

    // Region color lookup
    const regionColorMap = new Map<number, THREE.Color>();
    panels.forEach((p, idx) => {
      const hex = REGION_COLORS[idx % REGION_COLORS.length];
      regionColorMap.set(p.regionId, new THREE.Color(hex));
    });

    const defaultMeshColor = new THREE.Color(0x94a3b8);
    const selectedColor = new THREE.Color(0x38bdf8);

    // Fill face vertices
    for (let fIdx = 0; fIdx < mesh.faces.length; fIdx++) {
      const face = mesh.faces[fIdx];
      const v0 = mesh.vertices[face.vertexIds[0]]?.position;
      const v1 = mesh.vertices[face.vertexIds[1]]?.position;
      const v2 = mesh.vertices[face.vertexIds[2]]?.position;
      if (!v0 || !v1 || !v2) continue;

      positions.push(v0[0], v0[1], v0[2]);
      positions.push(v1[0], v1[1], v1[2]);
      positions.push(v2[0], v2[1], v2[2]);

      // Calculate triangle normal
      const ax = v1[0] - v0[0], ay = v1[1] - v0[1], az = v1[2] - v0[2];
      const bx = v2[0] - v0[0], by = v2[1] - v0[1], bz = v2[2] - v0[2];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      nx /= len; ny /= len; nz /= len;

      normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);

      // Face Color determination
      let faceColor = defaultMeshColor;

      if (viewMode === 'largeFaces' || viewMode === 'manufacturing') {
        // Find which panel this face belongs to
        const panelMatch = panels.find((p) =>
          p.outerVertices3D.some(
            (ov) =>
              Math.abs(ov[0] - v0[0]) < 1e-4 &&
              Math.abs(ov[1] - v0[1]) < 1e-4 &&
              Math.abs(ov[2] - v0[2]) < 1e-4
          )
        );

        if (panelMatch) {
          if (panelMatch.id === selectedPanelId) {
            faceColor = selectedColor;
          } else {
            faceColor = regionColorMap.get(panelMatch.regionId) || defaultMeshColor;
          }
        }
      }

      colors.push(faceColor.r, faceColor.g, faceColor.b);
      colors.push(faceColor.r, faceColor.g, faceColor.b);
      colors.push(faceColor.r, faceColor.g, faceColor.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setAttribute(
      'normal',
      new THREE.Float32BufferAttribute(normals, 3)
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
    });

    const meshObj = new THREE.Mesh(geometry, material);
    modelGroup.add(meshObj);

    // 2. Wireframe / Internal Triangulation overlay
    if (showInternalTriangulation || viewMode === 'original') {
      const wireframeGeo = new THREE.WireframeGeometry(geometry);
      const wireframeMat = new THREE.LineBasicMaterial({
        color: 0x64748b,
        transparent: true,
        opacity: 0.35,
      });
      const wireframe = new THREE.LineSegments(wireframeGeo, wireframeMat);
      modelGroup.add(wireframe);
    }

    // 3. Manufacturing Edges Overlay (Section 54)
    // Thick colored lines for Outer Cut (Black/White), Bends (Green), and Seams (Orange)
    if (viewMode === 'manufacturing' || viewMode === 'largeFaces') {
      // Reconstructed Outer Boundary lines
      const boundaryPositions: number[] = [];
      for (const p of panels) {
        const pts = p.outerVertices3D;
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          boundaryPositions.push(p1[0], p1[1], p1[2]);
          boundaryPositions.push(p2[0], p2[1], p2[2]);
        }
      }

      if (boundaryPositions.length > 0) {
        const bGeo = new THREE.BufferGeometry();
        bGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(boundaryPositions, 3)
        );
        const bMat = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          linewidth: 2,
        });
        const boundaries = new THREE.LineSegments(bGeo, bMat);
        modelGroup.add(boundaries);
      }
    }

    // Compute bounding sphere and frame camera
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) {
      const sphere = geometry.boundingSphere;
      const radius = Math.max(sphere.radius, 10);
      camera.position.set(radius * 1.6, radius * 1.4, radius * 2.2);
      camera.lookAt(sphere.center);
      gridFollow(sphere.center.y - radius);
    }
  }, [mesh, panels, viewMode, showInternalTriangulation, selectedPanelId]);

  const gridFollow = (yLevel: number) => {
    if (!sceneRef.current) return;
    const grid = sceneRef.current.children.find(
      (c) => c instanceof THREE.GridHelper
    );
    if (grid) grid.position.y = yLevel - 5;
  };

  // Mouse Controls (Orbit, Pan, Zoom)
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    isPanningRef.current = e.button === 2 || e.shiftKey; // Right click or Shift+Click = Pan
    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const camera = cameraRef.current;
    const modelGroup = modelGroupRef.current;
    if (!camera || !modelGroup) return;

    const deltaX = e.clientX - previousMousePosition.current.x;
    const deltaY = e.clientY - previousMousePosition.current.y;

    if (isPanningRef.current) {
      // Pan camera
      const panSpeed = 0.25;
      camera.position.x -= deltaX * panSpeed;
      camera.position.y += deltaY * panSpeed;
    } else {
      // Orbit around center
      modelGroup.rotation.y += deltaX * 0.008;
      modelGroup.rotation.x += deltaY * 0.008;
    }

    previousMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    const camera = cameraRef.current;
    if (!camera) return;
    const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
    camera.position.multiplyScalar(zoomFactor);
  };

  const resetCamera = () => {
    const camera = cameraRef.current;
    const modelGroup = modelGroupRef.current;
    if (!camera || !modelGroup) return;
    modelGroup.rotation.set(0, 0, 0);
    camera.position.set(160, 140, 210);
    camera.lookAt(0, 0, 0);
  };

  return (
    <div
      id="aume-3d-viewport"
      className="relative w-full h-full min-h-[460px] bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex flex-col"
    >
      {/* Top Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Mode Switcher */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
          <button
            id="view-mode-original"
            onClick={() => onChangeViewMode('original')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'original'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>الشبكة الأصلية (STL)</span>
          </button>

          <button
            id="view-mode-large-faces"
            onClick={() => onChangeViewMode('largeFaces')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'largeFaces'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>الأسطح الكبيرة V2</span>
          </button>

          <button
            id="view-mode-manufacturing"
            onClick={() => onChangeViewMode('manufacturing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode === 'manufacturing'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>وضع التصنيع (Bends & Cuts)</span>
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
          <button
            id="toggle-internal-triangulation"
            onClick={onToggleInternalTriangulation}
            title={
              showInternalTriangulation
                ? 'إخفاء شبكة المثلثات الداخلية (Triangulation)'
                : 'إظهار شبكة المثلثات الداخلية'
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
              showInternalTriangulation
                ? 'bg-slate-100 text-slate-900 font-semibold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {showInternalTriangulation ? (
              <>
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                <span>المثلثات الداخلية: ظاهرة</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                <span>المثلثات الداخلية: مخفية (صحيح)</span>
              </>
            )}
          </button>

          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          <button
            id="reset-3d-camera"
            onClick={resetCamera}
            title="إعادة ضبط الكاميرا"
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D WebGL Canvas Area */}
      <div
        ref={mountRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        className="w-full flex-1 cursor-grab active:cursor-grabbing select-none"
      />

      {/* Bottom overlay info */}
      <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm border border-slate-200/80 px-3 py-1.5 rounded-lg text-xs text-slate-600 shadow-xs pointer-events-none flex items-center gap-4">
        <span>🖱️ السحب بالماوس: تدوير النموذج</span>
        <span>🖱️ زر الفأرة الأيمن: تحريك (Pan)</span>
        <span>🔍 عجلة الفأرة: تكبير / تصغير</span>
      </div>

      {/* Selection badge */}
      {selectedPanelId && (
        <div className="absolute bottom-3 right-3 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-mono font-semibold shadow-md flex items-center gap-2">
          <span>القطعة المحددة: {selectedPanelId}</span>
          <button
            onClick={() => onSelectPanel(null)}
            className="text-blue-200 hover:text-white ml-1 font-bold text-sm"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
