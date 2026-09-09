/**
 * @license
 * AUME LowPoly Fabrication — Acceptance Test Suite Modal
 * Specification Compliant: Sections 65 - 77, 84 - 86, 96 - 101
 */

import React, { useState } from 'react';
import { runFullAcceptanceTestSuite, FullTestSuiteSummary } from '../core/tests/testSuite';
import { Play, CheckCircle2, XCircle, Clock, ShieldCheck, X } from 'lucide-react';

interface AcceptanceTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AcceptanceTestModal: React.FC<AcceptanceTestModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [suiteSummary, setSuiteSummary] = useState<FullTestSuiteSummary | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleRunTests = () => {
    setIsRunning(true);
    setTimeout(() => {
      const summary = runFullAcceptanceTestSuite();
      setSuiteSummary(summary);
      setIsRunning(false);
    }, 100);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-semibold text-slate-900">
              مصفوفة اختبارات القبول الرسمية (Acceptance Release Gates)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action and Summary */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs text-slate-600">
              تتحقق هذه الاختبارات من كافة بنود العقد الهندسي (Section 101)، بما يشمل استعادة الأسطح
              الكبيرة، حتمية الترتيب (Shuffle Invariance)، كتم خطوط التثليث، ونقاء ملفات DXF.
            </p>
            {suiteSummary && (
              <div className="flex items-center gap-4 mt-2 text-xs font-mono">
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {suiteSummary.passedCount} ناجح
                </span>
                {suiteSummary.failedCount > 0 && (
                  <span className="text-rose-600 font-bold flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" /> {suiteSummary.failedCount} راسب
                  </span>
                )}
                <span className="text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> {Math.round(suiteSummary.totalDurationMs)} ms
                </span>
              </div>
            )}
          </div>

          <button
            id="btn-run-acceptance-suite"
            disabled={isRunning}
            onClick={handleRunTests}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{isRunning ? 'جارٍ تشغيل الاختبارات...' : 'تشغيل الاختبارات الهندسية'}</span>
          </button>
        </div>

        {/* Tests List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {!suiteSummary && !isRunning && (
            <div className="text-center py-12 text-slate-400 text-xs">
              اضغط على "تشغيل الاختبارات الهندسية" لتنفيذ حزمة الفحص الرسمية.
            </div>
          )}

          {suiteSummary &&
            suiteSummary.results.map((test) => (
              <div
                key={test.id}
                className={`p-3.5 rounded-xl border text-xs transition-all ${
                  test.passed
                    ? 'bg-emerald-50/40 border-emerald-200/80 text-emerald-950'
                    : 'bg-rose-50/40 border-rose-200/80 text-rose-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-mono font-bold text-slate-800 mr-2">{test.id}:</span>
                      <span className="font-semibold text-slate-900">{test.name}</span>
                    </div>
                  </div>
                  <span className="font-mono text-slate-500 shrink-0">
                    {Math.round(test.durationMs)} ms
                  </span>
                </div>

                <div className="mt-2 pl-6 space-y-1 text-[11px] text-slate-600">
                  <div>
                    <strong className="text-slate-700">المتوقع:</strong> {test.expected}
                  </div>
                  <div>
                    <strong className="text-slate-700">الفعلي:</strong> {test.actual}
                  </div>
                  {test.details && (
                    <div className="text-slate-500 italic mt-1">
                      ℹ️ {test.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
