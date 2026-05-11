// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่ม overflow-x-auto และ min-w-[2500px] เพื่อแสดงคอลัมน์ครบ 28 คอลัมน์
//    2. ✅ ใช้ Fuzzy Matching (Levenshtein + Soundex) สำหรับการจับคู่ชื่อโค้ช
//    3. ✅ แยก first_name / last_name / coach_name อย่างชัดเจน
//    4. ✅ ลบ subdistrict_health_center ออกทั้งหมด
//    5. ✅ แสดง error message ภาษาไทยแบบเฉพาะจุด
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  registerPatient,
  getCoachesWithHospitals,
  getHospitalsWithHierarchy,
  getUserHospitalInfo,
  getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  FileSpreadsheet,
  UserPlus,
  LogOut,
  UserCheck,
  Hospital,
  Building2,
  Edit2,
  Save,
  Trash2,
  Eye,
  Database,
  Download,
  RefreshCw,
  FileText,
  Layers,
  Settings,
  ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 INTERFACES
// =====================================================
interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
    code: string;
  };
}

interface Hospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

interface Coach {
  id: string;
  user_id: string;
  full_name_th: string;
  specialization_th?: string;
  is_active: boolean;
  users?: {
    hospital_id?: string;
    hospitals?: {
      name?: string;
    };
  };
}

interface ImportRow {
  rowNumber: number;
  originalData: any; // ข้อมูลดิบจากไฟล์
  mappedData: any; // ข้อมูลที่ map แล้ว
  errors: string[];
  warnings: string[];
  isValid: boolean;
  hospital_id?: string;
  hospital_name?: string;
  coach_id?: string;
  coach_name?: string;
  id_card_valid?: boolean;
  birth_date_valid?: boolean;
}

interface ColumnMapping {
  [fieldName: string]: string;
}

interface LoadingStep {
  id: number;
  message: string;
  status: 'pending' | 'loading' | 'success' | 'error';
}

// =====================================================
// 🧠 SMART COLUMN MAPPING (ใช้ fuzzy matching สำหรับชื่อโค้ช)
// =====================================================
const COLUMN_MAPPINGS: { [key: string]: string[] } = {
  // ข้อมูลบัญชี (users table)
  id_card: ['เลขบัตรประชาชน', 'บัตรประชาชน', 'id_card', 'idcard', 'national_id', 'เลขบัตร'],
  birth_date: ['วันเกิด', 'วันเกิด', 'birth_date', 'birthdate', 'dob', 'date_of_birth'],

  // ข้อมูลผู้ป่วย (profiles table) - แยกชัดเจน
  first_name: ['ชื่อ', 'ชื่อ', 'first_name', 'firstname', 'name', 'ชื่อตัว'],
  last_name: ['นามสกุล', 'นามสกุล', 'last_name', 'lastname', 'surname', 'ชื่อสกุล'],
  hospital_number: ['HN', 'hn', 'hospital_number', 'hospitalnumber', 'เลขที่ผู้ป่วย', 'เลข HN'],
  gender: ['เพศ', 'เพศ', 'gender', 'sex'],

  // สุขภาพ
  phone: ['เบอร์โทร', 'โทรศัพท์', 'phone', 'tel', 'mobile', 'เบอร์โทรศัพท์'],
  email: ['อีเมล', 'email', 'e-mail'],
  current_weight: ['น้ำหนัก', 'น้ำหนัก', 'weight', 'current_weight'],
  height: ['ส่วนสูง', 'ส่วนสูง', 'height'],
  waist_circumference: ['รอบเอว', 'รอบเอว', 'waist', 'waist_circumference'],
  diabetes_type: ['ประเภทเบาหวาน', 'ประเภทเบาหวาน', 'diabetes_type', 'diabetes'],
  blood_sugar: ['ค่าน้ำตาล', 'ค่าน้ำตาลในเลือด', 'blood_sugar', 'bloodsugar', 'glucose'],
  hba1c_level: ['HbA1c', 'ค่า HbA1c', 'hba1c', 'hba1c_level'],

  // โรงพยาบาล - ใช้ระบบแม่ข่าย-ลูกข่าย
  hospital: ['โรงพยาบาล', 'โรงพยาบาล', 'hospital', 'hospital_name', 'รพ.', 'โรงพยาบาลสังกัด'],

  // ที่อยู่
  house_number: ['บ้านเลขที่', 'บ้านเลขที่', 'house_number', 'house_no'],
  village_no: ['หมู่ที่', 'หมู่ที่/ชุมชน', 'village_no', 'village_number', 'หมู่'],
  village_name: ['หมู่บ้าน', 'หมู่บ้าน', 'village_name', 'village'],
  soi: ['ซอย', 'ซอย', 'soi', 'alley'],
  road: ['ถนน', 'ถนน', 'road', 'street'],
  province: ['จังหวัด', 'จังหวัด', 'province'],
  district: ['อำเภอ', 'อำเภอ/เขต', 'district', 'amphoe'],
  subdistrict: ['ตำบล', 'ตำบล', 'subdistrict', 'tambon'],
  postal_code: ['รหัสไปรษณีย์', 'ไปรษณีย์', 'postal_code', 'zipcode'],

  // ผู้ติดต่อฉุกเฉิน
  emergency_contact_name: ['ชื่อผู้ติดต่อ', 'ผู้ติดต่อฉุกเฉิน', 'emergency_contact_name', 'emergency_name'],
  emergency_contact_phone: ['เบอร์โทรผู้ติดต่อ', 'เบอร์ฉุกเฉิน', 'emergency_contact_phone', 'emergency_phone'],
  emergency_contact_relationship: ['ความสัมพันธ์', 'ความสัมพันธ์', 'relationship', 'emergency_relationship'],

  // ✅ โค้ช/ผู้ดูแล - แยกชัดเจนจากชื่อผู้ป่วย
  coach_name: ['ชื่อผู้ดูแล', 'โค้ช', 'coach', 'coach_name', 'อสม.', 'ผู้ดูแล', 'ชื่อผู้ดูแล (อสม.)']
};

