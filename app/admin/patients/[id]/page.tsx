// app/admin/patients/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Edit, FileText, Activity, MapPin, Phone, User, Hospital } from 'lucide-react';

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);

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
    loadPatientData();
  }, [router]);

  const loadPatientData = async () => {
    try {
      const data = await getPatientDetail(patientId);
      setPatient(data);
    } catch (error) {
      console.error('Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // ✅ ฟังก์ชันแสดงผลวันที่
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // ✅ ฟังก์ชันคำนวณอายุ
  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return '-';
    const birthDate = new Date(birthDateString);
    const today = new Date();
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 0 ? age : '-';
  };

  // ✅ ฟังก์ชันแสดงชื่อผู้ป่วย (รวม first_name + last_name)
  const getPatientName = () => {
    if (patient?.first_name && patient?.last_name) {
      return `${patient.first_name} ${patient.last_name}`;
    }
    return patient?.full_name || 'ไม่ระบุชื่อ';
  };

  // ✅ ฟังก์ชันแสดงที่อยู่เต็มรูปแบบ (แก้ไขแล้ว - เพิ่ม address_line1)
  const getFullAddress = () => {
    if (!patient) return '-';
    const parts = [
      patient.house_number,
      patient.address_line1,  // ✅ เพิ่ม address_line1
      patient.village_no ? `หมู่ ${patient.village_no}` : '',
      patient.village_name,
      patient.soi,
      patient.road,
      patient.subdistrict,
      patient.district,
      patient.province,
      patient.postal_code,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(' ') : '-';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">กำลังโหลด...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">ไม่พบข้อมูลผู้ป่วย</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 pb-20">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-white/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <button
                onClick={() => router.push('/admin/patients')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>กลับรายการผู้ป่วย</span>
              </button>
              <h1 className="text-3xl font-bold text-gray-800">รายละเอียดผู้ป่วย</h1>
              <p className="text-gray-600">
                HN: {patient.hospital_number} | {getPatientName()}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Edit className="w-4 h-4" />
                แก้ไขข้อมูล
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-800">ข้อมูลส่วนตัว</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">HN</p>
                <p className="font-semibold">{patient.hospital_number || '-'}</p>
              </div>
              
              {/* ✅ แสดงชื่อ-นามสกุล แยกกัน */}
              <div>
                <p className="text-sm text-gray-500">ชื่อ-นามสกุล</p>
                <p className="font-semibold">{getPatientName()}</p>
                {patient.first_name && patient.last_name && (
                  <p className="text-xs text-gray-400 mt-1">
                    ชื่อ: {patient.first_name} | นามสกุล: {patient.last_name}
                  </p>
                )}
              </div>
              
              <div>
                <p className="text-sm text-gray-500">วันเกิด</p>
                <p className="font-semibold">{formatDate(patient.birth_date)}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">อายุ</p>
                <p className="font-semibold">{calculateAge(patient.birth_date)} ปี</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">เพศ</p>
                <p className="font-semibold">
                  {patient.gender === 'male' ? 'ชาย' : 
                   patient.gender === 'female' ? 'หญิง' : '-'}
                </p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">เบอร์โทรศัพท์</p>
                <p className="font-semibold">{patient.phone || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">อีเมล</p>
                <p className="font-semibold">{patient.email || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">บัตรประชาชน</p>
                <p className="font-semibold font-mono">{patient.users?.id_card || '-'}</p>
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-bold text-gray-800">ข้อมูลสุขภาพ</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">น้ำหนัก (kg)</p>
                <p className="font-semibold">{patient.current_weight ? `${patient.current_weight} kg` : '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ส่วนสูง (cm)</p>
                <p className="font-semibold">{patient.height ? `${patient.height} cm` : '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">รอบเอว (cm)</p>
                <p className="font-semibold">{patient.waist_circumference ? `${patient.waist_circumference} cm` : '-'}</p>
              </div>
              
              {patient.current_weight && patient.height && (
                <div>
                  <p className="text-sm text-gray-500">BMI</p>
                  <p className="font-semibold">
                    {((patient.current_weight / ((patient.height / 100) ** 2)).toFixed(1))}
                  </p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-gray-500">ประเภทเบาหวาน</p>
                <p className="font-semibold">{patient.diabetes_type || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">วันที่วินิจฉัย</p>
                <p className="font-semibold">{formatDate(patient.diagnosis_date)}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ค่า HbA1c</p>
                <p className="font-semibold">{patient.hba1c_level || '-'}</p>
              </div>
              
              {/* ❌ ลบหมู่เลือดออก (ไม่มีใน Schema แล้ว) */}
              
              {/* ✅ แสดงหมายเหตุ (แทน allergies) */}
              <div>
                <p className="text-sm text-gray-500">หมายเหตุ (คำแนะนำเพิ่มเติม)</p>
                <p className="font-semibold">{patient.notes || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">อาชีพ</p>
                <p className="font-semibold">{patient.occupation || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ระดับการศึกษา</p>
                <p className="font-semibold">{patient.education_level || '-'}</p>
              </div>
            </div>
          </div>

          {/* ที่อยู่ - ✅ แก้ไขแล้ว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-800">ที่อยู่</h2>
            </div>
            
            <div className="space-y-3">
              {/* ✅ แสดงที่อยู่แบบแยกส่วน */}
              <div>
                <p className="text-sm text-gray-500">ที่อยู่เต็ม</p>
                <p className="font-semibold">{getFullAddress()}</p>
              </div>
              
              {/* ✅ แสดง address_line1 แยก (ถ้ามี) */}
              {patient.address_line1 && (
                <div>
                  <p className="text-sm text-gray-500">ที่อยู่เพิ่มเติม</p>
                  <p className="font-semibold">{patient.address_line1}</p>
                </div>
              )}
              
              {/* แสดงรายละเอียดที่อยู่แยกส่วน (สำหรับตรวจสอบ) */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                {patient.house_number && (
                  <div>
                    <p className="text-xs text-gray-400">เลขที่</p>
                    <p className="font-medium">{patient.house_number}</p>
                  </div>
                )}
                {patient.village_no && (
                  <div>
                    <p className="text-xs text-gray-400">หมู่ที่</p>
                    <p className="font-medium">{patient.village_no}</p>
                  </div>
                )}
                {patient.village_name && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-400">หมู่บ้าน</p>
                    <p className="font-medium">{patient.village_name}</p>
                  </div>
                )}
                {patient.soi && (
                  <div>
                    <p className="text-xs text-gray-400">ซอย</p>
                    <p className="font-medium">{patient.soi}</p>
                  </div>
                )}
                {patient.road && (
                  <div>
                    <p className="text-xs text-gray-400">ถนน</p>
                    <p className="font-medium">{patient.road}</p>
                  </div>
                )}
                {patient.subdistrict && (
                  <div>
                    <p className="text-xs text-gray-400">ตำบล</p>
                    <p className="font-medium">{patient.subdistrict}</p>
                  </div>
                )}
                {patient.district && (
                  <div>
                    <p className="text-xs text-gray-400">อำเภอ/เขต</p>
                    <p className="font-medium">{patient.district}</p>
                  </div>
                )}
                {patient.province && (
                  <div>
                    <p className="text-xs text-gray-400">จังหวัด</p>
                    <p className="font-medium">{patient.province}</p>
                  </div>
                )}
                {patient.postal_code && (
                  <div>
                    <p className="text-xs text-gray-400">รหัสไปรษณีย์</p>
                    <p className="font-medium">{patient.postal_code}</p>
                  </div>
                )}
              </div>
              
              {/* ✅ แสดง รพสต */}
              {patient.subdistrict_health_center && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex items-center gap-2">
                    <Hospital className="w-4 h-4 text-red-500" />
                    <div>
                      <p className="text-xs text-gray-500">โรงพยาบาลส่งเสริมสุขภาพตำบล (รพสต)</p>
                      <p className="font-semibold text-red-600">{patient.subdistrict_health_center}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ผู้ติดต่อฉุกเฉิน */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Phone className="w-5 h-5 text-red-600" />
              <h2 className="text-xl font-bold text-gray-800">ผู้ติดต่อฉุกเฉิน</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">ชื่อผู้ติดต่อ</p>
                <p className="font-semibold">{patient.emergency_contact_name || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">เบอร์โทรศัพท์</p>
                <p className="font-semibold">{patient.emergency_contact_phone || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">ความสัมพันธ์</p>
                <p className="font-semibold">{patient.emergency_contact_relationship || '-'}</p>
              </div>
            </div>
          </div>

          {/* สถานะการประเมิน */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-5 h-5 text-orange-600" />
              <h2 className="text-xl font-bold text-gray-800">สถานะการประเมิน</h2>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-lg border-2 ${
                patient.pam_level === 'L1' ? 'bg-red-50 border-red-500' :
                patient.pam_level === 'L2' ? 'bg-yellow-50 border-yellow-500' :
                patient.pam_level === 'L3' ? 'bg-blue-50 border-blue-500' :
                'bg-green-50 border-green-500'
              }`}>
                <p className="text-sm text-gray-600 mb-1">PAM Level</p>
                <p className="text-2xl font-bold">{patient.pam_level || 'L1'}</p>
              </div>
              
              <div className={`p-4 rounded-lg border-2 ${
                patient.zone === 'Red Zone' ? 'bg-red-50 border-red-500' :
                patient.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-500' :
                'bg-green-50 border-green-500'
              }`}>
                <p className="text-sm text-gray-600 mb-1">Zone</p>
                <p className="text-lg font-bold">{patient.zone || 'Green Zone'}</p>
              </div>
              
              <div className="p-4 rounded-lg border-2 bg-purple-50 border-purple-500">
                <p className="text-sm text-gray-600 mb-1">Step</p>
                <p className="text-lg font-bold">{patient.current_step || 'Starter'}</p>
              </div>
              
              <div className="p-4 rounded-lg border-2 bg-orange-50 border-orange-500">
                <p className="text-sm text-gray-600 mb-1">คะแนน PAM</p>
                <p className="text-2xl font-bold">{patient.pam_score || 18}</p>
              </div>
            </div>
          </div>

          {/* ข้อมูลเพิ่มเติม */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ข้อมูลอื่นๆ</h2>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">วันที่ลงทะเบียน</p>
                <p className="font-semibold">{formatDate(patient.created_at)}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">สถานะ</p>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                  patient.status === 'active' ? 'bg-green-100 text-green-700' :
                  patient.status === 'inactive' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {patient.status === 'active' ? 'ใช้งาน' : 
                   patient.status === 'inactive' ? 'ไม่ใช้งาน' : 
                   patient.status || 'ไม่ทราบ'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}