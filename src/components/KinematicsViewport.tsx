/**
 * @license
 * AUME LowPoly Fabrication — Phase 6: Kinematic Folding & CNC Toolpath Viewport
 * Specification Compliant: Sections 50, 51, 61, 62, 75, 76
 */

import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  SkipBack,
  Layers,
  Cpu,
  Zap,
  Clock,
  Navigation,
  Eye,
} from 'lucide-react';
import {
  SmartPanel,
  UnfoldResult,
  AssemblyMap,
  NestingResult,
  ManufacturingSettings,
  CNCSettings,
  ToolpathPlan,
} from '../core/manufacturing/types';
import { buildKinematicSimulation } from '../core/manufacturing/kinematics';
import { generateToolpathPlan } from '../core/manufacturing/toolpath';

interface KinematicsViewportProps {
  panels: SmartPanel[];
  unfold: UnfoldResult | null;
  assembly: AssemblyMap | null;
  nesting: NestingResult | null;
  mfgSettings: ManufacturingSettings;
  cncSettings: CNCSettings;
  onOpenGCodeModal?: () => void;
}

export const KinematicsViewport: React.FC<KinematicsViewportProps> = ({
  panels,
  unfold,
  assembly,
  nesting,
  mfgSettings,
  cncSettings,
  onOpenGCodeModal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'folding' | 'toolpath'>('folding');
  const [progress, setProgress] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [activeSheetIdx, setActiveSheetIdx] = useState<number>(0);

  // Compute toolpath plan
  const [toolpathPlan, setToolpathPlan] = useState<ToolpathPlan | null>(null);

  useEffect(() => {
    if (nesting && nesting.sheets.length > 0) {
      const plan = generateToolpathPlan(nesting.sheets, mfgSettings, cncSettings);
      setToolpathPlan(plan);
    }
  }, [nesting, mfgSettings, cncSettings]);

  // Kinematic simulation object
  const simulation = React.useMemo(() => {
    if (!unfold || !assembly || panels.length === 0) return null;
    return buildKinematicSimulation(panels, unfold, assembly);
  }, [panels, unfold, assembly]);

  // Three.js scene refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f172a');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
    camera.position.set(0, -350, 450);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(200, 300, 400);
    scene.add(dirLight1);
    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4);
    dirLight2.position.set(-200, -200, 200);
    scene.add(dirLight2);

    // Grid Floor
    const grid = new THREE.GridHelper(800, 40, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    // Dynamic Group for animated geometry
    const dynGroup = new THREE.Group();
    scene.add(dynGroup);
    dynamicGroupRef.current = dynGroup;

    // Mouse rotation simple orbit
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dynGroup) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      dynGroup.rotation.z += dx * 0.008;
      dynGroup.rotation.x += dy * 0.008;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
      renderer.render(scene, camera);
    };
    const onMouseUp = () => {
      isDragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z += e.deltaY * 0.5;
      camera.position.z = Math.max(100, Math.min(2500, camera.position.z));
      renderer.render(scene, camera);
    };

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    // Render loop
    const render = () => {
      renderer.render(scene, camera);
    };
    render();

    // Resize observer
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0 && cameraRef.current && rendererRef.current) {
          cameraRef.current.aspect = w / h;
          cameraRef.current.updateProjectionMatrix();
          rendererRef.current.setSize(w, h);
          render();
        }
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, []);

  // Update Dynamic Group when Progress or ViewMode Changes
  useEffect(() => {
    if (!dynamicGroupRef.current || !sceneRef.current || !cameraRef.current || !rendererRef.current)
      return;
    const group = dynamicGroupRef.current;
    group.clear();

    if (viewMode === 'folding' && simulation) {
      // Render animated Kinematic folding frame
      const frame = simulation.getFrameAtProgress(progress);

      frame.panels.forEach((pState) => {
        const isActive = pState.panelId === frame.activePanelId;
        const pts = pState.vertices3D;
        if (pts.length < 3) return;

        // Fan triangulation for convex polygon rendering
        const geom = new THREE.BufferGeometry();
        const positions: number[] = [];

        for (let i = 1; i < pts.length - 1; i++) {
          positions.push(pts[0][0], pts[0][1], pts[0][2]);
          positions.push(pts[i][0], pts[i][1], pts[i][2]);
          positions.push(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.computeVertexNormals();

        const color = isActive
          ? new THREE.Color('#38bdf8')
          : pState.isAssembled
          ? new THREE.Color('#10b981')
          : new THREE.Color('#64748b');

        const mat = new THREE.MeshStandardMaterial({
          color,
          side: THREE.DoubleSide,
          roughness: 0.3,
          metalness: 0.2,
          wireframe: false,
        });
        const mesh = new THREE.Mesh(geom, mat);
        group.add(mesh);

        // Edge wireframe
        const edgePositions: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          edgePositions.push(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
        }
        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
        const edgeMat = new THREE.LineBasicMaterial({
          color: isActive ? 0xffffff : 0x0f172a,
          linewidth: isActive ? 2 : 1,
        });
        const edgeLine = new THREE.LineSegments(edgeGeom, edgeMat);
        group.add(edgeLine);
      });
    } else if (viewMode === 'toolpath' && toolpathPlan && toolpathPlan.sheets.length > 0) {
      // Render CNC Laser Toolpath on Sheet
      const sheet = toolpathPlan.sheets[activeSheetIdx] || toolpathPlan.sheets[0];

      // Sheet Boundary
      const sheetW = mfgSettings.sheetWidth;
      const sheetH = mfgSettings.sheetHeight;
      const sheetGeom = new THREE.PlaneGeometry(sheetW, sheetH);
      const sheetMat = new THREE.MeshBasicMaterial({
        color: 0x1e293b,
        side: THREE.DoubleSide,
      });
      const sheetMesh = new THREE.Mesh(sheetGeom, sheetMat);
      sheetMesh.position.set(sheetW / 2, sheetH / 2, -1);
      group.add(sheetMesh);

      // Sheet Border Line
      const borderPts = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(sheetW, 0, 0),
        new THREE.Vector3(sheetW, sheetH, 0),
        new THREE.Vector3(0, sheetH, 0),
        new THREE.Vector3(0, 0, 0),
      ];
      const borderGeom = new THREE.BufferGeometry().setFromPoints(borderPts);
      const borderLine = new THREE.Line(
        borderGeom,
        new THREE.LineBasicMaterial({ color: 0x64748b, linewidth: 2 })
      );
      group.add(borderLine);

      // Toolpath Contours & Rapid Traversals
      let prevPt: [number, number] = [0, 0];

      sheet.contours.forEach((c) => {
        const startPt = c.leadInPoint || c.points[0];

        // Rapid Move G00 (Dashed Cyan)
        const rapidPts = [
          new THREE.Vector3(prevPt[0], prevPt[1], 1),
          new THREE.Vector3(startPt[0], startPt[1], 1),
        ];
        const rapidGeom = new THREE.BufferGeometry().setFromPoints(rapidPts);
        const rapidLine = new THREE.Line(
          rapidGeom,
          new THREE.LineDashedMaterial({
            color: 0x38bdf8,
            dashSize: 8,
            gapSize: 5,
          })
        );
        rapidLine.computeLineDistances();
        group.add(rapidLine);

        // Pierce Marker (Yellow Sphere)
        const pierceGeom = new THREE.SphereGeometry(3, 8, 8);
        const pierceMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
        const pierceMesh = new THREE.Mesh(pierceGeom, pierceMat);
        pierceMesh.position.set(startPt[0], startPt[1], 2);
        group.add(pierceMesh);

        // Cut Move G01 (Solid Green / Amber)
        const cutPts: THREE.Vector3[] = [];
        if (c.leadInPoint) {
          cutPts.push(new THREE.Vector3(c.leadInPoint[0], c.leadInPoint[1], 1));
        }
        for (const p of c.points) {
          cutPts.push(new THREE.Vector3(p[0], p[1], 1));
        }
        if (c.isClosed && c.points.length > 2) {
          cutPts.push(new THREE.Vector3(c.points[0][0], c.points[0][1], 1));
        }

        const cutGeom = new THREE.BufferGeometry().setFromPoints(cutPts);
        const cutLine = new THREE.Line(
          cutGeom,
          new THREE.LineBasicMaterial({
            color: c.contourType === 'outer_perimeter' ? 0x10b981 : 0xf97316,
            linewidth: 2,
          })
        );
        group.add(cutLine);

        prevPt = (c.leadOutPoint || c.points[c.points.length - 1]) as [number, number];
      });

      // Center view on sheet
      group.position.set(-sheetW / 2, -sheetH / 2, 0);
    }

    rendererRef.current.render(sceneRef.current, cameraRef.current);
  }, [viewMode, progress, simulation, toolpathPlan, activeSheetIdx, mfgSettings]);

  // Animation playback tick
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setProgress((prev) => {
        const next = prev + (dt * 0.15 * playSpeed);
        if (next >= 1.0) {
          setIsPlaying(false);
          return 1.0;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, playSpeed]);

  const activeStep = simulation
    ? simulation.getFrameAtProgress(progress)
    : null;

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-6 py-3 bg-slate-950/80 border-b border-slate-800 gap-4">
        {/* Mode Selector */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode('folding')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'folding'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>محاكاة الثني ثلاثية الأبعاد (Kinematics)</span>
          </button>
          <button
            onClick={() => setViewMode('toolpath')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              viewMode === 'toolpath'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>مسارات القطع الليزرية CNC (G-Code Toolpath)</span>
          </button>
        </div>

        {/* Action Controls & G-Code trigger */}
        <div className="flex items-center gap-3">
          {onOpenGCodeModal && (
            <button
              onClick={onOpenGCodeModal}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors border border-slate-700"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>معاينة وتصدير كود G-Code</span>
            </button>
          )}

          {viewMode === 'toolpath' && toolpathPlan && toolpathPlan.sheets.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>الشريحة:</span>
              <select
                value={activeSheetIdx}
                onChange={(e) => setActiveSheetIdx(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-slate-200 text-xs"
              >
                {toolpathPlan.sheets.map((s, idx) => (
                  <option key={s.sheetId} value={idx}>
                    #{idx + 1} - {s.sheetId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main 3D Canvas Viewport */}
      <div className="relative flex-1 min-h-[380px] bg-slate-950">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

        {/* View mode HUD overlays */}
        {viewMode === 'folding' && activeStep && (
          <div className="absolute top-4 left-4 p-3 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-800 text-xs text-slate-200 max-w-sm pointer-events-none shadow-lg">
            <div className="flex items-center gap-2 text-blue-400 font-bold mb-1">
              <Navigation className="w-3.5 h-3.5" />
              <span>
                الخطوة {activeStep.activeStepIndex + 1} من {panels.length}
              </span>
            </div>
            <div className="font-mono text-[11px] text-slate-400 mb-1">
              اللوح النشط: <span className="text-white font-bold">{activeStep.activePanelId}</span>
            </div>
            <div className="text-slate-300 text-[11px] leading-relaxed">
              {simulation?.steps[activeStep.activeStepIndex]?.description}
            </div>
          </div>
        )}

        {viewMode === 'toolpath' && toolpathPlan && (
          <div className="absolute top-4 left-4 p-3 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-800 text-xs text-slate-200 pointer-events-none shadow-lg space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              <span>إحصائيات مسار CNC المحسّن</span>
            </div>
            <div className="font-mono text-[11px] text-slate-300">
              مسافة القطع الإجمالية: <strong>{toolpathPlan.totalCutDistanceMm} mm</strong>
            </div>
            <div className="font-mono text-[11px] text-slate-300">
              مسافة الحركة السريعة G00: <strong>{toolpathPlan.totalRapidDistanceMm} mm</strong>
            </div>
            <div className="font-mono text-[11px] text-emerald-400">
              الوفر في المسافة السريعة (TSP): <strong>+{toolpathPlan.rapidDistanceSavedMm} mm</strong>
            </div>
            <div className="font-mono text-[11px] text-slate-300">
              عدد نقاط الاختراق (Pierces): <strong>{toolpathPlan.totalPierceCount}</strong>
            </div>
            <div className="font-mono text-[11px] text-amber-300">
              الوقت التقديري للدورة: <strong>{toolpathPlan.totalEstimatedCycleTimeSec} ثانية</strong>
            </div>
          </div>
        )}

        {/* Legend in CNC mode */}
        {viewMode === 'toolpath' && (
          <div className="absolute bottom-4 right-4 p-2.5 bg-slate-900/80 backdrop-blur-md rounded-xl border border-slate-800 text-[11px] text-slate-300 pointer-events-none shadow-lg flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-emerald-500 rounded-full" />
              <span>محيط خارجي (Outer Contour)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 bg-orange-500 rounded-full" />
              <span>ألسنة وتفريغات (Relief Tabs)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-0.5 border-b border-dashed border-sky-400" />
              <span>حركة سريعة G00 (Rapid Traverse)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <span>نقطة اختراق (Pierce Point)</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Folding Playback Bar (When in folding mode) */}
      {viewMode === 'folding' && (
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsPlaying(false);
                setProgress(0);
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="إعادة للبداية"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setProgress((p) => Math.max(0, p - 1 / Math.max(1, panels.length)));
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="الخطوة السابقة"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs transition-all shadow-md"
            >
              {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white" />}
              <span>{isPlaying ? 'إيقاف مؤقت' : 'تشغيل المحاكاة'}</span>
            </button>

            <button
              onClick={() => {
                setIsPlaying(false);
                setProgress((p) => Math.min(1, p + 1 / Math.max(1, panels.length)));
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              title="الخطوة التالية"
            >
              <SkipForward className="w-4 h-4" />
            </button>

            {/* Playback speed selector */}
            <div className="flex items-center gap-1 ml-2 bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs text-slate-400">
              {[0.5, 1, 2].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaySpeed(spd)}
                  className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                    playSpeed === spd ? 'bg-slate-800 text-white' : 'hover:text-white'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Progress Slider */}
          <div className="flex-1 max-w-md flex items-center gap-3">
            <span className="text-xs font-mono text-slate-400">2D مسطح</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.005}
              value={progress}
              onChange={(e) => {
                setIsPlaying(false);
                setProgress(parseFloat(e.target.value));
              }}
              className="flex-1 accent-blue-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />
            <span className="text-xs font-mono text-emerald-400">3D مجمّع</span>
            <span className="text-xs font-mono font-bold text-white w-12 text-right">
              {Math.round(progress * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