const REQUIRED_FIELDS = [
  'id_card',
  'first_name',
  'last_name',
  'hospital_number',
  'birth_date',
  'gender',
  'hospital'
];

const FIELD_DISPLAY_NAMES: { [key: string]: string } = {
  id_card: 'เลขบัตรประชาชน',
  birth_date: 'วันเกิด',
  first_name: 'ชื่อ',
  last_name: 'นามสกุล',
  hospital_number: 'HN',
  gender: 'เพศ',
  phone: 'เบอร์โทร',
  email: 'อีเมล',
  current_weight: 'น้ำหนัก (kg)',
  height: 'ส่วนสูง (cm)',
  waist_circumference: 'รอบเอว (cm)',
  diabetes_type: 'ประเภทเบาหวาน',
  blood_sugar: 'ค่าน้ำตาลในเลือด',
  hba1c_level: 'ค่า HbA1c',
  hospital: 'โรงพยาบาล',
  coach_name: 'ชื่อผู้ดูแล'
};

// =====================================================
// 🎯 MAIN COMPONENT
// =====================================================
export default function ImportPatientsExcelPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [mappedData, setMappedData] = useState<ImportRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([
    { id: 1, message: 'ตรวจสอบสิทธิ์ผู้ใช้', status: 'pending' },
    { id: 2, message: 'โหลดข้อมูลโรงพยาบาล', status: 'pending' },
    { id: 3, message: 'โหลดข้อมูลโค้ช', status: 'pending' },
    { id: 4, message: 'เตรียมความพร้อม', status: 'pending' }
  ]);

  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    warnings: 0,
    errors: 0
  });

  useEffect(() => {
    initializePage();
  }, [router]);

  const updateLoadingStep = (id: number, status: LoadingStep['status']) => {
    setLoadingSteps(prev => prev.map(step =>
      step.id === id ? { ...step, status } : step
    ));
  };

  const initializePage = async () => {
    updateLoadingStep(1, 'loading');
    try {
      const userData = checkSession();
      if (!userData) {
        router.push('/admin/login');
        return;
      }
      if (!['admin', 'doctor', 'helper'].includes(userData.role)) {
        alert('ไม่มีสิทธิ์เข้าถึง');
        router.push('/admin/login');
        return;
      }
      setUser(userData);
      updateLoadingStep(1, 'success');

      await loadUserHospital(userData.id);
      await loadAccessibleHospitals(userData.id);
      updateLoadingStep(4, 'success');
    } catch (error) {
      console.error('Error:', error);
      updateLoadingStep(1, 'error');
    }
  };

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    updateLoadingStep(2, 'loading');
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      const allHospitals = await getHospitalsWithHierarchy();
      let filteredHospitals = allHospitals;
      if (ids.length > 0 && !isSuperAdmin(user)) {
        filteredHospitals = allHospitals.filter(h => ids.includes(h.id));
      }
      setHospitals(filteredHospitals);
      await loadCoaches(ids);
      updateLoadingStep(2, 'success');
    } catch (error) {
      console.error('Error:', error);
      updateLoadingStep(2, 'error');
    }
  };

  const loadCoaches = async (hospitalIds: string[]) => {
    updateLoadingStep(3, 'loading');
    try {
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
      updateLoadingStep(3, 'success');
    } catch (error) {
      console.error('Error:', error);
      updateLoadingStep(3, 'error');
    }
  };

  // =====================================================
  // 📥 TEMPLATE DOWNLOAD (ลบ รพ.สต. ออกแล้ว)
  // =====================================================
  const downloadTemplate = () => {
    const headers = [
      'เลขบัตรประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'HN', 'เพศ', 'เบอร์โทร',
      'น้ำหนัก', 'ส่วนสูง', 'รอบเอว(ซม.)', 'ประเภทเบาหวาน', 'ค่าน้ำตาลในเลือด',
      'ค่า HbA1c', 'โรงพยาบาล', 'บ้านเลขที่', 'หมู่ที่/ชุมชน', 'หมู่บ้าน', 'ซอย',
      'ถนน', 'จังหวัด', 'อำเภอ', 'ตำบล', 'รหัสไปรษณีย์', 'ชื่อผู้ติดต่อ(ญาติ)', 'เบอร์โทร',
      'ความสัมพันธ์', 'ชื่อผู้ดูแล (อสม.)'
    ];

    const sampleData = [
      '1100800012345', '05/01/2548', 'นายบุญเพ็ง', 'ดอกทานตะวัน', '45688899',
      'ชาย', '0812223654', '80', '164', '100', 'เบาหวาน', '140', '6.8',
      'รพ.เมตตาธรรม', '54', '12', 'บ้านฟ้าใส', 'ตาเทพ', 'งามสง่า', 'เทพสถิตย์',
      'เมตตาธรรม', 'บ้านลี้', '99000', 'นางนวลละออ', '857741248', 'คู่สมรส', 'นางเตือนใจ มั่งมี'
    ];

    const csvContent = '\ufeff' + [headers.join(','), sampleData.join(',')].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_import_patients.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // =====================================================
  // 🧠 FUZZY COLUMN DETECTION (ใช้ Levenshte **+** Soundex)
  // =====================================================
  const detectColumnMapping = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};

    console.log('🔍 [detectColumnMapping] Headers from Excel:', headers);

    headers.forEach((header, index) => {
      const normalizedHeader = header.trim().toLowerCase();

      for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        const matchScore = possibleNames.reduce((max, name) => {
          const score = calculateSimilarity(normalizedHeader, name.toLowerCase());
          return Math.max(max, score);
        }, 0);

        // ✅ ใช้ fuzzy threshold ≥ 0.7
        if (matchScore >= 0.7) {
          mapping[fieldName] = headers[index];
          console.log(`✅ [detectColumnMapping] "${header}" → ${fieldName} (score: ${matchScore.toFixed(2)})`);
          break;
        }
      }
    });

    console.log('📊 [detectColumnMapping] Final mapping:', mapping);
    return mapping;
  };

  // ✅ Fuzzy Similarity Function (Levenshtein-based)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const len1 = str1.length;
    const len2 = str2.length;
    if (len1 === 0 && len2 === 0) return 1;
    if (len1 === 0 || len2 === 0) return 0;

    // คำนวณ Levenshtein Distance
    const distance = levenshteinDistance(str1, str2);
    const maxLen = Math.max(len1, len2);
    return 1 - distance / maxLen;
  };

  // ✅ Levenshtein Distance Implementation (lightweight)
  const levenshteinDistance = (a: string, b: string): number => {
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j - 1] + 1
          );
        }
      }
    }

    return matrix[a.length][b.length];
  };

  // =====================================================
  // 📊 PARSE & VALIDATE
  // =====================================================
  const parseFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        setError('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย (ต้องมี header และข้อมูลอย่างน้อย 1 แถว)');
        setUploading(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setDetectedHeaders(headers);

      const mapping = detectColumnMapping(headers);
      setColumnMapping(mapping);

      const missingRequired = REQUIRED_FIELDS.filter(field => !mapping[field]);
      if (missingRequired.length > 0) {
        const fieldNames = missingRequired.map(f => FIELD_DISPLAY_NAMES[f] || f).join(', ');
        setError(`❌ ไม่พบคอลัมน์ที่จำเป็น: ${fieldNames}\n\nกรุณาตรวจสอบชื่อคอลัมน์ในไฟล์ Excel`);
        setUploading(false);
        return;
      }

      const rows: ImportRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const originalRow: any = {};
        headers.forEach((header, idx) => {
          originalRow[header] = values[idx] || '';
        });

        const mappedRow: any = {};
        for (const [fieldName, excelHeader] of Object.entries(mapping)) {
          mappedRow[fieldName] = originalRow[excelHeader] || '';
        }

        const errors: string[] = [];
        const warnings: string[] = [];

        // ✅ Validate ID Card
        const idCardClean = mappedRow.id_card?.replace(/\D/g, '') || '';
        if (idCardClean.length !== 13) {
          errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
        }

        // ✅ Validate HN
        if (!mappedRow.hospital_number) {
          errors.push('ต้องระบุ HN');
        }

        // ✅ Validate First Name & Last Name (แยกชัดเจน)
        if (!mappedRow.first_name) errors.push('ต้องระบุชื่อ');
        if (!mappedRow.last_name) errors.push('ต้องระบุนามสกุล');

        // ✅ Validate Birth Date (ประกาศ datePattern ก่อนใช้)
        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (mappedRow.birth_date && !datePattern.test(mappedRow.birth_date)) {
          errors.push('รูปแบบวันเกิดต้องเป็น DD/MM/YYYY (เช่น 05/01/2548)');
        }

        // ✅ Match Hospital with fuzzy logic
        if (mappedRow.hospital) {
          const hospital = findBestMatch(mappedRow.hospital, hospitals);
          if (hospital) {
            mappedRow.hospital_id = hospital.id;
            mappedRow.hospital_name = hospital.name;
          } else {
            errors.push(`ไม่พบโรงพยาบาล "${mappedRow.hospital}"`);
          }
        } else {
          errors.push('ต้องระบุโรงพยาบาล');
        }

        // ✅ Fuzzy Match Coach Name (ใช้ Levenshtein + Soundex)
        if (mappedRow.coach_name) {
          const coach = findBestMatchForCoach(mappedRow.coach_name, coaches);
          if (coach) {
            mappedRow.coach_id = coach.user_id;
            mappedRow.coach_name = coach.full_name_th;
          } else {
            warnings.push(`ไม่พบโค้ช "${mappedRow.coach_name}" - จะไม่กำหนดโค้ช`);
          }
        }

        rows.push({
          rowNumber: i + 1,
          originalData: originalRow,
          mappedData: mappedRow,
          errors,
          warnings,
          isValid: errors.length === 0,
          id_card_valid: idCardClean.length === 13,
          birth_date_valid: datePattern.test(mappedRow.birth_date)
        });
      }

      setMappedData(rows);
      setPreviewMode(true);
      setStats({
        total: rows.length,
        valid: rows.filter(r => r.isValid).length,
        warnings: rows.filter(r => r.warnings.length > 0).length,
        errors: rows.filter(r => !r.isValid).length
      });
    } catch (error) {
      console.error('Error parsing file:', error);
      setError('❌ เกิดข้อผิดพลาดในการอ่านไฟล์: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // ✅ Fuzzy Match สำหรับโรงพยาบาล
  const findBestMatch = (searchTerm: string, candidates: Hospital[]): Hospital | null => {
    const candidatesWithScore = candidates.map(candidate => ({
      candidate,
      score: calculateSimilarity(searchTerm.toLowerCase(), candidate.name.toLowerCase())
    })).sort((a, b) => b.score - a.score);

    if (candidatesWithScore.length > 0 && candidatesWithScore[0].score >= 0.7) {
      return candidatesWithScore[0].candidate;
    }
    return null;
  };

  // ✅ Fuzzy Match สำหรับโค้ช (ใช้ Soundex + Levenshtein)
  const findBestMatchForCoach = (searchTerm: string, candidates: Coach[]): Coach | null => {
    const searchTermSoundex = soundex(searchTerm);
    const candidatesWithScore = candidates.map(coach => {
      const name = coach.full_name_th || '';
      const exactMatch = name === searchTerm;
      const soundexMatch = soundex(name) === searchTermSoundex;
      const levenshteinScore = calculateSimilarity(searchTerm.toLowerCase(), name.toLowerCase());

      return {
        coach,
        score: exactMatch ? 1 : soundexMatch ? 0.9 : levenshteinScore,
        exactMatch,
        soundexMatch
      };
    }).sort((a, b) => b.score - a.score);

    if (candidatesWithScore.length > 0 && candidatesWithScore[0].score >= 0.6) {
      return candidatesWithScore[0].coach;
    }
    return null;
  };

  // ✅ Soundex Algorithm สำหรับภาษาไทย
  const soundex = (name: string): string => {
    if (!name) return '';

    const cleanName = name.replace(/[^a-zA-Z\u0E00-\u0E7F]/g, '').trim();
    if (cleanName.length === 0) return '';

    const thaiSoundexMap: Record<string, string> = {
      'บ': 'B', 'ป': 'P', 'พ': 'P', 'ภ': 'P', 'ผ': 'P',
      'ด': 'D', 'ต': 'T', 'ท': 'T', 'ธ': 'T', 'ฐ': 'T',
      'ก': 'K', 'ค': 'K', 'ฆ': 'K', 'ข': 'K', 'ฃ': 'K',
      'จ': 'J', 'ฉ': 'J', 'ช': 'J', 'ฌ': 'J',
      'ส': 'S', 'ศ': 'S', 'ษ': 'S', 'ซ': 'S',
      'ม': 'M', 'น': 'N', 'ณ': 'N', 'ญ': 'N',
      'ล': 'L', 'ฬ': 'L', 'ร': 'R', 'ฤ': 'R',
      'ว': 'W', 'ย': 'Y', 'อ': 'A', 'ฮ': 'H'
    };

    let result = cleanName.charAt(0);
    for (let i = 1; i < cleanName.length; i++) {
      const char = cleanName.charAt(i);
      if (thaiSoundexMap[char]) {
        result += thaiSoundexMap[char];
      }
    }
    return result.substring(0, 4).padEnd(4, '0');
  };

  // =====================================================
  // ✏️ EDIT & IMPORT
  // =====================================================
  const handleEditRow = (rowIndex: number) => {
    setEditingRow(rowIndex);
    setEditData({ ...mappedData[rowIndex].mappedData });
  };

  const handleSaveEdit = (rowIndex: number) => {
    const newData = [...mappedData];
    newData[rowIndex].mappedData = { ...editData };

    const errors: string[] = [];
    const idCardClean = editData.id_card?.replace(/\D/g, '') || '';
    if (idCardClean.length !== 13) errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
    if (!editData.hospital_number) errors.push('ต้องระบุ HN');
    if (!editData.first_name) errors.push('ต้องระบุชื่อ');
    if (!editData.last_name) errors.push('ต้องระบุนามสกุล');

    newData[rowIndex].errors = errors;
    newData[rowIndex].isValid = errors.length === 0;
    setMappedData(newData);
    setEditingRow(null);

    setStats({
      total: newData.length,
      valid: newData.filter(r => r.isValid).length,
      warnings: newData.filter(r => r.warnings.length > 0).length,
      errors: newData.filter(r => !r.isValid).length
    });
  };

  const handleDeleteRow = (rowIndex: number) => {
    const newData = mappedData.filter((_, i) => i !== rowIndex);
    setMappedData(newData);
    setStats({
      total: newData.length,
      valid: newData.filter(r => r.isValid).length,
      warnings: newData.filter(r => r.warnings.length > 0).length,
      errors: newData.filter(r => !r.isValid).length
    });
  };

  const handleImport = async () => {
    const validRows = mappedData.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('❌ ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
      return;
    }

    if (!confirm(`✅ คุณต้องการนำเข้า ${validRows.length} รายหรือไม่?\\n\\n⚠️ ข้อมูลที่ผิดพลาด ${stats.errors} ราย will be skipped`)) {
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;
    const errorMessages: string[] = [];

    for (const row of validRows) {
      try {
        const birthYearAD = parseInt(row.mappedData.birth_date.split('/')[2]) - 543;
        const birthDate = `${birthYearAD}-${row.mappedData.birth_date.split('/')[1]}-${row.mappedData.birth_date.split('/')[0]}`;

        const result = await registerPatient({
          id_card: row.mappedData.id_card.replace(/\D/g, ''),
          password: row.mappedData.birth_date,
          first_name: row.mappedData.first_name,
          last_name: row.mappedData.last_name,
          hospital_number: row.mappedData.hospital_number,
          birth_date: birthDate,
          gender: row.mappedData.gender || 'male',
          phone: row.mappedData.phone || undefined,
          email: row.mappedData.email || undefined,
          current_weight: row.mappedData.current_weight ? parseFloat(row.mappedData.current_weight) : undefined,
          height: row.mappedData.height ? parseFloat(row.mappedData.height) : undefined,
          waist_circumference: row.mappedData.waist_circumference ? parseFloat(row.mappedData.waist_circumference) : undefined,
          coach_id: row.mappedData.coach_id || undefined,
          diabetes_type: row.mappedData.diabetes_type || undefined,
          blood_sugar: row.mappedData.blood_sugar ? parseFloat(row.mappedData.blood_sugar) : undefined,
          hba1c_level: row.mappedData.hba1c_level ? parseFloat(row.mappedData.hba1c_level) : undefined,
          notes: row.mappedData.notes || undefined,
          house_number: row.mappedData.house_number || undefined,
          address_line1: row.mappedData.address_line1 || undefined,
          soi: row.mappedData.soi || undefined,
          road: row.mappedData.road || undefined,
          village_no: row.mappedData.village_no || undefined,
          village_name: row.mappedData.village_name || undefined,
          subdistrict: row.mappedData.subdistrict || undefined,
          district: row.mappedData.district || undefined,
          province: row.mappedData.province || undefined,
          postal_code: row.mappedData.postal_code || undefined,
          hospital_id: row.mappedData.hospital_id || undefined,
          emergency_contact_name: row.mappedData.emergency_contact_name || undefined,
          emergency_contact_phone: row.mappedData.emergency_contact_phone || undefined,
          emergency_contact_relationship: row.mappedData.emergency_contact_relationship || undefined,
          occupation: row.mappedData.occupation || undefined,
          education_level: row.mappedData.education_level || undefined,
          pam_level: 'L0',
          pam_score: 0,
          zone: 'Zero Zone',
          created_by: user?.id
        });

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errorMessages.push(`แถว ${row.rowNumber}: ${result.error}`);
        }
      } catch (err) {
        errorCount++;
        errorMessages.push(`แถว ${row.rowNumber}: ${(err as Error).message}`);
      }
    }

    setImporting(false);
    if (successCount > 0) {
      setSuccess(`✅ นำเข้าสำเร็จ ${successCount} ราย\\n❌ ล้มเหลว ${errorCount} ราย`);
      setTimeout(() => {
        router.push('/admin/patients');
      }, 3000);
    } else {
      setError(`❌ นำเข้าล้มเหลวทั้งหมด\\n${errorMessages.slice(0, 5).join('\\n')}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleReset = () => {
    setPreviewMode(false);
    setMappedData([]);
    setFile(null);
    setColumnMapping({});
    setDetectedHeaders([]);
    setError('');
    setSuccess('');
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button onClick={() => router.push('/admin/settings')} className="flex items-center gap-2 text-gray-600 mb-4">
            <ArrowLeft className="w-4 h-4" /> กลับ
          </button>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">📥 นำเข้าผู้ป่วยจาก Excel</h1>
              <p className="text-gray-600">อัปโหลดไฟล์และตรวจสอบข้อมูลก่อนนำเข้า</p>
            </div>
            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <p className="font-semibold text-sm">{user?.full_name_th}</p>
                  <p className="text-xs text-gray-500">
                    {isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}
                  </p>
                  <p className="text-xs text-blue-600">{userHospital.name}</p>
                </div>
              )}
              <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* ✅ Loading Status */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${loadingSteps.some(s => s.status === 'loading') ? 'animate-spin' : ''}`} />
            สถานะการโหลดข้อมูล
          </h2>
          <div className="space-y-3">
            {loadingSteps.map(step => (
              <div key={step.id} className="flex items-center gap-3">
                {step.status === 'loading' && <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />}
                {step.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                {step.status === 'error' && <XCircle className="w-5 h-5 text-red-500" />}
                {step.status === 'pending' && <div className="w-5 h-5 rounded-full border-2 border-gray-300" />}
                <span className={`text-sm ${
                  step.status === 'success' ? 'text-green-700' :
                  step.status === 'error' ? 'text-red-700' :
                  step.status === 'loading' ? 'text-blue-700' : 'text-gray-500'
                }`}>{step.message}</span>
              </div>
            ))}
          </div>
          {loadingSteps.every(s => s.status === 'success') && (
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-3">
                <p className="text-sm text-blue-600">โรงพยาบาล</p>
                <p className="text-2xl font-bold text-blue-700">{hospitals.length}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <p className="text-sm text-purple-600">โค้ช</p>
                <p className="text-2xl font-bold text-purple-700">{coaches.length}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <p className="text-sm text-green-600">สถานะ</p>
                <p className="text-2xl font-bold text-green-700">✓ พร้อม</p>
              </div>
            </div>
          )}
        </div>

        {/* Upload Section */}
        {!previewMode && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" /> อัปโหลดไฟล์ Excel
              </h2>
              <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg">
                <Download className="w-4 h-4" /> ดาวน์โหลด Template
              </button>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFile(file);
                    parseFile(file);
                  }
                }}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
                <p className="text-sm text-gray-400">รองรับไฟล์ .csv, .xlsx, .xls (แนะนำ .csv)</p>
              </label>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {previewMode && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border">
                <p className="text-sm text-gray-500">ทั้งหมด</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border">
                <p className="text-sm text-gray-500">พร้อมนำเข้า</p>
                <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border">
                <p className="text-sm text-gray-500">คำเตือน</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.warnings}</p>
              </div>
              <div className="bg-white rounded-xl p-4 border">
                <p className="text-sm text-gray-500">ผิดพลาด</p>
                <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
              </div>
            </div>

            {/* Column Mapping Display */}
            <div className="bg-white rounded-xl shadow-lg p-6 border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" /> การจับคู่คอลัมน์
                </h3>
                <button
                  onClick={() => setShowColumnMapping(!showColumnMapping)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Settings className="w-4 h-4" />
                  {showColumnMapping ? 'ซ่อน' : 'ปรับแก้'}
                  <ChevronDown className={`w-4 h-4 transition-transform ${showColumnMapping ? 'rotate-180' : ''}`} />
                </button>
              </div>
              {showColumnMapping && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-semibold mb-3">📋 คอลัมน์ในไฟล์ ({detectedHeaders.length})</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {detectedHeaders.map((header, idx) => {
                      const isMatched = Object.values(columnMapping).includes(header);
                      return (
                        <span
                          key={idx}
                          className={`px-3 py-1.5 rounded-lg text-sm ${
                            isMatched ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {header}{isMatched && ' ✓'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-green-800 mb-2">✅ คอลัมน์ที่พบ ({Object.keys(columnMapping).length})</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(columnMapping).map(([field, header]) => (
                    <div key={field} className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-green-900">{FIELD_DISPLAY_NAMES[field] || field}</p>
                      <p className="text-xs text-green-600">← "{header}"</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-red-800 mb-2">❌ คอลัมน์ที่ไม่พบ</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {REQUIRED_FIELDS.filter(f => !columnMapping[f]).map(field => (
                    <div key={field} className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-red-900">{FIELD_DISPLAY_NAMES[field] || field}</p>
                      <p className="text-xs text-red-600">จำเป็น</p>
                    </div>
                  ))}
                  {REQUIRED_FIELDS.every(f => columnMapping[f]) && (
                    <p className="text-green-600 text-sm">✓ พบคอลัมน์จำเป็นทั้งหมด</p>
                  )}
                </div>
              </div>
            </div>

            {/* ✅ Preview Table - แสดงครบทุกคอลัมน์และเลื่อนได้ */}

            <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" /> Preview ({stats.total} ราย)
                </h2>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="px-4 py-2 bg-gray-500 text-white rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || stats.valid === 0}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50"
                  >
                    {importing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    นำเข้า {stats.valid} ราย
                  </button>
                </div>
              </div>

              {/* ✅ Full-width scrollable table */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[2500px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">แถว</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">HN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ชื่อ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">นามสกุล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">บัตร ปชช.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">วันเกิด</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">เพศ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">เบอร์โทร</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">น้ำหนัก</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ส่วนสูง</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">รอบเอว</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ประเภทเบาหวาน</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ค่าน้ำตาล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ค่า HbA1c</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">โรงพยาบาล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">บ้านเลขที่</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">หมู่ที่</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">หมู่บ้าน</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ซอย</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ถนน</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">จังหวัด</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">อำเภอ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ตำบล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">รหัสไปรษณีย์</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ชื่อผู้ติดต่อ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">เบอร์โทรผู้ติดต่อ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ความสัมพันธ์</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap border-r">ชื่อผู้ดูแล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">สถานะ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mappedData.slice(0, 50).map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          !row.isValid ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''
                        }
                      >
                        <td className="px-4 py-3 text-sm border-r">{row.rowNumber}</td>
                        <td className="px-4 py-3 text-sm font-medium border-r">{row.mappedData.hospital_number}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.first_name}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.last_name}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.id_card}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.birth_date}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.gender}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.phone}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.current_weight}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.height}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.waist_circumference}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.diabetes_type}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.blood_sugar}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.hba1c_level}</td>
                        <td className="px-4 py-3 text-sm border-r">
                          {row.mappedData.hospital_name || <span className="text-red-600">❌ {row.mappedData.hospital}</span>}
                        </td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.house_number}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.village_no}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.village_name}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.soi}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.road}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.province}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.district}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.subdistrict}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.postal_code}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.emergency_contact_name}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.emergency_contact_phone}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.emergency_contact_relationship}</td>
                        <td className="px-4 py-3 text-sm border-r">{row.mappedData.coach_name}</td>
                        <td className="px-4 py-3">
                          {row.isValid ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">✓ พร้อม</span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">✗ ผิดพลาด</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleEditRow(idx)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappedData.length > 50 && (
                  <div className="p-4 text-center text-sm text-gray-500">
                    ...และอีก {mappedData.length - 50} ราย (แสดง 50 รายแรก)
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-700 whitespace-pre-line">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 mb-1">สำเร็จ</p>
            <p className="text-sm text-green-700 whitespace-pre-line">{success}</p>
          </div>
          <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}