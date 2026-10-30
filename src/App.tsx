/**
 * @license
 * AUME LowPoly Fabrication — Master Application Entry Point
 * Specification Compliant: Complete Architecture (Phases 1, 2, 3)
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MeshInput,
  GeometryReconstructionResult,
  GeometryV2Params,
  DEFAULT_GEOMETRY_V2_PARAMS,
} from './core/geometry/types';
import {
  ManufacturingSettings,
  DEFAULT_MANUFACTURING_SETTINGS,
  SmartPanel,
  UnfoldResult,
  NestingResult,
  BOMItem,
  AssemblyMap,
  ManufacturabilityScore,
  CNCSettings,
  DEFAULT_CNC_SETTINGS,
} from './core/manufacturing/types';
import { parseMeshFile, validateMeshTopology, ImportMetadata } from './core/parsers/meshParser';
import { reconstructGeometryV2 } from './core/geometry/reconstructionV2';
import { buildSmartPanels } from './core/manufacturing/panels';
import { performIncrementalUnfold } from './core/manufacturing/unfold';
import { performPolygonNesting } from './core/manufacturing/nesting';
import { generateBOM } from './core/manufacturing/bom';
import { buildAssemblyMap } from './core/manufacturing/assembly';
import { evaluateManufacturabilityScore } from './core/manufacturing/scoring';
import {
  createCubeFixture,
  createTriangulatedPentagonFixture,
  createTriangulatedHexagonFixture,
  createSoccerBallFixture,
  createLowPolyCamelFixture,
  createDenseFlatPlaneFixture,
  createLowPolyFoxFixture,
  createTry1BenchmarkFixture,
} from './core/fixtures/sampleModels';

// UI Components
import { ThreeViewport } from './components/ThreeViewport';
import { FlatPatternViewport } from './components/FlatPatternViewport';
import { ValidationDashboard } from './components/ValidationDashboard';
import { BOMTable } from './components/BOMTable';
import { AssemblyMapView } from './components/AssemblyMapView';
import { SettingsModal } from './components/SettingsModal';
import { ExportModal } from './components/ExportModal';
import { AcceptanceTestModal } from './components/AcceptanceTestModal';
import { KinematicsViewport } from './components/KinematicsViewport';
import { GCodeModal } from './components/GCodeModal';

// Icons
import {
  Layers,
  Play,
  UploadCloud,
  FileCode,
  ShieldCheck,
  Settings,
  Package,
  Boxes,
  FileSpreadsheet,
  Wrench,
  Activity,
  CheckCircle2,
  Cpu,
  ChevronRight,
  Zap,
  Navigation,
  AlertOctagon,
} from 'lucide-react';

export default function App() {
  // Application State
  const [mesh, setMesh] = useState<MeshInput | null>(null);
  const [metadata, setMetadata] = useState<ImportMetadata | null>(null);
  const [reconstruction, setReconstruction] = useState<GeometryReconstructionResult | null>(null);
  const [panels, setPanels] = useState<SmartPanel[]>([]);
  const [unfold, setUnfold] = useState<UnfoldResult | null>(null);
  const [nesting, setNesting] = useState<NestingResult | null>(null);
  const [bom, setBom] = useState<BOMItem[]>([]);
  const [assembly, setAssembly] = useState<AssemblyMap | null>(null);
  const [manufacturabilityScore, setManufacturabilityScore] = useState<ManufacturabilityScore | null>(null);

  // Configuration Parameters
  const [mfgSettings, setMfgSettings] = useState<ManufacturingSettings>({
    ...DEFAULT_MANUFACTURING_SETTINGS,
    nestingStrategy: 'components',
  });
  const [geoParams, setGeoParams] = useState<GeometryV2Params>(DEFAULT_GEOMETRY_V2_PARAMS);
  const [cncSettings, setCncSettings] = useState<CNCSettings>(DEFAULT_CNC_SETTINGS);

  // Navigation & Viewport State
  const [activeTab, setActiveTab] = useState<'3d' | '2d' | 'kinematics' | 'bom' | 'assembly' | 'diagnostics'>('3d');
  const [viewMode3D, setViewMode3D] = useState<'original' | 'largeFaces' | 'manufacturing'>('largeFaces');
  const [showInternalTriangulation, setShowInternalTriangulation] = useState<boolean>(false);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isAcceptanceTestsOpen, setIsAcceptanceTestsOpen] = useState<boolean>(false);
  const [isGCodeOpen, setIsGCodeOpen] = useState<boolean>(false);

  // Pipeline Status & Progress (Section 57, 62)
  const [isPipelineRunning, setIsPipelineRunning] = useState<boolean>(false);
  const [pipelineStage, setPipelineStage] = useState<string>('جاهز للعمل');
  const [pipelineProgress, setPipelineProgress] = useState<number>(0);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load initial model (Soccer Ball or Cube)
  useEffect(() => {
    loadModel('soccer');
  }, []);

  // Pre-configured models loader
  const loadModel = (modelKey: string) => {
    setPipelineError(null);
    let newMesh: MeshInput;
    let fileName = '';

    switch (modelKey) {
      case 'cube':
        newMesh = createCubeFixture();
        fileName = 'cube_triangulated_fixture.stl';
        break;
      case 'pentagon':
        newMesh = createTriangulatedPentagonFixture();
        fileName = 'pentagon_fixture.stl';
        break;
      case 'hexagon':
        newMesh = createTriangulatedHexagonFixture();
        fileName = 'hexagon_fixture.stl';
        break;
      case 'soccer':
        newMesh = createSoccerBallFixture();
        fileName = 'soccer_ball_fixture.stl';
        break;
      case 'camel':
        newMesh = createLowPolyCamelFixture();
        fileName = 'aume_camel_sculpture_15parts.obj';
        break;
      case 'fox':
        newMesh = createLowPolyFoxFixture();
        fileName = 'lowpoly_fox_sculpture.obj';
        break;
      case 'flatgrid':
        newMesh = createDenseFlatPlaneFixture(8);
        fileName = 'dense_flat_grid_128triangles.stl';
        break;
      case 'try1':
        newMesh = createTry1BenchmarkFixture(1200);
        fileName = 'try1_benchmark_dense.stl';
        break;
      default:
        newMesh = createSoccerBallFixture();
        fileName = 'model.stl';
    }

    const topo = validateMeshTopology(newMesh);
    const meta: ImportMetadata = {
      ...topo,
      fileName,
      fileType: fileName.endsWith('.obj') ? 'OBJ' : 'STL_ASCII',
      estimatedArea: topo.totalSurfaceArea,
    };

    setMesh(newMesh);
    setMetadata(meta);
    setSelectedPanelId(null);

    // Automatically run AUME Pipeline for the new model
    runAUMEPipeline(newMesh, geoParams, mfgSettings);
  };

  // One-Click AUME Pipeline (Section 57)
  const runAUMEPipeline = async (
    targetMesh: MeshInput,
    currentGeoParams: GeometryV2Params,
    currentMfgSettings: ManufacturingSettings
  ) => {
    setIsPipelineRunning(true);
    setPipelineError(null);
    setPipelineProgress(10);
    setPipelineStage('١. فحص وتنظيف الشبكة الهندسية (Mesh Validation)');

    await new Promise((r) => setTimeout(r, 40));

    try {
      // Step 2 & 3: Large Face Reconstruction V2 (PCA + Lazy Queue + Exact Gate)
      setPipelineProgress(30);
      setPipelineStage('٢. إعادة بناء الأسطح الكبيرة V2 وكتم خطوط التثليث (PCA Reconstruction)');
      await new Promise((r) => setTimeout(r, 20));

      const recon = reconstructGeometryV2(targetMesh, currentGeoParams);
      setReconstruction(recon);

      // Step 4: Smart Panels & Local UV Projection
      setPipelineProgress(50);
      setPipelineStage('٣. تصنيف الألواح الذكية P-XXXXXXXX وتحديد معالم الحدود (Smart Panels)');
      await new Promise((r) => setTimeout(r, 20));

      const smartPanels = buildSmartPanels(recon.regions, targetMesh);
      setPanels(smartPanels);

      // Step 5: Incremental Unfold & Bend/Seam Analysis
      setPipelineProgress(70);
      setPipelineStage('٤. الفرد التصنيعي واكتشاف خطوط الثني واللحام (Incremental Unfold)');
      await new Promise((r) => setTimeout(r, 20));

      const unfoldRes = performIncrementalUnfold(smartPanels, recon, currentMfgSettings);
      setUnfold(unfoldRes);

      // Step 6: Multi-Sheet Polygon Nesting
      setPipelineProgress(85);
      setPipelineStage('٥. توزيع الألواح الخام وفحص التصادم الحقيقي (Polygon Nesting)');
      await new Promise((r) => setTimeout(r, 20));

      const nestingRes = performPolygonNesting(unfoldRes, currentMfgSettings);
      setNesting(nestingRes);

      // Step 7: BOM, Assembly Map, & Manufacturability Score
      setPipelineProgress(95);
      setPipelineStage('٦. إنشاء جدول BOM ودليل التجميع وتقييم قابلية التصنيع');
      await new Promise((r) => setTimeout(r, 20));

      const bomList = generateBOM(smartPanels, nestingRes, currentMfgSettings, unfoldRes.allBends);
      setBom(bomList);

      const assemblyMap = buildAssemblyMap(smartPanels, unfoldRes.allBends, recon, unfoldRes.allSeams);
      setAssembly(assemblyMap);

      const score = evaluateManufacturabilityScore(smartPanels, unfoldRes, nestingRes);
      setManufacturabilityScore(score);

      setPipelineProgress(100);
      setIsPipelineRunning(false);
      setPipelineStage('اكتملت المعالجة بنجاح (100%)');
    } catch (err: any) {
      console.error('Pipeline execution error:', err);
      setIsPipelineRunning(false);
      const errMsg = err?.message || 'تعذر استكمال المعالجة الهندسية';
      setPipelineError(errMsg);
      setPipelineStage(`توقفت المعالجة: ${errMsg}`);
    }
  };

  // Handle Custom File Upload (STL / OBJ)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!buffer) return;

      try {
        const { mesh: parsedMesh, metadata: meta } = parseMeshFile(
          buffer as ArrayBuffer,
          file.name,
          geoParams.maxDistanceTolerance || 0.001
        );

        setMesh(parsedMesh);
        setMetadata(meta);
        setSelectedPanelId(null);
        runAUMEPipeline(parsedMesh, geoParams, mfgSettings);
      } catch (err) {
        console.error('Failed to parse mesh file:', err);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Immediate reactive settings handler
  const handleMfgSettingsChange = (newSettings: ManufacturingSettings) => {
    setMfgSettings(newSettings);
    if (unfold && panels.length > 0 && reconstruction) {
      try {
        const nestingRes = performPolygonNesting(unfold, newSettings);
        setNesting(nestingRes);
        const bomList = generateBOM(panels, nestingRes, newSettings, unfold.allBends);
        setBom(bomList);
        const score = evaluateManufacturabilityScore(panels, unfold, nestingRes);
        setManufacturabilityScore(score);
      } catch (err) {
        console.error('Instant nesting update error:', err);
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans antialiased selection:bg-blue-100 selection:text-blue-900" dir="rtl">
      {/* Top Header & Branding */}
      <header className="bg-white border-b border-slate-200/90 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-900 tracking-tight">
                  AUME LowPoly Fabrication
                </h1>
                <span className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-blue-50 text-blue-700 border border-blue-200/70 rounded-full">
                  Geometry V2 + Phase 3
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                منظومة الفرد التصنيعي للنماذج ثلاثية الأبعاد • إخفاء شبكات التثليث • تصدير DXF وBOM
              </p>
            </div>
          </div>

          {/* Quick Actions & Primary Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Sample Models Dropdown */}
            <select
              id="select-sample-model"
              onChange={(e) => loadModel(e.target.value)}
              defaultValue="soccer"
              className="text-xs bg-slate-50 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="soccer">كرة القدم (Soccer Ball Fixture - 116 Δ)</option>
              <option value="camel">تمثال الجمل الهندسي (AUME Camel Sculpture - 15 قطاعاً)</option>
              <option value="cube">المكعب القياسي (Cube Fixture - 12 Δ)</option>
              <option value="pentagon">خماسي مسطح (Pentagon - 5 Δ → 1 Region)</option>
              <option value="hexagon">سداسي مسطح (Hexagon - 6 Δ → 1 Region)</option>
              <option value="fox">تمثال الثعلب الهيكلي (LowPoly Fox Sculpture)</option>
              <option value="flatgrid">شبكة مسطحة كثيفة (Dense Flat Grid - 128 Δ)</option>
              <option value="try1">اختبار الأداء القياسي (try1.stl Benchmark)</option>
            </select>

            {/* Custom STL/OBJ Upload */}
            <button
              id="btn-upload-file"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <UploadCloud className="w-4 h-4 text-slate-500" />
              <span>رفع STL/OBJ</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".stl,.obj"
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Run AUME Pipeline Button (Section 57) */}
            <button
              id="btn-run-aume-pipeline"
              disabled={isPipelineRunning || !mesh}
              onClick={() => mesh && runAUMEPipeline(mesh, geoParams, mfgSettings)}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm transition-colors"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{isPipelineRunning ? 'جارٍ التشغيل...' : 'تشغيل AUME'}</span>
            </button>

            <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />

            {/* Acceptance Tests Runner */}
            <button
              id="btn-open-acceptance-tests"
              onClick={() => setIsAcceptanceTestsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg transition-colors"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="hidden md:inline">مصفوفة الاختبارات</span>
            </button>

            {/* CNC Laser G-Code Modal */}
            <button
              id="btn-open-gcode"
              onClick={() => setIsGCodeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200/80 rounded-lg transition-colors"
            >
              <Zap className="w-4 h-4 text-purple-600" />
              <span className="hidden md:inline">كود CNC ليزر (G-Code)</span>
            </button>

            {/* Settings Modal Toggle */}
            <button
              id="btn-open-settings"
              onClick={() => setIsSettingsOpen(true)}
              title="إعدادات التصنيع والهندسة"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* Export Package Modal Toggle */}
            <button
              id="btn-open-export"
              onClick={() => setIsExportOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-lg shadow-xs transition-colors"
            >
              <Package className="w-4 h-4" />
              <span>تصدير DXF</span>
            </button>
          </div>
        </div>

        {/* Real-Time Telemetry & Progress Status Bar (Section 62) */}
        {isPipelineRunning && (
          <div className="bg-blue-50 border-t border-blue-100 px-4 sm:px-6 py-1.5 flex items-center justify-between text-xs text-blue-900">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600 animate-spin" />
              <span className="font-medium">{pipelineStage}</span>
            </div>
            <span className="font-mono font-bold">{pipelineProgress}%</span>
          </div>
        )}

        {/* Pipeline Error Banner */}
        {pipelineError && !isPipelineRunning && (
          <div className="bg-rose-50 border-t border-rose-200 px-4 sm:px-6 py-2 flex items-center justify-between text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-medium">{pipelineError}</span>
            </div>
            <button
              onClick={() => mesh && runAUMEPipeline(mesh, geoParams, mfgSettings)}
              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-[11px] transition-colors"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Navigation Tabs Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-1.5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center gap-1">
            <button
              id="tab-3d-cad"
              onClick={() => setActiveTab('3d')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === '3d'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>الرؤية ثلاثية الأبعاد (3D CAD)</span>
            </button>

            <button
              id="tab-2d-nesting"
              onClick={() => setActiveTab('2d')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === '2d'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>الفرد وتوزيع الألواح (2D Nesting)</span>
            </button>

            <button
              id="tab-kinematics"
              onClick={() => setActiveTab('kinematics')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'kinematics'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Navigation className="w-4 h-4 text-purple-400" />
              <span>المحاكاة الحركية (Digital Twin)</span>
            </button>

            <button
              id="tab-bom-table"
              onClick={() => setActiveTab('bom')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'bom'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>حصر المواد (BOM)</span>
              {bom.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 text-slate-700 font-mono">
                  {bom.length}
                </span>
              )}
            </button>

            <button
              id="tab-assembly-guide"
              onClick={() => setActiveTab('assembly')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'assembly'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>دليل التجميع (Assembly Map)</span>
            </button>

            <button
              id="tab-diagnostics"
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors ${
                activeTab === 'diagnostics'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span>التحليل الهندسي والجودة (QA)</span>
            </button>
          </div>

          {/* Quick summary stats in top tab bar */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-mono text-slate-600 pl-2">
            <div>
              الأسطح المستعادة:{' '}
              <strong className="text-slate-900 font-bold">{panels.length}</strong>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div>
              الألواح الخام:{' '}
              <strong className="text-blue-600 font-bold">{nesting?.sheets.length || 0}</strong>
            </div>
            <div className="w-px h-3.5 bg-slate-200" />
            <div>
              الاستغلال:{' '}
              <strong className="text-emerald-600 font-bold">
                {nesting?.overallUtilization || 0}%
              </strong>
            </div>
          </div>
        </div>

        {/* Tab Content Display */}
        <div className="flex-1 flex flex-col min-h-[520px]">
          {activeTab === '3d' && (
            <ThreeViewport
              mesh={mesh}
              panels={panels}
              unfold={unfold}
              selectedPanelId={selectedPanelId}
              onSelectPanel={setSelectedPanelId}
              showInternalTriangulation={showInternalTriangulation}
              onToggleInternalTriangulation={() =>
                setShowInternalTriangulation((prev) => !prev)
              }
              viewMode={viewMode3D}
              onChangeViewMode={setViewMode3D}
            />
          )}

          {activeTab === '2d' && (
            <FlatPatternViewport
              unfold={unfold}
              nesting={nesting}
              panels={panels}
              selectedPanelId={selectedPanelId}
              onSelectPanel={setSelectedPanelId}
              mfgSettings={mfgSettings}
              onChangeMfgSettings={handleMfgSettingsChange}
            />
          )}

          {activeTab === 'kinematics' && (
            <KinematicsViewport
              panels={panels}
              unfold={unfold}
              assembly={assembly}
              reconstruction={reconstruction}
              nesting={nesting}
              settings={mfgSettings}
              mfgSettings={mfgSettings}
              cncSettings={cncSettings}
              onOpenGCode={() => setIsGCodeOpen(true)}
              onOpenGCodeModal={() => setIsGCodeOpen(true)}
            />
          )}

          {activeTab === 'bom' && (
            <BOMTable
              bom={bom}
              selectedPanelId={selectedPanelId}
              onSelectPanel={setSelectedPanelId}
            />
          )}

          {activeTab === 'assembly' && (
            <AssemblyMapView
              assembly={assembly}
              panels={panels}
              selectedPanelId={selectedPanelId}
              onSelectPanel={setSelectedPanelId}
            />
          )}

          {activeTab === 'diagnostics' && (
            <ValidationDashboard
              metadata={metadata}
              reconstruction={reconstruction}
              panels={panels}
              unfold={unfold}
              nesting={nesting}
              manufacturabilityScore={manufacturabilityScore}
              settings={mfgSettings}
              assembly={assembly}
              bom={bom}
              cncSettings={cncSettings}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-3 px-6 text-xs text-slate-500 text-center">
        AUME LowPoly Fabrication System — Geometry V2 + Manufacturing Core + AUME Intelligence
      </footer>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        mfgSettings={mfgSettings}
        onChangeMfgSettings={handleMfgSettingsChange}
        geoParams={geoParams}
        onChangeGeoParams={setGeoParams}
        onResetDefaults={() => {
          handleMfgSettingsChange({
            ...DEFAULT_MANUFACTURING_SETTINGS,
            nestingStrategy: 'components',
          });
          setGeoParams(DEFAULT_GEOMETRY_V2_PARAMS);
        }}
      />

      {/* Acceptance Tests Modal */}
      <AcceptanceTestModal
        isOpen={isAcceptanceTestsOpen}
        onClose={() => setIsAcceptanceTestsOpen(false)}
      />

      {/* CNC G-Code Inspector & Machine Parameters Modal */}
      <GCodeModal
        isOpen={isGCodeOpen}
        onClose={() => setIsGCodeOpen(false)}
        nesting={nesting}
        settings={mfgSettings}
        mfgSettings={mfgSettings}
        cncSettings={cncSettings}
        onChangeCncSettings={setCncSettings}
        onUpdateCncSettings={setCncSettings}
      />

      {/* Export Package Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        nesting={nesting}
        panels={panels}
        unfold={unfold}
        bom={bom}
        settings={mfgSettings}
        reconstruction={reconstruction}
        assembly={assembly}
        manufacturabilityScore={manufacturabilityScore}
        cncSettings={cncSettings}
      />
    </div>
  );
}
