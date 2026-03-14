'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { checkSession, logout, getPatientDetail } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, User, Activity, FileText, Edit, History } from 'lucide-react';

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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
    loadPatientDetail();
  }, [patientId, router]);

  const loadPatientDetail = async () => {
    try {
      const data = await getPatientDetail(patientId);
      setPatient(data);
    } catch (error) {
      console.error('Error loading patient detail:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">ไม่พบข้อมูลผู้ป่วย</p>
          <button
            onClick={() => router.push('/admin/patients')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            กลับไปรายการผู้ป่วย
          </button>
        </div>
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
                กลับ
              </button>
              <h1 className="text-2xl font-bold text-gray-800">รายละเอียดผู้ป่วย</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
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
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* ข้อมูลส่วนตัว */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-blue-600" />
            ข้อมูลส่วนตัว
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">HN</p>
              <p className="font-semibold text-gray-800">{patient.hospital_number}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500 mb-1">ชื่อ-นามสกุล</p>
              <p className="font-semibold text-gray-800">{patient.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">วันเกิด</p>
              <p className="font-semibold text-gray-800">
                {patient.birth_date ? new Date(patient.birth_date).toLocaleDateString('th-TH') : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">เพศ</p>
              <p className="font-semibold text-gray-800">
                {patient.gender === 'male' ? 'ชาย' : patient.gender === 'female' ? 'หญิง' : 'อื่นๆ'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">เบอร์โทรศัพท์</p>
              <p className="font-semibold text-gray-800">{patient.phone || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">อีเมล</p>
              <p className="font-semibold text-gray-800">{patient.email || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">ID Card</p>
              <p className="font-semibold text-gray-800">{patient.users?.id_card || '-'}</p>
            </div>
          </div>
        </div>

        {/* ข้อมูลสุขภาพ */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-600" />
            ข้อมูลสุขภาพ
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">น้ำหนัก (kg)</p>
              <p className="font-semibold text-gray-800">{patient.current_weight || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">ส่วนสูง (cm)</p>
              <p className="font-semibold text-gray-800">{patient.height || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">รอบเอว (cm)</p>
              <p className="font-semibold text-gray-800">{patient.waist_circumference || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">ประเภทเบาหวาน</p>
              <p className="font-semibold text-gray-800">{patient.diabetes_type || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">วันที่วินิจฉัย</p>
              <p className="font-semibold text-gray-800">
                {patient.diagnosis_date ? new Date(patient.diagnosis_date).toLocaleDateString('th-TH') : '-'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">ค่า HbA1c ล่าสุด</p>
              <p className="font-semibold text-gray-800">{patient.hba1c_level || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">กลุ่มเลือด</p>
              <p className="font-semibold text-gray-800">{patient.blood_type || '-'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500 mb-1">การแพ้ยา/อาหาร</p>
              <p className="font-semibold text-gray-800">{patient.allergies || '-'}</p>
            </div>
          </div>
        </div>

        {/* สถานะการประเมิน */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            สถานะการประเมิน
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-600 mb-1">PAM Level</p>
              <p className="text-2xl font-bold text-blue-700">{patient.pam_level || '-'}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm text-green-600 mb-1">Zone</p>
              <p className="text-lg font-bold text-green-700">{patient.zone || '-'}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <p className="text-sm text-purple-600 mb-1">Step</p>
              <p className="text-lg font-bold text-purple-700">{patient.current_step || '-'}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
              <p className="text-sm text-orange-600 mb-1">คะแนน PAM</p>
              <p className="text-2xl font-bold text-orange-700">{patient.pam_score || '-'}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col md:flex-row gap-4">
            <button
              onClick={() => router.push(`/admin/screening?patient=${patientId}`)}
              className="flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-bold py-3 px-6 rounded-xl hover:from-blue-600 hover:to-cyan-600 transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-5 h-5" />
              ทำแบบประเมิน
            </button>
            <button
              onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
              className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-3 px-6 rounded-xl hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center gap-2"
            >
              <History className="w-5 h-5" />
              ดูประวัติการประเมิน
            </button>
          </div>
        </div>

        {/* ที่อยู่ */}
        {(patient.address_line1 || patient.district || patient.province) && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ที่อยู่</h2>
            <div className="text-gray-700">
              <p>{patient.address_line1}</p>
              <p>{patient.district} {patient.province} {patient.postal_code}</p>
            </div>
          </div>
        )}

        {/* ผู้ติดต่อฉุกเฉิน */}
        {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">ผู้ติดต่อฉุกเฉิน</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">ชื่อผู้ติดต่อ</p>
                <p className="font-semibold text-gray-800">{patient.emergency_contact_name || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">เบอร์โทรศัพท์</p>
                <p className="font-semibold text-gray-800">{patient.emergency_contact_phone || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">ความสัมพันธ์</p>
                <p className="font-semibold text-gray-800">{patient.emergency_contact_relationship || '-'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}