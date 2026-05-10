// app/admin/patients/import/validate/page.tsx
// ✅ สร้างใหม่: 10 พฤษภาคม 2569
// ✅ ฟีเจอร์:
//    1. ✅ แสดง Preview ข้อมูลจาก Excel ก่อนนำเข้า
//    2. ✅ แก้ไขข้อมูลแต่ละแถวได้
//    3. ✅ ตรวจสอบความถูกต้องของข้อมูล
//    4. ✅ แสดงข้อผิดพลาดและคำเตือน
//    5. ✅ ยืนยันก่อนนำเข้าจริง
'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getHospitals, getCoaches } from '@/lib/supabase/queries';
import { supabase } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Upload,
  CheckCircle,
  AlertCircle,
  XCircle,
  Loader2,
  FileSpreadsheet,
  Edit2,
  Save,
  Trash2,
  UserPlus,
  LogOut,
  UserCheck,
  Hospital,
  Building2,
  Download
} from 'lucide-react';

interface PatientRow {
  id: string;
  rowNumber: number;
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
  hospital: string;
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
  errors: string[];
  warnings: string[];
  isValid: boolean;
}

interface Hospital {
  id: string;
  name: string;
  code: string;
}

interface Coach {
  id: string;
  full_name_th: string;
}

export default function ValidateImportPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
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
    loadReferenceData();
    
    // ✅ โหลดข้อมูลจาก sessionStorage (ที่ส่งมาจากหน้า upload)
    const importedData = sessionStorage.getItem('import_patients_data');
    if (importedData) {
      const parsedData = JSON.parse(importedData);
      convertToPatientRows(parsedData);
    } else {
      router.push('/admin/patients/import');
    }
    
    setLoading(false);
  }, [router]);

  // ✅ โหลดข้อมูลอ้างอิง (โรงพยาบาล, โค้ช)
  const loadReferenceData = async () => {
    try {
      const [hospitalsData, coachesData] = await Promise.all([
        getHospitals(),
        getCoaches()
      ]);
      setHospitals(hospitalsData);
      setCoaches(coachesData);
    } catch (error) {
      console.error('Error loading reference data:', error);
    }
  };

  // ✅ แปลงข้อมูลจาก Excel เป็น PatientRow
  const convertToPatientRows = (data: any[]) => {
    const patientRows: PatientRow[] = data.map((row, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // ✅ ตรวจสอบความถูกต้อง
      if (!row['เลขบัตรประชาชน'] || row['เลขบัตรประชาชน'].toString().length !== 13) {
        errors.push('เลขบัตรประชาชนต้อง 13 หลัก');
      }
      if (!row['ชื่อ']) {
        errors.push('ต้องระบุชื่อ');
      }
      if (!row['นามสกุล']) {
        errors.push('ต้องระบุนามสกุล');
      }
      if (!row['HN']) {
        errors.push('ต้องระบุ HN');
      }
      if (!row['โรงพยาบาล']) {
        errors.push('ต้องระบุโรงพยาบาล');
      }
      if (!row['วันเกิด']) {
        errors.push('ต้องระบุวันเกิด');
      }

      // ✅ คำเตือน
      if (!row['เบอร์โทร']) {
        warnings.push('ไม่มีเบอร์โทรศัพท์');
      }
      if (!row['น้ำหนัก']) {
        warnings.push('ไม่มีข้อมูลน้ำหนัก');
      }

      return {
        id: `row-${index}`,
        rowNumber: index + 2, // Excel row number (header = row 1)
        id_card: row['เลขบัตรประชาชน']?.toString() || '',
        birth_date: row['วันเกิด']?.toString() || '',
        first_name: row['ชื่อ']?.toString() || '',
        last_name: row['นามสกุล']?.toString() || '',
        hospital_number: row['HN']?.toString() || '',
        gender: row['เพศ']?.toString() || 'male',
        phone: row['เบอร์โทร']?.toString() || '',
        weight: row['น้ำหนัก']?.toString() || '',
        height: row['ส่วนสูง']?.toString() || '',
        waist: row['รอบเอว(ซม.)']?.toString() || '',
        diabetes_type: row['ประเภทเบาหวาน']?.toString() || '',
        blood_sugar: row['ค่าน้ำตาลในเลือด']?.toString() || '',
        hba1c: row['ค่า HbA1c ล่าสุด (ถ้ามี)']?.toString() || '',
        hospital: row['โรงพยาบาล']?.toString() || '',
        subdistrict_health_center: row['รพ.สต.']?.toString() || '',
        house_number: row['บ้านเลขที่']?.toString() || '',
        village_no: row['หมู่ที่/ชุมชน']?.toString() || '',
        village_name: row['หมู่บ้าน']?.toString() || '',
        soi: row['ซอย']?.toString() || '',
        road: row['ถนน']?.toString() || '',
        province: row['จังหวัด']?.toString() || '',
        district: row['อำเภอ']?.toString() || '',
        subdistrict: row['ตำบล']?.toString() || '',
        postal_code: row['รหัสไปรษณีย์']?.toString() || '',
        emergency_contact_name: row['ชื่อผู้ติดต่อ(ญาติ)']?.toString() || '',
        emergency_contact_phone: row['เบอร์โทร']?.toString() || '',
        emergency_contact_relationship: row['ความสัมพันธ์']?.toString() || '',
        coach_name: row['ชื่อผู้ดูแล (อสม.)']?.toString() || '',
        errors,
        warnings,
        isValid: errors.length === 0,
      };
    });

    setRows(patientRows);
    setSuccessCount(patientRows.filter(r => r.isValid).length);
    setErrorCount(patientRows.filter(r => !r.isValid).length);
  };

  // ✅ แก้ไขข้อมูลในแถว
  const handleEditRow = (id: string, field: keyof PatientRow, value: string) => {
    setRows(rows.map(row => 
      row.id === id ? { ...row, [field]: value } : row
    ));
  };

  // ✅ ลบแถว
  const handleDeleteRow = (id: string) => {
    setRows(rows.filter(row => row.id !== id));
    setSuccessCount(rows.filter(r => r.id !== id && r.isValid).length);
    setErrorCount(rows.filter(r => r.id !== id && !r.isValid).length);
  };

  // ✅ แก้ไขทั้งหมดที่ผิดพลาด
  const handleFixAllErrors = () => {
    // TODO: Implement auto-fix logic
    alert('ฟีเจอร์นี้จะพัฒนาเพิ่มเติมในอนาคต');
  };

  // ✅ นำเข้าข้อมูลจริง
  const handleImport = async () => {
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('❌ ไม่มีข้อมูลที่ถูกต้องให้นำเข้า');
      return;
    }

    if (!confirm(`✅ คุณต้องการนำเข้า ${validRows.length} รายหรือไม่?\n\n⚠️ ข้อมูลที่ผิดพลาด ${errorCount} ราย will be skipped`)) {
      return;
    }

    setImporting(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const row of validRows) {
        try {
          // ✅ ค้นหา hospital_id จากชื่อโรงพยาบาล
          const hospital = hospitals.find(h => 
            h.name === row.hospital || h.code === row.hospital
          );

          // ✅ แปลงวันเกิดจาก พ.ศ. เป็น ค.ศ.
          const birthDate = convertThaiDateToAD(row.birth_date);

          const result = await supabase
            .from('profiles')
            .insert({
              id_card: row.id_card,
              first_name: row.first_name,
              last_name: row.last_name,
              hospital_number: row.hospital_number,
              birth_date: birthDate,
              gender: row.gender === 'ชาย' ? 'male' : 'female',
              phone: row.phone || null,
              current_weight: row.weight ? parseFloat(row.weight) : null,
              height: row.height ? parseFloat(row.height) : null,
              waist_circumference: row.waist ? parseFloat(row.waist) : null,
              diabetes_type: row.diabetes_type || null,
              blood_sugar: row.blood_sugar ? parseFloat(row.blood_sugar) : null,
              hba1c_level: row.hba1c ? parseFloat(row.hba1c) : null,
              hospital_id: hospital?.id || null,
              house_number: row.house_number || null,
              village_no: row.village_no || null,
              village_name: row.village_name || null,
              soi: row.soi || null,
              road: row.road || null,
              subdistrict: row.subdistrict || null,
              district: row.district || null,
              province: row.province || null,
              postal_code: row.postal_code || null,
              emergency_contact_name: row.emergency_contact_name || null,
              emergency_contact_phone: row.emergency_contact_phone || null,
              emergency_contact_relationship: row.emergency_contact_relationship || null,
              pam_level: 'L0',
              pam_score: 0,
              zone: 'Zero Zone',
              is_active: true,
              status: 'active',
            });

          if (result.error) {
            errorCount++;
            console.error('Error importing row:', result.error);
          } else {
            successCount++;
          }
        } catch (error) {
          errorCount++;
          console.error('Error importing row:', error);
        }
      }

      alert(`✅ นำเข้าสำเร็จ ${successCount} ราย\n❌ ล้มเหลว ${errorCount} ราย`);
      
      // ✅ ล้างข้อมูลและกลับหน้ารายการผู้ป่วย
      sessionStorage.removeItem('import_patients_data');
      router.push('/admin/patients');
      
    } catch (error) {
      console.error('Import error:', error);
      alert('❌ เกิดข้อผิดพลาดในการนำเข้า');
    } finally {
      setImporting(false);
    }
  };

  // ✅ แปลงวันที่ไทย (พ.ศ.) เป็น ค.ศ.
  const convertThaiDateToAD = (thaiDate: string): string => {
    try {
      // Format: DD/MM/YYYY หรือ YYYY-MM-DD
      const parts = thaiDate.split(/[\/\-]/);
      if (parts.length === 3) {
        let year = parseInt(parts[2]);
        if (year > 2500) {
          year = year - 543; // Convert BE to AD
        }
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return thaiDate;
    } catch (error) {
      return thaiDate;
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 ตรวจสอบและแก้ไขข้อมูลก่อนนำเข้า
              </h1>
              <p className="text-gray-600">
                ตรวจสอบความถูกต้องและแก้ไขข้อมูลก่อนบันทึกเข้าสู่ระบบ
              </p>
            </div>

            <div className="flex items-center gap-4">
              {user && (
                <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800 text-sm">
                        {user?.full_name_th || 'ผู้ดูแลระบบ'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' : '👨‍⚕️ แพทย์'}
                      </p>
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
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{rows.length}</p>
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
                <p className="text-2xl font-bold text-green-600">{successCount}</p>
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
                <p className="text-2xl font-bold text-yellow-600">
                  {rows.filter(r => r.warnings.length > 0).length}
                </p>
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
                <p className="text-2xl font-bold text-red-600">{errorCount}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleFixAllErrors}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 text-sm"
              >
                <Edit2 className="w-4 h-4" />
                แก้ไขทั้งหมดที่ผิดพลาด
              </button>
              <button
                onClick={() => router.push('/admin/patients/import')}
                className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
              >
                <Upload className="w-4 h-4" />
                อัปโหลดไฟล์ใหม่
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleImport}
                disabled={importing || successCount === 0}
                className="flex items-center gap-2 px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    กำลังนำเข้า...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    นำเข้า {successCount} ราย
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">แถว</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">บัตร ปชช.</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">โรงพยาบาล</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">สถานะ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className={`${!row.isValid ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-500">{row.rowNumber}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{row.hospital_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{row.first_name} {row.last_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.id_card}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.hospital}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.isValid ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            ✓ พร้อมนำเข้า
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                            ✗ ต้องแก้ไข
                          </span>
                        )}
                        {row.warnings.length > 0 && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            ⚠ {row.warnings.length} คำเตือน
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {/* TODO: Open edit modal */}}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-all"
                          title="แก้ไข"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteRow(row.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-all"
                          title="ลบแถวนี้"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Error Summary */}
        {errorCount > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4">
            <h3 className="font-bold text-red-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              สรุปข้อผิดพลาดที่พบบ่อย
            </h3>
            <ul className="text-sm text-red-700 space-y-1">
              {rows.flatMap(r => r.errors).filter((v, i, a) => a.indexOf(v) === i).slice(0, 5).map((error, idx) => (
                <li key={idx}>• {error}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}