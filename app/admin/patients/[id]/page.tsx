'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Edit, FileText, Activity, MapPin, Phone, User } from 'lucide-react';

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

  // ✅ ฟังก์ชันแสดงผลวันที่ - ปรับให้ถูกต้อง
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    
    const date = new Date(dateString);
    
    // ตรวจสอบว่าเป็นปี ค.ศ. หรือ พ.ศ.
    // ถ้าปี > 2500 แสดงว่าเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ก่อน
    const year = date.getFullYear();
    
    let displayYear = year;
    if (year > 2500) {
      // เป็น พ.ศ. → แปลงเป็น ค.ศ. สำหรับการแสดงผล
      displayYear = year - 543;
      date.setFullYear(displayYear);
    }
    
    // แสดงผลเป็นภาษาไทย (พ.ศ.)
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // ✅ ฟังก์ชันคำนวณอายุ - ปรับให้ถูกต้อง
  const calculateAge = (birthDateString: string) => {
    if (!birthDateString) return '-';
    
    const birthDate = new Date(birthDateString);
    const today = new Date();
    
    // ตรวจสอบว่าเป็นปี พ.ศ. หรือ ค.ศ.
    let birthYear = birthDate.getFullYear();
    if (birthYear > 2500) {
      // เป็น พ.ศ. → แปลงเป็น ค.ศ.
      birthYear = birthYear - 543;
      birthDate.setFullYear(birthYear);
    }
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 0 ? age : '-';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
      {/* Header */}
      <div className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={() => router.push('/admin/patients')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับรายการผู้ป่วย
              </button>
              <h1 className="text-2xl font-bold text-gray-800">รายละเอียดผู้ป่วย</h1>
              <p className="text-sm text-gray-600">
                HN: {patient.hospital_number} | {patient.full_name}
              </p>
            </div>
            <div className="flex gap-2">
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
              
              <div>
                <p className="text-sm text-gray-500">ชื่อ-นามสกุล</p>
                <p className="font-semibold">{patient.full_name || '-'}</p>
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
                   patient.gender === 'female' ? 'หญิง' : 
                   patient.gender === 'other' ? 'อื่นๆ' : '-'}
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
              
              <div>
                <p className="text-sm text-gray-500">หมู่เลือด</p>
                <p className="font-semibold">{patient.blood_type || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">การแพ้ยา/อาหาร</p>
                <p className="font-semibold">{patient.allergies || '-'}</p>
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

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-800">ที่อยู่</h2>
            </div>
            
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">ที่อยู่บรรทัดที่ 1</p>
                <p className="font-semibold">{patient.address_line1 || '-'}</p>
              </div>
              
              {patient.address_line2 && (
                <div>
                  <p className="text-sm text-gray-500">ที่อยู่บรรทัดที่ 2</p>
                  <p className="font-semibold">{patient.address_line2}</p>
                </div>
              )}
              
              <div>
                <p className="text-sm text-gray-500">เขต/อำเภอ</p>
                <p className="font-semibold">{patient.district || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">จังหวัด</p>
                <p className="font-semibold">{patient.province || '-'}</p>
              </div>
              
              <div>
                <p className="text-sm text-gray-500">รหัสไปรษณีย์</p>
                <p className="font-semibold">{patient.postal_code || '-'}</p>
              </div>
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
                patient.pam_level === 'L2' ? 'bg-blue-50 border-blue-500' :
                patient.pam_level === 'L3' ? 'bg-yellow-50 border-yellow-500' :
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