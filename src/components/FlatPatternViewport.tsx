/**
 * @license
 * AUME LowPoly Fabrication — 2D Flat Pattern & Multi-Sheet Nesting Viewport
 * Specification Compliant: Sections 37, 38, 43, 55, 82
 * Strictly ZERO internal triangulation rendered in 2D flat patterns!
 */

import React, { useState, useRef } from 'react';
import { NestingResult, SmartPanel, UnfoldResult } from '../core/manufacturing/types';
import { ZoomIn, ZoomOut, RotateCcw, Layers, LayoutGrid, CheckCircle2 } from 'lucide-react';

interface FlatPatternViewportProps {
  unfold: UnfoldResult | null;
  nesting: NestingResult | null;
  panels: SmartPanel[];
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string | null) => void;
}

export const FlatPatternViewport: React.FC<FlatPatternViewportProps> = ({
  unfold,
  nesting,
  panels,
  selectedPanelId,
  onSelectPanel,
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
                      fill={isSelected ? '#dbeafe' : '#f8fafc'}
                      stroke={isSelected ? '#2563eb' : '#0f172a'}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
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

                    {/* Mountain/Valley Bend Lines (Layer: BEND) */}
                    {part.bendLines.map((bl, bIdx) => (
                      <line
                        key={bIdx}
                        x1={bl.start[0]}
                        y1={bl.start[1]}
                        x2={bl.end[0]}
                        y2={bl.end[1]}
                        stroke="#dc2626"
                        strokeWidth="1.5"
                        strokeDasharray="4 2"
                      />
                    ))}

                    {/* Part ID Text Label (Layer: ID) */}
                    <text
                      x={cX}
                      y={cY}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={isSelected ? '#1d4ed8' : '#334155'}
                      fontSize="9"
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
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* Footer Legend */}
      <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-md border border-slate-200/80 px-4 py-2 rounded-lg text-xs flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-slate-900 rounded-sm" />
            <span className="text-slate-700 font-medium">خط القطع الخارجي (CUT)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-1 border-t-2 border-red-600 border-dashed" />
            <span className="text-slate-700 font-medium">خط الثني (BEND)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-blue-100 border border-blue-500" />
            <span className="text-slate-700 font-medium">القطعة المحددة</span>
          </div>

          <div className="flex items-center gap-1 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>خالي تماماً من خطوط التثليث الداخلية (DXF Zero Internal Triangulation)</span>
          </div>
        </div>

        {viewMode2D === 'nesting' && nesting && (
          <div className="text-xs font-mono text-slate-600">
            إجمالي الألواح: <strong>{nesting.sheets.length}</strong> | الاستغلال العام:{' '}
            <strong className="text-blue-600 font-bold">{nesting.overallUtilization}%</strong>
          </div>
        )}
      </div>
    </div>
  );
};
