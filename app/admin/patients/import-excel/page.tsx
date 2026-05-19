'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  checkSession, 
  logout, 
  validateThaiIdCard,
  getAllValidAddresses,
  validateAddress 
} from '@/lib/supabase/queries';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  Loader2, 
  ArrowLeft, 
  LogOut, 
  CheckCircle, 
  XCircle, 
  Edit3,
  AlertTriangle,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';

//  กำหนดคอลัมน์มาตรฐาน + ประเภท Input สำหรับแก้ไขและตรวจสอบ
const STANDARD_FIELDS = [
  { key: 'id_card', label: 'เลขบัตรประชาชน', required: true, inputType: 'text' },
  { key: 'first_name', label: 'ชื่อผู้ป่วย', required: true, inputType: 'text' },
  { key: 'last_name', label: 'นามสกุลผู้ป่วย', required: true, inputType: 'text' },
  { key: 'hospital_number', label: 'HN', required: true, inputType: 'text' },
  { key: 'birth_date', label: 'วันเกิด(วว/ดด/ปปปป พ.ศ.)', required: true, inputType: 'date' },
  { key: 'gender', label: 'เพศ', required: true, inputType: 'select', options: ['ชาย', 'หญิง'] },
  { key: 'hospital_name', label: 'โรงพยาบาล', required: true, inputType: 'text' },
  { key: 'phone', label: 'เบอร์โทรศัพท์ผู้ป่วย', inputType: 'text' },
  { key: 'email', label: 'อีเมลผู้ป่วย', inputType: 'text' },
  { key: 'current_weight', label: 'น้ำหนัก(กก.)', inputType: 'number', min: 30, max: 200 },
  { key: 'height', label: 'ส่วนสูง(ซม.)', inputType: 'number', min: 100, max: 250 },
  { key: 'waist_circumference', label: 'รอบเอว(ซม.)', inputType: 'number', min: 26, max: 200 },
  { key: 'diabetes_type', label: 'ประเภทเบาหวาน', inputType: 'select', options: ['กลุ่มเสี่ยง', 'เบาหวาน'] },
  { key: 'blood_sugar', label: 'ค่าน้ำตาล(มก./ดล.)', inputType: 'number' },
  { key: 'hba1c_level', label: 'ค่าHbA1c', inputType: 'number' },
  { key: 'notes', label: 'หมายเหตุสุขภาพ', inputType: 'text' },
  { key: 'house_number', label: 'บ้านเลขที่', inputType: 'text' },
  { key: 'village_no', label: 'หมู่ที่', inputType: 'text' },
  { key: 'village_name', label: 'หมู่บ้าน', inputType: 'text' },
  { key: 'soi', label: 'ซอย', inputType: 'text' },
  { key: 'road', label: 'ถนน', inputType: 'text' },
  { key: 'subdistrict', label: 'ตำบล', inputType: 'text' },
  { key: 'district', label: 'อำเภอ', inputType: 'text' },
  { key: 'province', label: 'จังหวัด', inputType: 'text' },
  { key: 'postal_code', label: 'รหัสไปรษณีย์', inputType: 'text' },
  { key: 'address_line1', label: 'ที่อยู่เพิ่มเติม', inputType: 'text' },
  { key: 'emergency_contact_name', label: 'ผู้ติดต่อฉุกเฉิน', inputType: 'text' },
  { key: 'emergency_contact_phone', label: 'เบอร์ติดต่อฉุกเฉิน', inputType: 'text' },
  { key: 'emergency_contact_relationship', label: 'ความสัมพันธ์ผู้ติดต่อฉุกเฉิน', inputType: 'text' },
  { key: 'coach_name', label: 'โค้ชผู้ดูแล', inputType: 'text' },
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
  const [editValue, setEditValue] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<Record<number, string[]>>({});
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  
  // ✅ State สำหรับข้อมูลที่อยู่ถูกต้อง
  const [validAddresses, setValidAddresses] = useState<Array<{
    province: string;
    district: string;
    subdistrict: string;
    postal_code: string;
  }>>([]);

  // ✅ ตรวจสอบ Session
  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) { router.push('/admin/patients'); return; }
    setUser(userData);
  }, [router]);

  // ✅ โหลดข้อมูลที่อยู่ถูกต้องเมื่อเข้าหน้า
  useEffect(() => {
    const loadValidAddresses = async () => {
      try {
        const addresses = await getAllValidAddresses();
        setValidAddresses(addresses || []);
      } catch (err) {
        console.warn('⚠️ ไม่สามารถโหลดข้อมูลที่อยู่เพื่อตรวจสอบได้ ระบบจะข้ามการตรวจสอบ DB');
      }
    };
    loadValidAddresses();
  }, []);

  // 🔄 แปลงข้อมูลดิบ + จับคู่ Header อัตโนมัติ
  useEffect(() => {
    if (rawData.length === 0 || excelHeaders.length === 0) return;
    const autoMap: Record<string, string> = {};
    excelHeaders.forEach(header => {
      const cleanHeader = header.replace(/\s+/g, '').toLowerCase().replace(/[()\.\-]/g, '');
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
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: selectedRows.has(idx) };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) {
          // แปลงค่าเป็น String และตัดช่องว่างส่วนเกิน
          const val = row[excelKey];
          newRow[dbKey] = val !== undefined && val !== null ? String(val).trim() : '';
        }
      });
      return newRow;
    });
    setPreviewData(mapped);
    setStep('preview');
    runValidation(mapped);
  }, [rawData, headerMapping, selectedRows]);

  // ✅ Validation Logic (เข้มงวด)
  const validateRow = (row: any) => {
    const errors: string[] = [];
    STANDARD_FIELDS.forEach(field => {
      const val = row[field.key];
      const strVal = String(val ?? '').trim();

      // 1. ตรวจสอบฟิลด์บังคับ
      if (field.required && strVal === '') {
        errors.push(`${field.label} เป็นฟิลด์บังคับ`);
        return;
      }
      if (strVal === '') return; // ข้ามฟิลด์ไม่บังคับที่ว่าง

      // 2. ตรวจสอบตามประเภทข้อมูล
      if (field.inputType === 'number') {
        //  ตรวจสอบว่าเป็นตัวเลขล้วนหรือไม่ (ไม่รับตัวหนังสือ)
        if (!/^-?\d+(\.\d+)?$/.test(strVal)) {
          errors.push(`${field.label} ต้องเป็นตัวเลขเท่านั้น`);
        } else {
          const num = parseFloat(strVal);
          if (field.min !== undefined && num < field.min) errors.push(`${field.label} น้อยกว่า ${field.min}`);
          if (field.max !== undefined && num > field.max) errors.push(`${field.label} มากกว่า ${field.max}`);
        }
      } 
      else if (field.inputType === 'date') {
        // 🔴 ตรวจสอบรูปแบบวันที่เข้มงวด
        const dateRegex = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/;
        const match = strVal.match(dateRegex);
        if (!match) {
          errors.push(`${field.label} รูปแบบต้องเป็น วว/ดด/ปปปป หรือ วว-ดด-ปปปป`);
        } else {
          const [, d, m, y] = match;
          const day = parseInt(d), month = parseInt(m), year = parseInt(y);
          if (day < 1 || day > 31) errors.push(`${field.label} วันไม่ถูกต้อง (1-31)`);
          if (month < 1 || month > 12) errors.push(`${field.label} เดือนไม่ถูกต้อง (1-12)`);
          if (year < 2400 || year > 2569) errors.push(`${field.label} ปี พ.ศ. ไม่ถูกต้อง`);
        }
      } 
      else if (field.inputType === 'select') {
        // 🔴 ตรวจสอบค่า Dropdown
        if (!field.options?.includes(strVal)) {
          errors.push(`${field.label} ต้องเป็น ${field.options?.join(' หรือ ')}`);
        }
      } 
      else if (field.key === 'id_card') {
        if (!validateThaiIdCard(strVal)) errors.push('เลขบัตรประชาชนไม่ถูกต้อง (ต้อง 13 หลัก และ Check Digit ตรง)');
      }
    });

    // ✅ ตรวจสอบที่อยู่ (ถ้ามีข้อมูลและโหลด DB สำเร็จ)
    if (validAddresses.length > 0 && (row.province || row.district || row.subdistrict)) {
      const addrCheck = validateAddress({
        province: row.province || '',
        district: row.district || '',
        subdistrict: row.subdistrict || '',
        postal_code: row.postal_code || ''
      }, validAddresses);
      if (!addrCheck.valid) errors.push(...addrCheck.errors);
    }

    return errors;
  };

  const runValidation = (data: any[]) => {
    const errors: Record<number, string[]> = {};
    data.forEach((row, idx) => {
      errors[idx] = validateRow(row);
    });
    setValidationErrors(errors);
    setPreviewData(prev => prev.map(r => ({ ...r, _errors: errors[r._rowIndex] || [] })));
  };

  // 🔄 จัดการการแก้ไขในตาราง
  const startEdit = (rIdx: number, key: string) => {
    setEditingCell({ row: rIdx, key });
    setEditValue(previewData[rIdx][key] || '');
  };

  const cancelEdit = () => setEditingCell(null);

  const saveEdit = () => {
    if (!editingCell) return;
    const { row, key } = editingCell;
    setPreviewData(prev => {
      const next = [...prev];
      next[row] = { ...next[row], [key]: editValue.trim() };
      return next;
    });
    runValidation(previewData.map((r, i) => i === row ? { ...r, [key]: editValue.trim() } : r));
    setEditingCell(null);
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveEdit();
    else if (e.key === 'Escape') cancelEdit();
  };

  //  อ่านไฟล์
  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('กรุณาเลือกไฟล์ Excel เท่านั้น'); return; }
    setSelectedFile(file);
    setError('');
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // แปลงเป็น JSON โดยไม่แปลงวันที่อัตโนมัติ เพื่อควบคุมการตรวจสอบเอง
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        setRawData(json);
        if (json.length > 0) setExcelHeaders(Object.keys(json[0]));
      } catch { setError('❌ ไม่สามารถอ่านไฟล์ได้'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  // 🔘 เลือกแถว
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

  // ✅ ตรวจสอบว่าแถวที่เลือกมี Error หรือไม่ (สำหรับปิดปุ่มนำเข้า)
  const hasErrorsInSelected = Array.from(selectedRows).some(idx => 
    previewData[idx]?._errors?.length > 0
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  const displayFields = STANDARD_FIELDS.filter(f => Object.values(headerMapping).includes(f.key));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</button>
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
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span> 
                ตรวจสอบการจับคู่คอลัมน์
              </h2>
              <button onClick={buildPreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">
                ถัดไป: Preview & Validation →
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {excelHeaders.map(header => {
                const matchedKey = headerMapping[header];
                const isMatched = matchedKey && matchedKey !== '';
                return (
                  <div key={header} className={`p-4 border rounded-lg transition-all ${isMatched ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-medium text-gray-500 mb-1">📄 คอลัมน์ใน Excel</p>
                    <p className={`font-semibold truncate mb-2 ${isMatched ? 'text-green-900' : 'text-gray-800'}`}>
                      {header} {isMatched && <span className="ml-2">✅</span>}
                    </p>
                    <select value={headerMapping[header] || ''} onChange={e => setHeaderMapping(prev => ({ ...prev, [header]: e.target.value }))} className={`w-full px-3 py-2 border rounded-lg text-sm ${isMatched ? 'border-green-400' : 'border-gray-300'}`}>
                      <option value="">-- ไม่จับคู่ --</option>
                      {STANDARD_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    {!isMatched && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ยังไม่ได้จับคู่</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 🔹 Step 3: Preview & Validate & Select & EDIT */}
        {step === 'preview' && previewData.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200 flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedRows.size === previewData.length} onChange={e => selectAll(e.target.checked)} className="w-4 h-4" />
                  <span className="text-sm font-medium">เลือกทั้งหมด ({previewData.length} แถว)</span>
                </label>
                <span className="text-sm text-gray-500">✅ ถูกเลือก: {selectedRows.size} แถว</span>
                <span className={`text-sm font-medium ${hasErrorsInSelected ? 'text-red-600' : 'text-green-600'}`}>
                  {hasErrorsInSelected ? '⚠️ มีข้อมูลที่เลือกยังไม่ผ่านตรวจสอบ' : '✅ ข้อมูลที่เลือกพร้อมนำเข้า'}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => runValidation(previewData)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔄 ตรวจสอบใหม่</button>
                <button onClick={() => setStep('mapping')} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔧 แก้ไขการจับคู่</button>
                <button 
                  disabled={selectedRows.size === 0 || hasErrorsInSelected} 
                  className="px-4 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  {hasErrorsInSelected ? <ShieldAlert className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                  {hasErrorsInSelected ? 'แก้ไขข้อผิดพลาดก่อนนำเข้า' : '🚀 นำเข้าที่เลือก'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="p-3 w-10 text-center sticky left-0 bg-gray-100 z-10">เลือก</th>
                      <th className="p-3 w-12 text-center sticky left-10 bg-gray-100 z-10">สถานะ</th>
                      {displayFields.map(field => (
                        <th key={field.key} className="p-3 min-w-[140px] text-left font-medium text-gray-700 whitespace-nowrap">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </th>
                      ))}
                      <th className="p-3 min-w-[220px] text-left font-medium text-red-700 whitespace-nowrap sticky right-0 bg-gray-100 z-10">
                        ️ ข้อผิดพลาด
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, rIdx) => (
                      <tr key={rIdx} className={`border-b hover:bg-gray-50 ${row._errors?.length > 0 ? 'bg-red-50/50' : ''}`}>
                        <td className="p-3 text-center sticky left-0 bg-white z-10">
                          <input type="checkbox" checked={row._selected} onChange={() => toggleSelectRow(rIdx)} className="w-4 h-4" />
                        </td>
                        <td className="p-3 text-center sticky left-10 bg-white z-10">
                          {row._errors?.length > 0 ? (
                            <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                          ) : <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />}
                        </td>
                        {displayFields.map(field => {
                          const isEditing = editingCell?.row === rIdx && editingCell?.key === field.key;
                          const val = row[field.key] || '';
                          return (
                            <td key={field.key} className="p-2 whitespace-nowrap relative">
                              {isEditing ? (
                                field.inputType === 'select' ? (
                                  <select autoFocus className="w-full px-2 py-1 border-2 border-blue-500 rounded bg-blue-50" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleCellKeyDown}>
                                    <option value="">-- เลือก --</option>
                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : (
                                  <input autoFocus type={field.inputType === 'number' ? 'number' : 'text'} step={field.inputType === 'number' ? '0.1' : undefined} className="w-full px-2 py-1 border-2 border-blue-500 rounded bg-blue-50" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleCellKeyDown} placeholder={field.required ? 'บังคับกรอก' : 'ไม่บังคับ'} />
                                )
                              ) : (
                                <div onClick={() => startEdit(rIdx, field.key)} className="px-2 py-1 min-h-[32px] cursor-text hover:bg-blue-50 rounded flex items-center gap-1 group">
                                  <span className={`truncate max-w-[150px] ${!val ? 'text-gray-400 text-xs italic' : ''}`}>{val || 'คลิกเพื่อแก้ไข'}</span>
                                  <Edit3 className="w-3 h-3 text-gray-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-3 align-top sticky right-0 bg-white z-10 border-l">
                          {row._errors?.length > 0 ? (
                            <div className="space-y-1">
                              {row._errors.map((err, idx) => (
                                <div key={idx} className="flex items-start gap-1 text-xs text-red-700 bg-red-100 px-2 py-1 rounded">
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                  <span>{err}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">✓ ผ่านการตรวจสอบ</span>
                          )}
                        </td>
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