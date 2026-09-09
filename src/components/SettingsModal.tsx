/**
 * @license
 * AUME LowPoly Fabrication — Fabrication & Geometry Parameters Settings
 * Specification Compliant: Sections 8, 42, 46
 */

import React from 'react';
import { ManufacturingSettings } from '../core/manufacturing/types';
import { GeometryV2Params } from '../core/geometry/types';
import { Settings, X, RotateCcw } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  mfgSettings: ManufacturingSettings;
  onChangeMfgSettings: (newSettings: ManufacturingSettings) => void;
  geoParams: GeometryV2Params;
  onChangeGeoParams: (newParams: GeometryV2Params) => void;
  onResetDefaults: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  mfgSettings,
  onChangeMfgSettings,
  geoParams,
  onChangeGeoParams,
  onResetDefaults,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-slate-700" />
            <h3 className="text-base font-semibold text-slate-900">
              إعدادات التصنيع وإعادة بناء الأسطح (Fabrication Parameters)
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Section 1: Sheet Stock & Cutting Parameters */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm mb-3 pb-1 border-b border-slate-100">
              ١. أبعاد الألواح الخام والقطع بالليزر (Sheet Stock & CNC)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 mb-1">عرض اللوح الخام (مم):</label>
                <input
                  type="number"
                  value={mfgSettings.sheetWidth}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      sheetWidth: parseFloat(e.target.value) || 1200,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">طول اللوح الخام (مم):</label>
                <input
                  type="number"
                  value={mfgSettings.sheetHeight}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      sheetHeight: parseFloat(e.target.value) || 800,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">هامش حافة اللوح Margin (مم):</label>
                <input
                  type="number"
                  value={mfgSettings.edgeMargin}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      edgeMargin: parseFloat(e.target.value) || 15,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">المسافة بين القطع Part Spacing (مم):</label>
                <input
                  type="number"
                  value={mfgSettings.partSpacing}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      partSpacing: parseFloat(e.target.value) || 8,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">عرض شعاع القطع Kerf (مم):</label>
                <input
                  type="number"
                  step="0.05"
                  value={mfgSettings.kerf}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      kerf: parseFloat(e.target.value) || 0.2,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">نوع الخامة والمادة:</label>
                <select
                  value={mfgSettings.material}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      material: e.target.value,
                      density: e.target.value.includes('Aluminum') ? 2.7 : 7.85,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                >
                  <option value="Mild Steel (CR4)">حديد صلب طري (Mild Steel CR4 - 7.85 g/cm³)</option>
                  <option value="Stainless Steel 304">ستانلس ستيل (Stainless Steel 304 - 8.0 g/cm³)</option>
                  <option value="Aluminum 5052">ألومنيوم (Aluminum 5052 - 2.7 g/cm³)</option>
                  <option value="Cardboard / Paper">كرتون مقوى للنماذج (Cardboard - 0.7 g/cm³)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Sheet Metal Bending & Allowance */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm mb-3 pb-1 border-b border-slate-100">
              ٢. حسابات الثني بالمكبس (Press Brake & Bend Allowance)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-600 mb-1">سماكة اللوح (مم):</label>
                <input
                  type="number"
                  step="0.1"
                  value={mfgSettings.materialThickness}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      materialThickness: parseFloat(e.target.value) || 1.5,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">نصف قطر الثني الداخلي (مم):</label>
                <input
                  type="number"
                  step="0.1"
                  value={mfgSettings.bendRadius}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      bendRadius: parseFloat(e.target.value) || 1.5,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">معامل K-Factor:</label>
                <input
                  type="number"
                  step="0.01"
                  value={mfgSettings.kFactor}
                  onChange={(e) =>
                    onChangeMfgSettings({
                      ...mfgSettings,
                      kFactor: parseFloat(e.target.value) || 0.44,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Geometry Core V2 Tolerances */}
          <div>
            <h4 className="font-semibold text-slate-900 text-sm mb-3 pb-1 border-b border-slate-100">
              ٣. معايير استعادة الأسطح الهندسية (Geometry Core V2 Gate Tolerances)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 mb-1">
                  أقصى انحراف استواء عن السطح Plane Tol (مم):
                </label>
                <input
                  type="number"
                  step="0.0005"
                  value={geoParams.maxDistanceTolerance}
                  onChange={(e) =>
                    onChangeGeoParams({
                      ...geoParams,
                      maxDistanceTolerance: parseFloat(e.target.value) || 0.001,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-1">
                  أقصى انحراف لزاوية العمودي Normal Deg (درجة):
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={geoParams.maxNormalDeg}
                  onChange={(e) =>
                    onChangeGeoParams({
                      ...geoParams,
                      maxNormalDeg: parseFloat(e.target.value) || 6,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={onResetDefaults}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضيات</span>
          </button>

          <button
            onClick={onClose}
            className="px-5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            حفظ وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
