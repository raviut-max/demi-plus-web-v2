/**
 * ============================================================================
 * 📄 ไฟล์: page.tsx (สมบูรณ์ พร้อมสี Mapping + ตัวกรองแถวซ้ำ)
 * ============================================================================
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
  Upload, AlertCircle, Loader2, ArrowLeft, 
  CheckCircle, XCircle, Edit3, AlertTriangle, ShieldAlert, RotateCcw, X, 
  Hospital, UserCheck, Save, Download, CreditCard, Zap
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

// ========== Helper functions ==========
const stripHospitalPrefix = (text: string): string => {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/โรงพยาบาล|รพ\.?/g, '').replace(/\s+/g, '');
};
const normalizeThaiText = (text: string): string => {
  if (!text) return '';
  return text.trim().toLowerCase().replace(/\s+/g, '').replace(/[่้๊๋์าำิีึืุูเแโใไ]/g, '');
};
const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeThaiText(str1), s2 = normalizeThaiText(str2);
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  if (s2.includes(s1)) return 0.85;
  if (s1.includes(s2)) return 0.75;
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i++) track[0][i] = i;
  for (let j = 0; j <= s2.length; j++) track[j][0] = j;
  for (let j = 1; j <= s2.length; j++)
    for (let i = 1; i <= s1.length; i++) {
      const indicator = s1[i-1] === s2[j-1] ? 0 : 1;
      track[j][i] = Math.min(track[j][i-1] + 1, track[j-1][i] + 1, track[j-1][i-1] + indicator);
    }
  const distance = track[s2.length][s1.length];
  return 1 - (distance / Math.max(s1.length, s2.length));
};
const findBestHospitalMatch = (hospitalName: string, hospitals: any[]) => {
  const cleanInput = stripHospitalPrefix(hospitalName);
  let bestMatch = null, bestScore = 0;
  hospitals.forEach(h => {
    const score = calculateSimilarity(cleanInput, stripHospitalPrefix(h.name));
    if (score > 0.8 && score > bestScore) { bestScore = score; bestMatch = h; }
  });
  return bestMatch ? { hospital: bestMatch, similarity: bestScore } : null;
};
const findBestCoachMatch = (coachName: string, coaches: any[]) => {
  let bestMatch = null, bestScore = 0;
  coaches.forEach(c => {
    const score = calculateSimilarity(coachName, c.full_name_th);
    if (score > 0.9 && score > bestScore) { bestScore = score; bestMatch = c; }
  });
  return bestMatch ? { coach: bestMatch, similarity: bestScore } : null;
};
const formatThaiDate = (input: any): string => {
  if (!input) return '';
  const str = String(input).trim();
  let day = '', month = '', year = '';
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = str.split('-');
    year = String(parseInt(y) + 543); month = m; day = d;
  } else if (str.match(/^[\d\/\-.]+$/)) {
    const parts = str.split(/[\/\-.]/).map(p => p.trim());
    if (parts.length >= 3) {
      let [p1, p2, p3] = parts;
      if (parseInt(p1) > 31) { year = p1; month = p2; day = p3; }
      else if (parseInt(p3) > 31 || p3.length === 4) { day = p1; month = p2; year = p3; }
      else { day = p1; month = p2; year = p3; }
    }
  }
  if (year.length === 2) year = `25${year}`;
  else if (year.length === 3) year = `2${year}`;
  return `${String(parseInt(day) || 1).padStart(2,'0')}/${String(parseInt(month) || 1).padStart(2,'0')}/${year}`;
};
const swapDayMonth = (dateStr: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length >= 2) [parts[0], parts[1]] = [parts[1], parts[0]];
  return parts.join('/');
};
const cleanIdCard = (id: string): string => (id || '').replace(/[-\s]/g, '');

const validateProvinceOnly = (province: string, validProvinces: string[]) => {
  if (!province) return { valid: false, errors: ['จังหวัดเป็นฟิลด์บังคับ'] };
  const normInput = normalizeThaiText(province);
  const found = validProvinces.some(p => normalizeThaiText(p).includes(normInput) || normInput.includes(normalizeThaiText(p)));
  return found ? { valid: true, errors: [] } : { valid: false, errors: [`จังหวัด "${province}" ไม่ถูกต้อง`] };
};

export default function ImportExcelPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [rawData, setRawData] = useState<any[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>({});
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; key: string } | null>(null);
  const [editValue, setEditValue] = useState('');
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
  const [readyToImportIndex, setReadyToImportIndex] = useState<number | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [modalCoaches, setModalCoaches] = useState<Record<number, any[]>>({});
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) router.push('/admin/login');
    else if (!['admin','doctor','helper','osm'].includes(userData.role)) router.push('/admin/patients');
    else { setUser(userData); loadNetworkData(userData.id); }
  }, []);
  useEffect(() => { getAllValidProvinces().then(setValidProvinces); }, []);
  const loadNetworkData = async (userId: string) => {
    try {
      const allHospitals = await getHospitalsWithHierarchy();
      setHospitals(allHospitals);
      const allCoaches = await getCoachesWithHospitals(allHospitals.map(h => h.id));
      setCoaches(allCoaches);
    } catch (err) { console.error(err); }
  };
  useEffect(() => {
    if (rawData.length && excelHeaders.length) {
      const autoMap: Record<string,string> = {};
      excelHeaders.forEach(h => {
        const clean = h.replace(/\s+/g,'').toLowerCase();
        const match = STANDARD_FIELDS.find(f => clean.includes(f.label.replace(/\s/g,'').toLowerCase()) || f.label.replace(/\s/g,'').toLowerCase().includes(clean));
        if (match) autoMap[h] = match.key;
      });
      setHeaderMapping(autoMap);
      setStep('mapping');
    }
  }, [rawData, excelHeaders]);

  const buildPreview = useCallback(() => {
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: false, _status: 'pending', _isPatientDuplicate: false };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) {
          let val = row[excelKey];
          if (dbKey === 'birth_date' && val) val = formatThaiDate(val);
          else if (val !== undefined && val !== null) val = String(val).trim();
          newRow[dbKey] = val || '';
        }
      });
      return newRow;
    });
    setPreviewData(mapped);
    setStep('preview');
    runValidation(mapped);
  }, [rawData, headerMapping]);

  const validateRow = async (row: any, rowIndex: number, duplicateMap: Map<string, number[]>) => {
    const errors: string[] = [];
    let isPatientDuplicate = false;

    for (const field of STANDARD_FIELDS) {
      const val = row[field.key];
      const strVal = String(val ?? '').trim();
      if (field.required && !strVal) { errors.push(`${field.label} เป็นฟิลด์บังคับ`); continue; }
      if (!strVal) continue;
      if (field.inputType === 'number') {
        const num = parseFloat(strVal);
        if (isNaN(num)) errors.push(`${field.label} ต้องเป็นตัวเลข`);
        else if (field.min !== undefined && num < field.min) errors.push(`${field.label} น้อยกว่า ${field.min}`);
        else if (field.max !== undefined && num > field.max) errors.push(`${field.label} มากกว่า ${field.max}`);
      } else if (field.key === 'birth_date') {
        if (!/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.test(strVal)) errors.push('รูปแบบวันเกิดต้องเป็น วว/ดด/ปปปป');
        else {
          const [_, d, m, y] = strVal.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)!;
          if (parseInt(d)<1 || parseInt(d)>31) errors.push('วันไม่ถูกต้อง');
          if (parseInt(m)<1 || parseInt(m)>12) errors.push('เดือนไม่ถูกต้อง');
          if (parseInt(y)<2400 || parseInt(y)>2569) errors.push('ปี พ.ศ. ไม่ถูกต้อง (2400-2569)');
        }
      } else if (field.inputType === 'select') {
        if (!field.options?.includes(strVal)) errors.push(`${field.label} ต้องเป็น ${field.options?.join(' หรือ ')}`);
      } else if (field.key === 'id_card') {
        if (!validateThaiIdCard(strVal)) errors.push('เลขบัตรประชาชนไม่ถูกต้อง (13 หลัก)');
      }
    }

    if (row.province && validProvinces.length) {
      const pc = validateProvinceOnly(row.province, validProvinces);
      if (!pc.valid) errors.push(...pc.errors);
    }

    if (row.id_card && validateThaiIdCard(row.id_card)) {
      const cleanId = cleanIdCard(row.id_card);
      const isImported = row._status === 'success' || row._imported;
      if (!isImported) {
        const dupInFile = duplicateMap.get(cleanId)?.filter(i => i !== rowIndex);
        if (dupInFile && dupInFile.length) errors.push(`เลขบัตรประชาชนซ้ำในไฟล์ (แถว ${dupInFile.map(i=>i+1).join(',')})`);
        else if (importedIds.has(cleanId)) errors.push('เลขบัตรนี้เพิ่งนำเข้าไปแล้ว (ซ้ำ)');
        else {
          try {
            setCheckingDuplicates(prev => new Set(prev).add(rowIndex));
            const { exists, isPatient } = await checkPatientExists(row.id_card);
            if (exists) {
              errors.push('เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว');
              isPatientDuplicate = isPatient;
            }
          } catch (err) { console.warn(err); }
          finally { setCheckingDuplicates(prev => { const n = new Set(prev); n.delete(rowIndex); return n; }); }
        }
      }
    }
    return { errors, isPatientDuplicate };
  };

  const runValidation = async (data: any[]) => {
    const duplicateMap = new Map<string, number[]>();
    data.forEach((row, idx) => {
      if (row.id_card && validateThaiIdCard(row.id_card)) {
        const clean = cleanIdCard(row.id_card);
        if (!duplicateMap.has(clean)) duplicateMap.set(clean, []);
        duplicateMap.get(clean)!.push(idx);
      }
    });
    const updated = [...data];
    for (let i = 0; i < data.length; i++) {
      const res = await validateRow(data[i], i, duplicateMap);
      updated[i]._errors = res.errors;
      updated[i]._isPatientDuplicate = res.isPatientDuplicate;
    }
    setPreviewData(updated);
  };

  const swapAllBirthDates = () => {
    setPreviewData(prev => {
      const upd = prev.map(r => ({ ...r, birth_date: r.birth_date ? swapDayMonth(r.birth_date) : r.birth_date }));
      runValidation(upd);
      return upd;
    });
  };

  const startEdit = (r: number, k: string) => { setEditingCell({ row: r, key: k }); setEditValue(previewData[r][k] || ''); };
  const saveEdit = () => {
    if (!editingCell) return;
    const { row, key } = editingCell;
    const newVal = key === 'birth_date' ? formatThaiDate(editValue) : editValue.trim();
    setPreviewData(prev => {
      const next = [...prev];
      next[row] = { ...next[row], [key]: newVal };
      runValidation(next);
      return next;
    });
    setEditingCell(null);
  };
  const handleCellKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') setEditingCell(null); };

  const processFile = (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) { setError('ต้องเป็นไฟล์ Excel เท่านั้น'); return; }
    setLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        setRawData(json);
        if (json.length) setExcelHeaders(Object.keys(json[0]));
      } catch { setError('อ่านไฟล์ไม่สำเร็จ'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleSelectRow = (idx: number) => {
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
    setPreviewData(prev => prev.map((r,i) => i===idx ? {...r, _selected: next.has(i)} : r));
  };

  const isRowSelectable = (row: any) => {
    if (row._imported || row._status === 'success') return false;
    const dupError = row._errors?.some((e: string) => e.includes('ซ้ำ') || e.includes('มีอยู่ในระบบแล้ว'));
    if (dupError && row._isPatientDuplicate) return false;
    return true;
  };

  const selectAll = (checked: boolean) => {
    const selectable = previewData.reduce((acc, row, i) => isRowSelectable(row) ? [...acc, i] : acc, [] as number[]);
    setSelectedRows(checked ? new Set(selectable) : new Set());
    setPreviewData(prev => prev.map((r,i) => ({ ...r, _selected: checked && selectable.includes(i) })));
  };

  const hasErrorsInSelected = Array.from(selectedRows).some(i => previewData[i]?._errors?.length && !previewData[i]._imported && previewData[i]._status !== 'success');

  const getFilteredPreviewData = useCallback(() => {
    if (!showOnlyDuplicates) return previewData;
    return previewData.filter(row => row._errors?.some((e: string) => e.includes('ซ้ำ') || e.includes('มีอยู่ในระบบแล้ว')));
  }, [previewData, showOnlyDuplicates]);

  const handleExportToExcel = () => {
    if (!previewData.length) { setError('ไม่มีข้อมูล'); return; }
    const wb = XLSX.utils.book_new();
    const exportRows = previewData.map((row, i) => ({
      'ลำดับ': i+1, 'เลขบัตร': row.id_card, 'ชื่อ': row.first_name, 'นามสกุล': row.last_name,
      'HN': row.hospital_number, 'วันเกิด': row.birth_date, 'เพศ': row.gender, 'โรงพยาบาล': row.hospital_name,
      'ข้อผิดพลาด': (row._errors || []).join('; ')
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูล');
    XLSX.writeFile(wb, `import_${new Date().toISOString()}.xlsx`);
  };

  const handleImport = async () => {
    if (!selectedRows.size) { setError('กรุณาเลือกแถว'); return; }
    if (hasErrorsInSelected) { setError('แถวที่เลือกมีข้อผิดพลาด'); return; }
    setImporting(true);
    try {
      const selectedData = previewData.filter((_, i) => selectedRows.has(i)).map(r => ({ ...r, password: r.birth_date }));
      const result = await importPatientsBatch(selectedData, user.id);
      if (result.success) {
        const newIds = selectedData.slice(0, result.success).map(d => cleanIdCard(d.id_card));
        setImportedIds(prev => new Set([...prev, ...newIds]));
        setPreviewData(prev => prev.map(r => newIds.includes(cleanIdCard(r.id_card)) ? { ...r, _status: 'success', _imported: true, _selected: false } : r));
        setSelectedRows(new Set());
      }
      if (result.errors?.length) {
        setImportResult({ success: result.success, failed: result.failed, errors: result.errors, successRecords: result.successRecords || [] });
      }
    } catch (err: any) { setError(err.message); }
    finally { setImporting(false); }
  };

  if (success) return <div className="min-h-screen flex items-center justify-center"><CheckCircle className="w-16 h-16 text-green-500" /><p className="ml-2">บันทึกสำเร็จ กำลังไป...</p></div>;
  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  const displayFields = STANDARD_FIELDS.filter(f => Object.values(headerMapping).includes(f.key));
  const filteredData = getFilteredPreviewData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow px-4 py-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 mb-4"><ArrowLeft size={16}/> กลับ</button>
        <h1 className="text-2xl font-bold">📥 นำเข้าผู้ป่วยจาก Excel</h1>
      </div>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && <div className="bg-red-50 p-3 rounded flex justify-between"><span>{error}</span><button onClick={()=>setError('')}>✕</button></div>}
        {step === 'upload' && (
          <div className="bg-white rounded-xl p-6 border">
            <div className="border-dashed border-2 p-8 text-center cursor-pointer" onClick={()=>document.getElementById('file')?.click()}>
              <input id="file" type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>e.target.files?.[0] && processFile(e.target.files[0])} />
              <Upload className="mx-auto mb-2 text-gray-400" size={40}/>
              <p>คลิกหรือลากไฟล์ Excel มาที่นี่</p>
            </div>
            {loading && <Loader2 className="animate-spin mx-auto mt-4"/>}
          </div>
        )}
        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span> ตรวจสอบการจับคู่คอลัมน์</h2>
              <button onClick={buildPreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">ถัดไป: Preview & Validation →</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {excelHeaders.map(header => {
                const matchedKey = headerMapping[header];
                const isMatched = matchedKey && matchedKey !== '';
                return (
                  <div key={header} className={`p-4 border rounded-lg transition-all ${isMatched ? 'bg-green-50 border-green-400' : 'bg-red-50 border-red-300'}`}>
                    <p className="text-xs font-medium text-gray-500 mb-1">📄 คอลัมน์ใน Excel</p>
                    <p className={`font-semibold truncate mb-2 ${isMatched ? 'text-green-900' : 'text-red-800'}`}>
                      {header} {isMatched && <span className="ml-2">✅</span>}
                    </p>
                    <select
                      value={matchedKey || ''}
                      onChange={e => setHeaderMapping(prev => ({ ...prev, [header]: e.target.value }))}
                      className={`w-full px-3 py-2 border rounded-lg text-sm ${isMatched ? 'border-green-400 bg-white' : 'border-red-400 bg-white'}`}
                    >
                      <option value="">-- ไม่จับคู่ --</option>
                      {STANDARD_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    {!isMatched && (
                      <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> ยังไม่ได้จับคู่
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {step === 'preview' && previewData.length > 0 && (
          <>
            <div className="bg-white p-4 rounded shadow flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2"><input type="checkbox" checked={previewData.filter(isRowSelectable).length>0 && selectedRows.size === previewData.filter(isRowSelectable).length} onChange={e=>selectAll(e.target.checked)} disabled={!previewData.filter(isRowSelectable).length}/> เลือกทั้งหมด (ไม่รวมซ้ำ)</label>
                <span>เลือก {selectedRows.size} แถว</span>
                <button onClick={()=>setShowOnlyDuplicates(!showOnlyDuplicates)} className={`px-3 py-1 rounded text-sm ${showOnlyDuplicates ? 'bg-red-100 text-red-700 border-red-300' : 'bg-gray-100 border'}`}>
                  <AlertTriangle className="inline w-4 h-4 mr-1"/>{showOnlyDuplicates ? 'แสดงทั้งหมด' : 'แสดงเฉพาะแถวที่ซ้ำ'}
                </button>
              </div>
              <div className="flex gap-2">
                <button onClick={()=>runValidation(previewData)} className="border px-3 py-1 rounded">ตรวจสอบใหม่</button>
                <button onClick={handleExportToExcel} className="bg-green-600 text-white px-3 py-1 rounded">📥 ส่งออก Excel</button>
                <button onClick={()=>setStep('mapping')} className="border px-3 py-1 rounded">แก้ไขการจับคู่</button>
                <button disabled={!selectedRows.size || hasErrorsInSelected || importing} onClick={handleImport} className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50">🚀 นำเข้า ({selectedRows.size})</button>
              </div>
            </div>
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 sticky left-0 bg-gray-100">เลือก</th><th className="p-2 sticky left-10 bg-gray-100">สถานะ</th>
                    {displayFields.map(f=><th key={f.key} className="p-2 min-w-[140px]">{f.label}{f.required&&'*'}{f.key==='birth_date'&&<button onClick={swapAllBirthDates} className="ml-2 text-[10px] bg-blue-100 px-1 rounded">สลับวัน</button>}</th>)}
                    <th className="p-2 min-w-[200px] text-red-600">ข้อผิดพลาด</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => {
                    const originalIndex = previewData.findIndex(r => r._rowIndex === row._rowIndex);
                    const isImported = row._imported || row._status === 'success';
                    const selectable = isRowSelectable(row);
                    return (
                      <tr key={originalIndex} className={`border-b ${isImported?'bg-green-50':(row._errors?.length?'bg-red-50':'')}`}>
                        <td className="p-2 text-center sticky left-0 bg-white"><input type="checkbox" checked={row._selected} disabled={!selectable} onChange={()=>selectable && toggleSelectRow(originalIndex)}/></td>
                        <td className="p-2 text-center sticky left-10 bg-white">{isImported?<CheckCircle className="text-green-600"/>:(row._errors?.length?<XCircle className="text-red-500"/>:<CheckCircle className="text-green-500"/>)}</td>
                        {displayFields.map(field=>{
                          const isEditing = editingCell?.row === originalIndex && editingCell?.key === field.key;
                          const val = row[field.key] || '';
                          return (
                            <td key={field.key} className="p-1 relative">
                              {isEditing ? (
                                field.key==='birth_date'?<input autoFocus value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={saveEdit} onKeyDown={handleCellKeyDown} className="border-2 border-blue-400 rounded px-1"/>:
                                field.inputType==='select'?<select autoFocus value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={saveEdit}><option value="">--</option>{field.options?.map(o=><option key={o}>{o}</option>)}</select>:
                                <input autoFocus type={field.inputType==='number'?'number':'text'} value={editValue} onChange={e=>setEditValue(e.target.value)} onBlur={saveEdit} className="border-2 border-blue-400 rounded px-1"/>
                              ) : (
                                <div onClick={()=>selectable && startEdit(originalIndex, field.key)} className={`px-1 py-1 rounded flex items-center gap-1 ${selectable?'cursor-text hover:bg-blue-50':''}`}>
                                  {field.key==='birth_date'?<><span className={!val?'text-gray-400':''}>{val||'คลิกแก้ไข'}</span>{val&&<button onClick={e=>{e.stopPropagation(); const swapped = swapDayMonth(String(val)); setPreviewData(p=>{const n=[...p]; n[originalIndex]={...n[originalIndex], birth_date:swapped}; runValidation(n); return n;});}} className="ml-1 text-blue-500 text-xs">🔁</button>}</>:<span className={!val?'text-gray-400':''}>{val||'คลิกแก้ไข'}</span>}
                                  <Edit3 size={12} className="text-gray-300 ml-auto"/>
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="p-2 align-top bg-white sticky right-0 border-l">
                          {isImported?'✓ สำเร็จ':(row._errors?.length?row._errors.map((e:string,i)=>(
                            <div key={i} className={`text-xs p-1 rounded mb-1 ${e.includes('ซ้ำ')?'bg-red-100 text-red-700':'bg-orange-100'}`}><AlertTriangle size={12} className="inline mr-1"/>{e}</div>
                          )):(checkingDuplicates.has(originalIndex)?<Loader2 className="animate-spin text-blue-500"/>:'✓ ผ่าน'))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {importResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-auto">
            <div className="flex justify-between"><h3>ผลการนำเข้า</h3><button onClick={()=>setImportResult(null)}>✕</button></div>
            <p>สำเร็จ {importResult.success} / ล้มเหลว {importResult.failed}</p>
            {importResult.errors?.length>0 && <div className="bg-red-50 p-2 mt-2"><h4>รายการผิดพลาด</h4>{importResult.errors.map((e:any,i:number)=><div key={i}>แถว {e.row}: {e.error}</div>)}</div>}
            <div className="flex gap-2 mt-4"><button onClick={()=>{setImportResult(null); setStep('preview');}} className="bg-blue-600 text-white px-4 py-2 rounded">กลับ</button></div>
          </div>
        </div>
      )}
    </div>
  );
}