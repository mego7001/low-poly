/**
 * @license
 * AUME LowPoly Fabrication — Assembly Map & Sequence Guide
 * Specification Compliant: Sections 50, 51
 */

import React, { useState } from 'react';
import { AssemblyMap, SmartPanel } from '../core/manufacturing/types';
import { GitCommit, ArrowLeft, Layers, Wrench, CheckCircle2 } from 'lucide-react';

interface AssemblyMapViewProps {
  assembly: AssemblyMap | null;
  panels: SmartPanel[];
  selectedPanelId: string | null;
  onSelectPanel: (panelId: string) => void;
}

export const AssemblyMapView: React.FC<AssemblyMapViewProps> = ({
  assembly,
  panels,
  selectedPanelId,
  onSelectPanel,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);

  if (!assembly || assembly.nodes.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500">
        لم يتم احتساب تسلسل التجميع بعد. يرجى تشغيل خط المعالجة.
      </div>
    );
  }

  const currentNode = assembly.nodes[activeStep] || assembly.nodes[0];

  return (
    <div className="space-y-6">
      {/* Workshop Step-by-Step Flow */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-600" />
              <span>دليل التجميع الإرشادي للورشة (Workshop Assembly Sequence)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ترتيب تجميع القطع خطوة بخطوة بدءاً من القاعدة والأجزاء الكبرى (Sections 50, 51)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={activeStep === 0}
              onClick={() => setActiveStep((p) => Math.max(0, p - 1))}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg transition-colors"
            >
              الخطوة السابقة
            </button>
            <span className="text-xs font-mono font-semibold px-2 text-slate-600">
              خطوة {activeStep + 1} من {assembly.nodes.length}
            </span>
            <button
              disabled={activeStep === assembly.nodes.length - 1}
              onClick={() => setActiveStep((p) => Math.min(assembly.nodes.length - 1, p + 1))}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 rounded-lg transition-colors"
            >
              الخطوة التالية
            </button>
          </div>
        </div>

        {/* Current Step Spotlight Card */}
        <div className="mt-4 bg-slate-50 border border-slate-200/80 rounded-xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-600 text-white font-mono font-bold flex items-center justify-center text-sm">
                #{currentNode.order}
              </div>
              <div>
                <h4 className="text-sm font-bold font-mono text-slate-900">
                  لوح: {currentNode.panelId}
                </h4>
                <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                  <span>الشكل: {currentNode.type}</span>
                  <span>المساحة: {currentNode.area} مم²</span>
                  <span>القطاع: #{currentNode.sector}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectPanel(currentNode.panelId)}
              className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors"
            >
              تحديد في الرسم 3D / 2D
            </button>
          </div>

          {/* Instruction banner for this step */}
          {currentNode.instruction && (
            <div className="mb-4 p-3 bg-blue-50/80 border border-blue-200/70 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">توجيه التركيب: </span>
                <span>{currentNode.instruction}</span>
              </div>
            </div>
          )}

          {/* Connections with other panels */}
          <div className="mt-3">
            <h5 className="text-xs font-semibold text-slate-700 mb-2">
              المفاصل والاتصالات المرتبطة بهذه الخطوة:
            </h5>
            {currentNode.connections.length === 0 ? (
              <p className="text-xs text-slate-500 italic">
                لوح البداية الرئيسي (Base Panel) — يتم تثبيته أولاً كمرجع للهيكل.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentNode.connections.map((conn, idx) => {
                  const targetId =
                    conn.fromPanelId === currentNode.panelId
                      ? conn.toPanelId
                      : conn.fromPanelId;
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 bg-white border border-slate-200/70 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            conn.type === 'bend' ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        />
                        <span className="font-mono font-semibold text-slate-800">
                          {targetId}
                        </span>
                        <span className="text-slate-500">
                          ({conn.type === 'bend' ? 'ثني بالمكبس' : 'لحام / تثبيت'})
                        </span>
                      </div>
                      <div className="font-mono text-slate-600">
                        {conn.length} مم @ {conn.angleDeg}°
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Complete Assembly Nodes Grid */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-800 mb-3">
            جدول المسار الكامل للتجميع (Full Sequence Nodes):
          </h4>
          <div className="flex flex-wrap gap-2">
            {assembly.nodes.map((node, idx) => (
              <button
                key={node.panelId}
                onClick={() => {
                  setActiveStep(idx);
                  onSelectPanel(node.panelId);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors border ${
                  activeStep === idx
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>#{node.order}</span>
                <span className="font-semibold">{node.panelId}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
