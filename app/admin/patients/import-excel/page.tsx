// app/admin/patients/import-excel/page.tsx
// ✅ แก้ไขล่าสุด: 12 พฤษภาคม 2569
// ✅ ฟีเจอร์ใหม่: แก้ไข Column Mapping ได้ด้วยตนเอง
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSession, logout, registerPatient, getCoachesWithHospitals,
  getHospitalsWithHierarchy, getUserHospitalInfo, getAccessibleHospitalIds,
  isSuperAdmin
} from '@/lib/supabase/queries';
import {
  Upload, CheckCircle, AlertCircle, XCircle, Loader2, ArrowLeft,
  FileSpreadsheet, UserPlus, LogOut, UserCheck, Hospital, Building2,
  Edit2, Save, Trash2, Eye, Download, RefreshCw, Layers, Settings,
  ChevronDown, Link2, Link2Off
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// =====================================================
// 📋 INTERFACES
// =====================================================
interface UserHospital {
  id: string; name: string; code: string; type: 'main' | 'sub';
  parent_id: string | null; parent_hospital?: { id: string; name: string; code: string };
}
interface Hospital {
  id: string; name: string; code: string; type: 'main' | 'sub'; parent_id: string | null;
}
interface Coach {
  id: string; user_id: string; full_name_th: string; specialization_th?: string;
  is_active: boolean; users?: { hospital_id?: string; hospitals?: { name?: string } };
}
interface ImportRow {
  rowNumber: number; originalData: any; mappedData: any;
  errors: string[]; warnings: string[]; isValid: boolean;
  hospital_id?: string; hospital_name?: string; coach_id?: string; coach_name?: string;
  id_card_valid?: boolean; birth_date_valid?: boolean;
}
interface ColumnMapping { [fieldName: string]: string; }
interface LoadingStep {
  id: number; message: string; status: 'pending' | 'loading' | 'success' | 'error';
}

// =====================================================
// 🧠 SMART COLUMN MAPPING CONFIG
// =====================================================
const COLUMN_MAPPINGS: { [key: string]: string[] } = {
  // ข้อมูลบัญชี
  id_card: ['เลขบัตรประชาชน', 'บัตรประชาชน', 'id_card', 'idcard', 'national_id', 'เลขบัตร'],
  birth_date: ['วันเกิด', 'birth_date', 'birthdate', 'dob', 'date_of_birth'],
  // ข้อมูลส่วนตัว
  first_name: ['ชื่อ', 'first_name', 'firstname', 'name'],
  last_name: ['นามสกุล', 'last_name', 'lastname', 'surname'],
  hospital_number: ['HN', 'hn', 'hospital_number', 'เลขที่ผู้ป่วย', 'เลข HN'],
  gender: ['เพศ', 'gender', 'sex'],
  phone: ['เบอร์โทร', 'โทรศัพท์', 'phone', 'tel', 'mobile'],
  email: ['อีเมล', 'email', 'e-mail'],
  // สุขภาพ
  current_weight: ['น้ำหนัก', 'weight', 'current_weight'],
  height: ['ส่วนสูง', 'height'],
  waist_circumference: ['รอบเอว', 'waist', 'waist_circumference'],
  diabetes_type: ['ประเภทเบาหวาน', 'diabetes_type', 'diabetes'],
  blood_sugar: ['ค่าน้ำตาล', 'blood_sugar', 'glucose'],
  hba1c_level: ['HbA1c', 'ค่า HbA1c', 'hba1c', 'hba1c_level'],
  // โรงพยาบาล
  hospital: ['โรงพยาบาล', 'hospital', 'hospital_name', 'รพ.'],
  // ที่อยู่
  house_number: ['บ้านเลขที่', 'house_number', 'house_no'],
  village_no: ['หมู่ที่', 'หมู่ที่/ชุมชน', 'village_no', 'หมู่'],
  village_name: ['หมู่บ้าน', 'village_name', 'village'],
  soi: ['ซอย', 'soi', 'alley'],
  road: ['ถนน', 'road', 'street'],
  province: ['จังหวัด', 'province'],
  district: ['อำเภอ', 'อำเภอ/เขต', 'district'],
  subdistrict: ['ตำบล', 'subdistrict', 'tambon'],
  postal_code: ['รหัสไปรษณีย์', 'postal_code', 'zipcode'],
  // ผู้ติดต่อฉุกเฉิน
  emergency_contact_name: ['ชื่อผู้ติดต่อ', 'ผู้ติดต่อฉุกเฉิน', 'emergency_contact_name'],
  emergency_contact_phone: ['เบอร์โทรผู้ติดต่อ', 'เบอร์ฉุกเฉิน', 'emergency_contact_phone'],
  emergency_contact_relationship: ['ความสัมพันธ์', 'relationship', 'emergency_relationship'],
  // โค้ช
  coach_name: ['ชื่อผู้ดูแล', 'โค้ช', 'coach', 'coach_name', 'อสม.', 'ผู้ดูแล']
};

const REQUIRED_FIELDS = ['id_card', 'first_name', 'last_name', 'hospital_number', 'birth_date', 'gender', 'hospital'];
const FIELD_DISPLAY_NAMES: { [key: string]: string } = {
  id_card: 'เลขบัตรประชาชน', birth_date: 'วันเกิด', first_name: 'ชื่อ', last_name: 'นามสกุล',
  hospital_number: 'HN', gender: 'เพศ', phone: 'เบอร์โทร', email: 'อีเมล',
  current_weight: 'น้ำหนัก (kg)', height: 'ส่วนสูง (cm)', waist_circumference: 'รอบเอว (cm)',
  diabetes_type: 'ประเภทเบาหวาน', blood_sugar: 'ค่าน้ำตาล', hba1c_level: 'ค่า HbA1c',
  hospital: 'โรงพยาบาล', house_number: 'บ้านเลขที่', village_no: 'หมู่ที่',
  village_name: 'หมู่บ้าน', soi: 'ซอย', road: 'ถนน', province: 'จังหวัด',
  district: 'อำเภอ', subdistrict: 'ตำบล', postal_code: 'รหัสไปรษณีย์',
  emergency_contact_name: 'ชื่อผู้ติดต่อ', emergency_contact_phone: 'เบอร์โทรผู้ติดต่อ',
  emergency_contact_relationship: 'ความสัมพันธ์', coach_name: 'ชื่อผู้ดูแล'
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
  const [showColumnMapping, setShowColumnMapping] = useState(true);
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([
    { id: 1, message: 'ตรวจสอบสิทธิ์ผู้ใช้', status: 'pending' },
    { id: 2, message: 'โหลดข้อมูลโรงพยาบาล', status: 'pending' },
    { id: 3, message: 'โหลดข้อมูลโค้ช', status: 'pending' },
    { id: 4, message: 'เตรียมความพร้อม', status: 'pending' }
  ]);
  const [stats, setStats] = useState({ total: 0, valid: 0, warnings: 0, errors: 0 });

  useEffect(() => { initializePage(); }, [router]);

  const updateLoadingStep = (id: number, status: LoadingStep['status']) => {
    setLoadingSteps(prev => prev.map(step => step.id === id ? { ...step, status } : step));
  };

  const initializePage = async () => {
    updateLoadingStep(1, 'loading');
    try {
      const userData = checkSession();
      if (!userData || !['admin', 'doctor', 'helper'].includes(userData.role)) {
        alert('ไม่มีสิทธิ์เข้าถึง'); router.push('/admin/login'); return;
      }
      setUser(userData); updateLoadingStep(1, 'success');
      await loadUserHospital(userData.id);
      await loadAccessibleHospitals(userData.id);
      updateLoadingStep(4, 'success');
    } catch (error) { console.error('Error:', error); updateLoadingStep(1, 'error'); }
  };

  const loadUserHospital = async (userId: string) => {
    try { setUserHospital(await getUserHospitalInfo(userId)); }
    catch (error) { console.error('Error loading user hospital:', error); }
  };

  const loadAccessibleHospitals = async (userId: string) => {
    updateLoadingStep(2, 'loading');
    try {
      const ids = await getAccessibleHospitalIds(userId);
      const allHospitals = await getHospitalsWithHierarchy();
      const filtered = ids.length > 0 && !isSuperAdmin(user)
        ? allHospitals.filter(h => ids.includes(h.id)) : allHospitals;
      setHospitals(filtered); setAccessibleHospitalIds(ids);
      await loadCoaches(ids); updateLoadingStep(2, 'success');
    } catch (error) { console.error('Error:', error); updateLoadingStep(2, 'error'); }
  };

  const loadCoaches = async (hospitalIds: string[]) => {
    updateLoadingStep(3, 'loading');
    try { setCoaches(await getCoachesWithHospitals(hospitalIds)); updateLoadingStep(3, 'success'); }
    catch (error) { console.error('Error:', error); updateLoadingStep(3, 'error'); }
  };

  // =====================================================
  // 📥 TEMPLATE DOWNLOAD
  // =====================================================
  const downloadTemplate = () => {
    const headers = ['เลขบัตรประชาชน', 'วันเกิด', 'ชื่อ', 'นามสกุล', 'HN', 'เพศ', 'เบอร์โทร',
      'น้ำหนัก', 'ส่วนสูง', 'รอบเอว(ซม.)', 'ประเภทเบาหวาน', 'ค่าน้ำตาลในเลือด', 'ค่า HbA1c',
      'โรงพยาบาล', 'บ้านเลขที่', 'หมู่ที่/ชุมชน', 'หมู่บ้าน', 'ซอย', 'ถนน', 'จังหวัด', 'อำเภอ',
      'ตำบล', 'รหัสไปรษณีย์', 'ชื่อผู้ติดต่อ(ญาติ)', 'เบอร์โทร', 'ความสัมพันธ์', 'ชื่อผู้ดูแล (อสม.)'];
    const sample = ['1100800012345', '05/01/2548', 'นายบุญเพ็ง', 'ดอกทานตะวัน', '45688899', 'ชาย',
      '0812223654', '80', '164', '100', 'เบาหวาน', '140', '6.8', 'รพ.เมตตาธรรม', '54', '12',
      'บ้านฟ้าใส', 'ตาเทพ', 'งามสง่า', 'เทพสถิตย์', 'เมตตาธรรม', 'บ้านลี้', '99000', 'นางนวลละออ',
      '857741248', 'คู่สมรส', 'นางเตือนใจ มั่งมี'];
    const csv = '\ufeff' + [headers.join(','), sample.join(',')].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'template_import_patients.csv';
    link.click(); URL.revokeObjectURL(url);
  };

  // =====================================================
  // 🧠 COLUMN DETECTION & MAPPING
  // =====================================================
  const detectColumnMapping = (headers: string[]): ColumnMapping => {
    const mapping: ColumnMapping = {};
    headers.forEach((header, index) => {
      const normalized = header.trim().toLowerCase();
      for (const [fieldName, possibles] of Object.entries(COLUMN_MAPPINGS)) {
        if (possibles.some(name => name.toLowerCase() === normalized ||
          normalized.includes(name.toLowerCase()) || name.toLowerCase().includes(normalized))) {
          mapping[fieldName] = headers[index]; break;
        }
      }
    });
    return mapping;
  };

  // ✅ ฟังก์ชันหลัก: เปลี่ยนการจับคู่คอลัมน์
  const handleColumnRemap = (fieldName: string, newHeader: string) => {
    const newMapping = { ...columnMapping };
    if (newHeader) { newMapping[fieldName] = newHeader; }
    else { delete newMapping[fieldName]; }
    setColumnMapping(newMapping);
    // Re-validate ข้อมูลทั้งหมดด้วย mapping ใหม่
    if (mappedData.length > 0) { validateDataWithMapping(mappedData, newMapping); }
  };

  // ✅ ฟังก์ชันยกเลิกการจับคู่ทั้งหมด
  const handleResetMapping = () => {
    setColumnMapping({});
    if (mappedData.length > 0) { validateDataWithMapping(mappedData, {}); }
  };

  // ✅ ฟังก์ชันจับคู่อัตโนมัติใหม่
  const handleAutoDetectMapping = () => {
    if (detectedHeaders.length === 0) return;
    const newMapping = detectColumnMapping(detectedHeaders);
    setColumnMapping(newMapping);
    if (mappedData.length > 0) { validateDataWithMapping(mappedData, newMapping); }
  };

  // =====================================================
  // 📊 PARSE & VALIDATE
  // =====================================================
  const parseFile = async (file: File) => {
    setUploading(true); setError('');
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) { setError('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย'); setUploading(false); return; }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setDetectedHeaders(headers);

      const mapping = detectColumnMapping(headers);
      setColumnMapping(mapping);

      const missing = REQUIRED_FIELDS.filter(f => !mapping[f]);
      if (missing.length > 0) {
        setError(`❌ ไม่พบคอลัมน์ที่จำเป็น: ${missing.map(f => FIELD_DISPLAY_NAMES[f]).join(', ')}`);
        setUploading(false); return;
      }

      const rows: ImportRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const originalRow: any = {};
        headers.forEach((h, idx) => { originalRow[h] = values[idx] || ''; });

        const mappedRow: any = {};
        for (const [field, excelHeader] of Object.entries(mapping)) {
          mappedRow[field] = originalRow[excelHeader] || '';
        }

        const errors: string[] = [], warnings: string[] = [];
        const idCard = mappedRow.id_card?.replace(/\D/g, '') || '';
        if (idCard.length !== 13) errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
        if (!mappedRow.hospital_number) errors.push('ต้องระบุ HN');
        if (!mappedRow.first_name) errors.push('ต้องระบุชื่อ');
        if (!mappedRow.last_name) errors.push('ต้องระบุนามสกุล');

        if (mappedRow.hospital) {
          const hosp = hospitals.find(h => h.name === mappedRow.hospital || h.code === mappedRow.hospital);
          if (hosp) { mappedRow.hospital_id = hosp.id; mappedRow.hospital_name = hosp.name; }
          else errors.push(`ไม่พบโรงพยาบาล "${mappedRow.hospital}"`);
        }

        if (mappedRow.coach_name) {
          const coach = coaches.find(c => c.full_name_th === mappedRow.coach_name);
          if (coach) { mappedRow.coach_id = coach.user_id; mappedRow.coach_name = coach.full_name_th; }
          else warnings.push(`ไม่พบโค้ช "${mappedRow.coach_name}"`);
        }

        const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
        if (mappedRow.birth_date && !datePattern.test(mappedRow.birth_date)) {
          errors.push('รูปแบบวันเกิดต้องเป็น DD/MM/YYYY');
        }

        rows.push({
          rowNumber: i + 1, originalData: originalRow, mappedData: mappedRow,
          errors, warnings, isValid: errors.length === 0,
          id_card_valid: idCard.length === 13,
          birth_date_valid: datePattern.test(mappedRow.birth_date)
        });
      }

      setMappedData(rows); setPreviewMode(true);
      setStats({
        total: rows.length, valid: rows.filter(r => r.isValid).length,
        warnings: rows.filter(r => r.warnings.length > 0).length,
        errors: rows.filter(r => !r.isValid).length
      });
    } catch (error) { setError('❌ เกิดข้อผิดพลาด: ' + (error as Error).message); }
    finally { setUploading(false); }
  };

  // ✅ Re-validate ข้อมูลเมื่อเปลี่ยน mapping
  const validateDataWithMapping = (rows: ImportRow[], mapping: ColumnMapping) => {
    const validated = rows.map(row => {
      const errors: string[] = [], warnings: string[] = [];
      const mappedRow: any = {};
      for (const [field, excelHeader] of Object.entries(mapping)) {
        mappedRow[field] = row.originalData[excelHeader] || '';
      }

      const idCard = mappedRow.id_card?.replace(/\D/g, '') || '';
      if (idCard.length !== 13) errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
      if (!mappedRow.hospital_number) errors.push('ต้องระบุ HN');
      if (!mappedRow.first_name) errors.push('ต้องระบุชื่อ');
      if (!mappedRow.last_name) errors.push('ต้องระบุนามสกุล');

      if (mappedRow.hospital) {
        const hosp = hospitals.find(h => h.name === mappedRow.hospital || h.code === mappedRow.hospital);
        if (hosp) { mappedRow.hospital_id = hosp.id; mappedRow.hospital_name = hosp.name; }
        else errors.push(`ไม่พบโรงพยาบาล "${mappedRow.hospital}"`);
      }

      return { ...row, mappedData: mappedRow, errors, warnings, isValid: errors.length === 0 };
    });
    setMappedData(validated);
    setStats({
      total: validated.length, valid: validated.filter(r => r.isValid).length,
      warnings: validated.filter(r => r.warnings.length > 0).length,
      errors: validated.filter(r => !r.isValid).length
    });
  };

  // =====================================================
  // ✏️ EDIT & IMPORT
  // =====================================================
  const handleEditRow = (idx: number) => { setEditingRow(idx); setEditData({ ...mappedData[idx].mappedData }); };
  const handleSaveEdit = (idx: number) => {
    const newData = [...mappedData]; newData[idx].mappedData = { ...editData };
    const errors: string[] = [];
    if (editData.id_card?.replace(/\D/g, '').length !== 13) errors.push('เลขบัตรต้อง 13 หลัก');
    if (!editData.hospital_number) errors.push('ต้องระบุ HN');
    newData[idx].errors = errors; newData[idx].isValid = errors.length === 0;
    setMappedData(newData); setEditingRow(null);
    setStats({
      total: newData.length, valid: newData.filter(r => r.isValid).length,
      warnings: newData.filter(r => r.warnings.length > 0).length,
      errors: newData.filter(r => !r.isValid).length
    });
  };
  const handleDeleteRow = (idx: number) => {
    const newData = mappedData.filter((_, i) => i !== idx); setMappedData(newData);
    setStats({
      total: newData.length, valid: newData.filter(r => r.isValid).length,
      warnings: newData.filter(r => r.warnings.length > 0).length,
      errors: newData.filter(r => !r.isValid).length
    });
  };

  const handleImport = async () => {
    const valid = mappedData.filter(r => r.isValid);
    if (valid.length === 0) { alert('❌ ไม่มีข้อมูลที่ถูกต้อง'); return; }
    if (!confirm(`✅ นำเข้า ${valid.length} ราย?`)) return;
    setImporting(true); let successCount = 0;
    for (const row of valid) {
      try {
        const [d, m, y] = row.mappedData.birth_date.split('/');
        const birthDate = `${parseInt(y) - 543}-${m}-${d}`;
        await registerPatient({
          id_card: row.mappedData.id_card.replace(/\D/g, ''), password: row.mappedData.birth_date,
          first_name: row.mappedData.first_name, last_name: row.mappedData.last_name,
          hospital_number: row.mappedData.hospital_number, birth_date: birthDate,
          gender: row.mappedData.gender || 'male', phone: row.mappedData.phone,
          current_weight: row.mappedData.current_weight ? parseFloat(row.mappedData.current_weight) : undefined,
          height: row.mappedData.height ? parseFloat(row.mappedData.height) : undefined,
          waist_circumference: row.mappedData.waist_circumference ? parseFloat(row.mappedData.waist_circumference) : undefined,
          diabetes_type: row.mappedData.diabetes_type, blood_sugar: row.mappedData.blood_sugar ? parseFloat(row.mappedData.blood_sugar) : undefined,
          hba1c_level: row.mappedData.hba1c_level ? parseFloat(row.mappedData.hba1c_level) : undefined,
          hospital_id: row.mappedData.hospital_id, coach_id: row.mappedData.coach_id,
          house_number: row.mappedData.house_number, village_no: row.mappedData.village_no,
          village_name: row.mappedData.village_name, soi: row.mappedData.soi, road: row.mappedData.road,
          province: row.mappedData.province, district: row.mappedData.district,
          subdistrict: row.mappedData.subdistrict, postal_code: row.mappedData.postal_code,
          emergency_contact_name: row.mappedData.emergency_contact_name,
          emergency_contact_phone: row.mappedData.emergency_contact_phone,
          emergency_contact_relationship: row.mappedData.emergency_contact_relationship,
          pam_level: 'L0', pam_score: 0, zone: 'Zero Zone', created_by: user?.id
        });
        successCount++;
      } catch (err) { console.error('Import error:', err); }
    }
    setImporting(false); setSuccess(`✅ สำเร็จ ${successCount} ราย`);
    if (successCount > 0) setTimeout(() => router.push('/admin/patients'), 2000);
  };

  const handleLogout = () => { logout(); router.push('/admin/login'); };
  const handleReset = () => {
    setPreviewMode(false); setMappedData([]); setFile(null); setColumnMapping({});
    setDetectedHeaders([]); setError(''); setSuccess('');
    setStats({ total: 0, valid: 0, warnings: 0, errors: 0 });
  };

  // =====================================================
  // 🎨 RENDER
  // =====================================================
  if (!user) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-12 h-12 animate-spin text-blue-500" /></div>;

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
                  <p className="text-xs text-gray-500">{isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin'}</p>
                  <p className="text-xs text-blue-600">{userHospital.name}</p>
                </div>
              )}
              <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded-lg"><LogOut className="w-4 h-4" /></button>
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
                <span className={`text-sm ${step.status === 'success' ? 'text-green-700' : step.status === 'error' ? 'text-red-700' : step.status === 'loading' ? 'text-blue-700' : 'text-gray-500'}`}>
                  {step.message}
                </span>
              </div>
            ))}
          </div>
          {loadingSteps.every(s => s.status === 'success') && (
            <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4">
              <div className="bg-blue-50 rounded-lg p-3"><p className="text-sm text-blue-600">โรงพยาบาล</p><p className="text-2xl font-bold text-blue-700">{hospitals.length}</p></div>
              <div className="bg-purple-50 rounded-lg p-3"><p className="text-sm text-purple-600">โค้ช</p><p className="text-2xl font-bold text-purple-700">{coaches.length}</p></div>
              <div className="bg-green-50 rounded-lg p-3"><p className="text-sm text-green-600">สถานะ</p><p className="text-2xl font-bold text-green-700">✓ พร้อม</p></div>
            </div>
          )}
        </div>

        {/* Upload Section */}
        {!previewMode && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><Upload className="w-5 h-5 text-blue-600" /> อัปโหลดไฟล์ Excel</h2>
              <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg"><Download className="w-4 h-4" /> ดาวน์โหลด Template</button>
            </div>
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors">
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); parseFile(f); }}} className="hidden" id="fileInput" />
              <label htmlFor="fileInput" className="cursor-pointer">
                <FileSpreadsheet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
                <p className="text-sm text-gray-400">รองรับไฟล์ .csv, .xlsx, .xls</p>
              </label>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {previewMode && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border"><p className="text-sm text-gray-500">ทั้งหมด</p><p className="text-2xl font-bold">{stats.total}</p></div>
              <div className="bg-white rounded-xl p-4 border"><p className="text-sm text-gray-500">พร้อมนำเข้า</p><p className="text-2xl font-bold text-green-600">{stats.valid}</p></div>
              <div className="bg-white rounded-xl p-4 border"><p className="text-sm text-gray-500">คำเตือน</p><p className="text-2xl font-bold text-yellow-600">{stats.warnings}</p></div>
              <div className="bg-white rounded-xl p-4 border"><p className="text-sm text-gray-500">ผิดพลาด</p><p className="text-2xl font-bold text-red-600">{stats.errors}</p></div>
            </div>

            {/* ✅ Column Mapping Display & Edit */}
            <div className="bg-white rounded-xl shadow-lg p-6 border">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" /> การจับคู่คอลัมน์</h3>
                <div className="flex gap-2">
                  <button onClick={() => setShowColumnMapping(!showColumnMapping)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800">
                    <Settings className="w-4 h-4" /> {showColumnMapping ? 'ซ่อน' : 'ปรับแก้'}
                    <ChevronDown className={`w-4 h-4 transition-transform ${showColumnMapping ? 'rotate-180' : ''}`} />
                  </button>
                  <button onClick={handleAutoDetectMapping} className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm hover:bg-blue-200">
                    <RefreshCw className="w-3 h-3" /> จับคู่อัตโนมัติ
                  </button>
                  <button onClick={handleResetMapping} className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
                    <Trash2 className="w-3 h-3" /> ล้างทั้งหมด
                  </button>
                </div>
              </div>

              {showColumnMapping && (
                <div className="space-y-6">
                  {/* 📋 คอลัมน์ในไฟล์ */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" /> คอลัมน์ในไฟล์ ({detectedHeaders.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {detectedHeaders.map((header, idx) => {
                        const isMapped = Object.values(columnMapping).includes(header);
                        return (
                          <span key={idx} className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 ${isMapped ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                            {header} {isMapped && <CheckCircle className="w-3 h-3" />}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* 🔧 ปรับจับคู่คอลัมน์ใหม่ */}
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> 🔧 ปรับจับคู่คอลัมน์ใหม่
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.keys(COLUMN_MAPPINGS).map(fieldName => (
                        <div key={fieldName} className="flex items-center gap-2 bg-white p-2 rounded border">
                          <label className="text-sm text-gray-700 w-32 font-medium">{FIELD_DISPLAY_NAMES[fieldName] || fieldName}:</label>
                          <select
                            value={columnMapping[fieldName] || ''}
                            onChange={(e) => handleColumnRemap(fieldName, e.target.value)}
                            className="flex-1 px-2 py-1.5 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">-- ไม่จับคู่ --</option>
                            {detectedHeaders.map((header, idx) => (
                              <option key={idx} value={header}>{header}</option>
                            ))}
                          </select>
                          {columnMapping[fieldName] && <Link2 className="w-4 h-4 text-green-500" />}
                          {!columnMapping[fieldName] && REQUIRED_FIELDS.includes(fieldName) && <AlertCircle className="w-4 h-4 text-red-500" />}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-blue-600 mt-3">
                      💡 เลือกคอลัมน์จากไฟล์เพื่อจับคู่กับฟิลด์ที่ต้องการ หรือเลือก "-- ไม่จับคู่ --" เพื่อยกเลิกการจับคู่
                    </p>
                  </div>

                  {/* ✅ คอลัมน์ที่พบ */}
                  <div>
                    <h4 className="text-sm font-semibold text-green-800 mb-2 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> ✅ คอลัมน์ที่จับคู่แล้ว ({Object.keys(columnMapping).length})
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {Object.entries(columnMapping).map(([field, header]) => (
                        <div key={field} className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-green-900">{FIELD_DISPLAY_NAMES[field] || field}</p>
                          <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                            <Link2 className="w-3 h-3" /> ← "{header}"
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ❌ คอลัมน์ที่ไม่พบ */}
                  <div>
                    <h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" /> ❌ คอลัมน์ที่จำเป็นแต่ยังไม่พบ
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {REQUIRED_FIELDS.filter(f => !columnMapping[f]).map(field => (
                        <div key={field} className="bg-red-50 border border-red-200 rounded-lg p-3">
                          <p className="text-sm font-medium text-red-900">{FIELD_DISPLAY_NAMES[field] || field}</p>
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <Link2Off className="w-3 h-3" /> จำเป็น
                          </p>
                        </div>
                      ))}
                      {REQUIRED_FIELDS.every(f => columnMapping[f]) && (
                        <p className="text-green-600 text-sm flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> ✓ พบคอลัมน์จำเป็นทั้งหมด
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-xl shadow-lg border overflow-hidden">
              <div className="p-6 border-b flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-blue-600" /> Preview ({stats.total} ราย)</h2>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="px-4 py-2 bg-gray-500 text-white rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r">แถว</th>
                      {detectedHeaders.map((header, idx) => (
                        <th key={idx} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r whitespace-nowrap">
                          {header} {Object.values(columnMapping).includes(header) && <CheckCircle className="w-3 h-3 inline text-green-500" />}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {mappedData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className={`${!row.isValid ? 'bg-red-50' : row.warnings.length > 0 ? 'bg-yellow-50' : ''}`}>
                        <td className="px-4 py-3 text-sm border-r">{row.rowNumber}</td>
                        {detectedHeaders.map((header, hIdx) => {
                          const value = row.originalData[header] || '-';
                          const isMapped = Object.values(columnMapping).includes(header);
                          return <td key={hIdx} className={`px-4 py-3 text-sm border-r ${isMapped ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{value}</td>;
                        })}
                        <td className="px-4 py-3">
                          {row.isValid ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">✓ พร้อม</span> : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">✗ ผิดพลาด</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => handleEditRow(idx)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => handleDeleteRow(idx)} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mappedData.length > 50 && <div className="p-4 text-center text-sm text-gray-500">...และอีก {mappedData.length - 50} ราย (แสดง 50 รายแรก)</div>}
              </div>
            </div>
          </>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1"><p className="font-semibold text-red-800 mb-1">เกิดข้อผิดพลาด</p><p className="text-sm text-red-700 whitespace-pre-line">{error}</p></div>
            <button onClick={() => setError('')} className="text-red-600 hover:text-red-800"><XCircle className="w-5 h-5" /></button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1"><p className="font-semibold text-green-800 mb-1">สำเร็จ</p><p className="text-sm text-green-700 whitespace-pre-line">{success}</p></div>
            <button onClick={() => setSuccess('')} className="text-green-600 hover:text-green-800"><XCircle className="w-5 h-5" /></button>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingRow !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">✏️ แก้ไขแถวที่ {mappedData[editingRow]?.rowNumber}</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* ข้อมูลส่วนตัว */}
              <div className="col-span-full"><h3 className="font-semibold text-blue-800 mb-2">📋 ข้อมูลส่วนตัว</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg">
                  <div><label className="block text-sm font-medium mb-1">HN</label><input type="text" value={editData.hospital_number || ''} onChange={(e) => setEditData({...editData, hospital_number: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">เลขบัตรประชาชน</label><input type="text" value={editData.id_card || ''} onChange={(e) => setEditData({...editData, id_card: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ชื่อ</label><input type="text" value={editData.first_name || ''} onChange={(e) => setEditData({...editData, first_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">นามสกุล</label><input type="text" value={editData.last_name || ''} onChange={(e) => setEditData({...editData, last_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">วันเกิด</label><input type="text" value={editData.birth_date || ''} onChange={(e) => setEditData({...editData, birth_date: e.target.value})} className="w-full px-3 py-2 border rounded-lg" placeholder="DD/MM/YYYY" /></div>
                  <div><label className="block text-sm font-medium mb-1">เพศ</label><select value={editData.gender || ''} onChange={(e) => setEditData({...editData, gender: e.target.value})} className="w-full px-3 py-2 border rounded-lg"><option value="">-- เลือก --</option><option value="male">ชาย</option><option value="female">หญิง</option></select></div>
                  <div><label className="block text-sm font-medium mb-1">เบอร์โทร</label><input type="text" value={editData.phone || ''} onChange={(e) => setEditData({...editData, phone: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">อีเมล</label><input type="email" value={editData.email || ''} onChange={(e) => setEditData({...editData, email: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>
              {/* ข้อมูลสุขภาพ */}
              <div className="col-span-full"><h3 className="font-semibold text-purple-800 mb-2">💊 ข้อมูลสุขภาพ</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-purple-50 rounded-lg">
                  <div><label className="block text-sm font-medium mb-1">น้ำหนัก (kg)</label><input type="number" value={editData.current_weight || ''} onChange={(e) => setEditData({...editData, current_weight: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ส่วนสูง (cm)</label><input type="number" value={editData.height || ''} onChange={(e) => setEditData({...editData, height: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">รอบเอว (cm)</label><input type="number" value={editData.waist_circumference || ''} onChange={(e) => setEditData({...editData, waist_circumference: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ประเภทเบาหวาน</label><select value={editData.diabetes_type || ''} onChange={(e) => setEditData({...editData, diabetes_type: e.target.value})} className="w-full px-3 py-2 border rounded-lg"><option value="">-- เลือก --</option><option value="กลุ่มเสี่ยง">กลุ่มเสี่ยง</option><option value="เบาหวาน">เบาหวาน</option></select></div>
                  <div><label className="block text-sm font-medium mb-1">ค่าน้ำตาล</label><input type="number" value={editData.blood_sugar || ''} onChange={(e) => setEditData({...editData, blood_sugar: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ค่า HbA1c</label><input type="number" value={editData.hba1c_level || ''} onChange={(e) => setEditData({...editData, hba1c_level: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>
              {/* โรงพยาบาลและที่อยู่ */}
              <div className="col-span-full"><h3 className="font-semibold text-pink-800 mb-2">🏥 โรงพยาบาลและที่อยู่</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-pink-50 rounded-lg">
                  <div><label className="block text-sm font-medium mb-1">โรงพยาบาล</label>
                    <select value={editData.hospital_id || ''} onChange={(e) => { const h = hospitals.find(x => x.id === e.target.value); setEditData({...editData, hospital_id: e.target.value, hospital_name: h?.name}); }} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- เลือก --</option>{hospitals.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium mb-1">บ้านเลขที่</label><input type="text" value={editData.house_number || ''} onChange={(e) => setEditData({...editData, house_number: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">หมู่ที่</label><input type="text" value={editData.village_no || ''} onChange={(e) => setEditData({...editData, village_no: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">หมู่บ้าน</label><input type="text" value={editData.village_name || ''} onChange={(e) => setEditData({...editData, village_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ซอย</label><input type="text" value={editData.soi || ''} onChange={(e) => setEditData({...editData, soi: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ถนน</label><input type="text" value={editData.road || ''} onChange={(e) => setEditData({...editData, road: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">จังหวัด</label><input type="text" value={editData.province || ''} onChange={(e) => setEditData({...editData, province: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">อำเภอ</label><input type="text" value={editData.district || ''} onChange={(e) => setEditData({...editData, district: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ตำบล</label><input type="text" value={editData.subdistrict || ''} onChange={(e) => setEditData({...editData, subdistrict: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">รหัสไปรษณีย์</label><input type="text" value={editData.postal_code || ''} onChange={(e) => setEditData({...editData, postal_code: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                </div>
              </div>
              {/* ผู้ติดต่อและโค้ช */}
              <div className="col-span-full"><h3 className="font-semibold text-orange-800 mb-2">👥 ผู้ติดต่อและโค้ช</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-orange-50 rounded-lg">
                  <div><label className="block text-sm font-medium mb-1">ชื่อผู้ติดต่อ</label><input type="text" value={editData.emergency_contact_name || ''} onChange={(e) => setEditData({...editData, emergency_contact_name: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">เบอร์โทรผู้ติดต่อ</label><input type="text" value={editData.emergency_contact_phone || ''} onChange={(e) => setEditData({...editData, emergency_contact_phone: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ความสัมพันธ์</label><input type="text" value={editData.emergency_contact_relationship || ''} onChange={(e) => setEditData({...editData, emergency_contact_relationship: e.target.value})} className="w-full px-3 py-2 border rounded-lg" /></div>
                  <div><label className="block text-sm font-medium mb-1">ชื่อผู้ดูแล (โค้ช)</label>
                    <select value={editData.coach_id || ''} onChange={(e) => { const c = coaches.find(x => x.user_id === e.target.value); setEditData({...editData, coach_id: e.target.value, coach_name: c?.full_name_th}); }} className="w-full px-3 py-2 border rounded-lg">
                      <option value="">-- เลือก --</option>{coaches.map(c => <option key={c.user_id} value={c.user_id}>{c.full_name_th}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-6">
              <button onClick={() => handleSaveEdit(editingRow)} className="flex-1 bg-green-500 text-white py-3 rounded-lg flex items-center justify-center gap-2"><Save className="w-4 h-4" /> บันทึก</button>
              <button onClick={() => setEditingRow(null)} className="flex-1 bg-gray-500 text-white py-3 rounded-lg">ยกเลิก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}