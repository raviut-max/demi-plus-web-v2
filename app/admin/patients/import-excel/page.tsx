// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ เพิ่มปุ่มดาวน์โหลด Template Excel
//    2. ✅ แสดง Loading Status แบบละเอียด (กำลังโหลดอะไร)
//    3. ✅ แสดง Column Mapping ที่ตรวจพบ
//    4. ✅ แสดง Progress แต่ละขั้นตอน
//    5. ✅ แก้ไขการอ่านไฟล์ Excel (.xlsx) ให้ถูกต้อง
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
  Users,
  MapPin
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
  [key: string]: string;
}

interface LoadingStatus {
  step: number;
  message: string;
  isLoading: boolean;
  isComplete: boolean;
  isError: boolean;
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
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  
  // ✅ Loading Status
  const [loadingStatus, setLoadingStatus] = useState<LoadingStatus[]>([
    { step: 1, message: 'ตรวจสอบสิทธิ์ผู้ใช้', isLoading: false, isComplete: false, isError: false },
    { step: 2, message: 'โหลดข้อมูลโรงพยาบาล', isLoading: false, isComplete: false, isError: false },
    { step: 3, message: 'โหลดข้อมูลโค้ช', isLoading: false, isComplete: false, isError: false },
    { step: 4, message: 'เตรียมความพร้อม', isLoading: false, isComplete: false, isError: false }
  ]);

