// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แสดงรายละเอียดคอลัมน์ที่พบในไฟล์ Excel
//    2. ✅ แสดงการจับคู่คอลัมน์ (Column Mapping) แบบละเอียด
//    3. ✅ แสดงคอลัมน์ที่จำเป็นและขาดหาย
//    4. ✅ แสดงตัวอย่างข้อมูล 3 แถวแรก
//    5. ✅ แสดง Error Messages ที่ชัดเจนกว่า
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
  Table,
  Info
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
  data: any;
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
  [key: string]: string; // mapped_name -> excel_header
}

interface ColumnInfo {
  fieldName: string;
  displayName: string;
  required: boolean;
  example: string;
  possibleNames: string[];
  matchedColumn?: string;
  isMatched: boolean;
}

// =====================================================
// 🧠 SMART COLUMN MAPPING
// =====================================================
const COLUMN_MAPPINGS: { [key: string]: string[] } = {
  id_card: ['เลขบัตรประชาชน', 'บัตรประชาชน', 'id_card', 'idcard', 'national_id', 'เลขบัตร'],
  birth_date: ['วันเกิด', 'วันเกิด', 'birth_date', 'birthdate', 'dob', 'date_of_birth'],
  first_name: ['ชื่อ', 'ชื่อ', 'first_name', 'firstname', 'name'],
  last_name: ['นามสกุล', 'นามสกุล', 'last_name', 'lastname', 'surname'],
  hospital_number: ['HN', 'hn', 'hospital_number', 'hospitalnumber', 'เลขที่ผู้ป่วย', 'เลข HN'],
  gender: ['เพศ', 'เพศ', 'gender', 'sex'],
  phone: ['เบอร์โทร', 'โทรศัพท์', 'phone', 'tel', 'mobile', 'เบอร์โทรศัพท์'],
  email: ['อีเมล', 'email', 'e-mail'],
  current_weight: ['น้ำหนัก', 'น้ำหนัก', 'weight', 'current_weight'],
  height: ['ส่วนสูง', 'ส่วนสูง', 'height'],
  waist_circumference: ['รอบเอว', 'รอบเอว', 'waist', 'waist_circumference'],
  diabetes_type: ['ประเภทเบาหวาน', 'ประเภทเบาหวาน', 'diabetes_type', 'diabetes'],
  blood_sugar: ['ค่าน้ำตาล', 'ค่าน้ำตาลในเลือด', 'blood_sugar', 'bloodsugar', 'glucose'],
  hba1c_level: ['HbA1c', 'ค่า HbA1c', 'hba1c', 'hba1c_level'],
  hospital: ['โรงพยาบาล', 'โรงพยาบาล', 'hospital', 'hospital_name', 'รพ.'],
  subdistrict_health_center: ['รพ.สต.', 'รพสต', 'subdistrict_health_center', 'health_center'],
  house_number: ['บ้านเลขที่', 'บ้านเลขที่', 'house_number', 'house_no'],
  village_no: ['หมู่ที่', 'หมู่ที่/ชุมชน', 'village_no', 'village_number', 'หมู่'],
  village_name: ['หมู่บ้าน', 'หมู่บ้าน', 'village_name', 'village'],
  soi: ['ซอย', 'ซอย', 'soi', 'alley'],
  road: ['ถนน', 'ถนน', 'road', 'street'],
  province: ['จังหวัด', 'จังหวัด', 'province'],
  district: ['อำเภอ', 'อำเภอ/เขต', 'district', 'amphoe'],
  subdistrict: ['ตำบล', 'ตำบล', 'subdistrict', 'tambon'],
  postal_code: ['รหัสไปรษณีย์', 'ไปรษณีย์', 'postal_code', 'zipcode'],
  emergency_contact_name: ['ชื่อผู้ติดต่อ', 'ผู้ติดต่อฉุกเฉิน', 'emergency_contact_name', 'emergency_name'],
  emergency_contact_phone: ['เบอร์โทรผู้ติดต่อ', 'เบอร์ฉุกเฉิน', 'emergency_contact_phone', 'emergency_phone'],
  emergency_contact_relationship: ['ความสัมพันธ์', 'ความสัมพันธ์', 'relationship', 'emergency_relationship'],
  coach_name: ['ชื่อผู้ดูแล', 'โค้ช', 'coach', 'coach_name', 'อสม.', 'ผู้ดูแล']
};

