/**
 * @license
 * AUME LowPoly Fabrication — Phase 6: CNC G-Code Inspector & Post-Processor Modal
 * Specification Compliant: Sections 61, 75, 76
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  Download,
  Copy,
  Check,
  Zap,
  Clock,
  Navigation,
  FileCode,
  Layers,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import {
  NestingResult,
  ManufacturingSettings,
  CNCSettings,
  DEFAULT_CNC_SETTINGS,
} from '../core/manufacturing/types';
import { generateToolpathPlan } from '../core/manufacturing/toolpath';
import { generateProjectGCode, generateSheetGCode } from '../core/manufacturing/gcode';

interface GCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  nesting: NestingResult | null;
  mfgSettings: ManufacturingSettings;
  cncSettings: CNCSettings;
  onUpdateCncSettings: (settings: CNCSettings) => void;
}

export const GCodeModal: React.FC<GCodeModalProps> = ({
  isOpen,
  onClose,
  nesting,
  mfgSettings,
  cncSettings,
  onUpdateCncSettings,
}) => {
  const [selectedSheetIdx, setSelectedSheetIdx] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Compute toolpath plan and G-Code
  const toolpathPlan = useMemo(() => {
    if (!nesting || nesting.sheets.length === 0) return null;
    return generateToolpathPlan(nesting.sheets, mfgSettings, cncSettings);
  }, [nesting, mfgSettings, cncSettings]);

  const activeGCode = useMemo(() => {
    if (!toolpathPlan || toolpathPlan.sheets.length === 0) return '';
    if (selectedSheetIdx === -1) {
      return generateProjectGCode(toolpathPlan, cncSettings);
    }
    const targetSheet = toolpathPlan.sheets[selectedSheetIdx] || toolpathPlan.sheets[0];
    return generateSheetGCode(targetSheet, cncSettings, selectedSheetIdx + 1);
  }, [toolpathPlan, selectedSheetIdx, cncSettings]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(activeGCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const filename =
      selectedSheetIdx === -1
        ? 'AUME_FullProject_Laser.gcode'
        : `AUME_Sheet_${selectedSheetIdx + 1}_Laser.gcode`;
    const blob = new Blob([activeGCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <Zap className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-base font-bold text-white">
                مُولّد ومُعالج كود CNC الصناعي (Laser G-Code Post-Processor)
              </h3>
              <p className="text-xs text-slate-400">
                متوافق مع المعيار الدولي ISO 6983 / RS-274D لأنظمة الليزر، البلازما، ونفث الماء
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                showSettings ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>إعدادات الماكينة</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Machine Settings Drawer */}
        {showSettings && (
          <div className="p-4 bg-slate-950/90 border-b border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <label className="text-slate-400 font-medium block mb-1">قدرة الليزر (واط):</label>
              <input
                type="number"
                value={cncSettings.laserPowerWatt}
                onChange={(e) =>
                  onUpdateCncSettings({ ...cncSettings, laserPowerWatt: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">سرعة القطع (mm/min):</label>
              <input
                type="number"
                value={cncSettings.cuttingFeedrateMmMin}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    cuttingFeedrateMmMin: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">سرعة الحركة السريعة G00:</label>
              <input
                type="number"
                value={cncSettings.rapidFeedrateMmMin}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    rapidFeedrateMmMin: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">تأخير الاختراق Pierce (s):</label>
              <input
                type="number"
                step="0.05"
                value={cncSettings.pierceDelaySec}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    pierceDelaySec: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">غاز المساعدة (Assist Gas):</label>
              <select
                value={cncSettings.assistGas}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    assistGas: e.target.value as any,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value="Nitrogen (N2)">نيتروجين N2 (قطع نظيف)</option>
                <option value="Oxygen (O2)">أكسجين O2 (فولاذ سميك)</option>
                <option value="Compressed Air">هواء مضغوط Air (اقتصادي)</option>
              </select>
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">طول مدخل القطع Lead-in (mm):</label>
              <input
                type="number"
                value={cncSettings.leadInLengthMm}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    leadInLengthMm: Number(e.target.value),
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">ارتفاع الأمان Safe Z (mm):</label>
              <input
                type="number"
                value={cncSettings.safeZMm}
                onChange={(e) =>
                  onUpdateCncSettings({ ...cncSettings, safeZMm: Number(e.target.value) })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-slate-400 font-medium block mb-1">تعويض شق القطع (Kerf Mode):</label>
              <select
                value={cncSettings.kerfOffsetMode}
                onChange={(e) =>
                  onUpdateCncSettings({
                    ...cncSettings,
                    kerfOffsetMode: e.target.value as any,
                  })
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
              >
                <option value="geometry">تعويض هندسي مباشر في المسار</option>
                <option value="controller_left">G41 في الماكينة (يسار)</option>
                <option value="controller_right">G42 في الماكينة (يمين)</option>
                <option value="none">بدون تعويض</option>
              </select>
            </div>
          </div>
        )}

        {/* Telemetry Bar */}
        {toolpathPlan && (
          <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-6 font-mono">
              <div>
                <span className="text-slate-400">مسافة القطع: </span>
                <span className="font-bold text-white">{toolpathPlan.totalCutDistanceMm} mm</span>
              </div>
              <div>
                <span className="text-slate-400">حركة سريعة G00: </span>
                <span className="font-bold text-sky-400">{toolpathPlan.totalRapidDistanceMm} mm</span>
              </div>
              <div>
                <span className="text-slate-400">وفر المسار (TSP): </span>
                <span className="font-bold text-emerald-400">
                  +{toolpathPlan.rapidDistanceSavedMm} mm
                </span>
              </div>
              <div>
                <span className="text-slate-400">نقاط الاختراق: </span>
                <span className="font-bold text-amber-400">{toolpathPlan.totalPierceCount}</span>
              </div>
              <div>
                <span className="text-slate-400">زمن الدورة المقدر: </span>
                <span className="font-bold text-white">
                  {toolpathPlan.totalEstimatedCycleTimeSec} ثانية
                </span>
              </div>
            </div>

            {/* Sheet Selector */}
            <div className="flex items-center gap-2">
              <span className="text-slate-400">عرض:</span>
              <select
                value={selectedSheetIdx}
                onChange={(e) => setSelectedSheetIdx(Number(e.target.value))}
                className="bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200 text-xs font-medium"
              >
                <option value={-1}>كامل المشروع (All Sheets)</option>
                {toolpathPlan.sheets.map((s, idx) => (
                  <option key={s.sheetId} value={idx}>
                    شريحة #{idx + 1} ({s.sheetId})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Code Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-[11px] leading-relaxed select-text">
          <pre className="text-emerald-400/90 whitespace-pre">
            {activeGCode || '// جارٍ توليد كود مسارات القطع...'}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>تسلسل القطع آمن: الألسنة والتفريغات الداخلية تُقطع قبل المحيط الخارجي.</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'تم النسخ للحافظة' : 'نسخ الكود'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل ملف G-Code (.gcode / .nc)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
