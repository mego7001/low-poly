/**
 * @license
 * AUME LowPoly Fabrication — 2D Flat Pattern & Multi-Sheet Nesting Viewport
 * Specification Compliant: Sections 37, 38, 43, 55, 82
 * Strictly ZERO internal triangulation rendered in 2D flat patterns!
 */

import React, { useState, useRef } from 'react';
import { ManufacturingSettings, NestingResult, SmartPanel, UnfoldResult } from '../core/manufacturing/types';
import { ZoomIn, ZoomOut, RotateCcw, Layers, LayoutGrid, CheckCircle2, SplitSquareVertical } from 'lucide-react';

interface FlatPatternViewportProps {
  unfold: UnfoldResult | null;
  nesting: NestingResult | null;
  panels: SmartPanel[];
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
  mfgSettings?: ManufacturingSettings;
  onChangeMfgSettings?: (newSettings: ManufacturingSettings) => void;
}

export const FlatPatternViewport: React.FC<FlatPatternViewportProps> = ({
  unfold,
  nesting,
  panels,
  selectedPanelId,
  onSelectPanel,
  mfgSettings,
  onChangeMfgSettings,
}) => {
  const [viewMode2D, setViewMode2D] = useState<'flat' | 'nesting'>('nesting');
  const [activeSheetIndex, setActiveSheetIndex] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(0.8);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((prev) => Math.max(0.1, Math.min(5, prev * factor)));
  };

  const resetView = () => {
    setZoom(0.8);
    setPan({ x: 50, y: 50 });
  };

  const currentSheet = nesting?.sheets.find((s) => s.sheetIndex === activeSheetIndex) || nesting?.sheets[0];

  return (
    <div
      id="aume-2d-viewport"
      className="relative w-full h-full min-h-[460px] bg-slate-100/70 border border-slate-200 rounded-xl overflow-hidden flex flex-col select-none"
    >
      {/* 2D Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Mode switcher: Flat Pattern vs Nesting */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
          <button
            id="view-2d-nesting"
            onClick={() => setViewMode2D('nesting')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode2D === 'nesting'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>توزيع الألواح الخام (Nesting)</span>
          </button>

          <button
            id="view-2d-flat"
            onClick={() => setViewMode2D('flat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              viewMode2D === 'flat'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>القطع المفردة (Flat Pattern)</span>
          </button>
        </div>

        {/* Multi-Sheet Selector (when in Nesting mode) */}
        {viewMode2D === 'nesting' && nesting && nesting.sheets.length > 0 && (
          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
            <span className="text-xs text-slate-500 font-medium px-2">اللوح:</span>
            {nesting.sheets.map((sheet) => (
              <button
                key={sheet.sheetIndex}
                onClick={() => setActiveSheetIndex(sheet.sheetIndex)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                  activeSheetIndex === sheet.sheetIndex
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                #{sheet.sheetIndex} ({sheet.utilizationPercent}%)
              </button>
            ))}
          </div>
        )}

        {/* Nesting Strategy Selector (Components vs Individual) */}
        {viewMode2D === 'nesting' && onChangeMfgSettings && mfgSettings && (
          <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
            <span className="text-xs text-slate-500 font-medium px-1.5">نمط التوزيع:</span>
            <button
              id="nesting-strat-components"
              onClick={() =>
                onChangeMfgSettings({
                  ...mfgSettings,
                  nestingStrategy: 'components',
                })
              }
              title="توزيع القطاعات المجمعة مع خطوط الثني والتفريغ المفصلي (الأفضل لتصنيع الصاج والليزر)"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                mfgSettings.nestingStrategy === 'components'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>قطع مجمعة (بتلات متصلة)</span>
            </button>
            <button
              id="nesting-strat-individual"
              onClick={() =>
                onChangeMfgSettings({
                  ...mfgSettings,
                  nestingStrategy: 'individual',
                })
              }
              title="توزيع كل لوح بمفرده للقص المنفصل واللحام الكامل"
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                mfgSettings.nestingStrategy === 'individual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <SplitSquareVertical className="w-3.5 h-3.5" />
              <span>ألواح مفردة ({panels.length})</span>
            </button>
          </div>
        )}

        {/* Zoom & Pan Controls */}
        <div className="flex items-center gap-1 bg-white/95 backdrop-blur-md shadow-sm border border-slate-200/80 rounded-lg p-1 pointer-events-auto">
          <button
            onClick={() => setZoom((prev) => Math.min(4, prev * 1.2))}
            title="تكبير"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((prev) => Math.max(0.2, prev * 0.8))}
            title="تصغير"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetView}
            title="إعادة ضبط الرؤية"
            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div
        className="w-full flex-1 overflow-hidden cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          className="w-full h-full pointer-events-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id="grid-pattern" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#e2e8f0" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Background Grid */}
          <rect x="-2000" y="-2000" width="8000" height="8000" fill="url(#grid-pattern)" />

          {/* NESTING MODE RENDERING */}
          {viewMode2D === 'nesting' && currentSheet && (
            <g id="nesting-sheet-group">
              {/* Raw Stock Sheet Boundary */}
              <rect
                x="0"
                y="0"
                width={currentSheet.width}
                height={currentSheet.height}
                fill="#ffffff"
                stroke="#0f172a"
                strokeWidth="2.5"
                rx="4"
                className="drop-shadow-md"
              />

              {/* Sheet Dimension Markers */}
              <text
                x="15"
                y="25"
                fill="#64748b"
                fontSize="14"
                fontFamily="monospace"
                fontWeight="bold"
              >
                اللوح الخام #{currentSheet.sheetIndex}: {currentSheet.width} × {currentSheet.height} مم
                (نسبة الاستغلال: {currentSheet.utilizationPercent}%)
              </text>

              {/* Remnant Offcut Rectangles (Section 43) */}
              {currentSheet.remnants &&
                currentSheet.remnants.map((rem, rIdx) => (
                  <g key={`rem-${rIdx}`}>
                    <rect
                      x={rem.x}
                      y={rem.y}
                      width={rem.width}
                      height={rem.height}
                      fill="#10b981"
                      fillOpacity="0.07"
                      stroke="#059669"
                      strokeWidth="1.5"
                      strokeDasharray="6 4"
                      rx="2"
                    />
                    <text
                      x={rem.x + 8}
                      y={rem.y + 16}
                      fill="#047857"
                      fontSize="10"
                      fontFamily="monospace"
                      fontWeight="bold"
                    >
                      بواقي خام صالحة للتدوير ({rem.width} × {rem.height} مم)
                    </text>
                  </g>
                ))}

              {/* Placed Parts */}
              {currentSheet.placedParts.map((part) => {
                const isSelected = part.panelId === selectedPanelId;
                const pathPoints = part.polygon.map(([x, y]) => `${x},${y}`).join(' ');

                // Center of polygon for text label
                let sumX = 0, sumY = 0;
                part.polygon.forEach(([x, y]) => {
                  sumX += x;
                  sumY += y;
                });
                const cX = sumX / part.polygon.length;
                const cY = sumY / part.polygon.length;

                return (
                  <g
                    key={part.partId}
                    className="pointer-events-auto cursor-pointer group"
                    onClick={() => onSelectPanel(part.panelId)}
                  >
                    {/* Outer Cut Boundary (Layer: CUT) */}
                    <polygon
                      points={pathPoints}
                      fill={
                        isSelected
                          ? '#dbeafe'
                          : part.isDetachedPatch
                          ? '#fffbeb'
                          : '#f8fafc'
                      }
                      stroke={
                        isSelected
                          ? '#2563eb'
                          : part.isDetachedPatch
                          ? '#d97706'
                          : '#0f172a'
                      }
                      strokeWidth={isSelected ? '2.5' : part.isDetachedPatch ? '2' : '1.5'}
                      strokeLinejoin="round"
                    />

                    {/* Attached Assembly Tabs */}
                    {part.tabs &&
                      part.tabs.map((tab, tIdx) => {
                        const tabPoints = tab.tabPolygon2D
                          .map(([tx, ty]) => `${tx},${ty}`)
                          .join(' ');
                        return (
                          <g key={`tab-${tIdx}`}>
                            <polygon
                              points={tabPoints}
                              fill="#f1f5f9"
                              stroke="#059669"
                              strokeWidth="1.2"
                              strokeLinejoin="round"
                            />
                            <line
                              x1={tab.foldLine2D[0][0]}
                              y1={tab.foldLine2D[0][1]}
                              x2={tab.foldLine2D[1][0]}
                              y2={tab.foldLine2D[1][1]}
                              stroke="#059669"
                              strokeWidth="1"
                              strokeDasharray="2 2"
                            />
                            <text
                              x={tab.labelPosition2D[0]}
                              y={tab.labelPosition2D[1]}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#047857"
                              fontSize="7"
                              fontFamily="monospace"
                              fontWeight="bold"
                            >
                              #{tab.pairLabel}
                            </text>
                          </g>
                        );
                      })}

                    {/* Mountain/Valley Hinge Cut & Bend Lines */}
                    {part.bendLines.map((bl, bIdx) => {
                      const isValley = bl.bendType === 'VALLEY';
                      const color = isValley ? '#2563eb' : '#dc2626';

                      if (bl.hingeCutPattern && bl.hingeCutPattern.dashes.length > 0) {
                        return (
                          <g key={`hinge-${bIdx}`}>
                            {/* Visual guide line */}
                            <line
                              x1={bl.start[0]}
                              y1={bl.start[1]}
                              x2={bl.end[0]}
                              y2={bl.end[1]}
                              stroke={color}
                              strokeWidth="0.8"
                              strokeOpacity="0.3"
                              strokeDasharray="1 3"
                            />
                            {/* Real laser cut dashes (CUT layer) */}
                            {bl.hingeCutPattern.dashes.map((dash, dIdx) => (
                              <line
                                key={`dash-${dIdx}`}
                                x1={dash.start[0]}
                                y1={dash.start[1]}
                                x2={dash.end[0]}
                                y2={dash.end[1]}
                                stroke={color}
                                strokeWidth="2.2"
                                strokeLinecap="round"
                              />
                            ))}
                            {/* Uncut tabs visualization */}
                            {bl.hingeCutPattern.tabGaps.map((tab, tIdx) => (
                              <circle
                                key={`tab-pt-${tIdx}`}
                                cx={(tab.start[0] + tab.end[0]) / 2}
                                cy={(tab.start[1] + tab.end[1]) / 2}
                                r="1.3"
                                fill="#10b981"
                              />
                            ))}
                          </g>
                        );
                      }

                      return (
                        <line
                          key={bIdx}
                          x1={bl.start[0]}
                          y1={bl.start[1]}
                          x2={bl.end[0]}
                          y2={bl.end[1]}
                          stroke={color}
                          strokeWidth="1.5"
                          strokeDasharray="4 2"
                        />
                      );
                    })}

                    {/* Sub-panels inside composite component */}
                    {part.subPanels &&
                      part.subPanels.map((sp) => {
                        const spPoints = sp.vertices2D.map(([x, y]) => `${x},${y}`).join(' ');
                        return (
                          <g key={sp.panelId}>
                            <polygon
                              points={spPoints}
                              fill="none"
                              stroke="#94a3b8"
                              strokeWidth="0.8"
                              strokeDasharray="2 2"
                            />
                            <text
                              x={sp.center2D[0]}
                              y={sp.center2D[1]}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fill="#64748b"
                              fontSize="7.5"
                              fontFamily="monospace"
                              fontWeight="600"
                              className="select-none"
                            >
                              {sp.panelId}
                            </text>
                          </g>
                        );
                      })}

                    {/* Part ID Text Label (Layer: ID) */}
                    <text
                      x={cX}
                      y={part.subPanels && part.subPanels.length > 0 ? cY - 14 : cY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isSelected ? '#1d4ed8' : '#0f172a'}
                      fontSize={part.subPanels && part.subPanels.length > 0 ? '11' : '9'}
                      fontFamily="monospace"
                      fontWeight="bold"
                      className="select-none"
                    >
                      {part.panelId}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* FLAT PATTERN VIEW */}
          {viewMode2D === 'flat' && unfold && (
            <g id="flat-pattern-group">
              {unfold.components.map((comp, compIdx) => {
                const compOffsetX = (compIdx % 4) * 320;
                const compOffsetY = Math.floor(compIdx / 4) * 280;

                return (
                  <g key={comp.componentId} transform={`translate(${compOffsetX}, ${compOffsetY})`}>
                    {/* Component Card Frame */}
                    <rect
                      x="-10"
                      y="-10"
                      width={Math.max(280, comp.bounds.width + 40)}
                      height={Math.max(200, comp.bounds.height + 40)}
                      fill="#ffffff"
                      stroke="#cbd5e1"
                      strokeWidth="1"
                      rx="8"
                      strokeDasharray="3 3"
                    />

                    <text x="5" y="15" fill="#475569" fontSize="12" fontFamily="monospace" fontWeight="bold">
                      قطاع #{comp.componentId} ({comp.panelIds.join(', ')})
                    </text>

                    {/* Render panels in this component */}
                    {comp.panels2D.map((p2d) => {
                      const isSelected = p2d.panelId === selectedPanelId;
                      const pointsStr = p2d.vertices2D
                        .map(([x, y]) => `${x + 20},${y + 40}`)
                        .join(' ');

                      let sumX = 0, sumY = 0;
                      p2d.vertices2D.forEach(([x, y]) => {
                        sumX += x + 20;
                        sumY += y + 40;
                      });
                      const cX = sumX / p2d.vertices2D.length;
                      const cY = sumY / p2d.vertices2D.length;

                      return (
                        <g
                          key={p2d.panelId}
                          className="pointer-events-auto cursor-pointer"
                          onClick={() => onSelectPanel(p2d.panelId)}
                        >
                          <polygon
                            points={pointsStr}
                            fill={isSelected ? '#dbeafe' : '#f1f5f9'}
                            stroke={isSelected ? '#2563eb' : '#0f172a'}
                            strokeWidth="1.5"
                            strokeLinejoin="round"
                          />
                          <text
                            x={cX}
                            y={cY}
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#1e293b"
                            fontSize="9"
                            fontFamily="monospace"
                            fontWeight="bold"
                          >
                            {p2d.panelId}
                          </text>
                        </g>
                      );
                    })}
                    {/* Render bend lines in this component */}
                    {comp.bendLines2D &&
                      comp.bendLines2D.map((bl, bIdx) => {
                        const isValley = bl.bendType === 'VALLEY';
                        const color = isValley ? '#2563eb' : '#dc2626';

                        if (bl.hingeCutPattern && bl.hingeCutPattern.dashes.length > 0) {
                          return (
                            <g key={`comp-hinge-${bIdx}`}>
                              {/* Visual guide line */}
                              <line
                                x1={bl.start[0] + 20}
                                y1={bl.start[1] + 40}
                                x2={bl.end[0] + 20}
                                y2={bl.end[1] + 40}
                                stroke={color}
                                strokeWidth="0.8"
                                strokeOpacity="0.3"
                                strokeDasharray="1 3"
                              />
                              {/* Real laser cut dashes */}
                              {bl.hingeCutPattern.dashes.map((dash, dIdx) => (
                                <line
                                  key={`comp-dash-${dIdx}`}
                                  x1={dash.start[0] + 20}
                                  y1={dash.start[1] + 40}
                                  x2={dash.end[0] + 20}
                                  y2={dash.end[1] + 40}
                                  stroke={color}
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                />
                              ))}
                              {/* Tabs */}
                              {bl.hingeCutPattern.tabGaps.map((tab, tIdx) => (
                                <circle
                                  key={`comp-tab-${tIdx}`}
                                  cx={(tab.start[0] + tab.end[0]) / 2 + 20}
                                  cy={(tab.start[1] + tab.end[1]) / 2 + 40}
                                  r="1.3"
                                  fill="#10b981"
                                />
                              ))}
                            </g>
                          );
                        }

                        return (
                          <line
                            key={`comp-bend-${bIdx}`}
                            x1={bl.start[0] + 20}
                            y1={bl.start[1] + 40}
                            x2={bl.end[0] + 20}
                            y2={bl.end[1] + 40}
                            stroke={color}
                            strokeWidth="1.5"
                            strokeDasharray="4 2"
                          />
                        );
                      })}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Footer Legend */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md border border-slate-200/80 px-4 py-2 rounded-lg text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-slate-900 rounded-sm" />
            <span className="text-slate-700 font-medium">خط القطع الخارجي (CUT)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 border-t-2 border-red-600 border-dashed" />
            <span className="text-slate-700 font-medium">طي بارز Mountain</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 border-t-2 border-blue-600 border-dashed" />
            <span className="text-slate-700 font-medium">طي غائر Valley</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-slate-700 font-medium">جسور الربط اليدوي (Hinge Tabs)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-100 border border-amber-500" />
            <span className="text-amber-800 font-medium">رقعة للحام (Detached Patch)</span>
          </div>

          {unfold && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-md font-mono text-[11px] font-bold">
              <span>المساحة المتصلة الكبرى:</span>
              <span>{unfold.maxConnectedAreaPercent}%</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>خالي تماماً من خطوط التثليث (Zero Internal Triangulation)</span>
          </div>
        </div>

        {viewMode2D === 'nesting' && nesting && (
          <div className="text-xs font-mono text-slate-600 flex items-center gap-3">
            <div>
              الألواح: <strong>{nesting.sheets.length}</strong>
            </div>
            <div>
              استغلال الخام: <strong className="text-blue-600 font-bold">{nesting.overallUtilization}%</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
