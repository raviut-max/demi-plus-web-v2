/**
 * ============================================================================
 * 📄 ไฟล์: page.tsx
 * 📂 ตำแหน่ง: app/admin/patients/import-excel/page.tsx
 * 🏥 ระบบ: DEMI+ (Diabetes Engagement Management Interface Plus)
 * 📝 หน้าที่: นำเข้าข้อมูลผู้ป่วยจากไฟล์ Excel
 * 👥 ผู้พัฒนา: DEMI+ Development Team
 * 📅 อัปเดตล่าสุด: 22 พฤษภาคม 2569
 * ⚠️ คำเตือน: ห้ามแก้ไขโค้ดโดยไม่ได้รับอนุญาต
 * ============================================================================
 */

'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  checkSession, 
  logout, 
  validateThaiIdCard,
  getAllValidAddresses,
  validateAddress,
  importPatientsBatch,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy
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
  ShieldAlert,
  RotateCcw,
  X,
  Hospital,
  UserCheck,
  MapPin,
  Sparkles,
  Save,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/client';

// =====================================================
// 📋 กำหนดคอลัมน์มาตรฐาน
// =====================================================
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

// =====================================================
// 🧠 SMART MATCHING FUNCTIONS
// =====================================================
const normalizeThaiText = (text: string): string => {
  if (!text) return '';
  let normalized = text.trim().toLowerCase();
  const abbreviations: Record<string, string> = {
    'รพ': 'โรงพยาบาล', 'รพสต': 'โรงพยาบาลส่งเสริมสุขภาพตำบล', 'รพช': 'โรงพยาบาลชุมชน',
    'สสจ': 'สาธารณสุขจังหวัด', 'สสอ': 'สาธารณสุขอำเภอ', 'อน': 'อนามัย',
    'นพ': 'นายแพทย์', 'พญ': 'แพทย์หญิง', 'ทพ': 'ทันตแพทย์', 'ภก': 'เภสัชกร',
  };
  Object.entries(abbreviations).forEach(([abbr, full]) => {
    normalized = normalized.replace(new RegExp(`\\b${abbr}\\b`, 'g'), full);
  });
  normalized = normalized.replace(/\s+/g, '');
  const toneMarks = /[่้๊๋์าำิีึืุูเแโใไ]/g;
  normalized = normalized.replace(toneMarks, '');
  return normalized;
};

const calculateSimilarity = (str1: string, str2: string): number => {
  const s1 = normalizeThaiText(str1);
  const s2 = normalizeThaiText(str2);
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  if (s2.includes(s1)) return 0.85;
  if (s1.includes(s2)) return 0.75;
  const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
  for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
  for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(track[j][i - 1] + 1, track[j - 1][i] + 1, track[j - 1][i - 1] + indicator);
    }
  }
  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - (distance / maxLength);
};

const findBestHospitalMatch = (hospitalName: string, hospitals: any[]) => {
  let bestMatch: any = null;
  let bestScore = 0;
  hospitals.forEach(hospital => {
    const score = calculateSimilarity(hospitalName, hospital.name);
    if (score > 0.80 && score > bestScore) {
      bestScore = score;
      bestMatch = hospital;
    }
  });
  return bestMatch ? { hospital: bestMatch, similarity: bestScore } : null;
};

const findBestCoachMatch = (coachName: string, coaches: any[]) => {
  let bestMatch: any = null;
  let bestScore = 0;
  coaches.forEach(coach => {
    const score = calculateSimilarity(coachName, coach.full_name_th);
    if (score > 0.90 && score > bestScore) {
      bestScore = score;
      bestMatch = coach;
    }
  });
  return bestMatch ? { coach: bestMatch, similarity: bestScore } : null;
};

