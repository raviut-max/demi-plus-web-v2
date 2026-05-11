// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 11 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ แสดงรายละเอียด Column Mapping แบบละเอียด
//    2. ✅ แสดงคอลัมน์ที่จับได้ และจับไม่ได้
//    3. ✅ แสดงตัวอย่างชื่อคอลัมน์ที่ระบบรองรับ
//    4. ✅ แสดงตัวอย่างข้อมูลจากไฟล์ Excel
//    5. ✅ แสดง Error Messages ที่ชัดเจน
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession,
  logout,
  getAccessibleHospitalIds,
  getUserHospitalInfo,
  isSuperAdmin,
  registerPatient
} from '@/lib/supabase/queries';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  ArrowLeft,
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
  Info,
  Table
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
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelSampleData, setExcelSampleData] = useState<any[]>([]);

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

  const getHospitalsWithHierarchy = async () => {
    try {
      const { data, error } = await supabase
        .from('hospitals')
        .select(`
          *,
          parent_hospital:hospitals!parent_id (
            id,
            name,
            code
          )
        `)
        .eq('is_active', true)
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      return [];
    }
  };

  const getCoachesWithHospitals = async (hospitalIds: string[]) => {
    try {
      let query = supabase
        .from('doctors')
        .select(`
          id,
          user_id,
          full_name_th,
          specialization_th,
          is_active,
          is_verified,
          users (
            hospital_id,
            role,
            admin_type,
            is_active,
            hospitals (
              id,
              name,
              code,
              type,
              parent_id
            )
          )
        `)
        .eq('is_active', true)
        .eq('users.is_active', true);

      if (hospitalIds && hospitalIds.length > 0) {
        query = query.in('users.hospital_id', hospitalIds);
      }

      const { data, error } = await query.order('full_name_th', { ascending: true });

      if (error) throw error;

      const coachesWithHospitals = (data || []).filter(coach => 
        coach.users?.hospital_id && coach.users?.hospitals?.name
      );

      return coachesWithHospitals;
    } catch (error) {
      console.error('Error loading coaches:', error);
      return [];
    }
  };

  // =====================================================
  // 🧠 SMART COLUMN DETECTION
  // =====================================================
  const detectColumnMapping = (headers: string[]): { mapping: ColumnMapping, infos: ColumnInfo[] } => {
    const mapping: ColumnMapping = {};
    const infos: ColumnInfo[] = [];
    
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
          mapping[fieldName] = header;
          matchedColumn = header;
          isMatched = true;
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
      
      // ✅ Detect Column Mapping
      const { mapping, infos } = detectColumnMapping(headers);
      setColumnMapping(mapping);
      setColumnInfos(infos);
      
      console.log('🧠 Column Mapping:', mapping);
      console.log('📋 Column Infos:', infos);
      
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
        
        const mappedRow: any = {};
        for (const [fieldName, excelHeader] of Object.entries(mapping)) {
          mappedRow[fieldName] = row[excelHeader] || '';
        }
        
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
  // 🖱️ DRAG & DROP HANDLERS
  // =====================================================
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      handleFile(droppedFile);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(file.type) && !validExtensions.includes(fileExtension)) {
      setError('❌ กรุณาเลือกไฟล์ Excel (.xlsx, .xls) หรือ CSV เท่านั้น');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError('❌ ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 10MB)');
      return;
    }
    
    setFile(file);
    parseFile(file);
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
      setError('❌ ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
      return;
    }

    if (!confirm(`✅ คุณต้องการนำเข้า ${validRows.length} รายหรือไม่?\n\n⚠️ ข้อมูลที่ผิดพลาด ${stats.errors} ราย will be skipped`)) {
      return;
    }

    setImporting(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

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
          errors.push(`แถว ${row.rowNumber}: ${result.error}`);
        }
      } catch (err) {
        errorCount++;
        errors.push(`แถว ${row.rowNumber}: ${(err as Error).message}`);
      }
    }

    setImporting(false);
    
    if (successCount > 0) {
      setSuccess(`✅ นำเข้าสำเร็จ ${successCount} ราย\n❌ ล้มเหลว ${errorCount} ราย`);
      setTimeout(() => {
        router.push('/admin/patients');
      }, 3000);
    } else {
      setError(`❌ นำเข้าล้มเหลวทั้งหมด\n${errors.slice(0, 5).join('\n')}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleReset = () => {
    setFile(null);
    setMappedData([]);
    setRawData([]);
    setPreviewMode(false);
    setError('');
    setSuccess('');
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
    setExcelHeaders([]);
    setExcelSampleData([]);
    setColumnInfos([]);
  };

  const downloadTemplate = () => {
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
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 text-sm"
              >
                <Download className="w-4 h-4" />
                ดาวน์โหลด Template
              </button>
            </div>
            
            <div 
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                dragActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-blue-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                id="fileInput"
              />
              <label htmlFor="fileInput" className="cursor-pointer">
                {uploading ? (
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      กำลังประมวลผลไฟล์...
                    </p>
                    <p className="text-sm text-gray-400">
                      กรุณารอสักครู่
                    </p>
                  </div>
                ) : (
                  <>
                    <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
                    </p>
                    <p className="text-sm text-gray-400">
                      รองรับไฟล์ .xlsx, .xls, .csv (สูงสุด 10MB)
                    </p>
                  </>
                )}
              </label>
            </div>

            {/* Column Mapping Info */}
            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-2">🧠 ระบบจะจับคู่คอลัมน์อัตโนมัติ</h3>
              <p className="text-sm text-blue-700 mb-2">
                ระบบจะตรวจสอบชื่อคอลัมน์และจับคู่กับฟิลด์ที่ถูกต้อง แม้ชื่อจะไม่ตรงเป๊ะ
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-blue-600">
                <div>✅ เลขบัตรประชาชน</div>
                <div>✅ วันเกิด</div>
                <div>✅ ชื่อ-นามสกุล</div>
                <div>✅ HN</div>
                <div>✅ โรงพยาบาล</div>
                <div>✅ โค้ช/อสม.</div>
                <div>✅ ที่อยู่</div>
                <div>✅ ผู้ติดต่อฉุกเฉิน</div>
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

            {/* Action Buttons */}
            <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                >
                  <RefreshCw className="w-4 h-4" />
                  เริ่มต้นใหม่
                </button>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                >
                  <Download className="w-4 h-4" />
                  ดาวน์โหลด Template
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImport}
                  disabled={importing || stats.valid === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
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

            {/* ✅ Column Mapping Details - แสดงรายละเอียดการจับคู่ */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Table className="w-5 h-5 text-blue-600" />
                  รายละเอียดการจับคู่คอลัมน์
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  แสดงคอลัมน์ที่พบในไฟล์ Excel และการจับคู่กับฟิลด์ในระบบ
                </p>
              </div>

              <div className="p-6">
                {/* ✅ คอลัมน์ที่จับได้ (Matched) */}
                <div className="mb-6">
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    คอลัมน์ที่จับคู่สำเร็จ ({columnInfos.filter(c => c.isMatched).length} คอลัมน์)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {columnInfos.filter(c => c.isMatched).map((info) => (
                      <div key={info.fieldName} className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-green-900">{info.displayName}</span>
                          {info.required && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">จำเป็น</span>
                          )}
                        </div>
                        <div className="text-sm text-green-700">
                          <span className="font-medium">พบคอลัมน์:</span> "{info.matchedColumn}"
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                          ตัวอย่าง: {info.example}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ✅ คอลัมน์ที่จับไม่ได้ (Unmatched) */}
                {columnInfos.filter(c => !c.isMatched).length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      คอลัมน์ที่ไม่พบในไฟล์ ({columnInfos.filter(c => !c.isMatched).length} คอลัมน์)
                    </h3>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {columnInfos.filter(c => !c.isMatched).map((info) => (
                          <div key={info.fieldName} className="bg-white border border-red-200 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-red-900">{info.displayName}</span>
                              {info.required && (
                                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">จำเป็น ⚠️</span>
                              )}
                            </div>
                            <div className="text-xs text-red-700">
                              <span className="font-medium">ชื่อที่ระบบรองรับ:</span>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {info.possibleNames.slice(0, 5).map((name, idx) => (
                                  <span key={idx} className="bg-red-100 px-2 py-0.5 rounded">
                                    {name}
                                  </span>
                                ))}
                                {info.possibleNames.length > 5 && (
                                  <span className="text-red-600">+{info.possibleNames.length - 5} อื่นๆ</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ✅ คอลัมน์ที่พบในไฟล์ แต่ระบบไม่รู้จัก */}
                {excelHeaders.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <Info className="w-5 h-5 text-blue-600" />
                      คอลัมน์ทั้งหมดที่พบในไฟล์ ({excelHeaders.length} คอลัมน์)
                    </h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex flex-wrap gap-2">
                        {excelHeaders.map((header, idx) => {
                          const isMatched = columnInfos.some(c => c.matchedColumn === header);
                          return (
                            <span 
                              key={idx}
                              className={`px-3 py-1 rounded-full text-sm ${
                                isMatched 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {header} {isMatched ? '✓' : '✗'}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* ✅ ตัวอย่างข้อมูลจากไฟล์ */}
                {excelSampleData.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-purple-800 mb-3 flex items-center gap-2">
                      <Eye className="w-5 h-5 text-purple-600" />
                      ตัวอย่างข้อมูลจากไฟล์ (3 แถวแรก)
                    </h3>
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
                                <td key={colIdx} className="px-3 py-2 border border-gray-200">
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
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  Preview ข้อมูล ({stats.total} ราย)
                </h2>
                <p className="text-sm text-gray-500">
                  แสดง 50 รายแรกจากทั้งหมด {stats.total} ราย
                </p>
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

      {/* Edit Modal */}
      {editingRow !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">✏️ แก้ไขแถวที่ {mappedData[editingRow]?.rowNumber}</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">HN</label>
                <input
                  type="text"
                  value={editData.hospital_number || ''}
                  onChange={(e) => setEditData({...editData, hospital_number: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">เลขบัตรประชาชน</label>
                <input
                  type="text"
                  value={editData.id_card || ''}
                  onChange={(e) => setEditData({...editData, id_card: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ชื่อ</label>
                <input
                  type="text"
                  value={editData.first_name || ''}
                  onChange={(e) => setEditData({...editData, first_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">นามสกุล</label>
                <input
                  type="text"
                  value={editData.last_name || ''}
                  onChange={(e) => setEditData({...editData, last_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">โรงพยาบาล</label>
                <select
                  value={editData.hospital_id || ''}
                  onChange={(e) => {
                    const hospital = hospitals.find(h => h.id === e.target.value);
                    setEditData({
                      ...editData,
                      hospital_id: e.target.value,
                      hospital_name: hospital?.name
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">-- เลือก --</option>
                  {hospitals.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">โค้ช</label>
                <select
                  value={editData.coach_id || ''}
                  onChange={(e) => {
                    const coach = coaches.find(c => c.user_id === e.target.value);
                    setEditData({
                      ...editData,
                      coach_id: e.target.value,
                      coach_name: coach?.full_name_th
                    });
                  }}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">-- เลือก --</option>
                  {coaches.map(c => (
                    <option key={c.user_id} value={c.user_id}>{c.full_name_th}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => handleSaveEdit(editingRow)}
                className="flex-1 bg-green-500 text-white py-3 rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                บันทึก
              </button>
              <button
                onClick={() => setEditingRow(null)}
                className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}