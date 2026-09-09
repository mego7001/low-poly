/**
 * @license
 * AUME LowPoly Fabrication — Bill of Materials (BOM) View
 * Specification Compliant: Sections 49, 59
 */

import React, { useState } from 'react';
import { BOMItem } from '../core/manufacturing/types';
import { bomToCSV } from '../core/manufacturing/bom';
import { Download, Search, FileSpreadsheet, FileJson } from 'lucide-react';

interface BOMTableProps {
  bom: BOMItem[];
  onSelectPanel: (panelId: string) => void;
  selectedPanelId: string | null;
}

export const BOMTable: React.FC<BOMTableProps> = ({
  bom,
  onSelectPanel,
  selectedPanelId,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filteredItems = bom.filter((item) => {
    const matchesSearch =
      item.partId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.panelId.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || item.type === filterType;
    return matchesSearch && matchesType;
  });

  const totalArea = bom.reduce((acc, item) => acc + item.areaMm2, 0);
  const totalMass = bom.reduce((acc, item) => acc + item.estimatedMassGrams, 0);

  const downloadCSV = () => {
    const csvContent = bomToCSV(bom);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'AUME_BOM.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadJSON = () => {
    const jsonContent = JSON.stringify(bom, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'AUME_BOM.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
      {/* Header and Download actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>جدول حصر المواد والتصنيع (Bill of Materials — BOM)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            إجمالي القطع: {bom.length} | المساحة الكلية:{' '}
            {(totalArea / 1000000).toFixed(3)} م² | الكتلة التقديرية:{' '}
            {(totalMass / 1000).toFixed(2)} كجم
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>تصدير CSV</span>
          </button>
          <button
            onClick={downloadJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-slate-500" />
            <span>تصدير JSON</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="بحث برقم القطعة أو الكود..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-3 pr-9 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-blue-500"
        >
          <option value="ALL">جميع الأشكال الهندسية</option>
          <option value="Triangle">مثلث (Triangle)</option>
          <option value="Quad">رباعي (Quad)</option>
          <option value="Pentagon">خماسي (Pentagon)</option>
          <option value="Hexagon">سداسي (Hexagon)</option>
          <option value="Composite">مركب (Composite)</option>
        </select>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto border border-slate-200/80 rounded-lg">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">ترتيب التجميع</th>
              <th className="py-2.5 px-3">معرّف القطعة (Part ID)</th>
              <th className="py-2.5 px-3">رمز اللوح (Panel ID)</th>
              <th className="py-2.5 px-3">الشكل الهندسي</th>
              <th className="py-2.5 px-3">المساحة (مم²)</th>
              <th className="py-2.5 px-3">الكتلة (جرام)</th>
              <th className="py-2.5 px-3">اللوح المخصص</th>
              <th className="py-2.5 px-3">عدد الثنيات</th>
              <th className="py-2.5 px-3">طول اللحام (مم)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-6 text-slate-400">
                  لا توجد قطع مطابقة للبحث
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const isSelected = item.panelId === selectedPanelId;
                return (
                  <tr
                    key={item.partId}
                    onClick={() => onSelectPanel(item.panelId)}
                    className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
                      isSelected ? 'bg-blue-50 font-semibold text-blue-900' : ''
                    }`}
                  >
                    <td className="py-2 px-3 font-mono text-slate-500">#{item.assemblyOrder}</td>
                    <td className="py-2 px-3 font-mono font-medium text-slate-800">
                      {item.partId}
                    </td>
                    <td className="py-2 px-3 font-mono text-blue-600">{item.panelId}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px]">
                        {item.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono">{item.areaMm2.toLocaleString()}</td>
                    <td className="py-2 px-3 font-mono">{item.estimatedMassGrams}</td>
                    <td className="py-2 px-3 font-medium text-slate-600">{item.sheetAssignment}</td>
                    <td className="py-2 px-3 font-mono">{item.bendCount}</td>
                    <td className="py-2 px-3 font-mono">{item.weldLengthMm}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
