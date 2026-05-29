/**
📄 ไฟล์: page.tsx
📂 ตำแหน่ง: app/admin/patients/import-excel/page.tsx
🏥 ระบบ: DEMI+ (Diabetes Engagement Management Interface Plus)
📝 หน้าที่: นำเข้าข้อมูลผู้ป่วยจากไฟล์ Excel
👥 ผู้พัฒนา: DEMI+ Development Team
📅 อัปเดตล่าสุด: 28 พฤษภาคม 2569
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
  getHospitalsWithHierarchy,
  // Import supabase client เพื่อใช้ดึงค่า HN สูงสุดโดยตรง
} from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client'; // ตรวจสอบ path นี้ให้ตรงกับ project คุณ
import {
  Upload, AlertCircle, Loader2, ArrowLeft, CheckCircle, XCircle, Edit3, 
  AlertTriangle, RotateCcw, X, Hospital, UserCheck, Download, ShieldAlert, Users, Scissors, Phone, Hash
} from 'lucide-react';
import * as XLSX from 'xlsx';

// =====================================================
// 📋 กำหนดคอลัมน์มาตรฐาน
// =====================================================
const STANDARD_FIELDS = [
  { key: 'id_card', label: 'เลขบัตรประชาชน', required: true, inputType: 'text' },
  { key: 'first_name', label: 'ชื่อผู้ป่วย', required: true, inputType: 'text' },
  { key: 'last_name', label: 'นามสกุลผู้ป่วย', required: true, inputType: 'text' },
  { key: 'hospital_number', label: 'HN', required: true, inputType: 'text' },
  { key: 'birth_date', label: 'วันเกิด(วว/ดด/ปปปป พ.ศ.)', required: true, inputType: 'text' },
  { key: 'gender', label: 'เพศ', required: true, inputType: 'select', options: ['ชาย', 'หญิง'] },
  { key: 'hospital_name', label: 'โรงพยาบาล', required: true, inputType: 'text' },
  { key: 'phone', label: 'เบอร์โทรศัพท์ผู้ป่วย', inputType: 'text', isPhoneField: true }, // ✅ ฟิลด์เบอร์โทร 1
  { key: 'email', label: 'อีเมลผู้ป่วย', inputType: 'text' },
  { key: 'current_weight', label: 'น้ำหนัก(กก.)', inputType: 'number', min: 30, max: 200 },
  { key: 'height', label: 'ส่วนสูง(ซม.)', inputType: 'number', min: 100, max: 250 },
  { key: 'waist_circumference', label: 'รอบเอว(ซม.)', inputType: 'number', min: 26, max: 200 },
  { key: 'diabetes_type', label: 'ประเภทเบาหวาน', inputType: 'select', options: ['กลุ่มเสี่ยง', 'เบาหวาน'] },
  { key: 'blood_sugar', label: 'ค่าน้ำตาล', inputType: 'number' }, // ✅ แก้ไขแล้ว
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
  { key: 'emergency_contact_name', label: 'ผู้ติดต่อฉุกเฉิน', inputType: 'text' }, // ✅ แก้ไขแล้ว
  { key: 'emergency_contact_phone', label: 'เบอร์ติดต่อฉุกเฉิน', inputType: 'text', isPhoneField: true }, // ✅ แก้ไขแล้ว + เบอร์โทร 2
  { key: 'emergency_contact_relationship', label: 'ความสัมพันธ์ผู้ติดต่อฉุกเฉิน', inputType: 'text' },
  { key: 'coach_name', label: 'โค้ชผู้ดูแล', inputType: 'text' },
];

// =====================================================
// 🧠 UTILS & MATCHING
// =====================================================
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

// ✅ ฟังก์ชันจัดการวันที่ (สำคัญมาก)
const formatThaiDate = (input: string | number | Date): string => {
  if (!input || String(input).trim() === '') {
    return '01/01/2511'; // กรณีว่าง ให้เติมค่า default
  }
  
  let day = '', month = '', year = '';
  const str = String(input).trim();
  
  // ตรวจสอบรูปแบบ
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, d] = str.split('-');
    year = String(parseInt(y) + 543); month = m; day = d;
  } else if (str.match(/^[\d\/.\-]+$/)) {
    const parts = str.split(/[/.\-]/).map(p => p.trim());
    if (parts.length >= 3) {
      const [p1, p2, p3] = parts;
      if (parseInt(p1) > 31) { year = p1; month = p2; day = p3; }
      else if (parseInt(p3) > 31 || p3.length === 4) { day = p1; month = p2; year = p3; }
      else { day = p1; month = p2; year = p3; }
    } else if (parts.length === 2) {
      // กรณีมีแค่วัน/เดือน เช่น 01/01
      day = parts[0];
      month = parts[1];
      year = '2511'; // เติมปี 2511
    } else {
      // กรณีไม่สมบูรณ์ ให้ default
      return '01/01/2511';
    }
  } else {
    return '01/01/2511';
  }

  let formattedYear = year;
  if (year.length === 2) {
    const shortYear = parseInt(year);
    // 80-99 -> 24xx, 00-79 -> 25xx
    if (shortYear >= 80) formattedYear = `24${year}`;
    else formattedYear = `25${year}`;
  } else if (year.length === 4) {
    formattedYear = year;
  } else if (year.length === 3) {
    formattedYear = `2${year}`;
  }
  
  return `${String(parseInt(day) || 1).padStart(2, '0')}/${String(parseInt(month) || 1).padStart(2, '0')}/${formattedYear}`;
};

const swapDayMonth = (dateStr: string): string => {
  if (!dateStr) return '01/01/2511';
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

const removeNamePrefixes = (name: string): string => {
  if (!name) return '';
  return name.replace(/^(นาย|นางสาว|นาง|นส|น\.?s\.?|เด็กชาย|เด็กหญิง)\.?/i, '').trim();
};

// =====================================================
// MAIN COMPONENT
// =====================================================
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
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'fixing' | 'saving' | 'success'>('upload');
  const [validProvinces, setValidProvinces] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importedPatients, setImportedPatients] = useState<any[]>([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState<Set<number>>(new Set());
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [fixData, setFixData] = useState<Record<number, { hospitalMatch?: any; coachMatch?: any; selectedHospitalId?: string; selectedCoachId?: string; isFixed: boolean; isCoachEmpty?: boolean }>>({});

  const [validationProgress, setValidationProgress] = useState(0);
  const [isInitialValidation, setIsInitialValidation] = useState(false);
  
  // ✅ State สำหรับ HN
  const [hnCounter, setHnCounter] = useState(1);
  const [hnLoading, setHnLoading] = useState(false);

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
      const cleanHeader = header.replace(/\s+/g, '').toLowerCase().replace(/[().\-]/g, '');
      const match = STANDARD_FIELDS.find(f => {
        const fClean = f.label.replace(/\s+/g, '').replace(/[().\-]/g, '').toLowerCase();
        const fKeywords = getKeywordsForField(f.key);
        return cleanHeader.includes(fClean) || fClean.includes(cleanHeader) || fKeywords.some(keyword => cleanHeader.includes(keyword));
      });
      autoMap[header] = match?.key || '';
    });
    setHeaderMapping(autoMap);
    setStep('mapping');
  }, [rawData, excelHeaders]);

  const getKeywordsForField = (fieldKey: string): string[] => {
    const keywords: Record<string, string[]> = {
      'blood_sugar': ['ค่าน้ำตาล', 'น้ำตาล', 'bs', 'fbs', 'glucose'],
      'emergency_contact_name': ['ผู้ติดต่อฉุกเฉิน', 'ผู้ติดต่อ', 'ญาติ', 'ชื่อผู้ติดต่อ(ญาติ)', 'emergency', 'contact'],
      'emergency_contact_phone': ['เบอร์ติดต่อฉุกเฉิน', 'เบอร์ติดต่อ', 'เบอร์โทรฉุกเฉิน', 'เบอร์ญาติ', 'เบอร์โทร1', 'เบอร์โทร_1', 'เบอร์โทร', 'เบอร์โทรศัพท์', 'โทรศัพท์', 'มือถือ'],
      'hba1c_level': ['hba1c', 'ค่าhba1c', 'a1c'],
      'current_weight': ['น้ำหนัก', 'weight', 'นน'],
      'height': ['ส่วนสูง', 'height', 'สูง'],
      'waist_circumference': ['รอบเอว', 'waist'],
      'hospital_number': ['hn', 'เลขที่ผู้ป่วย', 'เลขผู้ป่วย'],
      'id_card': ['บัตรประชาชน', 'id', 'เลขบัตร', 'ประชาชน'],
      'birth_date': ['วันเกิด', 'dob', 'เกิด'],
      'phone': ['เบอร์โทร', 'โทรศัพท์', 'มือถือ', 'เบอร์โทรศัพท์', 'เบอร์โทรศัพท์ผู้ป่วย'],
      'email': ['อีเมล', 'email', 'mail'],
      'province': ['จังหวัด', 'province'],
      'district': ['อำเภอ', 'district'],
      'subdistrict': ['ตำบล', 'subdistrict'],
    };
    return keywords[fieldKey] || [];
  };

  const getDuplicateMappings = () => {
    const mappingCount: Record<string, string[]> = {};
    Object.entries(headerMapping).forEach(([excelCol, fieldKey]) => {
      if (fieldKey) {
        if (!mappingCount[fieldKey]) mappingCount[fieldKey] = [];
        mappingCount[fieldKey].push(excelCol);
      }
    });
    const duplicates: Record<string, string[]> = {};
    Object.entries(mappingCount).forEach(([fieldKey, excelCols]) => {
      if (excelCols.length > 1) duplicates[fieldKey] = excelCols;
    });
    return duplicates;
  };

  // ✅ ฟังก์ชันดึง HN สูงสุดจาก DB เพื่อเริ่มนับต่อ
  const fetchMaxHNFromDB = async (): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('hospital_number')
        .not('hospital_number', 'is', null)
        .neq('hospital_number', '')
        .order('hospital_number', { ascending: false })
        .limit(100); // ดึงมา 100 รายการล่าสุดเพื่อหา Max
      
      if (error) return 1;
      
      let maxNum = 0;
      // Regex เพื่อหา HN99-xxxx หรือ xxxx
      const hnRegex = /(?:HN99[-]?)?(\d{4})$/i; 
      
      data?.forEach(row => {
        const hn = row.hospital_number;
        if (hn) {
          const match = String(hn).match(hnRegex);
          if (match) {
            const num = parseInt(match[1]);
            if (num > maxNum) maxNum = num;
          }
        }
      });
      return maxNum + 1;
    } catch (err) {
      return 1;
    }
  };

  const buildPreview = useCallback(() => {
    const mapped = rawData.map((row, idx) => {
      const newRow: any = { _rowIndex: idx, _selected: false, _isDuplicate: false, _isWarning: false };
      Object.entries(headerMapping).forEach(([excelKey, dbKey]) => {
        if (dbKey) {
          const val = row[excelKey];
          // ใช้ formatDate ที่ปรับปรุงแล้ว
          newRow[dbKey] = dbKey === 'birth_date' ? formatThaiDate(val) : (val !== undefined && val !== null ? String(val).trim() : '');
        }
      });
      return newRow;
    });
    setPreviewData(mapped);
    setStep('preview');
    runPreviewValidation(mapped);
  }, [rawData, headerMapping]);

  const validateSingleRow = async (row: any, idx: number, duplicateMap: Map<string, number[]>) => {
    const rowErrors: string[] = [];
    let isDuplicate = false; // แดง (ซ้ำ Patient)
    let isWarning = false;   // เหลือง (ซ้ำแต่ไม่ใช่ Patient)

    // 1. ตรวจสอบเลขบัตรประชาชน
    if (row.id_card) {
      if (!validateThaiIdCard(row.id_card)) {
        rowErrors.push('❌ รูปแบบเลขบัตรประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก)');
      } else {
        const cleanId = cleanIdCard(row.id_card);
        try {
          const { exists, isPatient } = await checkPatientExists(cleanId);
          
          if (exists && isPatient) {
            rowErrors.push('🔍 พบข้อมูลซ้ำในระบบ: มีผู้ป่วยคนนี้อยู่แล้ว (Role: Patient) ไม่สามารถนำเข้าซ้ำได้');
            isDuplicate = true;
          } else if (exists && !isPatient) {
            rowErrors.push('⚠️ เลขบัตรนี้มีอยู่ในระบบแล้ว แต่ไม่ใช่ Role ผู้ป่วย (สามารถเลือกนำเข้าได้)');
            isWarning = true; // เปลี่ยนเป็น Warning เหลือง
          } else if (importedIds.has(cleanId)) {
            rowErrors.push('🔍 พบข้อมูลซ้ำในรอบนี้: เลขบัตรนี้เพิ่งถูกเลือกนำเข้า');
            isDuplicate = true;
          } else if (duplicateMap.has(cleanId) && duplicateMap.get(cleanId)!.length > 1) {
            rowErrors.push('❌ ซ้ำในไฟล์: เลขบัตรนี้ปรากฏมากกว่า 1 แถว');
            isDuplicate = true;
          }
        } catch { rowErrors.push('⚠️ ไม่สามารถตรวจสอบความซ้ำกับฐานข้อมูลได้'); }
      }
    }

    // 2. ตรวจสอบฟิลด์อื่นๆ (ถ้าไม่ซ้ำแบบ Red)
    if (!isDuplicate) {
      STANDARD_FIELDS.forEach(field => {
        if (field.required && (!row[field.key] || String(row[field.key]).trim() === '')) {
          rowErrors.push(`❌ ${field.label} เป็นฟิลด์บังคับ (ขาดหายไป)`);
        }
      });

      // วันเกิด ตรวจสอบ format หลังจากเติมปีแล้ว
      if (row.birth_date) {
        const dateRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/;
        const match = row.birth_date.match(dateRegex);
        if (!match) rowErrors.push('❌ วันเกิดรูปแบบไม่ถูกต้อง');
        else {
          const [, d, m, y] = match;
          if (parseInt(d) < 1 || parseInt(d) > 31) rowErrors.push('❌ วันเกิด: วันไม่ถูกต้อง (1-31)');
          if (parseInt(m) < 1 || parseInt(m) > 12) rowErrors.push('❌ วันเกิด: เดือนไม่ถูกต้อง (1-12)');
          if (parseInt(y) < 2400 || parseInt(y) > 2569) rowErrors.push('❌ วันเกิด: ปี พ.ศ. ไม่ถูกต้อง');
        }
      }

      if (row.province) {
        const pc = validateProvinceOnly(row.province, validProvinces);
        if (!pc.valid) rowErrors.push(...pc.errors.map(e => `❌ ${e}`));
      }

      const numericFields = [
        { key: 'current_weight', label: 'น้ำหนัก', min: 30, max: 200 },
        { key: 'height', label: 'ส่วนสูง', min: 100, max: 250 },
        { key: 'waist_circumference', label: 'รอบเอว', min: 26, max: 200 },
        { key: 'blood_sugar', label: 'ค่าน้ำตาล', min: 0, max: 1000 },
        { key: 'hba1c_level', label: 'ค่าHbA1c', min: 0, max: 20 }
      ];

      numericFields.forEach(({ key, label, min, max }) => {
        if (row[key] !== undefined && row[key] !== '' && row[key] !== null) {
          const val = String(row[key]).trim();
          if (!/^-?\d+(\.\d+)?$/.test(val)) {
            rowErrors.push(`❌ ${label}: มีตัวอักษรปน หรือรูปแบบไม่ถูกต้อง (ต้องเป็นตัวเลขเท่านั้น)`);
          } else {
            const num = parseFloat(val);
            if (num < min || num > max) rowErrors.push(`❌ ${label}: ค่าไม่อยู่ในช่วงที่กำหนด (${min}-${max})`);
          }
        }
      });
    }

    return { errors: rowErrors, isDuplicate, isWarning };
  };

  const runPreviewValidation = async (data: any[]) => {
    setIsInitialValidation(true);
    setValidationProgress(0);
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
      const result = await validateSingleRow(data[idx], idx, duplicateMap);
      errors[idx] = result.errors;
      updatedData[idx]._isDuplicate = result.isDuplicate;
      updatedData[idx]._isWarning = result.isWarning;
      setValidationProgress(Math.round(((idx + 1) / data.length) * 100));
    }

    setValidationErrors(errors);
    setPreviewData(updatedData);
    setIsInitialValidation(false);
    setValidationProgress(0);
  };

  // ✅ ฟังก์ชันสร้าง HN ชั่วคราว
  const handleFillMissingHN = async () => {
    setHnLoading(true);
    try {
      // อ่านค่า Max HN จาก DB ก่อน
      const startCounter = await fetchMaxHNFromDB();
      let counter = startCounter;
      
      setPreviewData(prev => {
        const updated = prev.map(row => {
          if (!row.hospital_number || row.hospital_number.trim() === '') {
            const hn = `HN99-${String(counter).padStart(4, '0')}`;
            counter++;
            return { ...row, hospital_number: hn };
          }
          return row;
        });
        return updated;
      });
    } catch (err) {
      setError('❌ ไม่สามารถดึงข้อมูล HN จากฐานข้อมูลได้');
    } finally {
      setHnLoading(false);
    }
  };

  const swapAllBirthDates = () => {
    setPreviewData(prev => {
      const updated = prev.map(row => row.birth_date ? { ...row, birth_date: swapDayMonth(row.birth_date) } : row);
      runPreviewValidation(updated);
      return updated;
    });
  };

  const cleanAllNames = () => {
    setPreviewData(prev => {
      const updated = prev.map(row => {
        if (row.first_name) {
          return { ...row, first_name: removeNamePrefixes(row.first_name) };
        }
        return row;
      });
      runPreviewValidation(updated);
      return updated;
    });
  };

  const startEdit = (rIdx: number, key: string) => { 
    if (previewData[rIdx]._isDuplicate) return; 
    setEditingCell({ row: rIdx, key }); 
    setEditValue(previewData[rIdx][key] || ''); 
  };

  const cancelEdit = () => setEditingCell(null);
  
  const saveEdit = () => {
    if (!editingCell) return;
    const { row, key } = editingCell;
    const finalValue = key === 'birth_date' ? formatThaiDate(editValue) : editValue.trim();
    
    setPreviewData(prev => { 
      const next = [...prev]; 
      next[row] = { ...next[row], [key]: finalValue }; 
      return next; 
    });

    const updatedRow = { ...previewData[row], [key]: finalValue };
    const duplicateMap = new Map<string, number[]>();
    previewData.forEach((r, i) => {
      if (r.id_card && validateThaiIdCard(r.id_card)) {
        const cleanId = cleanIdCard(r.id_card);
        if (!duplicateMap.has(cleanId)) duplicateMap.set(cleanId, []);
        duplicateMap.get(cleanId)!.push(i);
      }
    });

    validateSingleRow(updatedRow, row, duplicateMap).then(res => {
      setValidationErrors(prev => ({ ...prev, [row]: res.errors }));
      setPreviewData(prev => {
        const next = [...prev];
        next[row]._isDuplicate = res.isDuplicate;
        next[row]._isWarning = res.isWarning;
        return next;
      });
    });
    setEditingCell(null);
  };

  const toggleSelectRow = (idx: number) => {
    if (previewData[idx]._isDuplicate) return;
    const next = new Set(selectedRows);
    next.has(idx) ? next.delete(idx) : next.add(idx);
    setSelectedRows(next);
  };

  const selectAllValid = (checked: boolean) => {
    const validIndices = previewData.map((r, i) => i).filter(i => !previewData[i]._isDuplicate);
    if (checked) setSelectedRows(new Set(validIndices));
    else setSelectedRows(new Set());
  };

  const validSelectableCount = previewData.filter(r => !r._isDuplicate).length;
  const canImport = selectedRows.size > 0 && !Array.from(selectedRows).some(i => previewData[i]._isDuplicate);

  const handleExportToExcel = () => {
    if (!previewData || previewData.length === 0) { setError('ไม่มีข้อมูลสำหรับส่งออก'); return; }
    
    const wb = XLSX.utils.book_new();
    const sortedData = [...previewData].sort((a, b) => cleanIdCard(a.id_card).localeCompare(cleanIdCard(b.id_card)));
    
    const exportData = sortedData.map((row, idx) => {
      const hasErrors = validationErrors[idx]?.length > 0;
      const isDup = row._isDuplicate;
      const isWarning = row._isWarning;
      const isImported = row._status === 'success' || row._imported;
      return { 
        'ลำดับ': idx + 1, 'เลขบัตรประชาชน': row.id_card || '', 'ชื่อ': row.first_name || '', 'นามสกุล': row.last_name || '', 
        'HN': row.hospital_number || '', 'วันเกิด': row.birth_date || '', 'เพศ': row.gender || '', 'โรงพยาบาล': row.hospital_name || '', 
        'เบอร์โทรศัพท์': row.phone || '', 'น้ำหนัก(กก.)': row.current_weight || '', 'ส่วนสูง(ซม.)': row.height || '', 
        'โค้ชผู้ดูแล': row.coach_name || '-',
        'สถานะ': isImported ? '✅ เข้าระบบแล้ว' : (isDup ? '🔴 ซ้ำคนไข้(บล็อก)' : (isWarning ? '🟡 ซ้ำในระบบ(ผ่าน)' : (hasErrors ? '❌ มีข้อผิดพลาด' : '⏳ พร้อมนำเข้า'))),
        'ข้อผิดพลาด': hasErrors ? validationErrors[idx]?.join('; ') : ''
      };
    });
    
    const readyData = exportData.filter(r => r['สถานะ'] === '⏳ พร้อมนำเข้า' || r['สถานะ'] === '🟡 ซ้ำในระบบ(ผ่าน)');
    if (readyData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(readyData), '✅ พร้อมนำเข้า/แก้ไขถูกต้องแล้ว');

    const inSystemData = exportData.filter(r => r['สถานะ'] === '🔴 ซ้ำคนไข้(บล็อก)');
    if (inSystemData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inSystemData), '🔄 ซ้ำคนไข้ในระบบแล้ว');

    const importedData = exportData.filter(r => r['สถานะ'] === '✅ เข้าระบบแล้ว');
    if (importedData.length > 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(importedData), '✅ เข้าระบบแล้ว');

    const errorData = exportData.filter(r => r['สถานะ'] === '❌ มีข้อผิดพลาด');
    if (errorData.length > 0) {
      const wsError = XLSX.utils.json_to_sheet(errorData);
      wsError['!cols'] = exportData[0] ? Object.keys(exportData[0]).map(key => key === 'ข้อผิดพลาด' ? { wch: 60 } : { wch: 20 }) : [];
      XLSX.utils.book_append_sheet(wb, wsError, '❌ มีข้อผิดพลาด');
    }

    const summary = [
      ['📊 สรุปผลการนำเข้าข้อมูลผู้ป่วย'], ['วันที่ส่งออก:', new Date().toLocaleString('th-TH')], [''],
      ['จำนวนแถวทั้งหมด:', previewData.length], ['จำนวนที่พร้อมนำเข้า:', readyData.length],
      ['จำนวนที่ซ้ำคนไข้(บล็อก):', inSystemData.length], ['จำนวนที่เข้าระบบแล้ว:', importedData.length],
      ['จำนวนที่มีข้อผิดพลาด:', errorData.length]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), '📊 สรุปผล');
    XLSX.writeFile(wb, `รายงานนำเข้าผู้ป่วย_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`);
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

  const startImportProcess = async () => {
    setStep('fixing');
    setError('');
    const selectedData = Array.from(selectedRows).map(i => previewData[i]);
    const newFixData: Record<number, any> = {};

    for (const row of selectedData) {
      const idx = row._rowIndex;
      const hospMatch = findBestHospitalMatch(row.hospital_name, hospitals);
      const netHospId = hospMatch?.hospital.id;
      
      const networkCoaches = coaches.filter(c => {
        const cHospId = c.users?.hospital_id;
        const targetHosp = hospitals.find(h => h.id === netHospId);
        return cHospId === netHospId || cHospId === targetHosp?.parent_hospital_id || targetHosp?.parent_hospital_id === cHospId;
      });

      const isCoachEmpty = !row.coach_name || String(row.coach_name).trim() === '';
      const coachMatch = isCoachEmpty ? null : findBestCoachMatch(row.coach_name, networkCoaches);
      const needsFix = !hospMatch || (!isCoachEmpty && !coachMatch) || (coachMatch && coachMatch.similarity < 0.95);
      
      newFixData[idx] = {
        hospitalMatch: hospMatch, coachMatch: coachMatch,
        selectedHospitalId: hospMatch?.hospital.id, selectedCoachId: coachMatch?.coach.user_id,
        isCoachEmpty, isFixed: !needsFix
      };
    }
    setFixData(newFixData);
  };

  const applyFix = (idx: number) => {
    setFixData(prev => ({ ...prev, [idx]: { ...prev[idx], isFixed: true } }));
    const fd = fixData[idx];
    if (fd) {
      setPreviewData(prev => {
        const next = [...prev];
        if (fd.selectedHospitalId) { const h = hospitals.find(hosp => hosp.id === fd.selectedHospitalId); if (h) next[idx].hospital_name = h.name; }
        if (!fd.isCoachEmpty && fd.selectedCoachId) { const c = coaches.find(coach => coach.user_id === fd.selectedCoachId); if (c) next[idx].coach_name = c.full_name_th; }
        return next;
      });
    }
  };

  const areAllFixed = Object.values(fixData).every(fd => fd.isFixed);

  const saveToSystem = async () => {
    if (!areAllFixed) return;
    setStep('saving');
    setImportProgress({ current: 0, total: selectedRows.size });
    try {
      const selectedData = Array.from(selectedRows).map(i => previewData[i]);
      const result = await importPatientsBatch(selectedData, user.id);
      if (result.success > 0) {
        const newIds = selectedData.slice(0, result.success).map(d => cleanIdCard(d.id_card));
        setImportedIds(prev => { const next = new Set(prev); newIds.forEach(id => next.add(id)); return next; });
        setImportedPatients(selectedData.slice(0, result.success).map(d => ({
          id_card: d.id_card, first_name: d.first_name, last_name: d.last_name,
          hospital_number: d.hospital_number, hospital_name: d.hospital_name, coach_name: d.coach_name || '-'
        })));
        setStep('success');
      } else {
        setError(`❌ เกิดข้อผิดพลาด: ${result.errors[0]?.error || 'ไม่ทราบสาเหตุ'}`);
        setStep('fixing');
      }
    } catch (err: any) {
      setError(`❌ เกิดข้อผิดพลาด: ${err.message}`);
      setStep('fixing');
    } finally {
      setImportProgress({ current: 0, total: 0 });
    }
  };

  const backToPreview = () => {
    setSelectedRows(new Set()); setFixData({}); setImportedPatients([]);
    setStep('preview'); runPreviewValidation(previewData);
  };

  if (step === 'success') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-green-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center"><CheckCircle className="w-6 h-6 text-green-600" /></div>
            <div><h2 className="text-xl font-bold text-gray-800">บันทึกข้อมูลสำเร็จ!</h2><p className="text-sm text-gray-600">นำเข้าผู้ป่วยสำเร็จ {importedPatients.length} ราย</p></div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> รายชื่อผู้ป่วยที่นำเข้าระบบ:</h3>
          <div className="bg-gray-50 rounded-lg border max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0"><tr><th className="p-2 text-left">ชื่อ-นามสกุล</th><th className="p-2 text-left">HN</th><th className="p-2 text-left">บัตรประชาชน</th><th className="p-2 text-left">โรงพยาบาล</th><th className="p-2 text-left">โค้ช</th></tr></thead>
              <tbody>{importedPatients.map((p, idx) => (<tr key={idx} className="border-t hover:bg-gray-100"><td className="p-2">{p.first_name} {p.last_name}</td><td className="p-2">{p.hospital_number}</td><td className="p-2 font-mono text-xs">{p.id_card}</td><td className="p-2">{p.hospital_name}</td><td className="p-2">{p.coach_name}</td></tr>))}</tbody>
            </table>
          </div>
        </div>
        <div className="p-4 border-t bg-gray-50 flex gap-3">
          <button onClick={backToPreview} className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium flex items-center justify-center gap-2"><Upload className="w-4 h-4" /> นำเข้าเพิ่มเติม</button>
          <button onClick={() => router.push('/admin/patients')} className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 font-medium flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" /> ไปหน้ารายการผู้ป่วย</button>
        </div>
      </div>
    </div>
  );

  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;

  const displayFields = STANDARD_FIELDS.filter(f => Object.values(headerMapping).includes(f.key));
  const duplicateMappings = getDuplicateMappings();

  return (
    <div className="min-h-screen bg-gray-50">
      {isInitialValidation && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-80 shadow-lg text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-800 mb-1">กำลังตรวจสอบข้อมูลพื้นฐาน...</h3>
            <p className="text-sm text-gray-500 mb-3">กรุณารอสักครู่</p>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${validationProgress}%` }}></div>
            </div>
            <p className="text-xs text-gray-400 mt-2">{validationProgress}%</p>
          </div>
        </div>
      )}

      <div className="bg-white shadow-sm border-b border-gray-200 px-4 py-6">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"><ArrowLeft className="w-4 h-4" /> กลับ</button>
        <h1 className="text-3xl font-bold text-gray-800">📥 นำเข้าข้อมูลผู้ป่วยจาก Excel</h1>
        <p className="text-gray-600 mt-1">ตรวจสอบ แก้ไข และเลือกข้อมูลก่อนนำเข้าระบบ</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {error && (<div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" /><p className="text-sm text-red-700 flex-1">{error}</p><button onClick={() => setError('')} className="text-red-600">✕</button></div>)}

        {step === 'upload' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2"><span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-xs">1</span> อัปโหลดไฟล์</h2>
            <div onDrop={(e) => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); }} onDragOver={e => e.preventDefault()} onClick={() => document.getElementById('file-input')?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-500 cursor-pointer bg-gray-50">
              <input id="file-input" type="file" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} className="hidden" />
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" /><p className="text-gray-700 font-medium">ลากไฟล์มาวาง หรือคลิกเลือก</p><p className="text-sm text-gray-500">รองรับ .xlsx, .xls</p>
            </div>
            {loading && <div className="mt-4 flex justify-center items-center gap-2 text-blue-600"><Loader2 className="w-4 h-4 animate-spin" /> กำลังอ่านไฟล์...</div>}
          </div>
        )}

        {step === 'mapping' && (
          <div className="bg-white rounded-xl shadow p-6 border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><span className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-xs">2</span> ตรวจสอบการจับคู่คอลัมน์</h2>
              <button onClick={buildPreview} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-sm">ถัดไป: Preview & Validation →</button>
            </div>
            {Object.keys(duplicateMappings).length > 0 && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-yellow-800">⚠️ พบการจับคู่คอลัมน์ซ้ำซ้อน</h3>
                    <p className="text-sm text-yellow-700 mt-1">โปรดตรวจสอบฟิลด์ต่อไปนี้ที่มีการใช้คอลัมน์เดียวกันมากกว่า 1 ครั้ง:</p>
                    <ul className="mt-2 space-y-1">
                      {Object.entries(duplicateMappings).map(([fieldKey, excelCols]) => {
                        const fieldLabel = STANDARD_FIELDS.find(f => f.key === fieldKey)?.label || fieldKey;
                        return (
                          <li key={fieldKey} className="text-sm text-yellow-700">• <strong>{fieldLabel}</strong>: ใช้คอลัมน์ {excelCols.join(', ')}</li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              {excelHeaders.map(header => {
                const matchedKey = headerMapping[header];
                const isMatched = matchedKey && matchedKey !== '';
                const isDuplicateField = matchedKey && duplicateMappings[matchedKey] && duplicateMappings[matchedKey].length > 1;
                const isPhoneField = matchedKey && STANDARD_FIELDS.find(f => f.key === matchedKey)?.isPhoneField;
                
                return (
                  <div key={header} className={`p-4 border rounded-lg transition-all ${
                    isMatched ? (isDuplicateField || isPhoneField ? 'bg-yellow-50 border-yellow-400' : 'bg-green-50 border-green-400') : 'bg-red-50 border-red-300'
                  }`}>
                    <p className="text-xs font-medium text-gray-500 mb-1">📄 คอลัมน์ใน Excel</p>
                    <p className={`font-semibold truncate mb-2 ${isMatched ? (isDuplicateField || isPhoneField ? 'text-yellow-900' : 'text-green-900') : 'text-red-700'}`}>
                      {header} {isMatched && <span className="ml-2">{isDuplicateField || isPhoneField ? '⚠️' : '✅'}</span>}
                    </p>
                    <select value={headerMapping[header] || ''} onChange={e => setHeaderMapping(prev => ({ ...prev, [header]: e.target.value }))} className={`w-full px-3 py-2 border rounded-lg text-sm ${isMatched ? (isDuplicateField || isPhoneField ? 'border-yellow-400' : 'border-green-400') : 'border-red-300'}`}>
                      <option value="">-- ไม่จับคู่ --</option>
                      {STANDARD_FIELDS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    {(isDuplicateField || isPhoneField) && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <Phone className="w-3 h-3 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-yellow-700">{isDuplicateField ? `⚠️ ซ้ำซ้อน: ใช้ร่วมกับ ${duplicateMappings[matchedKey].filter(c => c !== header).join(', ')}` : '⚠️ โปรดตรวจสอบว่าเป็นเบอร์โทรศัพท์ที่ถูกต้อง'}</p>
                      </div>
                    )}
                    {!isMatched && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> ต้องเลือกด้วยมือ</p>}
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
                <button onClick={() => runPreviewValidation(previewData)} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm flex items-center gap-1"><RotateCcw className="w-3 h-3" /> ตรวจสอบใหม่</button>
                <button onClick={handleExportToExcel} className="px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm flex items-center gap-2"><Download className="w-4 h-4" /> นำออก Excel</button>
                <button onClick={() => setStep('mapping')} className="px-3 py-1.5 border rounded hover:bg-gray-50 text-sm flex items-center gap-1"><Edit3 className="w-3 h-3" /> แก้ไขการจับคู่</button>
                <button disabled={!canImport} onClick={startImportProcess} className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2">
                  <Upload className="w-4 h-4" /> นำเข้าที่เลือก ({selectedRows.size})
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
                            {field.key === 'first_name' && <button onClick={cleanAllNames} className="ml-1 text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded hover:bg-purple-200 flex items-center gap-1"><Scissors className="w-3 h-3" /> ลบคำนำหน้า</button>}
                            {field.isPhoneField && <Phone className="w-3 h-3 text-yellow-600 ml-1" title="⚠️ โปรดตรวจสอบว่าจับคู่ถูกต้องกับเบอร์โทรศัพท์ที่ต้องการ" />}
                            {field.key === 'hospital_number' && (
                              <button onClick={handleFillMissingHN} disabled={hnLoading} className="ml-1 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded hover:bg-orange-200 flex items-center gap-1 whitespace-nowrap disabled:opacity-50" title="สร้างเลข HN ชั่วคราวสำหรับช่องว่าง (HN99-xxxx)">
                                {hnLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Hash className="w-3 h-3" />}
                                {hnLoading ? 'กำลังอ่าน...' : 'สร้าง HN ชั่วคราว'}
                              </button>
                            )}
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
                      const isWarning = row._isWarning; // สถานะเหลือง
                      const isChecking = checkingDuplicates.has(rIdx);
                      const isDisabledSelect = isDup;

                      return (
                        <tr key={rIdx} className={`border-b hover:bg-gray-50 transition-colors ${
                          isDup ? 'bg-red-50/40 border-l-4 border-red-400' : 
                          (isWarning ? 'bg-yellow-50/40 border-l-4 border-yellow-400' : (hasError ? 'bg-orange-50/40 border-l-4 border-orange-400' : ''))
                        }`}>
                          <td className="p-3 text-center sticky left-0 bg-white z-10">
                            <input type="checkbox" checked={selectedRows.has(rIdx)} disabled={isDisabledSelect || isChecking} onChange={() => toggleSelectRow(rIdx)} className={`w-4 h-4 ${isDisabledSelect ? 'opacity-40 cursor-not-allowed' : ''}`} />
                          </td>
                          <td className="p-3 text-center sticky left-10 bg-white z-10">
                            {isDup ? <XCircle className="w-5 h-5 text-red-500 mx-auto" /> : isWarning ? <AlertTriangle className="w-5 h-5 text-yellow-500 mx-auto" /> : (hasError ? <AlertCircle className="w-5 h-5 text-orange-500 mx-auto" /> : <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />)}
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
                                  <div onClick={() => !isDup && startEdit(rIdx, field.key)} className={`px-2 py-1 min-h-[32px] rounded flex items-center gap-1 group ${!isDup ? 'cursor-text hover:bg-blue-50' : 'cursor-not-allowed opacity-60'}`}>
                                    <span className={`truncate max-w-[140px] ${!val ? 'text-gray-400 text-xs italic' : ''}`}>{val || 'คลิกเพื่อแก้ไข'}</span>
                                    {field.key === 'birth_date' && val && <button onClick={(e) => { if (isDup) return; e.stopPropagation(); const swapped = swapDayMonth(String(val)); setPreviewData(prev => { const next = [...prev]; next[rIdx] = { ...next[rIdx], birth_date: swapped }; return next; }); }} className="ml-1 p-1 text-xs text-blue-600 hover:bg-blue-100 rounded">🔁</button>}
                                    <Edit3 className="w-3 h-3 text-gray-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td className="p-3 align-top sticky right-0 bg-white z-10 border-l min-w-[280px]">
                            {isChecking ? <div className="flex items-center gap-1 text-xs text-blue-700"><Loader2 className="w-3 h-3 animate-spin" /> ตรวจสอบบัตร...</div> : 
                             (hasError || isDup || isWarning) ? (
                              <div className="space-y-1.5">
                                {validationErrors[rIdx]?.map((err, idx) => (
                                  <div key={idx} className={`flex items-start gap-1.5 text-xs px-2 py-1.5 rounded border ${isDup ? 'bg-red-50 text-red-700 border-red-100' : (isWarning ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : 'bg-orange-50 text-orange-800 border-orange-200')}`}>
                                    {isDup ? <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" /> : (isWarning ? <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />)} <span>{err}</span>
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

        {step === 'fixing' && (
          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <div className="p-6 border-b bg-gray-50">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2"><ShieldAlert className="w-5 h-5 text-blue-600" /> ตรวจสอบและแก้ไขข้อมูลเครือข่าย</h2>
              <p className="text-sm text-gray-500 mt-1">ระบบพบข้อมูลโรงพยาบาลหรือโค้ชที่ไม่ตรงกับฐานข้อมูล กรุณาตรวจสอบและปรับแก้ไขก่อนบันทึก</p>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {Array.from(selectedRows).map(idx => {
                const row = previewData[idx];
                const fd = fixData[idx];
                if (!fd) return null;
                const netHospId = fd.selectedHospitalId || fd.hospitalMatch?.hospital.id;
                const networkCoaches = coaches.filter(c => {
                  const cHospId = c.users?.hospital_id;
                  const targetHosp = hospitals.find(h => h.id === netHospId);
                  return cHospId === netHospId || cHospId === targetHosp?.parent_hospital_id || targetHosp?.parent_hospital_id === cHospId;
                });
                return (
                  <div key={idx} className="border rounded-xl p-4 bg-white shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div><p className="font-bold text-gray-800">แถวที่ {idx + 1}: {row.first_name} {row.last_name}</p><p className="text-xs text-gray-500">HN: {row.hospital_number} | บัตร: {row.id_card}</p></div>
                      {fd.isFixed && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> พร้อมบันทึก</span>}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Hospital className="w-3 h-3" /> โรงพยาบาล</label>
                        {fd.hospitalMatch ? (
                          <div className={`p-3 rounded-lg border ${fd.hospitalMatch.similarity < 0.95 ? 'bg-orange-50 border-orange-200' : 'bg-green-50 border-green-200'}`}>
                            <p className="text-sm text-gray-700">ชื่อที่นำเข้า: <strong>{row.hospital_name}</strong></p>
                            <p className="text-sm text-gray-700 mt-1">ระบบจับคู่: <strong>{fd.hospitalMatch.hospital.name}</strong> ({fd.hospitalMatch.hospital.code})</p>
                            {fd.hospitalMatch.similarity < 0.95 && <p className="text-xs text-orange-600 mt-1">⚠️ คำนำหน้า/ชื่อไม่ตรงกัน 100%</p>}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-xs text-red-500">❌ ไม่พบโรงพยาบาลในระบบ</p>
                            <select className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" value={fd.selectedHospitalId || ''} onChange={e => setFixData(prev => ({ ...prev, [idx]: { ...prev[idx], selectedHospitalId: e.target.value } }))}>
                              <option value="">-- เลือกโรงพยาบาล --</option>
                              {hospitals.map(h => <option key={h.id} value={h.id}>{h.name} ({h.code}) {h.type === 'main' ? '- แม่ข่าย' : '- ลูกข่าย'}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1"><UserCheck className="w-3 h-3" /> โค้ชผู้ดูแล</label>
                        {fd.isCoachEmpty ? (
                          <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">ℹ️ ไม่ระบุโค้ชในไฟล์ (ข้ามการตรวจสอบได้)</div>
                        ) : fd.coachMatch && fd.coachMatch.similarity >= 0.95 ? (
                          <div className="p-3 rounded-lg bg-green-50 border border-green-200"><p className="text-sm text-gray-700">ระบบจับคู่: <strong>{fd.coachMatch.coach.full_name_th}</strong></p></div>
                        ) : (
                          <div className="space-y-2">
                            {row.coach_name && <p className="text-xs text-gray-500">ชื่อที่นำเข้า: <strong>{row.coach_name}</strong></p>}
                            <select className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500" value={fd.selectedCoachId || ''} onChange={e => setFixData(prev => ({ ...prev, [idx]: { ...prev[idx], selectedCoachId: e.target.value } }))}>
                              <option value="">-- ไม่ใส่โค้ช --</option>
                              {networkCoaches.map(c => <option key={c.user_id} value={c.user_id}>{c.full_name_th} | {c.specialization_th || 'ไม่ระบุ'}</option>)}
                            </select>
                            {networkCoaches.length === 0 && <p className="text-xs text-red-400">ไม่พบโค้ชในเครือข่าย</p>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 pt-3 border-t flex justify-end">
                      <button onClick={() => applyFix(idx)} disabled={(!fd.selectedHospitalId && !fd.hospitalMatch) || (!fd.isCoachEmpty && !fd.selectedCoachId && !fd.coachMatch)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2"><Edit3 className="w-3 h-3" /> ปรับแก้ให้ถูกต้อง</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
              <button onClick={() => setStep('preview')} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-sm">ยกเลิก</button>
              <button onClick={saveToSystem} disabled={!areAllFixed} className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center gap-2">{areAllFixed ? <><CheckCircle className="w-4 h-4" /> บันทึกข้อมูลเข้าระบบ</> : <><AlertCircle className="w-4 h-4" /> กรุณาปรับแก้ข้อมูลให้ครบถ้วน</>}</button>
            </div>
          </div>
        )}

        {step === 'saving' && (
          <div className="bg-white rounded-xl shadow p-8 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800">กำลังบันทึกข้อมูล...</h3>
            <p className="text-gray-500 mt-2">ความคืบหน้า: {importProgress.current} / {importProgress.total}</p>
          </div>
        )}
      </div>
    </div>
  );
}