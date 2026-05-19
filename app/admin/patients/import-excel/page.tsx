'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, validateThaiIdCard } from '@/lib/supabase/queries';
import { Upload, FileSpreadsheet, AlertCircle, Loader2, ArrowLeft, LogOut, CheckCircle, XCircle, Edit3, ChevronDown } from 'lucide-react';
import * as XLSX from 'xlsx';

// 📋 กำหนดคอลัมน์มาตรฐานที่ระบบต้องการ
const STANDARD_FIELDS = [
  { key: 'id_card', label: 'เลขบัตรประชาชน', required: true, type: 'id_card' },
  { key: 'first_name', label: 'ชื่อผู้ป่วย', required: true },
  { key: 'last_name', label: 'นามสกุลผู้ป่วย', required: true },
  { key: 'hospital_number', label: 'HN', required: true },
  { key: 'birth_date', label: 'วันเกิด(วว/ดด/ปปปป พ.ศ.)', required: true, type: 'date_th' },
  { key: 'gender', label: 'เพศ', required: true, type: 'gender' },
  { key: 'hospital_name', label: 'โรงพยาบาล', required: true },
  { key: 'phone', label: 'เบอร์โทรศัพท์ผู้ป่วย' },
  { key: 'email', label: 'อีเมลผู้ป่วย' },
  { key: 'current_weight', label: 'น้ำหนัก(กก.)', type: 'number', min: 30, max: 200 },
  { key: 'height', label: 'ส่วนสูง(ซม.)', type: 'number', min: 100, max: 250 },
  { key: 'waist_circumference', label: 'รอบเอว(ซม.)', type: 'number', min: 26, max: 200 },
  { key: 'diabetes_type', label: 'ประเภทเบาหวาน', type: 'select', options: ['กลุ่มเสี่ยง', 'เบาหวาน'] },
  { key: 'blood_sugar', label: 'ค่าน้ำตาล(มก./ดล.)', type: 'number' },
  { key: 'hba1c_level', label: 'ค่าHbA1c', type: 'number' },
  { key: 'notes', label: 'หมายเหตุสุขภาพ' },
  { key: 'house_number', label: 'บ้านเลขที่' },
  { key: 'village_no', label: 'หมู่ที่' },
  { key: 'village_name', label: 'หมู่บ้าน' },
  { key: 'soi', label: 'ซอย' },
  { key: 'road', label: 'ถนน' },
  { key: 'subdistrict', label: 'ตำบล' },
  { key: 'district', label: 'อำเภอ' },
  { key: 'province', label: 'จังหวัด' },
  { key: 'postal_code', label: 'รหัสไปรษณีย์' },
  { key: 'address_line1', label: 'ที่อยู่เพิ่มเติม' },
  { key: 'emergency_contact_name', label: 'ผู้ติดต่อฉุกเฉิน' },
  { key: 'emergency_contact_phone', label: 'เบอร์ติดต่อฉุกเฉิน' },
  { key: 'emergency_contact_relationship', label: 'ความสัมพันธ์ผู้ติดต่อฉุกเฉิน' },
  { key: 'coach_name', label: 'โค้ชผู้ดูแล' },
];

