/**
============================================================================
📄 ไฟล์: page.tsx
📂 ตำแหน่ง: app/admin/patients/import-excel/page.tsx
🏥 ระบบ: DEMI+ (Diabetes Engagement Management Interface Plus)
📝 หน้าที่: นำเข้าข้อมูลผู้ป่วยจากไฟล์ Excel
👥 ผู้พัฒนา: DEMI+ Development Team
📅 อัปเดตล่าสุด: 26 พฤษภาคม 2569
============================================================================
*/
'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  validateThaiIdCard,
  getAllValidProvinces,
  checkPatientExists,
  importPatientsBatch,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy
} from '@/lib/supabase/queries';
import {
  Upload, AlertCircle, Loader2, ArrowLeft, CheckCircle, XCircle, Edit3, 
  AlertTriangle, RotateCcw, X, Hospital, UserCheck, Download, ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';

const STANDARD_FIELDS = [
  { key: 'id_card', label: 'เลขบัตรประชาชน', required: true, inputType: 'text' },
  { key: 'first_name', label: 'ชื่อผู้ป่วย', required: true, inputType: 'text' },
  { key: 'last_name', label: 'นามสกุลผู้ป่วย', required: true, inputType: 'text' },
  { key: 'hospital_number', label: 'HN', required: true, inputType: 'text' },
  { key: 'birth_date', label: 'วันเกิด(วว/ดด/ปปปป พ.ศ.)', required: true, inputType: 'text' },
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

const stripHospitalPrefix = (text: string): string => {
  if (!text) return '';
  let clean = text.trim().toLowerCase();
  clean = clean.replace(/โรงพยาบาล/g, '');
  clean = clean.replace(/รพ\./g, '');
  clean = clean.replace(/\bรพ\b/g, '');
  clean = clean.replace(/\s+/g, '');
  return clean;
};

const normalizeThaiText = (text: string): string => {
  if (!text) return '';
  let normalized = text.trim().toLowerCase();
  normalized = normalized.replace(/\s+/g, '');
  return normalized;
};

const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeThaiText(str1);
  const s2 = normalizeThaiText(str2);
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  if (s2.includes(s1)) return 0.85;
  if (s1.includes(s2)) return 0.75;
  return 0.5;
};

const findBestHospitalMatch = (hospitalName: string, hospitals: any[]) => {
  const cleanInput = stripHospitalPrefix(hospitalName);
  let bestMatch: any = null;
  let bestScore = 0;
  hospitals.forEach(hospital => {
    const cleanDbName = stripHospitalPrefix(hospital.name);
    const score = calculateSimilarity(cleanInput, cleanDbName);
    if (score > 0.80 && score > bestScore) {
      bestScore = score;
      bestMatch = hospital;
    }
  });
  return bestMatch ? { hospital: bestMatch, similarity: bestScore } : null;
};

const findBestCoachMatch = (coachName: string, coaches: any[]) => {
  if (!coachName) return null;
  let bestMatch: any = null;
  let bestScore = 0;
  coaches.forEach(coach => {
    const score = calculateSimilarity(coachName, coach.full_name_th);
    if (score > 0.85 && score > bestScore) {
      bestScore = score;
      bestMatch = coach;
    }
  });
  return bestMatch ? { coach: bestMatch, similarity: bestScore } : null;
};

const formatThaiDate = (input: string | number | Date): string => {
  if (!input) return '';
  let day = '', month = '', year = '';
  const str = String(input).trim();
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = str.split('-');
    year = String(parseInt(y) + 543); month = m; day = d;
  } else if (str.match(/^[\d/.\-]+$/)) {
    const parts = str.split(/[/.\-]/).map(p => p.trim());
    if (parts.length >= 3) {
      const [p1, p2, p3] = parts;
      if (parseInt(p1) > 31) { year = p1; month = p2; day = p3; }
      else if (parseInt(p3) > 31 || p3.length === 4) { day = p1; month = p2; year = p3; }
      else { day = p1; month = p2; year = p3; }
    }
  }
  let formattedYear = year;
  if (year.length === 2) formattedYear = `25${year}`;
  else if (year.length === 4) formattedYear = year;
  else if (year.length === 3) formattedYear = `2${year}`;
  return `${String(parseInt(day) || 1).padStart(2, '0')}/${String(parseInt(month) || 1).padStart(2, '0')}/${formattedYear}`;
};

