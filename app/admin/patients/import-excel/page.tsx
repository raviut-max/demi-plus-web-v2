/**
 * ============================================================================
 * 📄 ไฟล์: page.tsx (สมบูรณ์ final)
 * - ตัดคำนำหน้าโรงพยาบาล/รพ. ออกก่อนจับคู่
 * - error โรงพยาบาลแจ้งทั้งชื่อเดิมและชื่อที่ clean แล้ว
 * - แสดงเฉพาะแถวซ้ำได้, error ละเอียดทุกฟิลด์
 * - เพิ่ม dropdown เลือกโรงพยาบาลและโค้ชใน modal เมื่อไม่พบข้อมูล
 * - โค้ชจะถูกกรองตามเครือข่ายโรงพยาบาลที่เลือก (แม่ข่าย+ลูกข่าย)
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
  let clean = text.trim().toLowerCase();
  clean = clean.replace(/โรงพยาบาล/g, '');
  clean = clean.replace(/รพ\.?/g, '');
  clean = clean.replace(/รพสต\.?/g, '');
  clean = clean.replace(/\s+/g, ' ');
  return clean.trim();
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
    const cleanDb = stripHospitalPrefix(h.name);
    const score = calculateSimilarity(cleanInput, cleanDb);
    if (score > 0.8 && score > bestScore) { bestScore = score; bestMatch = h; }
  });
  return bestMatch ? { hospital: bestMatch, similarity: bestScore, cleanedName: cleanInput } : null;
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
  if (!province) return { valid: false, errors: ['จังหวัดเป็นฟิลด์บังคับ กรุณากรอกชื่อจังหวัด'] };
  const normInput = normalizeThaiText(province);
  const matched = validProvinces.find(p => normalizeThaiText(p).includes(normInput) || normInput.includes(normalizeThaiText(p)));
  if (matched) return { valid: true, errors: [] };
  const suggestions = validProvinces.filter(p => normalizeThaiText(p).includes(normInput.slice(0,3))).slice(0,3);
  const suggestionText = suggestions.length ? ` เช่น ${suggestions.join(', ')}` : ' โปรดตรวจสอบชื่อจังหวัดให้ถูกต้อง';
  return { valid: false, errors: [`จังหวัด "${province}" ไม่ถูกต้อง${suggestionText}`] };
};

// Helper เอา network hospital ids (รวมแม่+ลูก)
const getNetworkHospitalIds = (hospitalId: string, hospitals: any[]): string[] => {
  const hospital = hospitals.find(h => h.id === hospitalId);
  if (!hospital) return [hospitalId];
  const networkIds: string[] = [hospitalId];
  if (hospital.type === 'main') {
    hospitals.filter(h => h.parent_id === hospitalId).forEach(sub => networkIds.push(sub.id));
  } else if (hospital.type === 'sub' && hospital.parent_id) {
    networkIds.push(hospital.parent_id);
  }
  return networkIds;
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
  // สำหรับเก็บค่าที่เลือกใน modal (ชั่วคราว)
  const [tempHospitalId, setTempHospitalId] = useState<Record<number, string>>({});
  const [tempCoachId, setTempCoachId] = useState<Record<number, string>>({});

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
      if (field.required && !strVal) {
        errors.push(`${field.label} เป็นฟิลด์บังคับ (ต้องมีข้อมูล)`);
        continue;
      }
      if (!strVal) continue;
      if (field.inputType === 'number') {
        const num = parseFloat(strVal);
        if (isNaN(num)) errors.push(`${field.label} ต้องเป็นตัวเลขเท่านั้น (พบ "${strVal}")`);
        else if (field.min !== undefined && num < field.min) errors.push(`${field.label} ${num} น้อยกว่า ${field.min} ${field.label==='น้ำหนัก(กก.)'?'กก.':field.label==='ส่วนสูง(ซม.)'?'ซม.':''} (ค่าต้องอยู่ระหว่าง ${field.min}-${field.max})`);
        else if (field.max !== undefined && num > field.max) errors.push(`${field.label} ${num} มากกว่า ${field.max} ${field.label==='น้ำหนัก(กก.)'?'กก.':''} (ค่าต้องอยู่ระหว่าง ${field.min}-${field.max})`);
      } else if (field.key === 'birth_date') {
        const dateRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
        if (!dateRegex.test(strVal)) {
          errors.push(`รูปแบบวันเกิดไม่ถูกต้อง (ต้องเป็น วว/ดด/ปปปป เช่น 01/01/2568) พบ "${strVal}"`);
        } else {
          const [_, d, m, y] = strVal.match(dateRegex)!;
          if (parseInt(d)<1 || parseInt(d)>31) errors.push(`วันเกิด: วันไม่ถูกต้อง (${d}) ต้องอยู่ระหว่าง 1-31`);
          if (parseInt(m)<1 || parseInt(m)>12) errors.push(`วันเกิด: เดือนไม่ถูกต้อง (${m}) ต้องอยู่ระหว่าง 1-12`);
          if (parseInt(y)<2400 || parseInt(y)>2569) errors.push(`วันเกิด: ปี พ.ศ. ไม่ถูกต้อง (${y}) ต้องอยู่ระหว่าง 2400-2569`);
        }
      } else if (field.inputType === 'select') {
        if (!field.options?.includes(strVal)) {
          errors.push(`${field.label} ต้องเป็น ${field.options?.join(' หรือ ')} เท่านั้น (พบ "${strVal}")`);
        }
      } else if (field.key === 'id_card') {
        const isValid = validateThaiIdCard(strVal);
        if (!isValid) {
          errors.push(`เลขบัตรประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก และ checksum ตรงกัน) พบ "${strVal}"`);
        }
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
        if (dupInFile && dupInFile.length) {
          errors.push(`เลขบัตรประชาชน ${cleanId} ซ้ำในไฟล์นี้ (แถวที่ ${dupInFile.map(i=>i+1).join(', ')})`);
        } else if (importedIds.has(cleanId)) {
          errors.push(`เลขบัตรประชาชน ${cleanId} เพิ่งถูกนำเข้าไปแล้วในรอบนี้ (ไม่สามารถนำเข้าซ้ำได้)`);
        } else {
          try {
            setCheckingDuplicates(prev => new Set(prev).add(rowIndex));
            const { exists, isPatient } = await checkPatientExists(row.id_card);
            if (exists) {
              if (isPatient) {
                errors.push(`เลขบัตรประชาชน ${cleanId} มีอยู่ในระบบแล้ว (เป็นผู้ป่วยเดิม ไม่สามารถนำเข้าซ้ำได้)`);
              } else {
                errors.push(`เลขบัตรประชาชน ${cleanId} มีอยู่ในระบบแล้ว (เป็นบุคลากร ไม่ใช่ผู้ป่วย)`);
              }
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
    const dupError = row._errors?.some((e: string) => e.includes('มีอยู่ในระบบแล้ว') || e.includes('ซ้ำในไฟล์') || e.includes('นำเข้าไปแล้ว'));
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
    return previewData.filter(row => row._errors?.some((e: string) => e.includes('มีอยู่ในระบบแล้ว') || e.includes('ซ้ำในไฟล์')));
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
    if (!selectedRows.size) { setError('กรุณาเลือกแถวที่ต้องการนำเข้า'); return; }
    if (hasErrorsInSelected) { setError('แถวที่เลือกมีข้อผิดพลาด (ไม่สามารถนำเข้าได้) กรุณาแก้ไขให้ถูกต้องก่อน'); return; }
    setImporting(true);
    try {
      const selectedData = previewData.filter((_, i) => selectedRows.has(i)).map(r => ({ ...r, password: r.birth_date }));
      const result = await importPatientsBatch(selectedData, user.id);
      if (result.success) {
        const newIds = selectedData.slice(0, result.success).map(d => cleanIdCard(d.id_card));
        setImportedIds(prev => new Set([...prev, ...newIds]));
        setPreviewData(prev => prev.map(r => newIds.includes(cleanIdCard(r.id_card)) ? { ...r, _status: 'success', _imported: true, _selected: false } : r));
        setSelectedRows(new Set());
        if (result.success === selectedData.length) setSuccess(true);
        else setError(`นำเข้าได้ ${result.success} จาก ${selectedData.length} รายการ`);
      }
      if (result.errors?.length) {
        // แปลง backend errors ให้อยู่ในรูปแบบเดียวกับ frontend
        const mappedErrors = result.errors.map((err: any, idx: number) => ({
          row: err.row,
          id_card: err.id_card,
          hospital_number: err.hospital_number,
          error: err.error,
          error_type: (err.error?.includes('โรงพยาบาล') ? 'hospital' : (err.error?.includes('โค้ช') ? 'coach' : 'other')),
          hospital_id: err.hospital_id || null,
          coach_id: null,
          original_hospital_name: err.original_hospital_name || null,
          original_coach_name: err.original_coach_name || null,
          fixed: false
        }));
        setImportResult({ success: result.success, failed: result.failed, errors: mappedErrors, successRecords: result.successRecords || [] });
        // ตั้งค่าเริ่มต้น tempHospitalId, tempCoachId
        const initialTempHosp: Record<number,string> = {};
        const initialTempCoach: Record<number,string> = {};
        mappedErrors.forEach((err: any, idx: number) => {
          initialTempHosp[idx] = err.hospital_id || '';
          initialTempCoach[idx] = '';
        });
        setTempHospitalId(initialTempHosp);
        setTempCoachId(initialTempCoach);
      }
    } catch (err: any) { setError(err.message); }
    finally { setImporting(false); }
  };

  // ฟังก์ชันสำหรับบันทึกการแก้ไขใน modal
  const handleFixHospital = (errorIdx: number) => {
    const selectedHospId = tempHospitalId[errorIdx];
    if (!selectedHospId) {
      setError('กรุณาเลือกโรงพยาบาล');
      return;
    }
    const hospital = hospitals.find(h => h.id === selectedHospId);
    if (!hospital) return;
    // อัปเดต previewData
    const errorItem = importResult.errors[errorIdx];
    const rowIndex = errorItem.row - 1;
    setPreviewData(prev => {
      const newData = [...prev];
      newData[rowIndex] = { ...newData[rowIndex], hospital_name: hospital.name };
      return newData;
    });
    // รัน validation ใหม่
    setTimeout(() => runValidation(previewData), 100);
    // อัปเดต importResult ว่า fixed แล้ว แต่ยังไม่สมบูรณ์ (อาจต้องเลือก coach ต่อ)
    const newErrors = [...importResult.errors];
    newErrors[errorIdx] = { ...newErrors[errorIdx], hospital_id: selectedHospId, fixed: false };
    setImportResult({ ...importResult, errors: newErrors });
    // โหลดโค้ชสำหรับโรงพยาบาลนี้ (เครือข่าย)
    const networkIds = getNetworkHospitalIds(selectedHospId, hospitals);
    const networkCoaches = coaches.filter(c => {
      const coachHospId = c.users?.hospital_id;
      return coachHospId && networkIds.includes(coachHospId);
    });
    setModalCoaches(prev => ({ ...prev, [errorIdx]: networkCoaches }));
    // เคลียร์ coach ที่เลือกไว้
    setTempCoachId(prev => ({ ...prev, [errorIdx]: '' }));
  };

  const handleFixCoach = (errorIdx: number) => {
    const selectedCoachId = tempCoachId[errorIdx];
    if (!selectedCoachId) {
      setError('กรุณาเลือกโค้ช');
      return;
    }
    const coach = coaches.find(c => c.user_id === selectedCoachId);
    if (!coach) return;
    const errorItem = importResult.errors[errorIdx];
    const rowIndex = errorItem.row - 1;
    setPreviewData(prev => {
      const newData = [...prev];
      newData[rowIndex] = { ...newData[rowIndex], coach_name: coach.full_name_th };
      return newData;
    });
    setTimeout(() => runValidation(previewData), 100);
    const newErrors = [...importResult.errors];
    newErrors[errorIdx] = { ...newErrors[errorIdx], coach_id: selectedCoachId, fixed: true };
    setImportResult({ ...importResult, errors: newErrors });
  };

  const handleRetryFixedRow = async (errorIdx: number) => {
    const errorItem = importResult.errors[errorIdx];
    const rowIndex = errorItem.row - 1;
    const row = previewData[rowIndex];
    if (!row) return;
    setImporting(true);
    try {
      const dateParts = row.birth_date.split(/[\/-]/);
      if (dateParts.length !== 3) throw new Error('รูปแบบวันเกิดไม่ถูกต้อง');
      const [day, month, yearBE] = dateParts;
      const birthDateISO = `${parseInt(yearBE) - 543}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      let coachId = null;
      if (row.coach_name) {
        const cm = findBestCoachMatch(row.coach_name, coaches);
        if (cm) coachId = cm.coach.user_id;
      }
      const hm = findBestHospitalMatch(row.hospital_name, hospitals);
      if (!hm) throw new Error(`ไม่พบโรงพยาบาล: ${row.hospital_name}`);
      const data = { id_card: row.id_card, password: row.birth_date, first_name: row.first_name, last_name: row.last_name, hospital_number: row.hospital_number, birth_date: birthDateISO, gender: row.gender, phone: row.phone || undefined, email: row.email || undefined, current_weight: row.current_weight ? parseFloat(row.current_weight) : undefined, height: row.height ? parseFloat(row.height) : undefined, waist_circumference: row.waist_circumference ? parseFloat(row.waist_circumference) : undefined, coach_id: coachId, diabetes_type: row.diabetes_type || undefined, blood_sugar: row.blood_sugar ? parseFloat(row.blood_sugar) : undefined, hba1c_level: row.hba1c_level ? parseFloat(row.hba1c_level) : undefined, notes: row.notes || undefined, house_number: row.house_number || undefined, address_line1: row.address_line1 || undefined, soi: row.soi || undefined, road: row.road || undefined, village_no: row.village_no || undefined, village_name: row.village_name || undefined, subdistrict: row.subdistrict || undefined, district: row.district || undefined, province: row.province || undefined, postal_code: row.postal_code || undefined, hospital_id: hm.hospital.id, emergency_contact_name: row.emergency_contact_name || undefined, emergency_contact_phone: row.emergency_contact_phone || undefined, emergency_contact_relationship: row.emergency_contact_relationship || undefined, pam_level: 'L0', pam_score: 0, zone: 'Zero Zone', created_by: user?.id };
      const result = await importPatientsBatch([data], user.id);
      if (result.success > 0) {
        setImportedIds(prev => new Set(prev).add(cleanIdCard(row.id_card)));
        setPreviewData(prev => { const next = [...prev]; next[rowIndex] = { ...next[rowIndex], _status: 'success', _imported: true, _selected: false }; return next; });
        setSelectedRows(prev => { const next = new Set(prev); next.delete(rowIndex); return next; });
        // ลบ error นี้จาก importResult
        const newErrors = importResult.errors.filter((_: any, i: number) => i !== errorIdx);
        setImportResult({ ...importResult, errors: newErrors, success: importResult.success + 1, failed: importResult.failed - 1 });
        if (newErrors.length === 0) setImportResult(null);
      } else {
        setError(`นำเข้าไม่สำเร็จ: ${result.errors[0]?.error}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleBackToPreview = () => { setImportResult(null); setStep('preview'); setReadyToImportIndex(null); };
  const handleExitImport = () => { setImportResult(null); setSelectedRows(new Set()); router.back(); };
  const handleRetryFailed = () => {
    if (!importResult || importResult.errors.length === 0) return;
    const failedRowIndices = importResult.errors.filter((err: any) => !err.fixed).map((err: any) => err.row - 1);
    setSelectedRows(new Set([...selectedRows, ...failedRowIndices]));
    setImportResult(null); setStep('preview');
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
                <label className="flex items-center gap-2"><input type="checkbox" checked={previewData.filter(isRowSelectable).length>0 && selectedRows.size === previewData.filter(isRowSelectable).length} onChange={e=>selectAll(e.target.checked)} disabled={!previewData.filter(isRowSelectable).length}/> เลือกทั้งหมด (ไม่รวมแถวซ้ำ/error)</label>
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
                    {displayFields.map(f=><th key={f.key} className="p-2 min-w-[140px]">{f.label}{f.required&&'*'}{f.key==='birth_date'&&<button onClick={swapAllBirthDates} className="ml-2 text-[10px] bg-blue-100 px-1 rounded" title="สลับวัน/เดือนทั้งคอลัมน์">สลับวัน</button>}</th>)}
                    <th className="p-2 min-w-[200px] text-red-600">ข้อผิดพลาด (รายละเอียด)</th>
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
                            </table>
                          );
                        })}
                        <td className="p-2 align-top bg-white sticky right-0 border-l">
                          {isImported?'✓ สำเร็จ':(row._errors?.length?row._errors.map((e:string,i)=>(
                            <div key={i} className={`text-xs p-1 rounded mb-1 ${e.includes('มีอยู่ในระบบแล้ว')||e.includes('ซ้ำ')?'bg-red-100 text-red-700':'bg-orange-100'}`}><AlertTriangle size={12} className="inline mr-1"/>{e}</div>
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
      {importResult && importResult.errors.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold">⚠️ แก้ไขข้อมูลก่อนนำเข้า</h3>
              <button onClick={()=>setImportResult(null)} className="text-gray-500 hover:text-gray-700"><X size={24}/></button>
            </div>
            <p className="mb-4 text-gray-600">ไม่พบโรงพยาบาลหรือโค้ชในระบบ กรุณาเลือกข้อมูลที่ถูกต้องด้านล่าง</p>
            <div className="space-y-6">
              {importResult.errors.map((err: any, idx: number) => (
                <div key={idx} className="border rounded-lg p-4 bg-gray-50">
                  <div className="font-medium text-red-700 mb-2">แถวที่ {err.row}: {err.id_card} - {err.hospital_number}</div>
                  <div className="text-sm text-gray-600 mb-3">{err.error}</div>
                  {err.error_type === 'hospital' && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">เลือกโรงพยาบาลที่ถูกต้อง:</label>
                      <select
                        className="w-full border rounded-lg p-2"
                        value={tempHospitalId[idx] || ''}
                        onChange={(e) => setTempHospitalId(prev => ({ ...prev, [idx]: e.target.value }))}
                      >
                        <option value="">-- กรุณาเลือก --</option>
                        {hospitals.map(h => (
                          <option key={h.id} value={h.id}>{h.name} ({h.code}) {h.type === 'main' ? '- แม่ข่าย' : '- ลูกข่าย'}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleFixHospital(idx)}
                        disabled={!tempHospitalId[idx]}
                        className="mt-2 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
                      >
                        บันทึกโรงพยาบาล
                      </button>
                    </div>
                  )}
                  {err.error_type === 'coach' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">เลือกโค้ช (ในเครือข่ายโรงพยาบาล {err.original_hospital_name || ''}):</label>
                      <select
                        className="w-full border rounded-lg p-2"
                        value={tempCoachId[idx] || ''}
                        onChange={(e) => setTempCoachId(prev => ({ ...prev, [idx]: e.target.value }))}
                      >
                        <option value="">-- กรุณาเลือก --</option>
                        {(modalCoaches[idx] || []).map(c => (
                          <option key={c.user_id} value={c.user_id}>{c.full_name_th} | {c.specialization_th || '-'}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleFixCoach(idx)}
                        disabled={!tempCoachId[idx]}
                        className="mt-2 bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                      >
                        บันทึกโค้ชและนำเข้า
                      </button>
                      {!modalCoaches[idx] && err.hospital_id && (
                        <button
                          onClick={() => {
                            const netIds = getNetworkHospitalIds(err.hospital_id, hospitals);
                            const netCoaches = coaches.filter(c => {
                              const ch = c.users?.hospital_id;
                              return ch && netIds.includes(ch);
                            });
                            setModalCoaches(prev => ({ ...prev, [idx]: netCoaches }));
                          }}
                          className="mt-2 ml-2 text-blue-600 underline"
                        >
                          โหลดรายชื่อโค้ช
                        </button>
                      )}
                    </div>
                  )}
                  {err.fixed && (
                    <button
                      onClick={() => handleRetryFixedRow(idx)}
                      className="mt-3 bg-orange-600 text-white px-4 py-2 rounded"
                    >
                      🚀 นำเข้าแถวนี้ทันที
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={handleBackToPreview} className="px-4 py-2 border rounded-lg">ย้อนกลับ</button>
              <button onClick={handleExitImport} className="px-4 py-2 bg-gray-600 text-white rounded-lg">ออก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}