// =====================================================
// 📅 DATE CONVERSION FUNCTIONS
// =====================================================
const convertISOToThaiDate = (isoDate: string): string => {
  if (!isoDate) return '';
  if (isoDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = isoDate.split('-');
    const yearBE = parseInt(year) + 543;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${yearBE}`;
  }
  return isoDate;
};

// =====================================================
// MAIN COMPONENT
// =====================================================
export default function ImportExcelPage() {
  const router = useRouter();
  const supabase = createClient();
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
  const [validAddresses, setValidAddresses] = useState<Array<{ province: string; district: string; subdistrict: string; postal_code: string; }>>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [success, setSuccess] = useState(false);
  
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: number;
    errors: Array<{ 
      row: number; 
      id_card: string; 
      hospital_number: string; 
      error: string;
      error_type: 'hospital' | 'coach' | 'other';
      hospital_id?: string;
      coach_id?: string;
      province?: string;
      district?: string;
      subdistrict?: string;
      original_hospital_name?: string;
      original_coach_name?: string;
      hospital_fixed?: boolean;
      fixed?: boolean;
    }>;
    successRecords: Array<{ row: number; id_card: string; hospital_number: string; first_name: string; last_name: string; }>;
  } | null>(null);
  
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [modalCoaches, setModalCoaches] = useState<Record<number, any[]>>({});

  useEffect(() => {
    const userData = checkSession();
    if (!userData) { router.push('/admin/login'); return; }
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) { router.push('/admin/patients'); return; }
    setUser(userData);
    loadNetworkData(userData.id);
  }, [router]);

  useEffect(() => {
    const loadValidAddresses = async () => {
      try {
        const addresses = await getAllValidAddresses();
        setValidAddresses(addresses || []);
      } catch (err) { console.warn('⚠️ ไม่สามารถโหลดข้อมูลที่อยู่'); }
    };
    loadValidAddresses();
  }, []);

  const loadNetworkData = async (userId: string) => {
    try {
      console.log('🏥 [loadNetworkData] Loading hospitals...');
      const allHospitals = await getHospitalsWithHierarchy();
      setHospitals(allHospitals);
      const hospitalIds = allHospitals.map(h => h.id);
      
      console.log('👨‍⚕️ [loadNetworkData] Loading coaches for hospitals:', hospitalIds);
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
      
      console.log('✅ [loadNetworkData] Loaded:', {
        hospitals: allHospitals.length,
        coaches: allCoaches.length
      });
    } catch (error) { 
      console.error('❌ [loadNetworkData] Error:', error); 
    }
  };

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

  const buildPreview = useCallback(() => {
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: selectedRows.has(idx), _status: 'pending' };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) {
          const val = row[excelKey];
          if (dbKey === 'birth_date' && val) {
            const cleanVal = String(val).trim();
            if (cleanVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
              newRow[dbKey] = convertISOToThaiDate(cleanVal);
            } else {
              newRow[dbKey] = cleanVal;
            }
          } else {
            newRow[dbKey] = val !== undefined && val !== null ? String(val).trim() : '';
          }
        }
      });
      return newRow;
    });
    setPreviewData(mapped);
    setStep('preview');
    runValidation(mapped);
  }, [rawData, headerMapping, selectedRows]);

  // =====================================================
  // ✅ ฟังก์ชัน validateRow (แก้ไข: ไม่ validate ที่อยู่)
  // =====================================================
  const validateRow = (row: any) => {
    const errors: string[] = [];
    STANDARD_FIELDS.forEach(field => {
      const val = row[field.key];
      const strVal = String(val ?? '').trim();

      if (field.required && strVal === '') { errors.push(`${field.label} เป็นฟิลด์บังคับ`); return; }
      if (strVal === '') return;

      if (field.inputType === 'number') {
        if (!/^-?\d+(\.\d+)?$/.test(strVal)) errors.push(`${field.label} ต้องเป็นตัวเลขเท่านั้น`);
        else {
          const num = parseFloat(strVal);
          if (field.min !== undefined && num < field.min) errors.push(`${field.label} น้อยกว่า ${field.min}`);
          if (field.max !== undefined && num > field.max) errors.push(`${field.label} มากกว่า ${field.max}`);
        }
      } else if (field.inputType === 'date') {
        const dateRegex = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/;
        const match = strVal.match(dateRegex);
        if (!match) errors.push(`${field.label} รูปแบบต้องเป็น วว/ดด/ปปปป หรือ วว-ดด-ปปปป`);
        else {
          const [, d, m, y] = match;
          if (parseInt(d) < 1 || parseInt(d) > 31) errors.push(`${field.label} วันไม่ถูกต้อง`);
          if (parseInt(m) < 1 || parseInt(m) > 12) errors.push(`${field.label} เดือนไม่ถูกต้อง`);
          if (parseInt(y) < 2400 || parseInt(y) > 2569) errors.push(`${field.label} ปี พ.ศ. ไม่ถูกต้อง`);
        }
      } else if (field.inputType === 'select') {
        if (!field.options?.includes(strVal)) errors.push(`${field.label} ต้องเป็น ${field.options?.join(' หรือ ')}`);
      } else if (field.key === 'id_card') {
        if (!validateThaiIdCard(strVal)) errors.push('เลขบัตรประชาชนไม่ถูกต้อง');
      }
    });

    // ✅ ปิดการ validate ที่อยู่ (ตำบล อำเภอ จังหวัด) - ตามคำขอ
    // if (validAddresses.length > 0 && (row.province || row.district || row.subdistrict)) {
    //   const addrCheck = validateAddress({ province: row.province || '', district: row.district || '', subdistrict: row.subdistrict || '', postal_code: row.postal_code || '' }, validAddresses);
    //   if (!addrCheck.valid) errors.push(...addrCheck.errors);
    // }

    return errors;
  };

  const runValidation = (data: any[]) => {
    const errors: Record<number, string[]> = {};
    data.forEach((row, idx) => { errors[idx] = validateRow(row); });
    setValidationErrors(errors);
    setPreviewData(prev => prev.map(r => ({ ...r, _errors: errors[r._rowIndex] || [] })));
  };

  const startEdit = (rIdx: number, key: string) => { setEditingCell({ row: rIdx, key }); setEditValue(previewData[rIdx][key] || ''); };
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
  const handleCellKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') saveEdit(); else if (e.key === 'Escape') cancelEdit(); };

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
        const json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        setRawData(json);
        if (json.length > 0) setExcelHeaders(Object.keys(json[0]));
      } catch { setError('❌ ไม่สามารถอ่านไฟล์ได้'); }
      finally { setLoading(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  const toggleSelectRow = (idx: number) => {
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
    setPreviewData(prev => prev.map((r, i) => i === idx ? { ...r, _selected: next.has(i) } : r));
  };

  const selectAll = (checked: boolean) => {
    const next = checked ? new Set(previewData.filter(r => r._status !== 'success').map((_, i) => i)) : new Set();
    setSelectedRows(next);
    setPreviewData(prev => prev.map((r, i) => ({ ...r, _selected: next.has(i) })));
  };

  const hasErrorsInSelected = Array.from(selectedRows).some(idx => previewData[idx]?._errors?.length > 0);

  const getNetworkHospitalIds = (hospitalId: string): string[] => {
    const hospital = hospitals.find(h => h.id === hospitalId);
    if (!hospital) return [hospitalId];
    const networkIds: string[] = [hospitalId];
    if (hospital.type === 'main') {
      const subHospitals = hospitals.filter(h => h.parent_id === hospitalId);
      subHospitals.forEach(sub => networkIds.push(sub.id));
    } else if (hospital.type === 'sub' && hospital.parent_id) {
      networkIds.push(hospital.parent_id);
    }
    return networkIds;
  };

  // =====================================================
  // 🚀 ฟังก์ชันโหลดโค้ช (แก้ไขใหม่: โหลดจาก API โดยตรง)
  // =====================================================
  const loadCoachesForErrorRow = async (errorIndex: number, hospitalId: string) => {
    if (!hospitalId) {
      console.warn('⚠️ [loadCoachesForErrorRow] No hospital_id provided');
      return;
    }
    
    // ✅ ป้องกันการโหลดซ้ำ
    if (modalCoaches[errorIndex]) {
      console.log('✅ [loadCoachesForErrorRow] Already loaded for error', errorIndex);
      return;
    }

    try {
      console.log(`\n🔍 ========== [loadCoachesForErrorRow] START ==========`);
      console.log(`📝 Error Index: ${errorIndex}`);
      console.log(`🏥 Hospital ID: ${hospitalId}`);
      
      // ✅ หา network hospital IDs (แม่ข่าย + ลูกข่าย)
      const networkIds = getNetworkHospitalIds(hospitalId);
      console.log('🏥 Network Hospital IDs:', networkIds);
      
      // ✅ โหลดโค้ชจาก API โดยตรง (แทนการใช้ state ที่อาจผิดพลาด)
      console.log('🔄 Loading coaches from API for network...');
      const networkCoaches = await getCoachesWithHospitals(networkIds);
      
      console.log(`\n✅ Found ${networkCoaches.length} coaches from API`);
      
      // ✅ อัปเดต state
      setModalCoaches(prev => ({ 
        ...prev, 
        [errorIndex]: networkCoaches 
      }));

      console.log(`\n🔍 ========== [loadCoachesForErrorRow] END ==========\n`);
      
    } catch (err) {
      console.error('❌ [loadCoachesForErrorRow] Error:', err);
    }
  };

  // ✅ Auto-load coaches when modal opens
  useEffect(() => {
    if (importResult && importResult.errors.length > 0) {
      importResult.errors.forEach((err, idx) => {
        // ถ้ามี hospital_id และยังไม่มีข้อมูลโค้ชใน modal ให้โหลด
        if (err.hospital_id && !modalCoaches[idx]) {
          console.log('🔄 Auto-loading coaches for error', idx, 'hospital:', err.hospital_id);
          loadCoachesForErrorRow(idx, err.hospital_id);
        }
      });
    }
  }, [importResult]);

  // =====================================================
  // ✅ ฟังก์ชันตรวจสอบเลขบัตรประชาชนซ้ำ
  // =====================================================
  const checkDuplicateIdCard = async (idCard: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('id_card')
        .eq('id_card', idCard)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      return !!data;
    } catch (err) {
      console.error('Error checking duplicate ID:', err);
      return false;
    }
  };

  // =====================================================
  // 📊 ฟังก์ชันบันทึกผลรายงาน (Export Report)
  // =====================================================
  const handleExportResults = () => {
    if (!previewData || previewData.length === 0) return;

    const reportData = previewData.map((row, idx) => ({
      'ลำดับ': idx + 1,
      'สถานะ': row._status === 'success' ? '✅ สำเร็จ' : (row._errors?.length > 0 ? '❌ ผิดพลาด' : '⏳ รอการนำเข้า'),
      'เลขบัตรประชาชน': row.id_card || '',
      'HN': row.hospital_number || '',
      'ชื่อ-นามสกุล': `${row.first_name || ''} ${row.last_name || ''}`,
      'โรงพยาบาล': row.hospital_name || '',
      'หมายเหตุ': row._status === 'success' ? 'นำเข้าสำเร็จ' : (row._errors?.map((e:any) => e).join(', ') || '')
    }));

    const ws = XLSX.utils.json_to_sheet(reportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import_Report');
    
    const timestamp = new Date().toISOString().slice(0, 16).replace(/:/g, '-');
    XLSX.writeFile(wb, `Import_Report_${timestamp}.xlsx`);
  };

  const handleExportToExcel = () => {
    if (!previewData || previewData.length === 0) {
      setError('ไม่มีข้อมูลสำหรับส่งออก');
      return;
    }

    const exportData = previewData.map((row, idx) => {
      const exportRow: any = {
        'ลำดับ': idx + 1,
        'เลขบัตรประชาชน': row.id_card || '',
        'ชื่อผู้ป่วย': row.first_name || '',
        'นามสกุลผู้ป่วย': row.last_name || '',
        'HN': row.hospital_number || '',
        'วันเกิด': row.birth_date || '',
        'เพศ': row.gender === 'male' ? 'ชาย' : row.gender === 'female' ? 'หญิง' : row.gender || '',
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
        'บ้านเลขที่': row.house_number || '',
        'หมู่ที่': row.village_no || '',
        'หมู่บ้าน': row.village_name || '',
        'ซอย': row.soi || '',
        'ถนน': row.road || '',
        'ตำบล': row.subdistrict || '',
        'อำเภอ': row.district || '',
        'จังหวัด': row.province || '',
        'รหัสไปรษณีย์': row.postal_code || '',
        'ที่อยู่เพิ่มเติม': row.address_line1 || '',
        'ผู้ติดต่อฉุกเฉิน': row.emergency_contact_name || '',
        'เบอร์ติดต่อฉุกเฉิน': row.emergency_contact_phone || '',
        'ความสัมพันธ์': row.emergency_contact_relationship || '',
        'โค้ชผู้ดูแล': row.coach_name || '',
      };
      return exportRow;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 10 }, { wch: 30 }, { wch: 12 }, { wch: 25 }, { wch: 10 }, { wch: 10 },
      { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 10 }, { wch: 30 }, { wch: 15 },
      { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 },
      { wch: 20 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 30 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ข้อมูลผู้ป่วย');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    XLSX.writeFile(wb, `ผู้ป่วยที่แก้ไข_${timestamp}.xlsx`);
  };

  // =====================================================
  // ✅ แก้ไขฟังก์ชันบันทึกการแก้ไขโรงพยาบาล (นำเข้าทันที + ปิดอัตโนมัติ)
  // =====================================================
  const handleSaveHospitalFix = async (errorIndex: number) => {
    if (!importResult) return;
    const currentError = importResult.errors[errorIndex];
    const rowIndex = currentError.row - 1;

    if (!currentError.hospital_id) {
      setError('กรุณาเลือกโรงพยาบาลก่อนบันทึก');
      return;
    }

    console.log('💾 [handleSaveHospitalFix] Saving hospital fix for row:', rowIndex);

    // 1. อัปเดตข้อมูลโรงพยาบาลใน previewData
    setPreviewData(prev => {
      const newData = [...prev];
      const row = { ...newData[rowIndex] };
      const hospital = hospitals.find(h => h.id === currentError.hospital_id);
      if (hospital) {
        row.hospital_name = hospital.name;
        console.log('✅ Updated hospital name to:', hospital.name);
      }
      newData[rowIndex] = row;
      return newData;
    });

    // 2. รอให้ Preview อัปเดต
    setTimeout(() => {
      runValidation(previewData);
    }, 100);

    // 3. ตรวจสอบและมี error อื่นๆ อีกหรือไม่
    setTimeout(() => {
      const updatedRow = previewData[rowIndex];
      const rowErrors = validateRow(updatedRow);
      
      console.log('🔍 [handleSaveHospitalFix] Validation errors:', rowErrors);
      
      if (rowErrors.length === 0) {
        console.log('✅ No errors - importing single row');
        handleImportSingleRow(rowIndex);
      } else {
        console.log('⚠️ Still has errors - updating modal');
        const newErrors = [...importResult.errors];
        newErrors[errorIndex] = { 
          ...newErrors[errorIndex], 
          hospital_fixed: true,
          fixed: false
        };
        setImportResult({ ...importResult, errors: newErrors });
        
        const nextError = rowErrors.find(e => !e.includes('โรงพยาบาล'));
        if (nextError) {
          setError(`✅ โรงพยาบาลถูกต้องแล้ว แต่พบปัญหา: ${nextError}`);
        }
      }
      
      // ✅ ปิด Modal และกลับไปหน้า Preview หลังจากบันทึก
      setTimeout(() => {
        console.log('🔙 Closing modal and returning to preview');
        setImportResult(null);
        setStep('preview');
      }, 500);
    }, 200);
  };

  // =====================================================
  // ✅ แก้ไขฟังก์ชัน handleImportSingleRow (ตรวจสอบเลขบัตรประชาชนซ้ำ)
  // =====================================================
  const handleImportSingleRow = async (rowIndex: number) => {
    const row = previewData[rowIndex];
    try {
      // ✅ ตรวจสอบเลขบัตรประชาชนซ้ำก่อน
      const isDuplicate = await checkDuplicateIdCard(row.id_card);
      if (isDuplicate) {
        setError(`❌ เลขบัตรประชาชน ${row.id_card} มีอยู่ในระบบแล้ว`);
        
        // แสดงใน modal ด้วย
        const newErrors = [...(importResult?.errors || [])];
        if (newErrors[rowIndex]) {
          newErrors[rowIndex] = { 
            ...newErrors[rowIndex], 
            error: `เลขบัตรประชาชน ${row.id_card} มีอยู่ในระบบแล้ว`,
            error_type: 'other' as const
          };
          setImportResult({ ...importResult!, errors: newErrors });
        }
        
        return;
      }

      const dateParts = row.birth_date.split(/[\/-]/);
      if (dateParts.length !== 3) throw new Error('รูปแบบวันเกิดไม่ถูกต้อง');
      const [day, month, yearBE] = dateParts;
      const yearAD = parseInt(yearBE) - 543;
      const birthDateISO = `${yearAD}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      let coachId = null;
      if (row.coach_name) {
        const coachMatch = findBestCoachMatch(row.coach_name, coaches);
        if (coachMatch) {
          coachId = coachMatch.coach.user_id;
        }
      }

      const hospitalMatch = findBestHospitalMatch(row.hospital_name, hospitals);
      if (!hospitalMatch) {
        setError('❌ ไม่พบโรงพยาบาลในระบบ');
        return;
      }

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
        house_number: row.house_number || undefined,
        address_line1: row.address_line1 || undefined,
        soi: row.soi || undefined,
        road: row.road || undefined,
        village_no: row.village_no || undefined,
        village_name: row.village_name || undefined,
        subdistrict: row.subdistrict || undefined,
        district: row.district || undefined,
        province: row.province || undefined,
        postal_code: row.postal_code || undefined,
        hospital_id: hospitalMatch.hospital.id,
        emergency_contact_name: row.emergency_contact_name || undefined,
        emergency_contact_phone: row.emergency_contact_phone || undefined,
        emergency_contact_relationship: row.emergency_contact_relationship || undefined,
        pam_level: 'L0',
        pam_score: 0,
        zone: 'Zero Zone',
        created_by: user?.id,
      };

      const result = await importPatientsBatch([data], user.id);
      
      if (result.success > 0) {
        setSuccess(true);
        setPreviewData(prev => prev.map((r, idx) => idx === rowIndex ? { ...r, _status: 'success', _selected: false } : r));
        setSelectedRows(prev => {
          const next = new Set(prev);
          next.delete(rowIndex);
          return next;
        });
        setTimeout(() => {
          router.push('/admin/patients');
        }, 2000);
      } else {
        setError(`❌ เกิดข้อผิดพลาด: ${result.errors[0]?.error || 'ไม่ทราบสาเหตุ'}`);
      }
    } catch (err: any) {
      console.error('❌ [handleImportSingleRow] Error:', err);
      setError(`❌ เกิดข้อผิดพลาดในการบันทึก: ${err.message}`);
    }
  };

  // =====================================================
  // ✅ แก้ไขฟังก์ชัน handleImport (ตรวจสอบเลขบัตรประชาชนซ้ำ)
  // =====================================================
  const handleImport = async () => {
    if (selectedRows.size === 0) { setError('กรุณาเลือกแถวที่ต้องการนำเข้า'); return; }
    if (hasErrorsInSelected) { 
      setError('มีแถวที่เลือกยังไม่ผ่านตรวจสอบพื้นฐาน กรุณาแก้ไขก่อนนำเข้า'); 
      return; 
    }

    const errors: typeof importResult.errors = [];
    const successRecords: typeof importResult.successRecords = [];
    let successCount = 0;

    selectedRows.forEach(rowIdx => {
      const row = previewData[rowIdx];
      const rowNumber = rowIdx + 1;
      
      const hospitalMatch = findBestHospitalMatch(row.hospital_name, hospitals);
      
      if (!hospitalMatch) {
        errors.push({
          row: rowNumber,
          id_card: row.id_card,
          hospital_number: row.hospital_number,
          error: `ไม่พบโรงพยาบาล "${row.hospital_name}" ในระบบ`,
          error_type: 'hospital',
          hospital_id: undefined,
          original_hospital_name: row.hospital_name,
          hospital_fixed: false,
          fixed: false
        });
      } else {
        const hospitalId = hospitalMatch.hospital.id;
        const networkIds = getNetworkHospitalIds(hospitalId);
        const networkCoaches = coaches.filter(c => {
          const cHospId = c.users?.hospital_id;
          return cHospId && networkIds.includes(cHospId);
        });
        
        const coachMatch = row.coach_name ? findBestCoachMatch(row.coach_name, networkCoaches) : null;

        if (row.coach_name && !coachMatch) {
          errors.push({
            row: rowNumber,
            id_card: row.id_card,
            hospital_number: row.hospital_number,
            error: `ไม่พบโค้ช "${row.coach_name}" ในเครือข่ายของ ${hospitalMatch.hospital.name}`,
            error_type: 'coach',
            hospital_id: hospitalId,
            original_hospital_name: row.hospital_name,
            original_coach_name: row.coach_name,
            hospital_fixed: true,
            fixed: false
          });
        } else {
          successCount++;
          successRecords.push({
            row: rowNumber,
            id_card: row.id_card,
            hospital_number: row.hospital_number,
            first_name: row.first_name,
            last_name: row.last_name
          });
        }
      }
    });

    if (errors.length > 0) {
      setImportResult({
        success: successCount,
        failed: errors.length,
        errors: errors,
        successRecords: successRecords
      });
      return;
    }

    setError('');
    setImporting(true);
    setImportProgress({ current: 0, total: selectedRows.size });

    try {
      const selectedData = previewData.filter(row => row._selected).map(row => {
        const data: any = { 
            id_card: row.id_card, 
            first_name: row.first_name, 
            last_name: row.last_name, 
            hospital_number: row.hospital_number, 
            birth_date: row.birth_date, 
            gender: row.gender, 
            hospital_name: row.hospital_name 
        };
        if (row.phone) data.phone = row.phone;
        if (row.email) data.email = row.email;
        if (row.current_weight) data.current_weight = row.current_weight;
        if (row.height) data.height = row.height;
        if (row.waist_circumference) data.waist_circumference = row.waist_circumference;
        if (row.diabetes_type) data.diabetes_type = row.diabetes_type;
        if (row.blood_sugar) data.blood_sugar = row.blood_sugar;
        if (row.hba1c_level) data.hba1c_level = row.hba1c_level;
        if (row.notes) data.notes = row.notes;
        if (row.house_number) data.house_number = row.house_number;
        if (row.village_no) data.village_no = row.village_no;
        if (row.village_name) data.village_name = row.village_name;
        if (row.soi) data.soi = row.soi;
        if (row.road) data.road = row.road;
        if (row.subdistrict) data.subdistrict = row.subdistrict;
        if (row.district) data.district = row.district;
        if (row.province) data.province = row.province;
        if (row.postal_code) data.postal_code = row.postal_code;
        if (row.address_line1) data.address_line1 = row.address_line1;
        if (row.emergency_contact_name) data.emergency_contact_name = row.emergency_contact_name;
        if (row.emergency_contact_phone) data.emergency_contact_phone = row.emergency_contact_phone;
        if (row.emergency_contact_relationship) data.emergency_contact_relationship = row.emergency_contact_relationship;
        if (row.coach_name) data.coach_name = row.coach_name;
        return data;
      });

      const result = await importPatientsBatch(selectedData, user.id);
      
      // ✅ ตรวจสอบว่ามี error จากเลขบัตรประชาชนซ้ำหรือไม่
      if (result.errors && result.errors.length > 0) {
        const duplicateErrors = result.errors.filter((e: any) => 
          e.error?.includes('เลขบัตรประชาชน') && e.error?.includes('มีอยู่แล้ว')
        );
        
        if (duplicateErrors.length > 0) {
          const duplicateMsg = duplicateErrors.map((e: any) => `แถว ${e.row}: ${e.error}`).join(', ');
          setError(`⚠️ พบเลขบัตรประชาชนซ้ำ: ${duplicateMsg}`);
        }
      }
      
      if (result.success > 0) {
        const successIds = new Set(selectedData.filter((_, idx) => idx < result.success).map(d => d.id_card));
        setPreviewData(prev => prev.map(r => {
          if (successIds.has(r.id_card)) {
            return { ...r, _status: 'success', _selected: false };
          }
          return r;
        }));
        
        setSelectedRows(prev => {
          const next = new Set(prev);
          previewData.forEach((r, i) => {
            if (successIds.has(r.id_card)) next.delete(i);
          });
          return next;
        });
      }

      const finalSuccessRecords = selectedData.filter((_, idx) => idx < result.success).map((data, idx) => ({ row: idx + 1, id_card: data.id_card, hospital_number: data.hospital_number, first_name: data.first_name, last_name: data.last_name }));
      setImportResult({ ...result, successRecords: finalSuccessRecords });
    } catch (err: any) {
      console.error('❌ [handleImport] Error:', err);
      setError(`เกิดข้อผิดพลาดในการนำเข้า: ${err.message}`);
    } finally {
      setImporting(false);
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const handleEditInModal = (errorIndex: number, field: string, value: string) => {
    if (!importResult) return;
    const updatedErrors = [...importResult.errors];
    updatedErrors[errorIndex] = { ...updatedErrors[errorIndex], [field]: value };
    setImportResult({ ...importResult, errors: updatedErrors });
  };

  const handleApplyModalFix = (errorIndex: number) => {
    if (!importResult) return;
    const currentError = importResult.errors[errorIndex];
    const rowIndex = currentError.row - 1;

    setPreviewData(prev => {
      const newData = [...prev];
      const row = { ...newData[rowIndex] };

      if (currentError.hospital_id) {
        const hospital = hospitals.find(h => h.id === currentError.hospital_id);
        if (hospital) {
          row.hospital_name = hospital.name;
        }
      }
      
      if (currentError.coach_id) {
        const coach = coaches.find(c => c.user_id === currentError.coach_id);
        if (coach) {
          row.coach_name = coach.full_name_th;
        }
      }
      
      if (currentError.province) row.province = currentError.province;
      if (currentError.district) row.district = currentError.district;
      if (currentError.subdistrict) row.subdistrict = currentError.subdistrict;

      newData[rowIndex] = row;
      return newData;
    });

    setTimeout(() => runValidation(previewData), 100);

    const newErrors = [...importResult.errors];
    newErrors[errorIndex] = { ...newErrors[errorIndex], fixed: true };
    setImportResult({ ...importResult, errors: newErrors });
  };

  const handleBackToPreview = () => {
    setImportResult(null);
    setStep('preview');
  };

  const handleExitImport = () => {
    setImportResult(null);
    setSelectedRows(new Set());
    router.back();
  };

  const handleRetryFailed = () => {
    if (!importResult || importResult.errors.length === 0) return;
    const failedRowIndices = importResult.errors.filter(err => !err.fixed).map(err => err.row - 1);
    const newSelectedRows = new Set([...selectedRows, ...failedRowIndices]);
    setSelectedRows(newSelectedRows);
    setImportResult(null);
    setStep('preview');
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">บันทึกข้อมูลสำเร็จ!</h2>
          <p className="text-gray-600">กำลังไปยังหน้ารายการผู้ป่วย...</p>
        </div>
      </div>
    );
  }

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

        {step === 'preview' && previewData.length > 0 && (
          <>
            <div className="bg-white rounded-xl shadow p-4 border border-gray-200 flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={selectedRows.size === previewData.filter(r => r._status !== 'success').length && previewData.filter(r => r._status !== 'success').length > 0}
                    onChange={(e) => selectAll(e.target.checked)}
                    className="w-4 h-4"
                    disabled={previewData.every(r => r._status === 'success')} 
                  />
                  <span className="text-sm font-medium">
                    เลือกทั้งหมด (เฉพาะที่ยังไม่บันทึก)
                  </span>
                </label>
                <span className="text-sm text-gray-500">✅ ถูกเลือก: {selectedRows.size} แถว</span>
                <span className={`text-sm font-medium ${hasErrorsInSelected ? 'text-red-600' : 'text-green-600'}`}>
                  {hasErrorsInSelected ? '⚠️ มีข้อมูลที่เลือกยังไม่ผ่านตรวจสอบ' : '✅ ข้อมูลที่เลือกพร้อมนำเข้า'}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={handleExportResults} className="px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm flex items-center gap-2">
                  <Download className="w-4 h-4" /> บันทึกผล
                </button>
                <button onClick={() => runValidation(previewData)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔄 ตรวจสอบใหม่</button>
                <button onClick={handleExportToExcel} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center gap-2">
                  <Download className="w-4 h-4" /> นำออก Excel
                </button>
                <button onClick={() => setStep('mapping')} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm">🔧 แก้ไขการจับคู่</button>
                <button 
                  disabled={selectedRows.size === 0 || hasErrorsInSelected || importing} 
                  onClick={handleImport}
                  className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"
                >
                  {importing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> กำลังนำเข้า... ({importProgress.current}/{importProgress.total})</>
                  ) : hasErrorsInSelected ? (
                    <><ShieldAlert className="w-4 h-4" /> แก้ไขข้อผิดพลาดก่อนนำเข้า</>
                  ) : (
                    <><Upload className="w-4 h-4" /> 🚀 นำเข้าที่เลือก ({selectedRows.size})</>
                  )}
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
                      <th className="p-3 min-w-[220px] text-left font-medium text-red-700 whitespace-nowrap sticky right-0 bg-gray-100 z-10">⚠️ ข้อผิดพลาด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((row, rIdx) => (
                      <tr 
                        key={rIdx} 
                        className={`border-b hover:bg-gray-50 ${row._status === 'success' ? 'bg-green-50' : (row._errors?.length > 0 ? 'bg-red-50/50' : '')}`}
                      >
                        <td className="p-3 text-center sticky left-0 bg-white z-10">
                          <input 
                            type="checkbox" 
                            checked={row._selected} 
                            disabled={row._status === 'success'} 
                            onChange={() => row._status !== 'success' && toggleSelectRow(rIdx)} 
                            className={`w-4 h-4 ${row._status === 'success' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          />
                        </td>
                        <td className="p-3 text-center sticky left-10 bg-white z-10">
                          {row._status === 'success' ? (
                            <span className="text-green-600 font-bold flex items-center justify-center gap-1">
                              <CheckCircle className="w-5 h-5" /> บันทึกแล้ว
                            </span>
                          ) : row._errors?.length > 0 ? (
                            <XCircle className="w-5 h-5 text-red-500 mx-auto" />
                          ) : (
                            <CheckCircle className="w-5 h-5 text-gray-300 mx-auto" />
                          )}
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
                          {row._status === 'success' ? (
                            <span className="text-xs text-green-600 font-medium">✓ สำเร็จ</span>
                          ) : row._errors?.length > 0 ? (
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

      {/* ✅ Modal แสดงผลการนำเข้า */}
      {importResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {importResult.failed === 0 ? (
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  ) : (
                    <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-yellow-600" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-xl font-bold text-gray-800">
                      {importResult.failed === 0 ? '✅ นำเข้าสำเร็จ!' : '⚠️ นำเข้าบางส่วนสำเร็จ'}
                    </h3>
                    <p className="text-gray-600">
                      สำเร็จ: {importResult.success} รายการ | ล้มเหลว: {importResult.failed} รายการ
                    </p>
                  </div>
                </div>
                <button onClick={() => setImportResult(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {importResult.successRecords && importResult.successRecords.length > 0 && (
                <div className="mb-6">
                  <h4 className="font-semibold text-green-700 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> รายการที่นำเข้าสำเร็จ ({importResult.successRecords.length}):
                  </h4>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 max-h-48 overflow-auto">
                    {importResult.successRecords.map((record, idx) => (
                      <div key={idx} className="text-sm text-green-800 mb-1 pb-1 border-b border-green-200 last:border-0 flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 flex-shrink-0" />
                        <span><strong>แถว {record.row}:</strong> {record.first_name} {record.last_name} | HN: {record.hospital_number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-semibold text-red-700 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> รายการที่ล้มเหลว - สามารถแก้ไขได้: ({importResult.errors.length})
                  </h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 max-h-96 overflow-auto space-y-3">
                    {importResult.errors.map((err, idx) => {
                      
                      if (err.fixed) {
                        return (
                          <div key={idx} className="bg-green-50 border border-green-200 rounded p-4 flex items-center gap-3">
                            <CheckCircle className="w-6 h-6 text-green-600" />
                            <div>
                              <p className="text-sm font-bold text-green-800">✅ แถวที่ {err.row} - แก้ไขเรียบร้อย</p>
                              <p className="text-xs text-green-600">ข้อมูลในตารางถูกอัปเดตแล้ว พร้อมนำเข้าใหม่</p>
                            </div>
                          </div>
                        );
                      }

                      const isHospitalMissing = (err.error_type === 'hospital' || !err.hospital_id);
                      const hospitalMatch = !isHospitalMissing ? { hospital: hospitals.find(h => h.id === err.hospital_id) } : null;

                      return (
                        <div key={idx} className="bg-white border border-red-200 rounded p-4">
                          <div className="flex items-start gap-2 mb-3">
                            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-red-800">
                                <strong>แถวที่ {err.row}:</strong> {err.error}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                บัตร ปชช.: {err.id_card} | HN: {err.hospital_number}
                              </p>
                            </div>
                          </div>
                          
                          {isHospitalMissing && (
                            <div className="mb-4 pl-6 space-y-2 border-l-4 border-red-300 bg-red-50 p-3 rounded">
                              <label className="block text-xs font-bold text-red-700 flex items-center gap-1">
                                <Hospital className="w-3 h-3" /> 1. เลือกโรงพยาบาลที่ถูกต้องก่อน:
                              </label>
                              <select 
                                className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
                                value={err.hospital_id || ''}
                                onChange={(e) => handleEditInModal(idx, 'hospital_id', e.target.value)}
                              >
                                <option value="">-- เลือกโรงพยาบาล --</option>
                                {hospitals.map(h => (
                                  <option key={h.id} value={h.id}>{h.name} ({h.code}) {h.type === 'main' ? '- แม่ข่าย' : '- ลูกข่าย'}</option>
                                ))}
                              </select>
                              <button
                                onClick={() => handleSaveHospitalFix(idx)}
                                disabled={!err.hospital_id}
                                className="w-full mt-2 flex items-center justify-center gap-2 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Save className="w-4 h-4" /> 💾 บันทึกการแก้ไขโรงพยาบาล
                              </button>
                              <p className="text-xs text-gray-500 mt-1">📝 เมื่อบันทึกแล้ว ระบบจะตรวจสอบฟิลด์อื่นๆ ต่อไป</p>
                            </div>
                          )}

                          {!isHospitalMissing && (
                            <div className="pl-6 space-y-2 border-l-4 border-blue-300 bg-blue-50 p-3 rounded">
                              <div className="flex items-center gap-2 text-xs font-bold text-green-700 mb-2">
                                <CheckCircle className="w-4 h-4" />
                                โรงพยาบาลถูกต้อง: {hospitalMatch?.hospital?.name}
                              </div>

                              <label className="block text-xs font-bold text-blue-700 flex items-center gap-1">
                                <UserCheck className="w-3 h-3" /> 2. เลือกโค้ชผู้ดูแล (จากโรงพยาบาล {hospitalMatch?.hospital?.name}):
                              </label>
                              
                              {!modalCoaches[idx] && err.hospital_id && (
                                <div className="text-xs text-gray-500 flex items-center gap-2">
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  กำลังโหลดรายชื่อโค้ชในเครือข่าย...
                                </div>
                              )}
                              
                              {modalCoaches[idx] && modalCoaches[idx].length === 0 && (
                                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                                  ⚠️ ไม่พบโค้ชในเครือข่ายโรงพยาบาลนี้ กรุณาติดต่อผู้ดูแลระบบ
                                </div>
                              )}
                              
                              <select
                                key={`coach-select-${idx}-${err.coach_id || 'none'}-${modalCoaches[idx]?.length || 0}`}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                                value={err.coach_id || ''}
                                onChange={(e) => {
                                  const selectedCoachId = e.target.value;
                                  console.log('🎯 Coach selected:', selectedCoachId);
                                   
                                  const updatedErrors = [...importResult.errors];
                                  updatedErrors[idx] = { 
                                    ...updatedErrors[idx], 
                                    coach_id: selectedCoachId 
                                  };
                                  setImportResult({ ...importResult, errors: updatedErrors });
                                  
                                  const selectedCoach = modalCoaches[idx]?.find(c => c.user_id === selectedCoachId);
                                  if (selectedCoach) {
                                    console.log('✅ Coach found:', selectedCoach.full_name_th);
                                    updatedErrors[idx] = { 
                                      ...updatedErrors[idx], 
                                      original_coach_name: selectedCoach.full_name_th 
                                    };
                                    setImportResult({ ...importResult, errors: updatedErrors });
                                  }
                                }}
                                disabled={!modalCoaches[idx] || modalCoaches[idx].length === 0}
                              >
                                <option value="">-- เลือกโค้ช --</option>
                                {modalCoaches[idx]?.map(coach => {
                                  const hospitalName = coach.users?.hospitals?.name || 'ไม่มีสังกัด';
                                  const specialization = coach.specialization_th || 'ไม่ระบุ';
                                  return (
                                    <option key={coach.user_id} value={coach.user_id}>
                                      {coach.full_name_th} | {specialization} | {hospitalName}
                                    </option>
                                  );
                                })}
                              </select>
                              
                              <p className="text-xs text-gray-500 mt-2">
                                💡 แสดงโค้ช: {modalCoaches[idx]?.length || 0} คน (จากเครือข่ายโรงพยาบาล)
                                {err.coach_id && ` | ✅ เลือกแล้ว: ${err.original_coach_name || '...'}`}
                              </p>

                              <button
                                onClick={() => handleApplyModalFix(idx)}
                                disabled={!err.coach_id}
                                className="w-full mt-4 flex items-center justify-center gap-2 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Save className="w-4 h-4" /> ✅ บันทึกการแก้ไขและนำเข้า
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ✅ ปุ่มควบคุมท้าย Modal */}
              <div className="flex gap-3 mt-6 flex-wrap">
                {importResult.failed > 0 && (
                  <>
                    <button onClick={handleBackToPreview} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2">
                      <ArrowLeft className="w-4 h-4" /> ย้อนกลับเพื่อแก้ไข
                    </button>
                    <button onClick={handleRetryFailed} className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium flex items-center justify-center gap-2">
                      <RotateCcw className="w-4 h-4" /> นำเข้ารายการที่ล้มเหลวใหม่
                    </button>
                    <button onClick={handleExitImport} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium flex items-center justify-center gap-2">
                      <X className="w-4 h-4" /> ออกจากการนำเข้า
                    </button>
                  </>
                )}
                
                {importResult.success > 0 && (
                  <>
                    {/* ✅ ปุ่มย้อนกลับไปหน้าพรีวิว - สำหรับนำเข้าต่อ */}
                    <button 
                      onClick={() => {
                        setImportResult(null);
                        setStep('preview');
                        setSelectedRows(new Set());
                      }} 
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" /> ย้อนกลับไปหน้าพรีวิว (นำเข้าต่อ)
                    </button>
                    
                    {/* ปุ่มไปหน้ารายการผู้ป่วย */}
                    <button 
                      onClick={() => router.push('/admin/patients')} 
                      className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" /> ไปหน้ารายการผู้ป่วย
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}