const swapDayMonth = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length >= 2) {
    [parts[0], parts[1]] = [parts[1], parts[0]];
    return parts.join('/');
  }
  return dateStr;
};

const cleanIdCard = (idCard: string): string => (idCard || '').replace(/[-\s]/g, '').trim();

const validateProvinceOnly = (provinceName: string, validProvinces: string[]): { valid: boolean; errors: string[] } => {
  if (!provinceName) return { valid: false, errors: ['จังหวัด เป็นฟิลด์บังคับ'] };
  const normalizedInput = normalizeThaiText(provinceName);
  const found = validProvinces.some(p => normalizeThaiText(p).includes(normalizedInput) || normalizedInput.includes(normalizeThaiText(p)));
  return found ? { valid: true, errors: [] } : { valid: false, errors: [`จังหวัด "${provinceName}" ไม่ถูกต้อง หรือไม่มีในระบบ`] };
};

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
  const [validProvinces, setValidProvinces] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [success, setSuccess] = useState(false);
  const [checkingDuplicates, setCheckingDuplicates] = useState<Set<number>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) { router.push('/admin/patients'); return; }
    setUser(userData);
    loadNetworkData();
    loadValidProvinces();
  }, [router]);

  const loadValidProvinces = async () => {
    try {
      const provinces = await getAllValidProvinces();
      setValidProvinces(provinces || []);
    } catch (err) { console.warn('⚠️ ไม่สามารถโหลดข้อมูลจังหวัด'); }
  };

  const loadNetworkData = async () => {
    try {
      const allHospitals = await getHospitalsWithHierarchy();
      setHospitals(allHospitals);
      const hospitalIds = allHospitals.map(h => h.id);
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
    } catch (error) { console.error('❌ [loadNetworkData] Error:', error); }
  };

  useEffect(() => {
    if (rawData.length === 0 || excelHeaders.length === 0) return;
    const autoMap: Record<string, string> = {};
    excelHeaders.forEach(header => {
      const cleanHeader = header.replace(/\s+/g, '').toLowerCase().replace(/[().-]/g, '');
      const match = STANDARD_FIELDS.find(f => {
        const fClean = f.label.replace(/\s+/g, '').replace(/[().-]/g, '').toLowerCase();
        return cleanHeader.includes(fClean) || fClean.includes(cleanHeader);
      });
      autoMap[header] = match?.key || '';
    });
    setHeaderMapping(autoMap);
    setStep('mapping');
  }, [rawData, excelHeaders]);

  const buildPreview = useCallback(() => {
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: false, _isDuplicate: false };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) {
          const val = row[excelKey];
          newRow[dbKey] = dbKey === 'birth_date' && val ? formatThaiDate(val) : (val !== undefined && val !== null ? String(val).trim() : '');
        }
      });
      return newRow;
    });
    setPreviewData(mapped);
    setStep('preview');
    runPreviewValidation(mapped);
  }, [rawData, headerMapping]);

  const runPreviewValidation = async (data: any[]) => {
    const errors: Record<number, string[]> = {};
    const duplicateMap = new Map<string, number[]>();
    
    data.forEach((row, idx) => {
      if (row.id_card && validateThaiIdCard(row.id_card)) {
        const cleanId = cleanIdCard(row.id_card);
        if (!duplicateMap.has(cleanId)) duplicateMap.set(cleanId, []);
        duplicateMap.get(cleanId)!.push(idx);
      }
    });

    const updatedData = [...data];
    for (let idx = 0; idx < data.length; idx++) {
      setCheckingDuplicates(prev => new Set(prev).add(idx));
      const row = data[idx];
      const rowErrors: string[] = [];
      let isDuplicate = false;

      if (row.id_card) {
        if (!validateThaiIdCard(row.id_card)) {
          rowErrors.push('รูปแบบเลขบัตรประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก)');
        } else {
          const cleanId = cleanIdCard(row.id_card);
          try {
            const { exists } = await checkPatientExists(cleanId);
            if (exists || importedIds.has(cleanId)) {
              rowErrors.push('🔍 พบข้อมูลซ้ำในระบบ: เลขบัตรประชาชนนี้มีอยู่แล้ว');
              isDuplicate = true;
            } else if (duplicateMap.has(cleanId) && duplicateMap.get(cleanId)!.length > 1) {
              rowErrors.push('❌ ซ้ำในไฟล์นำเข้า: เลขบัตรนี้ปรากฏมากกว่า 1 แถว');
              isDuplicate = true;
            }
          } catch (err) {
            rowErrors.push('⚠️ ไม่สามารถตรวจสอบความซ้ำกับฐานข้อมูลได้');
          }
        }
      }

      if (!isDuplicate) {
        if (row.birth_date) {
          const dateRegex = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
          const match = row.birth_date.match(dateRegex);
          if (!match) rowErrors.push('วันเกิดรูปแบบไม่ถูกต้อง (วว/ดด/ปปปป)');
          else {
            const [, d, m, y] = match;
            if (parseInt(d) < 1 || parseInt(d) > 31) rowErrors.push('วันไม่ถูกต้อง (1-31)');
            if (parseInt(m) < 1 || parseInt(m) > 12) rowErrors.push('เดือนไม่ถูกต้อง (1-12)');
            if (parseInt(y) < 2400 || parseInt(y) > 2569) rowErrors.push('ปี พ.ศ. ไม่ถูกต้อง (2400-2569)');
          }
        }

        if (row.province) {
          const pc = validateProvinceOnly(row.province, validProvinces);
          if (!pc.valid) rowErrors.push(...pc.errors);
        }

        ['current_weight', 'height', 'waist_circumference', 'blood_sugar', 'hba1c_level'].forEach(key => {
          if (row[key] !== undefined && row[key] !== '') {
            const val = String(row[key]).trim();
            if (!/^-?\d+(\.\d+)?$/.test(val)) {
              const label = STANDARD_FIELDS.find(f => f.key === key)?.label || key;
              rowErrors.push(`${label} มีตัวอักษรปน หรือรูปแบบไม่ถูกต้อง`);
            }
          }
        });
      }

      errors[idx] = rowErrors;
      updatedData[idx]._isDuplicate = isDuplicate;
      setCheckingDuplicates(prev => { const next = new Set(prev); next.delete(idx); return next; });
    }

    setValidationErrors(errors);
    setPreviewData(updatedData);
  };

  const swapAllBirthDates = () => {
    setPreviewData(prev => {
      const updated = prev.map(row => row.birth_date ? { ...row, birth_date: swapDayMonth(row.birth_date) } : row);
      runPreviewValidation(updated);
      return updated;
    });
  };

  const startEdit = (rIdx: number, key: string) => { setEditingCell({ row: rIdx, key }); setEditValue(previewData[rIdx][key] || ''); };
  const cancelEdit = () => setEditingCell(null);
  const saveEdit = () => {
    if (!editingCell) return;
    const { row, key } = editingCell;
    const finalValue = key === 'birth_date' ? formatThaiDate(editValue) : editValue.trim();
    setPreviewData(prev => { const next = [...prev]; next[row] = { ...next[row], [key]: finalValue }; return next; });
    runPreviewValidation(previewData.map((r, i) => i === row ? { ...r, [key]: finalValue } : r));
    setEditingCell(null);
  };

  const toggleSelectRow = (idx: number) => {
    if (validationErrors[idx]?.length || previewData[idx]._isDuplicate) return;
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
  };

  const selectAllValid = (checked: boolean) => {
    const validIndices = previewData.map((r, i) => i).filter(i => !validationErrors[i]?.length && !previewData[i]._isDuplicate);
    if (checked) setSelectedRows(new Set(validIndices));
    else setSelectedRows(new Set());
  };

  const validSelectableCount = previewData.filter((r, i) => !validationErrors[i]?.length && !r._isDuplicate).length;
  const canImport = selectedRows.size > 0 && !Array.from(selectedRows).some(i => validationErrors[i]?.length || previewData[i]._isDuplicate);

  const handleExportToExcel = () => {
    if (!previewData || previewData.length === 0) { setError('ไม่มีข้อมูลสำหรับส่งออก'); return; }
    
    const wb = XLSX.utils.book_new();
    const sortedData = [...previewData].sort((a, b) => cleanIdCard(a.id_card).localeCompare(cleanIdCard(b.id_card)));
    
    const exportData = sortedData.map((row, idx) => {
      return { 
        'ลำดับ': idx + 1, 
        'เลขบัตรประชาชน': row.id_card || '', 
        'ชื่อ': row.first_name || '', 
        'นามสกุล': row.last_name || '', 
        'HN': row.hospital_number || '', 
        'วันเกิด': row.birth_date || '', 
        'เพศ': row.gender || '',  
        'โรงพยาบาล': row.hospital_name || '', 
        'เบอร์โทรศัพท์': row.phone || '', 
        'อีเมล': row.email || '', 
        'น้ำหนัก(กก.)': row.current_weight || '', 
        'ส่วนสูง(ซม.)': row.height || '', 
        'รอบเอว(ซม.)': row.waist_circumference || '', 
        'ประเภทเบาหวาน': row.diabetes_type || '', 
        'ค่าน้ำตาล': row.blood_sugar || '', 
        'ค่าHbA1c': row.hba1c_level || '', 
        'หมายเหตุ': row.notes || '', 
        'โค้ชผู้ดูแล': row.coach_name || '-',
        'สถานะ': validationErrors[idx]?.length ? '❌ มีข้อผิดพลาด' : (row._isDuplicate ? '⚠️ ซ้ำ' : '✅ พร้อมนำเข้า')
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลผู้ป่วย');
    XLSX.writeFile(wb, `ข้อมูลผู้ป่วย_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
  };

  const processFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) { setError('กรุณาเลือกไฟล์ Excel เท่านั้น'); return; }
    setSelectedFile(file); setError(''); setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        setRawData(json);
        if (json.length > 0) setExcelHeaders(Object.keys(json[0]));
      } catch { setError('❌ ไม่สามารถอ่านไฟล์ได้'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md w-full">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">บันทึกข้อมูลสำเร็จ!</h2>
        <p className="text-gray-500 mb-8">ระบบได้บันทึกข้อมูลผู้ป่วยลงฐานข้อมูลเรียบร้อยแล้ว</p>
        <div className="grid grid-cols-2 gap-4">
          <button onClick={() => { setSuccess(false); setSelectedRows(new Set()); setStep('upload'); }} className="px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium">นำเข้าเพิ่มเติม</button>
          <button onClick={() => router.push('/admin/patients')} className="px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium">ไปหน้ารายการผู้ป่วย</button>
        </div>
      </div>
    </div>
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  const displayFields = STANDARD_FIELDS.filter(f => Object.values(headerMapping).includes(f.key));

  return (
    <div className="min-h-screen bg-gray-50">
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

        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs">1</span> อัปโหลดไฟล์
            </h2>
            <div onDrop={(e) => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => document.getElementById('file-input')?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 cursor-pointer bg-gray-50">
              <input id="file-input" type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" /> 
              <p className="text-gray-700 font-medium">ลากไฟล์มาวาง หรือคลิกเลือก</p> 
              <p className="text-sm text-gray-500">รองรับ .xlsx, .xls</p>
            </div>
            {loading && <div className="mt-4 flex justify-center items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> กำลังอ่านไฟล์...</div>}
          </div>
        )}

        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span> ตรวจสอบการจับคู่คอลัมน์
              </h2>
              <button onClick={buildPreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">ถัดไป: Preview & Validation →</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {excelHeaders.map(header => {
                const matchedKey = headerMapping[header];
                const isMatched = matchedKey && matchedKey !== '';
                return (
                  <div key={header} className={`p-4 border rounded-lg transition-all ${isMatched ? 'bg-green-50 border-green-400' : 'bg-gray-50 border-gray-200'}`}>
                    <p className="text-xs font-medium text-gray-500 mb-1">📄 คอลัมน์ใน Excel</p>
                    <p className={`font-semibold truncate mb-2 ${isMatched ? 'text-green-900' : 'text-gray-800'}`}>{header} {isMatched && <span className="ml-2">✅</span>}</p>
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

        {step === 'preview' && previewData.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200 flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={validSelectableCount > 0 && selectedRows.size === validSelectableCount} onChange={(e) => selectAllValid(e.target.checked)} className="w-4 h-4" disabled={validSelectableCount === 0} />
                  <span className="text-sm font-medium">เลือกทั้งหมด (เฉพาะที่ผ่านตรวจสอบ)</span>
                </label>
                <span className="text-sm text-gray-500">✅ ถูกเลือก: {selectedRows.size} แถว</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => runPreviewValidation(previewData)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔄 ตรวจสอบใหม่</button>
                <button onClick={handleExportToExcel} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> 📥 นำออก Excel</button>
                <button onClick={() => setStep('mapping')} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔧 แก้ไขการจับคู่</button>
                <button disabled={!canImport} onClick={async () => { setError(''); await handleImport(); }} className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4" /> 🚀 นำเข้าที่เลือก ({selectedRows.size})
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr className="whitespace-nowrap">
                      <th className="p-3 w-10 text-center sticky left-0 bg-gray-100 z-10 border-r">เลือก</th>
                      <th className="p-3 w-12 text-center sticky left-10 bg-gray-100 z-10 border-r">สถานะ</th>
                      {displayFields.map(field => (
                        <th key={field.key} className="p-3 min-w-[140px] text-left font-medium text-gray-700 whitespace-nowrap border-r">
                          <div className="flex items-center justify-between gap-2">
                            <span>{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                            {field.key === 'birth_date' && <button onClick={swapAllBirthDates} className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">🔄 สลับทั้งคอลัมน์</button>}
                          </div>
                        </th>
                      ))}
                      <th className="p-3 min-w-[280px] text-left font-medium text-red-700 whitespace-nowrap sticky right-0 bg-gray-100 z-10">⚠️ ข้อผิดพลาด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, rIdx) => {
                      const hasError = validationErrors[rIdx]?.length > 0;
                      const isDup = row._isDuplicate;
                      const isChecking = checkingDuplicates.has(rIdx);
                      const isDisabled = hasError || isDup;
                      
                      return (
                        <tr key={rIdx} className={`border-b hover:bg-gray-50 transition-colors ${isDup ? 'bg-red-50/40 border-l-4 border-red-400' : (hasError ? 'bg-orange-50/40 border-l-4 border-orange-400' : '')}`}>
                          <td className="p-3 text-center sticky left-0 bg-white z-10">
                            <input type="checkbox" checked={selectedRows.has(rIdx)} disabled={isDisabled || isChecking} onChange={() => toggleSelectRow(rIdx)} className={`w-4 h-4 ${isDisabled ? 'opacity-40 cursor-not-allowed' : ''}`} />
                          </td>
                          <td className="p-3 text-center sticky left-10 bg-white z-10">
                            {isDup ? <XCircle className="w-5 h-5 text-red-500 mx-auto" /> : hasError ? <AlertTriangle className="w-5 h-5 text-orange-500 mx-auto" /> : <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />}
                          </td>
                          {displayFields.map(field => {
                            const isEditing = editingCell?.row === rIdx && editingCell?.key === field.key;
                            const val = row[field.key] || '';
                            return (
                              <td key={field.key} className="p-2 whitespace-nowrap relative">
                                {isEditing ? (
                                  field.key === 'birth_date' ? <input autoFocus type="text" placeholder="วว/ดด/ปปปป" className="w-full px-2 py-1 border-2 border-blue-500 rounded bg-blue-50" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }} />
                                  : field.inputType === 'select' ? <select autoFocus className="w-full px-2 py-1 border-2 border-blue-500 rounded bg-blue-50" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}><option value="">-- เลือก --</option>{field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select>
                                  : <input autoFocus type={field.inputType === 'number' ? 'number' : 'text'} step={field.inputType === 'number' ? '0.1' : undefined} className="w-full px-2 py-1 border-2 border-blue-500 rounded bg-blue-50" value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }} />
                                ) : (
                                  <div onClick={() => !isDisabled && startEdit(rIdx, field.key)} className={`px-2 py-1 min-h-[32px] rounded flex items-center gap-1 group ${!isDisabled ? 'cursor-text hover:bg-blue-50' : 'cursor-not-allowed opacity-60'}`}>
                                    <span className={`truncate max-w-[140px] ${!val ? 'text-gray-400 text-xs italic' : ''}`}>{val || 'คลิกเพื่อแก้ไข'}</span>
                                    <Edit3 className="w-3 h-3 text-gray-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 align-top sticky right-0 bg-white z-10 border-l min-w-[280px]">
                            {isChecking ? <div className="flex items-center gap-1 text-xs text-blue-700"><Loader2 className="w-3 h-3 animate-spin" /> ตรวจสอบบัตร...</div> : 
                             (hasError || isDup) ? (
                              <div className="space-y-1.5">
                                {validationErrors[rIdx]?.map((err, idx) => (
                                  <div key={idx} className="flex items-start gap-1.5 text-xs px-2 py-1.5 rounded bg-red-50 text-red-700 border border-red-100">
                                    <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> <span>{err}</span>
                                  </div>
                                ))}
                              </div>
                            ) : <span className="text-xs text-green-600 font-medium">✓ ผ่านการตรวจสอบพื้นฐาน</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  async function handleImport() {
    if (selectedRows.size === 0) { setError('กรุณาเลือกแถวที่ต้องการนำเข้า'); return; }
    
    setImporting(true);
    setImportProgress({ current: 0, total: selectedRows.size });
    
    try {
      const selectedData = Array.from(selectedRows).map(idx => previewData[idx]);
      const errors: any[] = [];
      const successRecords: any[] = [];
      
      for (let i = 0; i < selectedData.length; i++) {
        const row = selectedData[i];
        const rowNumber = row._rowIndex + 1;
        
        const hospitalMatch = findBestHospitalMatch(row.hospital_name, hospitals);
        if (!hospitalMatch) {
          errors.push({ row: rowNumber, error: `ไม่พบโรงพยาบาล "${row.hospital_name}"`, type: 'hospital' });
          continue;
        }
        
        let coachId = null;
        if (row.coach_name) {
          const networkCoaches = coaches.filter(c => c.users?.hospital_id === hospitalMatch.hospital.id);
          const coachMatch = findBestCoachMatch(row.coach_name, networkCoaches);
          if (coachMatch) {
            coachId = coachMatch.coach.user_id;
          } else {
            errors.push({ row: rowNumber, error: `ไม่พบโค้ช "${row.coach_name}" ในเครือข่าย`, type: 'coach' });
            continue;
          }
        }
        
        try {
          const dateParts = row.birth_date.split(/[/-]/);
          const [day, month, yearBE] = dateParts;
          const birthDateISO = `${parseInt(yearBE) - 543}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
          
          const data = {
            id_card: row.id_card,
            password: row.birth_date,
            first_name: row.first_name,
            last_name: row.last_name,
            hospital_number: row.hospital_number,
            birth_date: birthDateISO,
            gender: row.gender,
            phone: row.phone || undefined,
            email: row.email || undefined,
            current_weight: row.current_weight ? parseFloat(row.current_weight) : undefined,
            height: row.height ? parseFloat(row.height) : undefined,
            waist_circumference: row.waist_circumference ? parseFloat(row.waist_circumference) : undefined,
            coach_id: coachId,
            diabetes_type: row.diabetes_type || undefined,
            blood_sugar: row.blood_sugar ? parseFloat(row.blood_sugar) : undefined,
            hba1c_level: row.hba1c_level ? parseFloat(row.hba1c_level) : undefined,
            notes: row.notes || undefined,
            hospital_id: hospitalMatch.hospital.id,
            created_by: user?.id
          };
          
          const result = await importPatientsBatch([data], user.id);
          if (result.success > 0) {
            successRecords.push({ row: rowNumber, ...row });
            setImportedIds(prev => new Set(prev).add(cleanIdCard(row.id_card)));
          } else {
            errors.push({ row: rowNumber, error: result.errors[0]?.error || 'นำเข้าไม่สำเร็จ', type: 'other' });
          }
        } catch (err: any) {
          errors.push({ row: rowNumber, error: err.message, type: 'other' });
        }
        
        setImportProgress(prev => ({ current: i + 1, total: selectedData.length }));
      }
      
      if (successRecords.length > 0) {
        setPreviewData(prev => prev.map(r => {
          const success = successRecords.find(s => s._rowIndex === r._rowIndex);
          if (success) return { ...r, _status: 'success', _imported: true, _selected: false };
          return r;
        }));
        setSelectedRows(new Set());
      }
      
      if (errors.length > 0) {
        setError(`✅ สำเร็จ ${successRecords.length} รายการ | ❌ ล้มเหลว ${errors.length} รายการ`);
      } else {
        setSuccess(true);
        setTimeout(() => router.push('/admin/patients'), 2000);
      }
    } catch (err: any) {
      setError(`❌ เกิดข้อผิดพลาด: ${err.message}`);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  }
}