  // ✅ สรุปสถิติ
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    warnings: 0,
    errors: 0
  });

  useEffect(() => {
    initializePage();
  }, [router]);

  // =====================================================
  // 📥 INITIALIZATION
  // =====================================================
  const initializePage = async () => {
    updateLoadingStatus(1, { isLoading: true });
    
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
      
      console.log('👤 [Import] User:', userData);
      setUser(userData);
      updateLoadingStatus(1, { isComplete: true, isLoading: false });
      
      // ✅ โหลดข้อมูลโรงพยาบาล
      await loadAccessibleHospitals(userData.id);
      
      // ✅ โหลดข้อมูลโค้ช
      await loadCoaches(accessibleHospitalIds);
      
      updateLoadingStatus(4, { isComplete: true });
      console.log('✅ [Import] Page initialized successfully');
      
    } catch (error) {
      console.error('❌ [Import] Initialization error:', error);
      updateLoadingStatus(1, { isError: true, isLoading: false });
    }
  };

  const updateLoadingStatus = (step: number, updates: Partial<LoadingStatus>) => {
    setLoadingStatus(prev => prev.map(status => 
      status.step === step ? { ...status, ...updates } : status
    ));
  };

  // =====================================================
  // 📥 DATA LOADING
  // =====================================================
  const loadAccessibleHospitals = async (userId: string) => {
    updateLoadingStatus(2, { isLoading: true });
    
    try {
      console.log('🏥 [Import] Loading hospitals...');
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      
      const allHospitals = await getHospitalsWithHierarchy();
      let filteredHospitals = allHospitals;
      
      if (ids.length > 0 && !isSuperAdmin(user)) {
        filteredHospitals = allHospitals.filter(h => ids.includes(h.id));
      }
      
      setHospitals(filteredHospitals);
      console.log('✅ [Import] Hospitals loaded:', filteredHospitals.length);
      updateLoadingStatus(2, { isComplete: true, isLoading: false });
      
    } catch (error) {
      console.error('❌ [Import] Hospital loading error:', error);
      updateLoadingStatus(2, { isError: true, isLoading: false });
    }
  };

  const loadCoaches = async (hospitalIds: string[]) => {
    updateLoadingStatus(3, { isLoading: true });
    
    try {
      console.log('👨‍⚕️ [Import] Loading coaches...');
      const allCoaches = await getCoachesWithHospitals(hospitalIds);
      setCoaches(allCoaches);
      console.log('✅ [Import] Coaches loaded:', allCoaches.length);
      updateLoadingStatus(3, { isComplete: true, isLoading: false });
      
    } catch (error) {
      console.error('❌ [Import] Coach loading error:', error);
      updateLoadingStatus(3, { isError: true, isLoading: false });
    }
  };

  // =====================================================
  // 📥 TEMPLATE DOWNLOAD
  // =====================================================
  const downloadTemplate = () => {
    console.log('📥 [Template] Downloading template...');
    
    const headers = [
      'เลขบัตรประชาชน',
      'วันเกิด',
      'ชื่อ',
      'นามสกุล',
      'HN',
      'เพศ',
      'เบอร์โทร',
      'น้ำหนัก',
      'ส่วนสูง',
      'รอบเอว(ซม.)',
      'ประเภทเบาหวาน',
      'ค่าน้ำตาลในเลือด',
      'ค่า HbA1c ล่าสุด (ถ้ามี)',
      'โรงพยาบาล',
      'รพ.สต.',
      'บ้านเลขที่',
      'หมู่ที่/ชุมชน',
      'หมู่บ้าน',
      'ซอย',
      'ถนน',
      'จังหวัด',
      'อำเภอ',
      'ตำบล',
      'รหัสไปรษณีย์',
      'ชื่อผู้ติดต่อ(ญาติ)',
      'เบอร์โทร',
      'ความสัมพันธ์',
      'ชื่อผู้ดูแล (อสม.)'
    ];

    const sampleData = [
      '1100800012345',
      '05/01/2548',
      'นายบุญเพ็ง',
      'ดอกทานตะวัน',
      '45688899',
      'ชาย',
      '0812223654',
      '80',
      '164',
      '100',
      'เบาหวาน',
      '140',
      '6.8',
      'รพ.เมตตาธรรม',
      'รพ.สต.บ้านฟ้าใส',
      '54',
      '12',
      'บ้านฟ้าใส',
      'ตาเทพ',
      'งามสง่า',
      'เทพสถิตย์',
      'เมตตาธรรม',
      'บ้านลี้',
      '99000',
      'นางนวลละออ สมควร',
      '857741248',
      'คู่สมรส',
      'นางเตือนใจ มั่งมี'
    ];

    const csvContent = [headers.join(','), sampleData.join(',')].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template_import_patients.csv';
    link.click();
    URL.revokeObjectURL(url);
    
    console.log('✅ [Template] Template downloaded successfully');
  };

  // =====================================================
  // 🧠 SMART COLUMN DETECTION
  // =====================================================
  const detectColumnMapping = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};
    
    console.log('🧠 [ColumnMapping] Detecting columns from', headers.length, 'headers');
    
    headers.forEach((header, index) => {
      const normalizedHeader = header.trim().toLowerCase();
      
      for (const [fieldName, possibleNames] of Object.entries(COLUMN_MAPPINGS)) {
        if (possibleNames.some(name => 
          name.toLowerCase() === normalizedHeader || 
          normalizedHeader.includes(name.toLowerCase()) ||
          name.toLowerCase().includes(normalizedHeader)
        )) {
          mapping[fieldName] = headers[index];
          console.log(`✅ [ColumnMapping] Mapped: ${fieldName} <- ${headers[index]}`);
          break;
        }
      }
    });

    const mappedCount = Object.keys(mapping).length;
    const requiredCount = REQUIRED_FIELDS.length;
    const missingRequired = REQUIRED_FIELDS.filter(field => !mapping[field]);
    
    console.log('📊 [ColumnMapping] Summary:', {
      total: headers.length,
      mapped: mappedCount,
      required: requiredCount,
      missing: missingRequired
    });

    return mapping;
  };

  // =====================================================
  // 📊 PARSE & VALIDATE
  // =====================================================
  const parseFile = async (file: File) => {
    setUploading(true);
    console.log('📂 [ParseFile] Starting file parse:', file.name, file.size, 'bytes');
    
    try {
      // ✅ ตรวจสอบประเภทไฟล์
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      console.log('📂 [ParseFile] File extension:', fileExtension);
      
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        alert('⚠️ ไฟล์ Excel (.xlsx/.xls) ต้องแปลงเป็น CSV ก่อน\n\nวิธีทำ:\n1. เปิดไฟล์ใน Excel\n2. เลือก File → Save As\n3. เลือกประเภทไฟล์เป็น "CSV (Comma delimited)"\n4. บันทึกและลองใหม่อีกครั้ง');
        setUploading(false);
        return;
      }
      
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      console.log('📊 [ParseFile] Total lines:', lines.length);
      
      if (lines.length < 2) {
        alert('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย (ต้องมี header และข้อมูลอย่างน้อย 1 แถว)');
        setUploading(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setDetectedHeaders(headers);
      console.log('📋 [ParseFile] Detected headers:', headers);
      
      // ✅ Smart Column Mapping
      const mapping = detectColumnMapping(headers);
      setColumnMapping(mapping);
      
      // ✅ ตรวจสอบ Required Fields
      const missingRequired = REQUIRED_FIELDS.filter(field => !mapping[field]);
      if (missingRequired.length > 0) {
        const fieldNames = missingRequired.map(field => {
          const displayName = FIELD_DISPLAY_NAMES[field] || field;
          return displayName;
        }).join(', ');
        
        alert(`❌ ไม่พบคอลัมน์ที่จำเป็น: ${fieldNames}\n\nกรุณาตรวจสอบไฟล์ Template`);
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
      
      console.log('✅ [ParseFile] Parse completed:', {
        total: rows.length,
        valid: stats.valid,
        errors: stats.errors
      });
      
    } catch (error) {
      console.error('❌ [ParseFile] Error:', error);
      alert('❌ เกิดข้อผิดพลาดในการอ่านไฟล์: ' + (error as Error).message);
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

  const handleReset = () => {
    setPreviewMode(false);
    setMappedData([]);
    setRawData([]);
    setFile(null);
    setColumnMapping({});
    setDetectedHeaders([]);
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
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
        
        {/* ✅ Loading Status */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${loadingStatus.some(s => s.isLoading) ? 'animate-spin' : ''}`} />
            สถานะการโหลดข้อมูล
          </h2>
          
          <div className="space-y-3">
            {loadingStatus.map((status) => (
              <div key={status.step} className="flex items-center gap-3">
                <div className="w-6 h-6 flex items-center justify-center">
                  {status.isLoading ? (
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                  ) : status.isComplete ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : status.isError ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                  )}
                </div>
                <span className={`text-sm ${
                  status.isComplete ? 'text-green-700' :
                  status.isError ? 'text-red-700' :
                  status.isLoading ? 'text-blue-700' :
                  'text-gray-500'
                }`}>
                  {status.message}
                </span>
              </div>
            ))}
          </div>

          {/* ✅ ข้อมูลที่โหลดเสร็จ */}
          {loadingStatus.every(s => s.isComplete || s.isError) && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800">โรงพยาบาล</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">{hospitals.length}</p>
                  <p className="text-xs text-blue-600">แห่งที่เข้าถึงได้</p>
                </div>
                
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-purple-800">โค้ช</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-700">{coaches.length}</p>
                  <p className="text-xs text-purple-600">คนที่พร้อมใช้งาน</p>
                </div>
                
                <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">พร้อมใช้งาน</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">✓</p>
                  <p className="text-xs text-green-600">ระบบพร้อมนำเข้า</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Upload Section */}
        {!previewMode && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-600" />
                อัปโหลดไฟล์ Excel
              </h2>
              
              {/* ✅ ปุ่มดาวน์โหลด Template */}
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
              >
                <Download className="w-4 h-4" />
                ดาวน์โหลด Template
              </button>
            </div>
            
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
              <input
                type="file"
                accept=".csv"
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
                  รองรับไฟล์ .csv (แปลงจาก Excel ก่อน)
                </p>
              </label>
            </div>

            {/* ✅ Column Mapping Requirements */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5" />
                คอลัมน์ที่จำเป็น (ต้องมีในไฟล์)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {REQUIRED_FIELDS.map((field) => {
                  const isMapped = columnMapping[field];
                  const displayName = FIELD_DISPLAY_NAMES[field] || field;
                  return (
                    <div
                      key={field}
                      className={`flex items-center gap-2 text-sm ${
                        isMapped ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {isMapped ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      <span>{displayName}</span>
                    </div>
                  );
                })}
              </div>
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

            {/* ✅ Column Mapping Display */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Layers className="w-5 h-5 text-blue-600" />
                  การจับคู่คอลัมน์ที่ตรวจพบ
                </h3>
                <span className="text-sm text-gray-500">
                  พบ {Object.keys(columnMapping).length} จาก {detectedHeaders.length} คอลัมน์
                </span>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(columnMapping).map(([field, header]) => {
                  const displayName = FIELD_DISPLAY_NAMES[field] || field;
                  const isRequired = REQUIRED_FIELDS.includes(field);
                  return (
                    <div key={field} className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-medium text-green-800">{displayName}</span>
                        {isRequired && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">จำเป็น</span>
                        )}
                      </div>
                      <div className="text-xs text-green-600">
                        <span className="font-medium">คอลัมน์ในไฟล์:</span>
                        <div className="font-mono mt-1 bg-green-100 px-2 py-1 rounded">{header}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ✅ คอลัมน์ที่ไม่พบ */}
              {detectedHeaders.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">คอลัมน์ทั้งหมดที่พบในไฟล์:</h4>
                  <div className="flex flex-wrap gap-2">
                    {detectedHeaders.map((header, idx) => {
                      const isMapped = Object.values(columnMapping).includes(header);
                      return (
                        <span
                          key={idx}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            isMapped
                              ? 'bg-green-100 text-green-800 border border-green-300'
                              : 'bg-gray-100 text-gray-600 border border-gray-300'
                          }`}
                        >
                          {header}
                          {isMapped && ' ✓'}
                        </span>
                      );
                    })}
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
                    onClick={handleReset}
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

// ✅ ชื่อฟิลด์ภาษาไทยสำหรับแสดงผล
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