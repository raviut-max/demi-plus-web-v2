// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แก้ไข Modal แสดงครบทุกฟิลด์ (27+ ฟิลด์)
//    2. ✅ แก้ไข handleSaveEdit ให้บันทึกทุกฟิลด์
//    3. ✅ เพิ่ม Scroll ใน Modal สำหรับข้อมูลเยอะ
//    4. ✅ จัดกลุ่มฟิลด์เป็นหมวดหมู่ชัดเจน
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
  ChevronDown,
  User,
  Heart,
  MapPin,
  Phone
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
  originalData: any;
  mappedData: any;
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
  current_weight: ['น้ำหนัก', 'น้ำหนัก', 'weight', 'current_weight', 'น้ำหนัก (kg)'],
  height: ['ส่วนสูง', 'ส่วนสูง', 'height', 'ส่วนสูง (cm)'],
  waist_circumference: ['รอบเอว', 'รอบเอว', 'waist', 'waist_circumference', 'รอบเอว(ซม.)'],
  diabetes_type: ['ประเภทเบาหวาน', 'ประเภทเบาหวาน', 'diabetes_type', 'diabetes'],
  blood_sugar: ['ค่าน้ำตาล', 'ค่าน้ำตาลในเลือด', 'blood_sugar', 'bloodsugar', 'glucose'],
  hba1c_level: ['HbA1c', 'ค่า HbA1c', 'hba1c', 'hba1c_level', 'ค่า HbA1c ล่าสุด'],
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
  emergency_contact_name: 'ชื่อผู้ติดต่อ',
  emergency_contact_phone: 'เบอร์โทรผู้ติดต่อ',
  emergency_contact_relationship: 'ความสัมพันธ์',
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

  const downloadTemplate = () => {
    const headers = [
      'เลขบัตรประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'HN', 'เพศ', 'เบอร์โทร',
      'น้ำหนัก', 'ส่วนสูง', 'รอบเอว(ซม.)', 'ประเภทเบาหวาน', 'ค่าน้ำตาลในเลือด',
      'ค่า HbA1c ล่าสุด (ถ้ามี)', 'โรงพยาบาล', 'รพ.สต.', 'บ้านเลขที่', 'หมู่ที่/ชุมชน',
      'หมู่บ้าน', 'ซอย', 'ถนน', 'จังหวัด', 'อำเภอ', 'ตำบล', 'รหัสไปรษณีย์',
      'ชื่อผู้ติดต่อ(ญาติ)', 'เบอร์โทร', 'ความสัมพันธ์', 'ชื่อผู้ดูแล (อสม.)'
    ];

    const sampleData = [
      '1100800012345', '05/01/2548', 'นายบุญเพ็ง', 'ดอกทานตะวัน', '45688899',
      'ชาย', '0812223654', '80', '164', '100', 'เบาหวาน', '140', '6.8',
      'รพ.เมตตาธรรม', 'รพ.สต.บ้านฟ้าใส', '54', '12', 'บ้านฟ้าใส', 'ตาเทพ',
      'งามสง่า', 'เทพสถิตย์', 'เมตตาธรรม', 'บ้านลี้', '99000', 'นางนวลละออ',
      '857741248', 'คู่สมรส', 'นางเตือนใจ มั่งมี'
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

  const detectColumnMapping = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};
    headers.forEach((header, index) => {
      const normalizedHeader = header.trim().toLowerCase();
      for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        if (possibleNames.some(name =>
          name.toLowerCase() === normalizedHeader ||
          normalizedHeader.includes(name.toLowerCase()) ||
          name.toLowerCase().includes(normalizedHeader)
        )) {
          mapping[fieldName] = headers[index];
          break;
        }
      }
    });
    return mapping;
  };

  const parseFile = async (file: File) => {
    setUploading(true);
    setError('');
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        setError('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย');
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
        setError(`❌ ไม่พบคอลัมน์ที่จำเป็น: ${fieldNames}`);
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

        const idCardClean = mappedRow.id_card?.replace(/\D/g, '') || '';
        if (idCardClean.length !== 13) errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
        if (!mappedRow.hospital_number) errors.push('ต้องระบุ HN');
        if (!mappedRow.first_name) errors.push('ต้องระบุชื่อ');
        if (!mappedRow.last_name) errors.push('ต้องระบุนามสกุล');

        if (mappedRow.hospital) {
          const hospital = hospitals.find(h =>
            h.name === mappedRow.hospital ||
            h.code === mappedRow.hospital
          );
          if (hospital) {
            mappedRow.hospital_id = hospital.id;
            mappedRow.hospital_name = hospital.name;
          } else {
            errors.push(`ไม่พบโรงพยาบาล "${mappedRow.hospital}"`);
          }
        }

        if (mappedRow.coach_name) {
          const coach = coaches.find(c => c.full_name_th === mappedRow.coach_name);
          if (coach) {
            mappedRow.coach_id = coach.user_id;
            mappedRow.coach_name = coach.full_name_th;
          } else {
            warnings.push(`ไม่พบโค้ช "${mappedRow.coach_name}"`);
          }
        }

        rows.push({
          rowNumber: i + 1,
          originalData: originalRow,
          mappedData: mappedRow,
          errors,
          warnings,
          isValid: errors.length === 0,
          id_card_valid: idCardClean.length === 13
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
      setError('❌ เกิดข้อผิดพลาดในการอ่านไฟล์');
    } finally {
      setUploading(false);
    }
  };

  // ✅ แก้ไข handleEditRow - แสดงทุกฟิลด์
  const handleEditRow = (rowIndex: number) => {
    setEditingRow(rowIndex);
    // ✅ สำเนาข้อมูลทั้งหมด ไม่ใช่แค่บางฟิลด์
    setEditData({ ...mappedData[rowIndex].mappedData });
  };

  // ✅ แก้ไข handleSaveEdit - บันทึกทุกฟิลด์
  const handleSaveEdit = (rowIndex: number) => {
    const newData = [...mappedData];
    // ✅ อัปเดตข้อมูลทั้งหมดที่แก้ไข
    newData[rowIndex].mappedData = { ...editData };

    // ✅ Re-validate
    const errors: string[] = [];
    const idCardClean = editData.id_card?.replace(/\D/g, '') || '';
    if (idCardClean.length !== 13) errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
    if (!editData.hospital_number) errors.push('ต้องระบุ HN');
    if (!editData.first_name) errors.push('ต้องระบุชื่อ');
    if (!editData.last_name) errors.push('ต้องระบุนามสกุล');
    if (!editData.hospital_id) errors.push('ต้องเลือกโรงพยาบาล');

    newData[rowIndex].errors = errors;
    newData[rowIndex].isValid = errors.length === 0;

    setMappedData(newData);
    setEditingRow(null);

    // ✅ Update stats
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
    if (!confirm(`✅ นำเข้า ${validRows.length} ราย?`)) return;

    setImporting(true);
    let successCount = 0;
    for (const row of validRows) {
      try {
        const birthYearAD = parseInt(row.mappedData.birth_date.split('/')[2]) - 543;
        const birthDate = `${birthYearAD}-${row.mappedData.birth_date.split('/')[1]}-${row.mappedData.birth_date.split('/')[0]}`;

        await registerPatient({
          id_card: row.mappedData.id_card.replace(/\D/g, ''),
          password: row.mappedData.birth_date,
          first_name: row.mappedData.first_name,
          last_name: row.mappedData.last_name,
          hospital_number: row.mappedData.hospital_number,
          birth_date: birthDate,
          gender: row.mappedData.gender || 'male',
          hospital_id: row.mappedData.hospital_id,
          coach_id: row.mappedData.coach_id,
          phone: row.mappedData.phone,
          current_weight: row.mappedData.current_weight ? parseFloat(row.mappedData.current_weight) : undefined,
          height: row.mappedData.height ? parseFloat(row.mappedData.height) : undefined,
          pam_level: 'L0',
          pam_score: 0,
          zone: 'Zero Zone',
          created_by: user?.id
        });
        successCount++;
      } catch (err) {
        console.error('Import error:', err);
      }
    }
    setImporting(false);
    alert(`✅ สำเร็จ ${successCount} ราย`);
    if (successCount > 0) setTimeout(() => router.push('/admin/patients'), 2000);
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
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
  };

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
        <div className="max-w-[1920px] mx-auto px-4 py-6">
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
                  <p className="text-xs text-gray-500">{isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}</p>
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

      <div className="max-w-[1920px] mx-auto px-4 py-8 space-y-6">

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

            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center">
              <input
                type="file"
                accept=".csv"
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
                <p className="text-lg font-medium">คลิกเพื่อเลือกไฟล์ CSV</p>
                <p className="text-sm text-gray-400">แปลงไฟล์ Excel เป็น CSV ก่อนอัปโหลด</p>
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

            {/* Column Mapping */}
            <div className="bg-white rounded-xl shadow-lg p-6 border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" /> การจับคู่คอลัมน์
                </h3>
                <button
                  onClick={() => setShowColumnMapping(!showColumnMapping)}
                  className="flex items-center gap-2 text-sm text-blue-600"
                >
                  <Settings className="w-4 h-4" />
                  {showColumnMapping ? 'ซ่อน' : 'ปรับแก้'}
                </button>
              </div>

              {showColumnMapping && (
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-sm font-semibold mb-3">📋 คอลัมน์ในไฟล์ ({detectedHeaders.length})</h4>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {detectedHeaders.map((header, idx) => {
                      const isMatched = Object.values(columnMapping).includes(header);
                      return (
                        <span key={idx} className={`px-3 py-1.5 rounded-lg text-sm ${isMatched ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
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

              <div className="mt-6 pt-6 border-t">
                <h4 className="text-sm font-semibold mb-2">📋 คอลัมน์ทั้งหมดในไฟล์ ({detectedHeaders.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {detectedHeaders.map((header, idx) => {
                    const isMatched = Object.values(columnMapping).includes(header);
                    return (
                      <span key={idx} className={`px-3 py-1.5 rounded-lg text-sm ${isMatched ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {header}{isMatched && ' ✓'}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" /> Preview ({stats.total} ราย)
                </h2>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="px-4 py-2 bg-gray-500 text-white rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={handleImport} disabled={importing || stats.valid === 0} className="px-6 py-2 bg-green-500 text-white rounded-lg disabled:opacity-50">
                    {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                    นำเข้า {stats.valid} ราย
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full min-w-[2000px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      {detectedHeaders.map((header, idx) => (
                        <th key={idx} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r whitespace-nowrap">
                          {header}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mappedData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={!row.isValid ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''}>
                        {detectedHeaders.map((header, hIdx) => {
                          const value = row.originalData[header] || '-';
                          return (
                            <td key={hIdx} className="px-4 py-3 text-sm border-r">
                              {value}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3">
                          {row.isValid ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">✓ พร้อม</span>
                          ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">✗ ผิดพลาด</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleEditRow(idx)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded">
                            <Edit2 className="w-4 h-4" />
                          </button>
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

      {/* ✅ Edit Modal - แก้ไขแล้ว แสดงครบทุกฟิลด์ */}
      {editingRow !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">✏️ แก้ไขแถวที่ {mappedData[editingRow]?.rowNumber}</h2>
              <button onClick={() => setEditingRow(null)} className="text-gray-500 hover:text-gray-700">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* ✅ Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-2">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

                {/* 📋 ข้อมูลส่วนตัว */}
                <div className="col-span-full">
                  <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                    <User className="w-5 h-5" /> ข้อมูลส่วนตัว
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium mb-1">HN *</label>
                      <input type="text" value={editData.hospital_number || ''} onChange={(e) => setEditData({ ...editData, hospital_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">เลขบัตรประชาชน *</label>
                      <input type="text" value={editData.id_card || ''} onChange={(e) => setEditData({ ...editData, id_card: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ชื่อ *</label>
                      <input type="text" value={editData.first_name || ''} onChange={(e) => setEditData({ ...editData, first_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">นามสกุล *</label>
                      <input type="text" value={editData.last_name || ''} onChange={(e) => setEditData({ ...editData, last_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">วันเกิด</label>
                      <input type="text" value={editData.birth_date || ''} onChange={(e) => setEditData({ ...editData, birth_date: e.target.value })} className="w-full px-3 py-2 border rounded-lg" placeholder="DD/MM/YYYY" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">เพศ</label>
                      <select value={editData.gender || ''} onChange={(e) => setEditData({ ...editData, gender: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                        <option value="">-- เลือก --</option>
                        <option value="male">ชาย</option>
                        <option value="female">หญิง</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">เบอร์โทร</label>
                      <input type="text" value={editData.phone || ''} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">อีเมล</label>
                      <input type="email" value={editData.email || ''} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                </div>

                {/* 💊 ข้อมูลสุขภาพ */}
                <div className="col-span-full">
                  <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                    <Heart className="w-5 h-5" /> ข้อมูลสุขภาพ
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-purple-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium mb-1">น้ำหนัก (kg)</label>
                      <input type="number" value={editData.current_weight || ''} onChange={(e) => setEditData({ ...editData, current_weight: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ส่วนสูง (cm)</label>
                      <input type="number" value={editData.height || ''} onChange={(e) => setEditData({ ...editData, height: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">รอบเอว (cm)</label>
                      <input type="number" value={editData.waist_circumference || ''} onChange={(e) => setEditData({ ...editData, waist_circumference: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ประเภทเบาหวาน</label>
                      <select value={editData.diabetes_type || ''} onChange={(e) => setEditData({ ...editData, diabetes_type: e.target.value })} className="w-full px-3 py-2 border rounded-lg">
                        <option value="">-- เลือก --</option>
                        <option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option>
                        <option value="เบาหวาน">เบาหวาน</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ค่าน้ำตาล</label>
                      <input type="number" value={editData.blood_sugar || ''} onChange={(e) => setEditData({ ...editData, blood_sugar: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ค่า HbA1c</label>
                      <input type="number" value={editData.hba1c_level || ''} onChange={(e) => setEditData({ ...editData, hba1c_level: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                </div>

                {/* 🏥 โรงพยาบาลและที่อยู่ */}
                <div className="col-span-full">
                  <h3 className="font-semibold text-pink-800 mb-3 flex items-center gap-2">
                    <MapPin className="w-5 h-5" /> โรงพยาบาลและที่อยู่
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-pink-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium mb-1">โรงพยาบาล *</label>
                      <select value={editData.hospital_id || ''} onChange={(e) => {
                        const hospital = hospitals.find(h => h.id === e.target.value);
                        setEditData({ ...editData, hospital_id: e.target.value, hospital_name: hospital?.name });
                      }} className="w-full px-3 py-2 border rounded-lg">
                        <option value="">-- เลือก --</option>
                        {hospitals.map(h => (
                          <option key={h.id} value={h.id}>{h.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">รพ.สต.</label>
                      <input type="text" value={editData.subdistrict_health_center || ''} onChange={(e) => setEditData({ ...editData, subdistrict_health_center: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">บ้านเลขที่</label>
                      <input type="text" value={editData.house_number || ''} onChange={(e) => setEditData({ ...editData, house_number: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">หมู่ที่</label>
                      <input type="text" value={editData.village_no || ''} onChange={(e) => setEditData({ ...editData, village_no: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">หมู่บ้าน</label>
                      <input type="text" value={editData.village_name || ''} onChange={(e) => setEditData({ ...editData, village_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ซอย</label>
                      <input type="text" value={editData.soi || ''} onChange={(e) => setEditData({ ...editData, soi: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ถนน</label>
                      <input type="text" value={editData.road || ''} onChange={(e) => setEditData({ ...editData, road: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">จังหวัด</label>
                      <input type="text" value={editData.province || ''} onChange={(e) => setEditData({ ...editData, province: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">อำเภอ</label>
                      <input type="text" value={editData.district || ''} onChange={(e) => setEditData({ ...editData, district: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ตำบล</label>
                      <input type="text" value={editData.subdistrict || ''} onChange={(e) => setEditData({ ...editData, subdistrict: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">รหัสไปรษณีย์</label>
                      <input type="text" value={editData.postal_code || ''} onChange={(e) => setEditData({ ...editData, postal_code: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                  </div>
                </div>

                {/* 👥 ผู้ติดต่อและโค้ช */}
                <div className="col-span-full">
                  <h3 className="font-semibold text-orange-800 mb-3 flex items-center gap-2">
                    <Phone className="w-5 h-5" /> ผู้ติดต่อและโค้ช
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 bg-orange-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium mb-1">ชื่อผู้ติดต่อ</label>
                      <input type="text" value={editData.emergency_contact_name || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_name: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">เบอร์โทรผู้ติดต่อ</label>
                      <input type="text" value={editData.emergency_contact_phone || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_phone: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ความสัมพันธ์</label>
                      <input type="text" value={editData.emergency_contact_relationship || ''} onChange={(e) => setEditData({ ...editData, emergency_contact_relationship: e.target.value })} className="w-full px-3 py-2 border rounded-lg" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">ชื่อผู้ดูแล (โค้ช)</label>
                      <select value={editData.coach_id || ''} onChange={(e) => {
                        const coach = coaches.find(c => c.user_id === e.target.value);
                        setEditData({ ...editData, coach_id: e.target.value, coach_name: coach?.full_name_th });
                      }} className="w-full px-3 py-2 border rounded-lg">
                        <option value="">-- เลือก --</option>
                        {coaches.map(c => (
                          <option key={c.user_id} value={c.user_id}>{c.full_name_th}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* ✅ Action Buttons */}
            <div className="flex gap-4 mt-6 pt-4 border-t">
              <button onClick={() => handleSaveEdit(editingRow)} className="flex-1 bg-green-500 text-white py-3 rounded-lg flex items-center justify-center gap-2">
                <Save className="w-4 h-4" /> บันทึก
              </button>
              <button onClick={() => setEditingRow(null)} className="flex-1 bg-gray-500 text-white py-3 rounded-lg">
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error/Success Messages */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 max-w-md">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button onClick={() => setError('')} className="text-red-600 hover:text-red-800">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {success && (
        <div className="fixed bottom-4 right-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3 max-w-md">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-green-800 mb-1">สำเร็จ</p>
            <p className="text-sm text-green-700">{success}</p>
          </div>
          <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}