// app/admin/appointments/new/page.tsx
// ✅ แก้ไขล่าสุด: 1 พฤษภาคม 2569
// ✅ การแก้ไข:
//    1. ✅ ใช้ doctors.id แทน users.id สำหรับ doctor_id
//    2. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    3. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    4. กรองผู้ป่วยตามสิทธิ์การเข้าถึงโรงพยาบาล
//    5. แสดงโรงพยาบาลของผู้ป่วยแต่ละรายใน dropdown

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getStaffList, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import { ArrowLeft, LogOut, Save, Calendar, Clock, User, Stethoscope, Hospital, Building2, UserCheck, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface UserHospital {
  id: string;
  name: string;
  type: 'main' | 'sub';
  parent_id: string | null;
  parent_hospital?: {
    id: string;
    name: string;
  };
}

export default function NewAppointmentPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patients, setPatients] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

  // ตั้งค่าเริ่มต้นเป็นวันพรุ่งนี้ 08:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  const [formData, setFormData] = useState({
    user_id: '',
    doctor_id: '',  // ✅ ต้องเป็น doctors.id
    appointment_type: 'followup',
    appointment_date: tomorrow.toISOString().slice(0, 16),
    duration_minutes: '30',
    location_type: 'clinic',
    location_detail: '',
    notes: '',
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

  // ✅ โหลดข้อมูลโรงพยาบาลของผู้ใช้
  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
      console.log('✅ [loadUserHospital] User hospital:', hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  // ✅ โหลดโรงพยาบาลที่เข้าถึงได้
  const loadAccessibleHospitals = async (userId: string) => {
    try {
      console.log('🔍 [loadAccessibleHospitals] Getting accessible hospitals for user:', userId);
      const ids = await getAccessibleHospitalIds(userId);
      setAccessibleHospitalIds(ids);
      console.log('🏥 [loadAccessibleHospitals] Accessible hospitals:', ids.length, 'hospitals');
      console.log('🏥 [loadAccessibleHospitals] Hospital IDs:', ids);
      
      // ✅ โหลดข้อมูลหลังจากได้สิทธิ์แล้ว
      loadData(ids);
    } catch (error) {
      console.error('❌ [loadAccessibleHospitals] Error:', error);
    }
  };

  // ✅ โหลดข้อมูลผู้ป่วยและแพทย์ (กรองตามโรงพยาบาล)
  const loadData = async (hospitalIds?: string[]) => {
    try {
      console.log('📡 [loadData] Loading patients and appointments...');
      console.log('🏥 [loadData] Hospital IDs for filtering:', hospitalIds);
      
      // ✅ 1. ดึงข้อมูลผู้ป่วย (กรองตามโรงพยาบาลถ้ามี)
      console.log('🔍 [loadData] Calling getPatientList with hospitalIds:', hospitalIds);
      const patientsData = await getPatientList(undefined, undefined, hospitalIds);
      
      console.log('📋 [loadData] Total patients (filtered):', patientsData.length);
      
      // ✅ Debug: ตรวจสอบว่าผู้ป่วยแต่ละคนอยู่โรงพยาบาลไหน
      if (patientsData.length > 0) {
        console.log('🏥 [loadData] Checking patient hospitals:');
        patientsData.slice(0, 5).forEach((patient, index) => {
          console.log(`  ${index + 1}. ${patient.full_name} - Hospital ID: ${patient.hospital_id}`, patient.hospitals);
        });
      }
      
      setPatients(patientsData);

      // ✅ 2. ดึงข้อมูลแพทย์/เจ้าหน้าที่ (กรองตามโรงพยาบาลถ้ามี)
      const allStaff = await getStaffList();
      
      console.log('👨‍⚕️ [loadData] Total staff before filter:', allStaff.length);
      
      // กรอง staff ตาม hospital IDs (ถ้าไม่ใช่ admin)
      let filteredStaff = allStaff;
      if (hospitalIds && hospitalIds.length > 0 && user?.role !== 'admin') {
        filteredStaff = allStaff.filter(staff => 
          staff.hospital_id && hospitalIds.includes(staff.hospital_id)
        );
        console.log('👨‍⚕️ [loadData] Staff filtered from', allStaff.length, 'to', filteredStaff.length);
      }
      
      // กรองเอาเฉพาะ doctor และ helper
      filteredStaff = filteredStaff.filter(staff => 
        staff.role === 'doctor' || staff.role === 'helper'
      );

      console.log('👨‍⚕️ [loadData] Total staff (filtered):', filteredStaff.length);
      console.log('👨‍⚕️ [loadData] Sample staff:', filteredStaff[0]);
      
      setStaffList(filteredStaff);

    } catch (error) {
      console.error('❌ [loadData] Error:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // ✅ ตรวจสอบว่าเลือกแพทย์แล้ว
    if (!formData.doctor_id) {
      alert('กรุณาเลือกแพทย์/เจ้าหน้าที่');
      return;
    }
    
    console.log('💾 [handleSubmit] Submitting appointment...');
    console.log('📝 [handleSubmit] FormData:', formData);
    
    setSaving(true);

    try {
      const { error } = await supabase
        .from('appointments')
        .insert({
          user_id: formData.user_id,
          doctor_id: formData.doctor_id,  // ✅ ต้องเป็น doctors.id
          appointment_type: formData.appointment_type,
          appointment_date: new Date(formData.appointment_date).toISOString(),
          duration_minutes: parseInt(formData.duration_minutes),
          location_type: formData.location_type,
          location_detail: formData.location_detail,
          status: 'scheduled',
          notes: formData.notes,
          created_by: user?.id,
        });

      if (error) {
        console.error('❌ [handleSubmit] Error:', error);
        throw error;
      }

      console.log('✅ [handleSubmit] Appointment created successfully!');
      alert('✅ สร้างนัดหมายสำเร็จ!');
      router.push('/admin/appointments/view');
    } catch (error) {
      console.error('❌ [handleSubmit] Error:', error);
      alert('เกิดข้อผิดพลาด: ' + (error as any).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📅 สร้างนัดหมายใหม่
              </h1>
              <p className="text-gray-600">กำหนดนัดหมายผู้ป่วย</p>
            </div>

            <div className="flex items-center gap-4">
              {/* ✅ แสดงข้อมูลผู้ใช้และโรงพยาบาล */}
              <div className="text-right bg-gradient-to-l from-blue-50 to-indigo-50 px-4 py-3 rounded-xl border border-blue-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800">
                      {user?.full_name_th || 'ผู้ดูแลระบบ'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {user?.role === 'admin' ? '👑 ผู้ดูแลระบบ' :
                       user?.role === 'doctor' ? '👨‍⚕️ แพทย์' : '👩‍💼 เจ้าหน้าที่'}
                    </p>
                  </div>
                </div>

                {/* ✅ แสดงข้อมูลโรงพยาบาล */}
                {userHospital ? (
                  <div className="border-t border-blue-200 pt-2 mt-2">
                    <div className="flex items-center gap-1 mb-1">
                      <Hospital className="w-3 h-3 text-blue-600" />
                      <span className="text-xs text-gray-600 font-medium">
                        {userHospital.name}
                      </span>
                    </div>

                    {/* ✅ Badge ประเภทโรงพยาบาล */}
                    <div className="flex items-center gap-2">
                      {userHospital.type === 'main' ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                          🏥 แม่ข่าย
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          🏥 ลูกข่าย
                        </span>
                      )}

                      {/* ✅ แสดงแม่ข่าย (ถ้าเป็นลูกข่าย) */}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Building2 className="w-3 h-3" />
                          <span>แม่ข่าย: {userHospital.parent_hospital.name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 mt-2">
                    ไม่สังกัดโรงพยาบาล
                  </p>
                )}
              </div>

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

      {/* Form */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-6">
          
          {/* ผู้ป่วย */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <User className="w-4 h-4 inline mr-1" />
              ผู้ป่วย *
            </label>
            <select
              value={formData.user_id}
              onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกผู้ป่วย --</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.full_name} ({patient.hospital_number})
                  {patient.hospitals?.name ? ` - ${patient.hospitals.name}` : ''}
                </option>
              ))}
            </select>
            {accessibleHospitalIds.length > 0 ? (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                แสดงผู้ป่วยจาก {accessibleHospitalIds.length} โรงพยาบาลที่คุณมีสิทธิ์เข้าถึง
              </p>
            ) : (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                แสดงผู้ป่วยทั้งหมด (Admin)
              </p>
            )}
          </div>

          {/* แพทย์/เจ้าหน้าที่ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Stethoscope className="w-4 h-4 inline mr-1" />
              แพทย์/เจ้าหน้าที่ *
            </label>
            <select
              value={formData.doctor_id}
              onChange={(e) => {
                console.log('🎯 [Dropdown] Selected doctor_id:', e.target.value);
                setFormData({ ...formData, doctor_id: e.target.value });
              }}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- เลือกแพทย์/เจ้าหน้าที่ --</option>
              {staffList.map((staff: any) => {
                // ✅ ใช้ doctors.id แทน users.id
                const doctorId = staff.doctors?.id;
                const staffName = staff.doctors?.full_name_th || staff.full_name_th || '-';
                const staffRole = staff.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่';
                const specialization = staff.doctors?.specialization_th || '';
                const hospitalName = staff.hospitals?.name || '';
                
                console.log('👨‍️ [Dropdown] Staff:', {
                  users_id: staff.id,
                  doctors_id: doctorId,
                  name: staffName,
                  role: staffRole
                });
                
                return (
                  <option key={doctorId} value={doctorId}>
                    {staffName} ({staffRole}{specialization ? ` - ${specialization}` : ''})
                    {hospitalName ? ` - ${hospitalName}` : ''}
                  </option>
                );
              })}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              💡 แสดงแพทย์/เจ้าหน้าที่จากโรงพยาบาลที่คุณมีสิทธิ์เข้าถึง
            </p>
          </div>

          {/* ประเภทนัดหมาย */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              ประเภทนัดหมาย *
            </label>
            <select
              value={formData.appointment_type}
              onChange={(e) => setFormData({ ...formData, appointment_type: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            >
              <option value="followup">ติดตามผล</option>
              <option value="consultation">ปรึกษา</option>
              <option value="checkup">ตรวจสุขภาพ</option>
              <option value="treatment">รักษา</option>
              <option value="other">อื่นๆ</option>
            </select>
          </div>

          {/* วันที่และเวลา */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              วันที่และเวลา *
            </label>
            <input
              type="datetime-local"
              value={formData.appointment_date}
              onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
            />
          </div>

          {/* ระยะเวลาและสถานที่ */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Clock className="w-4 h-4 inline mr-1" />
                ระยะเวลา (นาที)
              </label>
              <select
                value={formData.duration_minutes}
                onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="15">15 นาที</option>
                <option value="30">30 นาที</option>
                <option value="45">45 นาที</option>
                <option value="60">60 นาที</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                สถานที่
              </label>
              <select
                value={formData.location_type}
                onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              >
                <option value="clinic">คลินิก</option>
                <option value="online">ออนไลน์</option>
                <option value="home">บ้านผู้ป่วย</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>
          </div>

          {/* หมายเหตุ */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              หมายเหตุ
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              placeholder="หมายเหตุเพิ่มเติม"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-500 text-white font-bold py-3 rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 bg-gray-500 text-white font-bold py-3 rounded-lg hover:bg-gray-600"
            >
              ยกเลิก
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}