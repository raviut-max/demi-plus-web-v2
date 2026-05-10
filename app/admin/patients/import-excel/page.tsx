// app/admin/patients/import-excel/page.tsx
// ✅ สร้างใหม่: 10 พฤษภาคม 2569
// ✅ ฟีเจอร์:
//    1. ✅ อัปโหลดไฟล์ Excel (.xlsx, .xls, .csv)
//    2. ✅ แสดง Preview ข้อมูลก่อนนำเข้า
//    3. ✅ ตรวจสอบความถูกต้องของข้อมูล
//    4. ✅ แสดงข้อผิดพลาดและคำเตือน
//    5. ✅ บันทึกข้อมูลลงระบบ
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds, getUserHospitalInfo, isSuperAdmin } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  Download,
  UserPlus,
  LogOut,
  UserCheck,
  Hospital,
  Building2,
  Shield
} from 'lucide-react';

// ✅ Interface สำหรับข้อมูลผู้ป่วย
interface PatientImportData {
  id_card: string;
  birth_date: string;
  first_name: string;
  last_name: string;
  hospital_number: string;
  gender: string;
  phone: string;
  weight: string;
  height: string;
  waist: string;
  diabetes_type: string;
  blood_sugar: string;
  hba1c: string;
  hospital_name: string;
  subdistrict_health_center: string;
  house_number: string;
  village_no: string;
  village_name: string;
  soi: string;
  road: string;
  province: string;
  district: string;
  subdistrict: string;
  postal_code: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
  coach_name: string;
}

interface ValidationResult {
  row: number;
  data: PatientImportData;
  errors: string[];
  warnings: string[];
  isValid: boolean;
  hospital_id?: string;
  coach_id?: string;
}

interface UserHospital {
  id: string;
  name: string;
  code: string;
  type: 'main' | 'sub';
  parent_id: string | null;
}