// ✅ คอลัมน์ที่จำเป็น (Required Fields)
const REQUIRED_FIELDS = [
  'id_card',
  'first_name',
  'last_name',
  'hospital_number',
  'birth_date',
  'gender',
  'hospital'
];

// ✅ ชื่อภาษาไทยสำหรับแสดงผล
const FIELD_DISPLAY_NAMES: { [key: string]: string } = {
  id_card: 'เลขบัตรประชาชน',
  birth_date: 'วันเกิด',
  first_name: 'ชื่อ',
  last_name: 'นามสกุล',
  hospital_number: 'HN (เลขที่ผู้ป่วย)',
  gender: 'เพศ',
  phone: 'เบอร์โทรศัพท์',
  email: 'อีเมล',
  current_weight: 'น้ำหนัก (kg)',
  height: 'ส่วนสูง (cm)',
  waist_circumference: 'รอบเอว (cm)',
  diabetes_type: 'ประเภทเบาหวาน',
  blood_sugar: 'ค่าน้ำตาลในเลือด',
  hba1c_level: 'ค่า HbA1c',
  hospital: 'โรงพยาบาล',
  subdistrict_health_center: 'รพ.สต.',
  house_number: 'บ้านเลขที่',
  village_no: 'หมู่ที่',
  village_name: 'หมู่บ้าน',
  soi: 'ซอย',
  road: 'ถนน',
  province: 'จังหวัด',
  district: 'อำเภอ',
  subdistrict: 'ตำบล',
  postal_code: 'รหัสไปรษณีย์',
  emergency_contact_name: 'ชื่อผู้ติดต่อฉุกเฉิน',
  emergency_contact_phone: 'เบอร์โทรผู้ติดต่อ',
  emergency_contact_relationship: 'ความสัมพันธ์',
  coach_name: 'ชื่อผู้ดูแล (อสม.)'
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
  const [rawData, setRawData] = useState<any[]>([]);
  const [mappedData, setMappedData] = useState<ImportRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [columnInfos, setColumnInfos] = useState<ColumnInfo[]>([]);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelSampleData, setExcelSampleData] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // ✅ สรุปสถิติ
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    warnings: 0,
    errors: 0
  });

  useEffect(() => {
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
    loadUserHospital(userData.id);
    loadAccessibleHospitals(userData.id);
  }, [router]);

  // =====================================================
  // 📥 DATA LOADING
  // =====================================================
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  const loadAccessibleHospitals = async (userId: string) => {
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
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const loadCoaches = async (hospitalIds: string[]) => {
    try {
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
    } catch (error) {
      console.error('Error loading coaches:', error);
    }
  };

  // =====================================================
  // 🧠 SMART COLUMN DETECTION
  // =====================================================
  const detectColumnMapping = (headers: string[]): { mapping: ColumnMapping, infos: ColumnInfo[] } => {
    const mapping: ColumnMapping = {};
    const infos: ColumnInfo[] = [];
    
    console.log('🔍 [detectColumnMapping] Headers from Excel:', headers);
    
    // ✅ ตรวจสอบทุก field ที่ระบบรองรับ
    Object.entries(COLUMN_MAPPINGS).forEach(([fieldName, possibleNames]) => {
      let matchedColumn: string | undefined = undefined;
      let isMatched = false;
      
      // หาว่า header นี้ตรงกับ field ไหน
      for (const header of headers) {
        const normalizedHeader = header.trim().toLowerCase();
        
        if (possibleNames.some(name => 
          name.toLowerCase() === normalizedHeader || 
          normalizedHeader.includes(name.toLowerCase()) ||
          name.toLowerCase().includes(normalizedHeader)
        )) {
          mapping[fieldName] = header; // เก็บชื่อจริงจาก Excel
          matchedColumn = header;
          isMatched = true;
          console.log('✅ [detectColumnMapping] Matched:', fieldName, '->', header);
          break;
        }
      }
      
      infos.push({
        fieldName,
        displayName: FIELD_DISPLAY_NAMES[fieldName] || fieldName,
        required: REQUIRED_FIELDS.includes(fieldName),
        example: possibleNames[0],
        possibleNames,
        matchedColumn,
        isMatched
      });
    });
    
    console.log('📊 [detectColumnMapping] Column Mapping:', mapping);
    console.log('📊 [detectColumnMapping] Column Infos:', infos);
    
    return { mapping, infos };
  };

  // =====================================================
  // 📊 PARSE & VALIDATE
  // =====================================================
  const parseFile = async (file: File) => {
    setUploading(true);
    setError('');
    setSuccess('');
    
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setError('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย (ต้องมี header และข้อมูลอย่างน้อย 1 แถว)');
        setUploading(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setExcelHeaders(headers);
      
      console.log('📋 [parseFile] Excel Headers:', headers);
      console.log('📋 [parseFile] Total lines:', lines.length);
      
      // ✅ แสดงตัวอย่างข้อมูล 3 แถวแรก
      const sampleData = [];
      for (let i = 1; i < Math.min(4, lines.length); i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        sampleData.push(row);
      }
      setExcelSampleData(sampleData);
      
      // ✅ Smart Column Mapping
      const { mapping, infos } = detectColumnMapping(headers);
      setColumnMapping(mapping);
      setColumnInfos(infos);
      
      // ✅ ตรวจสอบ Required Fields
      const missingRequired = infos.filter(info => info.required && !info.isMatched);
      
      if (missingRequired.length > 0) {
        const fieldNames = missingRequired.map(info => info.displayName).join(', ');
        setError(`❌ ไม่พบคอลัมน์ที่จำเป็น: ${fieldNames}\n\nกรุณาตรวจสอบชื่อคอลัมน์ในไฟล์ Excel`);
        setUploading(false);
        return;
      }
      
      // ✅ Parse ข้อมูล
      const rows: ImportRow[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });
        
        // ✅ Map กับ field ที่รู้จัก
        const mappedRow: any = {};
        for (const [fieldName, excelHeader] of Object.entries(mapping)) {
          mappedRow[fieldName] = row[excelHeader] || '';
        }
        
        // ✅ Validate
        const errors: string[] = [];
        const warnings: string[] = [];
        
        // ตรวจสอบ ID Card
        const idCardClean = mappedRow.id_card?.replace(/\D/g, '') || '';
        if (idCardClean.length !== 13) {
          errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
        }
        
        // ตรวจสอบ HN
        if (!mappedRow.hospital_number) {
          errors.push('ต้องระบุ HN');
        }
        
        // ตรวจสอบชื่อ-นามสกุล
        if (!mappedRow.first_name) errors.push('ต้องระบุชื่อ');
        if (!mappedRow.last_name) errors.push('ต้องระบุนามสกุล');
        
        // ตรวจสอบโรงพยาบาล
        if (mappedRow.hospital) {
          const hospital = hospitals.find(h => 
            h.name === mappedRow.hospital || 
            h.code === mappedRow.hospital ||
            h.name.includes(mappedRow.hospital)
          );
          
          if (hospital) {
            mappedRow.hospital_id = hospital.id;
            mappedRow.hospital_name = hospital.name;
          } else {
            errors.push(`ไม่พบโรงพยาบาล "${mappedRow.hospital}"`);
          }
        } else {
          errors.push('ต้องระบุโรงพยาบาล');
        }
        
        // ตรวจสอบโค้ช
        if (mappedRow.coach_name) {
          const coach = coaches.find(c => 
            c.full_name_th === mappedRow.coach_name ||
            c.full_name_th.includes(mappedRow.coach_name)
          );
          
          if (coach) {
            mappedRow.coach_id = coach.user_id;
            mappedRow.coach_name = coach.full_name_th;
          } else {
            warnings.push(`ไม่พบโค้ช "${mappedRow.coach_name}" - จะไม่กำหนดโค้ช`);
          }
        }
        
        // ตรวจสอบวันเกิด
        if (mappedRow.birth_date) {
          const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
          if (!datePattern.test(mappedRow.birth_date)) {
            errors.push('รูปแบบวันเกิดต้องเป็น DD/MM/YYYY');
          }
        }
        
        rows.push({
          rowNumber: i + 1,
          data: mappedRow,
          errors,
          warnings,
          isValid: errors.length === 0,
          id_card_valid: idCardClean.length === 13,
          birth_date_valid: /^\d{2}\/\d{2}\/\d{4}$/.test(mappedRow.birth_date)
        });
      }
      
      setMappedData(rows);
      setRawData(rows);
      setPreviewMode(true);
      
      // ✅ คำนวณสถิติ
      setStats({
        total: rows.length,
        valid: rows.filter(r => r.isValid).length,
        warnings: rows.filter(r => r.warnings.length > 0).length,
        errors: rows.filter(r => !r.isValid).length
      });
      
      setSuccess(`✅ โหลดไฟล์สำเร็จ! พบข้อมูล ${rows.length} ราย`);
      
    } catch (error) {
      console.error('Error parsing file:', error);
      setError('❌ เกิดข้อผิดพลาดในการอ่านไฟล์: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  // =====================================================
  // ✏️ EDIT ROW
  // =====================================================
  const handleEditRow = (rowIndex: number) => {
    setEditingRow(rowIndex);
    setEditData({ ...mappedData[rowIndex].data });
  };

  const handleSaveEdit = (rowIndex: number) => {
    const newData = [...mappedData];
    newData[rowIndex].data = { ...editData };
    
    // Re-validate
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
    
    // Update stats
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

  // =====================================================
  // 💾 IMPORT
  // =====================================================
  const handleImport = async () => {
    const validRows = mappedData.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('❌ ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
      return;
    }

    if (!confirm(`✅ คุณต้องการนำเข้า ${validRows.length} รายหรือไม่?\n\n⚠️ ข้อมูลที่ผิดพลาด ${stats.errors} ราย will be skipped`)) {
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of validRows) {
      try {
        const birthYearAD = parseInt(row.data.birth_date.split('/')[2]) - 543;
        const birthDate = `${birthYearAD}-${row.data.birth_date.split('/')[1]}-${row.data.birth_date.split('/')[0]}`;

        const result = await registerPatient({
          id_card: row.data.id_card.replace(/\D/g, ''),
          password: `${row.data.birth_date.split('/')[0]}-${row.data.birth_date.split('/')[1]}-${row.data.birth_date.split('/')[2]}`,
          first_name: row.data.first_name,
          last_name: row.data.last_name,
          hospital_number: row.data.hospital_number,
          birth_date: birthDate,
          gender: row.data.gender || 'male',
          phone: row.data.phone || undefined,
          email: row.data.email || undefined,
          current_weight: row.data.current_weight ? parseFloat(row.data.current_weight) : undefined,
          height: row.data.height ? parseFloat(row.data.height) : undefined,
          waist_circumference: row.data.waist_circumference ? parseFloat(row.data.waist_circumference) : undefined,
          coach_id: row.data.coach_id || undefined,
          diabetes_type: row.data.diabetes_type || undefined,
          blood_sugar: row.data.blood_sugar ? parseFloat(row.data.blood_sugar) : undefined,
          hba1c_level: row.data.hba1c_level ? parseFloat(row.data.hba1c_level) : undefined,
          notes: row.data.notes || undefined,
          house_number: row.data.house_number || undefined,
          address_line1: row.data.address_line1 || undefined,
          soi: row.data.soi || undefined,
          road: row.data.road || undefined,
          village_no: row.data.village_no || undefined,
          village_name: row.data.village_name || undefined,
          subdistrict: row.data.subdistrict || undefined,
          district: row.data.district || undefined,
          province: row.data.province || undefined,
          postal_code: row.data.postal_code || undefined,
          hospital_id: row.data.hospital_id || undefined,
          emergency_contact_name: row.data.emergency_contact_name || undefined,
          emergency_contact_phone: row.data.emergency_contact_phone || undefined,
          emergency_contact_relationship: row.data.emergency_contact_relationship || undefined,
          occupation: row.data.occupation || undefined,
          education_level: row.data.education_level || undefined,
          pam_level: 'L0',
          pam_score: 0,
          zone: 'Zero Zone',
          created_by: user?.id
        });

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
      }
    }

    setImporting(false);
    alert(`✅ นำเข้าสำเร็จ ${successCount} ราย\n❌ ล้มเหลว ${errorCount} ราย`);

    if (successCount > 0) {
      setTimeout(() => {
        router.push('/admin/patients');
      }, 2000);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.push('/admin/settings')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📥 นำเข้าผู้ป่วยจาก Excel
              </h1>
              <p className="text-gray-600">อัปโหลดไฟล์และตรวจสอบข้อมูลก่อนนำเข้า</p>
            </div>

            <div className="flex items-center gap-4">
              {userHospital && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600">{userHospital.name}</span>
                    </div>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        
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

        {/* Upload Section */}
        {!previewMode && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                อัปโหลดไฟล์ Excel
              </h2>
            </div>
            
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    setFile(selectedFile);
                    parseFile(selectedFile);
                  }
                }}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">
                  คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                </p>
                <p className="text-sm text-gray-400">
                  รองรับไฟล์ .xlsx, .xls, .csv
                </p>
              </label>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {previewMode && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Database className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ทั้งหมด</p>
                    <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">พร้อมนำเข้า</p>
                    <p className="text-2xl font-bold text-green-600">{stats.valid}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">คำเตือน</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.warnings}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">ผิดพลาด</p>
                    <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ Column Mapping Display - แสดงรายละเอียดคอลัมน์ */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Table className="w-5 h-5 text-blue-600" />
                รายละเอียดคอลัมน์ที่พบในไฟล์ Excel
              </h3>
              
              {/* ✅ คอลัมน์ทั้งหมดที่พบ */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">📋 คอลัมน์ทั้งหมดที่พบ ({excelHeaders.length} คอลัมน์)</h4>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex flex-wrap gap-2">
                    {excelHeaders.map((header, idx) => {
                      const matchedInfo = columnInfos.find(info => info.matchedColumn === header);
                      return (
                        <span 
                          key={idx}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            matchedInfo 
                              ? matchedInfo.required
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : 'bg-blue-100 text-blue-800 border border-blue-300'
                              : 'bg-gray-200 text-gray-600 border border-gray-300'
                          }`}
                        >
                          {header}
                          {matchedInfo && ' ✓'}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ✅ คอลัมน์ที่จับคู่สำเร็จ */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                  คอลัมน์ที่จับคู่สำเร็จ ({columnInfos.filter(c => c.isMatched).length} คอลัมน์)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {columnInfos.filter(c => c.isMatched).map((info) => (
                    <div key={info.fieldName} className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-green-900">{info.displayName}</span>
                        {info.required && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                            จำเป็น
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-green-700 mb-1">
                        <span className="font-medium">พบคอลัมน์:</span> 
                        <span className="ml-1 font-mono bg-green-100 px-2 py-0.5 rounded">"{info.matchedColumn}"</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ✅ คอลัมน์ที่จับไม่ได้ */}
              {columnInfos.filter(c => !c.isMatched).length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-600" />
                    คอลัมน์ที่ไม่พบในไฟล์ ({columnInfos.filter(c => !c.isMatched).length} คอลัมน์)
                  </h4>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {columnInfos.filter(c => !c.isMatched).map((info) => (
                        <div key={info.fieldName} className="bg-white border border-red-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-red-900">{info.displayName}</span>
                            {info.required && (
                              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium">
                                จำเป็น ⚠️
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-red-700">
                            <span className="font-medium">ชื่อที่ระบบรองรับ:</span>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {info.possibleNames.slice(0, 5).map((name, idx) => (
                                <span key={idx} className="bg-red-100 px-2 py-0.5 rounded text-xs">
                                  {name}
                                </span>
                              ))}
                              {info.possibleNames.length > 5 && (
                                <span className="text-red-600 text-xs">+{info.possibleNames.length - 5} อื่นๆ</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ✅ ตัวอย่างข้อมูลจากไฟล์ */}
              {excelSampleData.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-purple-600" />
                    ตัวอย่างข้อมูลจากไฟล์ (3 แถวแรก)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          {excelHeaders.map((header, idx) => (
                            <th key={idx} className="px-3 py-2 text-left border border-gray-200">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {excelSampleData.map((row, rowIdx) => (
                          <tr key={rowIdx} className={rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            {excelHeaders.map((header, colIdx) => (
                              <td key={colIdx} className="px-3 py-2 border border-gray-200 text-gray-600">
                                {row[header] || '-'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  Preview ข้อมูล ({stats.total} ราย)
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setPreviewMode(false);
                      setMappedData([]);
                      setFile(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                  >
                    <Trash2 className="w-4 h-4" />
                    ยกเลิก
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || stats.valid === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        กำลังนำเข้า...
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        นำเข้า {stats.valid} ราย
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">แถว</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ชื่อ-นามสกุล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">บัตร ปชช.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">โรงพยาบาล</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">โค้ช</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mappedData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={`${!row.isValid ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''}`}>
                        <td className="px-4 py-3 text-sm text-gray-500">{row.rowNumber}</td>
                        <td className="px-4 py-3 text-sm font-medium">{row.data.hospital_number}</td>
                        <td className="px-4 py-3 text-sm">{row.data.first_name} {row.data.last_name}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={row.id_card_valid ? 'text-green-600' : 'text-red-600'}>
                            {row.data.id_card}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {row.data.hospital_name || (
                            <span className="text-red-600">❌ {row.data.hospital}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {row.data.coach_name || (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {row.isValid ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                              ✓ พร้อม
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                              ✗ ผิดพลาด
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleEditRow(idx)}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                              title="แก้ไข"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteRow(idx)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                              title="ลบ"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
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
    </div>
  );
}