export default function ImportExcelPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; key: string } | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<number, string[]>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');

  // ✅ ตรวจสอบ Session
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) { router.push('/admin/patients'); return; }
    setUser(userData);
  }, [router]);

  // 🔄 แปลงข้อมูลดิบ + จับคู่ Header
  useEffect(() => {
    if (rawData.length === 0) return;
    if (excelHeaders.length === 0) return;

    // Auto-mapping เบื้องต้น
    const autoMap: Record<string, string> = {};
    excelHeaders.forEach(header => {
      const cleanHeader = header.replace(/\s+/g, '').toLowerCase();
      const match = STANDARD_FIELDS.find(f => {
        const fClean = f.label.replace(/\s+/g, '').replace(/[()\.\-]/g, '').toLowerCase();
        return cleanHeader.includes(fClean) || fClean.includes(cleanHeader);
      });
      autoMap[header] = match?.key || '';
    });
    setHeaderMapping(autoMap);
    setStep('mapping');
  }, [rawData, excelHeaders]);

  // 📊 สร้าง Preview Data ตาม Mapping
  const buildPreview = useCallback(() => {
    if (!selectedFile || rawData.length === 0) return;
    
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: selectedRows.has(idx), _errors: [] as string[] };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) newRow[dbKey] = String(row[excelKey] ?? '').trim();
      });
      return newRow;
    });

    setPreviewData(mapped);
    setStep('preview');
    runValidation(mapped);
  }, [rawData, headerMapping, selectedRows]);

  // ✅ Validation Logic
  const runValidation = (data: any[]) => {
    const errors: Record<number, string[]> = {};
    data.forEach((row, idx) => {
      const rowErrors: string[] = [];
      STANDARD_FIELDS.forEach(field => {
        const val = row[field.key];
        if (field.required && (!val || val === '')) {
          rowErrors.push(`${field.label} เป็นฟิลด์บังคับ`);
          return;
        }
        if (!val && val !== 0) return;

        if (field.type === 'id_card') {
          if (!validateThaiIdCard(val)) rowErrors.push('เลขบัตรประชาชนไม่ถูกต้อง (ต้อง 13 หลัก และ Check Digit ตรง)');
        } else if (field.type === 'date_th') {
          if (!/^\d{2}\/\d{2}\/\d{4}$/.test(val)) rowErrors.push('รูปแบบวันเกิดต้องเป็น วว/ดด/ปปปป');
        } else if (field.type === 'gender') {
          if (!['ชาย', 'หญิง'].includes(val)) rowErrors.push('เพศต้องเป็น ชาย หรือ หญิง');
        } else if (field.type === 'number') {
          const num = parseFloat(val);
          if (isNaN(num)) rowErrors.push(`${field.label} ต้องเป็นตัวเลข`);
          else if (field.min !== undefined && num < field.min) rowErrors.push(`${field.label} น้อยกว่าค่าต่ำสุด (${field.min})`);
          else if (field.max !== undefined && num > field.max) rowErrors.push(`${field.label} เกินค่าสูงสุด (${field.max})`);
        } else if (field.type === 'select') {
          if (!field.options?.includes(val)) rowErrors.push(`${field.label} ต้องเป็น ${field.options?.join(' หรือ ')}`);
        }
      });
      if (rowErrors.length > 0) errors[idx] = rowErrors;
    });
    setValidationErrors(errors);
    setPreviewData(prev => prev.map((row, idx) => ({ ...row, _errors: errors[idx] || [] })));
  };

  // 📥 อ่านไฟล์
  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('กรุณาเลือกไฟล์ Excel เท่านั้น'); return; }
    setSelectedFile(file);
    setError('');
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setRawData(json);
        if (json.length > 0) setExcelHeaders(Object.keys(json[0]));
      } catch { setError('❌ ไม่สามารถอ่านไฟล์ได้'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  // 🔄 จัดการการแก้ไขในตาราง
  const handleCellEdit = (rowIdx: number, key: string, value: string) => {
    setPreviewData(prev => prev.map((row, i) => i === rowIdx ? { ...row, [key]: value } : row));
  };

  const handleMappingChange = (excelHeader: string, dbKey: string) => {
    setHeaderMapping(prev => ({ ...prev, [excelHeader]: dbKey }));
  };

  const toggleSelectRow = (idx: number) => {
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
    setPreviewData(prev => prev.map((r, i) => i === idx ? { ...r, _selected: next.has(i) } : r));
  };

  const selectAll = (checked: boolean) => {
    const next = checked ? new Set(previewData.map((_, i) => i)) : new Set();
    setSelectedRows(next);
    setPreviewData(prev => prev.map((r, i) => ({ ...r, _selected: next.has(i) })));
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4">
          <ArrowLeft className="w-4 h-4" /> กลับ
        </button>
        <h1 className="text-3xl font-bold text-gray-800">📥 นำเข้าข้อมูลผู้ป่วยจาก Excel</h1>
        <p className="text-gray-600 mt-1">ตรวจสอบ แก้ไข และเลือกข้อมูลก่อนนำเข้าระบบ</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError('')} className="text-red-600">✕</button>
          </div>
        )}

        {/* 🔹 Step 1: Upload */}
        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs">1</span> อัปโหลดไฟล์</h2>
            <div onDrop={(e) => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => document.getElementById('file-input')?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 cursor-pointer bg-gray-50">
              <input id="file-input" type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium">ลากไฟล์มาวาง หรือคลิกเลือก</p>
              <p className="text-sm text-gray-500">รองรับ .xlsx, .xls</p>
            </div>
            {loading && <div className="mt-4 flex justify-center items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> กำลังอ่านไฟล์...</div>}
          </div>
        )}

        {/* 🔹 Step 2: Mapping Configuration */}
        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span> ตรวจสอบการจับคู่คอลัมน์</h2>
              <button onClick={buildPreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">ถัดไป: Preview & Validation</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {excelHeaders.map(header => (
                <div key={header} className="p-3 border rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">คอลัมน์ใน Excel</p>
                  <p className="font-medium text-gray-800 truncate">{header}</p>
                  <select value={headerMapping[header] || ''} onChange={e => handleMappingChange(header, e.target.value)} className="w-full mt-2 px-2 py-1 border rounded text-sm">
                    <option value="">-- ไม่จับคู่ --</option>
                    {STANDARD_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🔹 Step 3: Preview & Validate & Select */}
        {step === 'preview' && previewData.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200 flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedRows.size === previewData.length} onChange={e => selectAll(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-medium">เลือกทั้งหมด ({previewData.length} แถว)</span>
                </label>
                <span className="text-sm text-gray-500">✅ ถูกเลือก: {selectedRows.size} แถว</span>
                <span className="text-sm text-green-600">✅ ผ่านตรวจสอบ: {previewData.length - Object.keys(validationErrors).length} แถว</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => runValidation(previewData)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔄 ตรวจสอบข้อมูลใหม่</button>
                <button onClick={() => setStep('mapping')} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔧 แก้ไขการจับคู่</button>
                <button disabled={selectedRows.size === 0} className="px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm">🚀 นำเข้าที่เลือก</button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-3 w-10 text-center sticky left-0 bg-gray-100 z-10">เลือก</th>
                      <th className="p-3 w-12 text-center sticky left-10 bg-gray-100 z-10">สถานะ</th>
                      {STANDARD_FIELDS.filter(f => headerMapping && Object.values(headerMapping).includes(f.key)).map(field => (
                        <th key={field.key} className="p-3 min-w-[120px] text-left font-medium text-gray-700 whitespace-nowrap">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, rIdx) => (
                      <tr key={rIdx} className={`border-b hover:bg-gray-50 ${row._errors.length > 0 ? 'bg-red-50' : ''}`}>
                        <td className="p-3 text-center sticky left-0 bg-white z-10">
                          <input type="checkbox" checked={row._selected} onChange={() => toggleSelectRow(rIdx)} className="w-4 h-4" />
                        </td>
                        <td className="p-3 text-center sticky left-10 bg-white z-10">
                          {row._errors.length > 0 ? (
                            <div className="group relative">
                              <XCircle className="w-5 h-5 text-red-500 mx-auto cursor-help" />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none z-20">
                                {row._errors.join(', ')}
                              </div>
                            </div>
                          ) : <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />}
                        </td>
                        {STANDARD_FIELDS.filter(f => headerMapping && Object.values(headerMapping).includes(f.key)).map(field => (
                          <td key={field.key} className="p-2 whitespace-nowrap">
                            {editingCell?.row === rIdx && editingCell?.key === field.key ? (
                              field.type === 'select' ? (
                                <select autoFocus className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500" value={row[field.key] || ''} onChange={e => handleCellEdit(rIdx, field.key, e.target.value)} onBlur={() => setEditingCell(null)} onKeyDown={e => e.key === 'Enter' && setEditingCell(null)}>
                                  <option value="">-- เลือก --</option>
                                  {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                              ) : (
                                <input autoFocus className="w-full px-2 py-1 border rounded focus:ring-2 focus:ring-blue-500" value={row[field.key] || ''} onChange={e => handleCellEdit(rIdx, field.key, e.target.value)} onBlur={() => setEditingCell(null)} onKeyDown={e => e.key === 'Enter' && setEditingCell(null)} />
                              )
                            ) : (
                              <div onClick={() => setEditingCell({ row: rIdx, key: field.key })} className="px-2 py-1 min-h-[32px] cursor-text hover:bg-blue-50 rounded flex items-center gap-1">
                                {row[field.key] || <span className="text-gray-400 text-xs">คลิกเพื่อแก้ไข</span>}
                                <Edit3 className="w-3 h-3 text-gray-300 ml-auto opacity-0 group-hover:opacity-100" />
                              </div>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}