export default function ImportPatientsExcelPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [coaches, setCoaches] = useState<any[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

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

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('Error loading user hospital:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      
      // ✅ โหลดรายการโรงพยาบาล
      const { data } = await supabase
        .from('hospitals')
        .select('*')
        .eq('is_active', true);
      
      if (data) {
        setHospitals(data);
      }

      // ✅ โหลดโค้ช
      await loadCoaches(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  // ✅ โหลดโค้ช
  const loadCoaches = async (hospitalIds: string[]) => {
    try {
      let query = supabase
        .from('doctors')
        .select(`id, user_id, full_name_th, specialization_th, users!inner(hospital_id)`)
        .eq('is_active', true);

      if (hospitalIds.length > 0 && !isSuperAdmin(user)) {
        query = query.in('users.hospital_id', hospitalIds);
      }

      const { data } = await query;
      if (data) {
        setCoaches(data);
      }
    } catch (error) {
      console.error('Error loading coaches:', error);
    }
  };

  // ✅ ดาวน์โหลด Template
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

  // ✅ อ่านไฟล์ Excel
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
      'application/csv'
    ];

    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
      alert('❌ กรุณาเลือกไฟล์ Excel (.xlsx, .xls) หรือ CSV เท่านั้น');
      return;
    }

    setFile(selectedFile);
    await parseFile(selectedFile);
  };

  // ✅ แปลงไฟล์ Excel/CSV
  const parseFile = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('❌ ไฟล์ไม่มีข้อมูลผู้ป่วย');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      const results: ValidationResult[] = [];

      // ✅ ตรวจสอบคอลัมน์ที่จำเป็น
      const requiredColumns = [
        'เลขบัตรประชาชน',
        'ชื่อ',
        'นามสกุล',
        'HN',
        'วันเกิด',
        'เพศ',
        'โรงพยาบาล'
      ];

      const missingColumns = requiredColumns.filter(col => !headers.includes(col));
      if (missingColumns.length > 0) {
        alert(`❌ ไฟล์ขาดคอลัมน์ที่จำเป็น: ${missingColumns.join(', ')}`);
        return;
      }

      // ✅ ประมวลผลแต่ละแถว
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((header, idx) => {
          row[header] = values[idx] || '';
        });

        const validation = validateRow(row, i + 1);
        results.push(validation);
      }

      setValidationResults(results);
      setSuccessCount(results.filter(r => r.isValid).length);
      setErrorCount(results.filter(r => !r.isValid).length);
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('❌ เกิดข้อผิดพลาดในการอ่านไฟล์');
    }
  };

  // ✅ ตรวจสอบความถูกต้องของแต่ละแถว
  const validateRow = (row: any, rowNum: number): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // ✅ ตรวจสอบเลขบัตรประชาชน
    if (!row['เลขบัตรประชาชน'] || row['เลขบัตรประชาชน'].toString().length !== 13) {
      errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
    }

    // ✅ ตรวจสอบชื่อ-นามสกุล
    if (!row['ชื่อ']) errors.push('ต้องระบุชื่อ');
    if (!row['นามสกุล']) errors.push('ต้องระบุนามสกุล');
    if (!row['HN']) errors.push('ต้องระบุ HN');
    if (!row['โรงพยาบาล']) errors.push('ต้องระบุโรงพยาบาล');

    // ✅ ตรวจสอบวันเกิด
    if (!row['วันเกิด']) {
      errors.push('ต้องระบุวันเกิด');
    } else {
      // ✅ ตรวจสอบรูปแบบวันเกิด (DD/MM/YYYY)
      const datePattern = /^\d{2}\/\d{2}\/\d{4}$/;
      if (!datePattern.test(row['วันเกิด'])) {
        errors.push('รูปแบบวันเกิดต้องเป็น DD/MM/YYYY');
      }
    }

    // ✅ ตรวจสอบเพศ
    if (row['เพศ'] && !['ชาย', 'หญิง'].includes(row['เพศ'])) {
      errors.push('เพศต้องเป็น "ชาย" หรือ "หญิง"');
    }

    // ✅ ตรวจสอบโรงพยาบาล
    if (row['โรงพยาบาล']) {
      const hospital = hospitals.find(h => 
        h.name === row['โรงพยาบาล'] || h.code === row['โรงพยาบาล']
      );
      if (!hospital) {
        warnings.push(`ไม่พบโรงพยาบาล "${row['โรงพยาบาล']}" ในระบบ`);
      }
    }

    // ✅ ตรวจสอบน้ำหนัก
    if (row['น้ำหนัก']) {
      const weight = parseFloat(row['น้ำหนัก']);
      if (isNaN(weight) || weight < 30 || weight > 200) {
        warnings.push('น้ำหนักต้องอยู่ระหว่าง 30-200 กก.');
      }
    }

    // ✅ ตรวจสอบส่วนสูง
    if (row['ส่วนสูง']) {
      const height = parseFloat(row['ส่วนสูง']);
      if (isNaN(height) || height < 100 || height > 250) {
        warnings.push('ส่วนสูงต้องอยู่ระหว่าง 100-250 ซม.');
      }
    }

    // ✅ ตรวจสอบโค้ช
    if (row['ชื่อผู้ดูแล (อสม.)']) {
      const coach = coaches.find(c => c.full_name_th === row['ชื่อผู้ดูแล (อสม.)']);
      if (!coach) {
        warnings.push(`ไม่พบโค้ช "${row['ชื่อผู้ดูแล (อสม.)']}" ในระบบ`);
      }
    }

    return {
      row: rowNum,
      data: {
        id_card: row['เลขบัตรประชาชน'] || '',
        birth_date: row['วันเกิด'] || '',
        first_name: row['ชื่อ'] || '',
        last_name: row['นามสกุล'] || '',
        hospital_number: row['HN'] || '',
        gender: row['เพศ'] || 'male',
        phone: row['เบอร์โทร'] || '',
        weight: row['น้ำหนัก'] || '',
        height: row['ส่วนสูง'] || '',
        waist: row['รอบเอว(ซม.)'] || '',
        diabetes_type: row['ประเภทเบาหวาน'] || '',
        blood_sugar: row['ค่าน้ำตาลในเลือด'] || '',
        hba1c: row['ค่า HbA1c ล่าสุด (ถ้ามี)'] || '',
        hospital_name: row['โรงพยาบาล'] || '',
        subdistrict_health_center: row['รพ.สต.'] || '',
        house_number: row['บ้านเลขที่'] || '',
        village_no: row['หมู่ที่/ชุมชน'] || '',
        village_name: row['หมู่บ้าน'] || '',
        soi: row['ซอย'] || '',
        road: row['ถนน'] || '',
        province: row['จังหวัด'] || '',
        district: row['อำเภอ'] || '',
        subdistrict: row['ตำบล'] || '',
        postal_code: row['รหัสไปรษณีย์'] || '',
        emergency_contact_name: row['ชื่อผู้ติดต่อ(ญาติ)'] || '',
        emergency_contact_phone: row['เบอร์โทร'] || '',
        emergency_contact_relationship: row['ความสัมพันธ์'] || '',
        coach_name: row['ชื่อผู้ดูแล (อสม.)'] || ''
      },
      errors,
      warnings,
      isValid: errors.length === 0
    };
  };

  // ✅ แปลงวันเกิดจาก พ.ศ. เป็น ค.ศ.
  const convertThaiDateToAD = (thaiDate: string): string => {
    try {
      const parts = thaiDate.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        let year = parseInt(parts[2]);
        if (year > 2500) {
          year = year - 543; // Convert BE to AD
        }
        return `${year}-${month}-${day}`;
      }
      return thaiDate;
    } catch (error) {
      return thaiDate;
    }
  };

  // ✅ นำเข้าข้อมูล
  const handleImport = async () => {
    const validRows = validationResults.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('❌ ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
      return;
    }

    if (!confirm(`✅ คุณต้องการนำเข้า ${validRows.length} รายหรือไม่?\n\n⚠️ ข้อมูลที่ผิดพลาด ${errorCount} ราย will be skipped`)) {
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const result of validRows) {
      try {
        // ✅ ค้นหา hospital_id
        const hospital = hospitals.find(h => 
          h.name === result.data.hospital_name || h.code === result.data.hospital_name
        );

        // ✅ ค้นหา coach_id
        const coach = coaches.find(c => c.full_name_th === result.data.coach_name);

        // ✅ แปลงวันเกิด
        const birthDate = convertThaiDateToAD(result.data.birth_date);

        // ✅ สร้างรหัสผ่านจากวันเกิด
        const password = result.data.birth_date; // dd/mm/yyyy

        // ✅ ตรวจสอบว่า id_card มีอยู่แล้วหรือไม่
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('id_card', result.data.id_card)
          .maybeSingle();

        if (existingUser) {
          errorCount++;
          console.warn(`⚠️ User with id_card ${result.data.id_card} already exists`);
          continue;
        }

        // ✅ สร้าง User
        const { data: newUser, error: userError } = await supabase
          .from('users')
          .insert({
            id_card: result.data.id_card,
            password_hash: password,
            role: 'patient',
            hospital_id: hospital?.id || null,
            birth_date: birthDate,
            created_by: user?.id,
            is_active: true
          })
          .select()
          .single();

        if (userError) {
          errorCount++;
          console.error('Error creating user:', userError);
          continue;
        }

        // ✅ สร้าง Profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: newUser.id,
            hospital_number: result.data.hospital_number,
            first_name: result.data.first_name,
            last_name: result.data.last_name,
            birth_date: birthDate,
            gender: result.data.gender === 'ชาย' ? 'male' : 'female',
            phone: result.data.phone || null,
            current_weight: result.data.weight ? parseFloat(result.data.weight) : null,
            height: result.data.height ? parseFloat(result.data.height) : null,
            waist_circumference: result.data.waist ? parseFloat(result.data.waist) : null,
            diabetes_type: result.data.diabetes_type || null,
            blood_sugar: result.data.blood_sugar ? parseFloat(result.data.blood_sugar) : null,
            hba1c_level: result.data.hba1c ? parseFloat(result.data.hba1c) : null,
            house_number: result.data.house_number || null,
            village_no: result.data.village_no || null,
            village_name: result.data.village_name || null,
            soi: result.data.soi || null,
            road: result.data.road || null,
            subdistrict: result.data.subdistrict || null,
            district: result.data.district || null,
            province: result.data.province || null,
            postal_code: result.data.postal_code || null,
            emergency_contact_name: result.data.emergency_contact_name || null,
            emergency_contact_phone: result.data.emergency_contact_phone || null,
            emergency_contact_relationship: result.data.emergency_contact_relationship || null,
            hospital_id: hospital?.id || null,
            coach_id: coach?.user_id || null,
            pam_level: 'L0',
            pam_score: 0,
            zone: 'Zero Zone',
            is_active: true,
            status: 'active'
          });

        if (profileError) {
          // ✅ ลบ user หากสร้าง profile ไม่สำเร็จ
          await supabase.from('users').delete().eq('id', newUser.id);
          errorCount++;
          console.error('Error creating profile:', profileError);
          continue;
        }

        successCount++;
      } catch (error) {
        errorCount++;
        console.error('Error importing row:', error);
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
              <p className="text-gray-600">อัปโหลดไฟล์ Excel เพื่อนำเข้าผู้ป่วยหลายรายพร้อมกัน</p>
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
        
        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-2">📋 คำแนะนำการเตรียมไฟล์</p>
              <ul className="space-y-1">
                <li>• ใช้ไฟล์ .xlsx, .xls หรือ .csv</li>
                <li>• คอลัมน์ที่จำเป็น: เลขบัตรประชาชน, ชื่อ, นามสกุล, HN, วันเกิด, เพศ, โรงพยาบาล</li>
                <li>• เลขบัตรประชาชนต้อง 13 หลัก และไม่ซ้ำในระบบ</li>
                <li>• HN ต้องไม่ซ้ำในระบบ</li>
                <li>• รูปแบบวันเกิด: DD/MM/YYYY (พ.ศ.)</li>
                <li>• โรงพยาบาลต้องตรงกับชื่อหรือรหัสในระบบ</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Download Template */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-green-600" />
            ดาวน์โหลดไฟล์ต้นแบบ
          </h2>
          <p className="text-gray-600 mb-4">ดาวน์โหลดไฟล์ตัวอย่างเพื่อใช้เป็นแนวทางในการกรอกข้อมูล</p>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
          >
            <Download className="w-4 h-4" />
            ดาวน์โหลด Template (CSV)
          </button>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600" />
            อัปโหลดไฟล์
          </h2>
          
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
              id="fileInput"
            />
            <label htmlFor="fileInput" className="cursor-pointer">
              <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</p>
              <p className="text-sm text-gray-400 mt-1">รองรับไฟล์ .xlsx, .xls, .csv</p>
            </label>
          </div>

          {file && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                <span className="text-sm text-blue-800">{file.name} ({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
              <button
                onClick={() => { setFile(null); setValidationResults([]); }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                ลบ
              </button>
            </div>
          )}
        </div>

        {/* Validation Results */}
        {validationResults.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-purple-600" />
              ผลการตรวจสอบ ({validationResults.length} ราย)
            </h2>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-blue-600">ทั้งหมด</p>
                <p className="text-2xl font-bold text-blue-800">{validationResults.length}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                <p className="text-sm text-green-600">พร้อมนำเข้า</p>
                <p className="text-2xl font-bold text-green-800">{successCount}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <p className="text-sm text-red-600">ผิดพลาด</p>
                <p className="text-2xl font-bold text-red-800">{errorCount}</p>
              </div>
            </div>

            {/* Preview Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">แถว</th>
                    <th className="px-3 py-2 text-left">HN</th>
                    <th className="px-3 py-2 text-left">ชื่อ-นามสกุล</th>
                    <th className="px-3 py-2 text-left">บัตร ปชช.</th>
                    <th className="px-3 py-2 text-left">โรงพยาบาล</th>
                    <th className="px-3 py-2 text-left">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {validationResults.slice(0, 10).map((result, idx) => (
                    <tr key={idx} className={`border-t ${!result.isValid ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2">{result.row}</td>
                      <td className="px-3 py-2 font-medium">{result.data.hospital_number}</td>
                      <td className="px-3 py-2">{result.data.first_name} {result.data.last_name}</td>
                      <td className="px-3 py-2">{result.data.id_card}</td>
                      <td className="px-3 py-2">{result.data.hospital_name}</td>
                      <td className="px-3 py-2">
                        {result.isValid ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            ✓ พร้อมนำเข้า
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">
                            ✗ ต้องแก้ไข
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {validationResults.length > 10 && (
                <p className="text-sm text-gray-500 mt-2 text-center">
                  ...และอีก {validationResults.length - 10} ราย
                </p>
              )}
            </div>

            {/* Error Details */}
            {errorCount > 0 && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  ข้อผิดพลาดที่พบบ่อย
                </h3>
                <ul className="text-sm text-red-700 space-y-1">
                  {validationResults
                    .flatMap(r => r.errors)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .slice(0, 5)
                    .map((error, idx) => (
                      <li key={idx}>• {error}</li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {validationResults.length > 0 && (
          <div className="flex gap-4">
            <button
              onClick={handleImport}
              disabled={importing || successCount === 0}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold py-4 rounded-xl hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  กำลังนำเข้า...
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  นำเข้า {successCount} ราย
                </>
              )}
            </button>
            <button
              onClick={() => {
                setFile(null);
                setValidationResults([]);
                setSuccessCount(0);
                setErrorCount(0);
              }}
              className="px-6 py-4 bg-gray-500 text-white font-bold rounded-xl hover:bg-gray-600 transition-all"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </div>
    </div>
  );
}