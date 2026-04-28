// app/admin/appointments/view/page.tsx
// ✅ แก้ไขล่าสุด: 28 เมษายน 2569
// ✅ การแก้ไข:
//    1. แสดงข้อมูลผู้ใช้งานที่ login (ชื่อ, บทบาท, โรงพยาบาล)
//    2. แสดงลำดับชั้นโรงพยาบาล (แม่ข่าย → ลูกข่าย)
//    3. กรองนัดหมายตามสิทธิ์การเข้าถึงโรงพยาบาล
//    4. Admin เห็นทั้งหมด, บุคลากรเห็นเฉพาะโรงพยาบาลที่เข้าถึงได้

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getAccessibleHospitalIds, getUserHospitalInfo } from '@/lib/supabase/queries';
import {
  Calendar,
  Filter,
  LogOut,
  ArrowLeft,
  Clock,
  User,
  Stethoscope,
  Plus,
  FileText,
  CheckCircle,
  Eye,
  AlertCircle,
  Edit,
  X,
  CalendarX,
  Hospital,
  Building2,
  UserCheck
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface PatientWithAppointment {
  patient_id: string;
  patient_name: string;
  hospital_number: string;
  appointment_id?: string;
  appointment_date?: string;
  appointment_type?: string;
  doctor_id?: string;
  doctor_name?: string;
  doctor_hospital?: {
    id: string;
    name: string;
    type: 'main' | 'sub';
  };
  status?: string;
  hasFollowup?: boolean;
  hasAppointment: boolean;
  patient_hospital_id?: string;
}

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

export default function ViewAppointmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userHospital, setUserHospital] = useState<UserHospital | null>(null);
  const [patientsWithAppointments, setPatientsWithAppointments] = useState<PatientWithAppointment[]>([]);
  const [allPatients, setAllPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [accessibleHospitalIds, setAccessibleHospitalIds] = useState<string[]>([]);

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
      console.log('🏥 Accessible hospitals for appointments:', ids.length, 'hospitals');
      
      // ✅ โหลดข้อมูลหลังจากได้สิทธิ์แล้ว
      loadData(ids);
    } catch (error) {
      console.error('Error loading accessible hospitals:', error);
    }
  };

  const loadData = async (hospitalIds?: string[]) => {
    try {
      console.log('📡 Loading patients and appointments...');
      console.log('🏥 Hospital IDs for filtering:', hospitalIds);

      // ✅ 1. ดึงข้อมูลผู้ป่วยทั้งหมด (กรองตามโรงพยาบาลถ้ามี)
      let patientsQuery = supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number, hospital_id')
        .order('first_name', { ascending: true });

      if (hospitalIds && hospitalIds.length > 0) {
        patientsQuery = patientsQuery.in('hospital_id', hospitalIds);
      }

      const {  data: patientsData, error: patientsError } = await patientsQuery;

      if (patientsError) {
        console.error('❌ Error fetching patients:', patientsError);
        throw patientsError;
      }

      console.log('📋 Total patients (filtered):', patientsData?.length);
      setAllPatients(patientsData || []);

      // ✅ 2. ดึงข้อมูลนัดหมายทั้งหมด
      const {  data: aptData, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true });

      if (aptError) {
        console.error('❌ Error fetching appointments:', aptError);
        throw aptError;
      }

      console.log('📋 Total appointments:', aptData?.length);

      // ✅ 3. สร้าง Map ของนัดหมายตาม patient_id
      const appointmentMap = new Map();
      if (aptData) {
        aptData.forEach((apt: any) => {
          if (!appointmentMap.has(apt.user_id)) {
            appointmentMap.set(apt.user_id, []);
          }
          appointmentMap.get(apt.user_id).push(apt);
        });
      }

      // ✅ 4. รวมข้อมูล: ผู้ป่วยที่มีนัดหมาย + ผู้ป่วยที่ไม่มีนัดหมาย
      const combined: PatientWithAppointment[] = patientsData?.map((patient: any) => {
        const patientAppointments = appointmentMap.get(patient.id) || [];
        const latestAppointment = patientAppointments.length > 0
          ? patientAppointments[patientAppointments.length - 1]
          : null;

        return {
          patient_id: patient.id,
          patient_name: `${patient.first_name} ${patient.last_name}`,
          hospital_number: patient.hospital_number,
          appointment_id: latestAppointment?.id,
          appointment_date: latestAppointment?.appointment_date,
          appointment_type: latestAppointment?.appointment_type,
          doctor_id: latestAppointment?.doctor_id,
          doctor_name: '',
          doctor_hospital: null,
          status: latestAppointment?.status,
          hasFollowup: false,
          hasAppointment: !!latestAppointment,
          patient_hospital_id: patient.hospital_id,
        };
      }) || [];

      // ✅ 5. ตรวจสอบ followup และดึงชื่อแพทย์ + โรงพยาบาลสำหรับนัดหมายที่มี
      const patientsWithFollowupStatus = await Promise.all(
        combined.map(async (patient) => {
          if (patient.hasAppointment && patient.appointment_id && patient.doctor_id) {
            // ตรวจสอบ followup
            const {  data: followupData } = await supabase
              .from('appointment_followups')
              .select('id')
              .eq('appointment_id', patient.appointment_id)
              .maybeSingle();

            // ✅ ดึงข้อมูลแพทย์ - ใช้ doctors.id
            let doctorName = '-';
            let doctorHospital = null;

            const {  data: docData } = await supabase
              .from('doctors')
              .select(`
                id,
                full_name_th,
                full_name,
                user_id,
                users!doctors_user_id_fkey (
                  hospital_id,
                  hospitals (
                    id,
                    name,
                    type
                  )
                )
              `)
              .eq('id', patient.doctor_id)
              .single();

            if (docData) {
              doctorName = docData.full_name_th || docData.full_name || '-';

              // ✅ ดึงข้อมูลโรงพยาบาลของแพทย์
              if (docData.users && docData.users.hospitals) {
                doctorHospital = {
                  id: docData.users.hospitals.id,
                  name: docData.users.hospitals.name,
                  type: docData.users.hospitals.type as 'main' | 'sub',
                };
              }
            }

            return {
              ...patient,
              doctor_name: doctorName,
              doctor_hospital: doctorHospital,
              hasFollowup: !!followupData,
            };
          }
          return patient;
        })
      );

      console.log('✅ Combined data:', patientsWithFollowupStatus.length);
      setPatientsWithAppointments(patientsWithFollowupStatus);

      // ✅ 6. ดึงข้อมูลแพทย์สำหรับ filter (กรองตามโรงพยาบาลที่เข้าถึงได้)
      let doctorsQuery = supabase
        .from('doctors')
        .select(`
          id,
          full_name_th,
          full_name,
          user_id,
          users!doctors_user_id_fkey (
            role,
            hospital_id,
            hospitals (
              name,
              type
            )
          )
        `)
        .eq('is_active', true);

      if (hospitalIds && hospitalIds.length > 0) {
        doctorsQuery = doctorsQuery.in('users.hospital_id', hospitalIds);
      }

      const {  data: doctorsData } = await doctorsQuery;

      const filteredStaff = doctorsData?.filter(staff =>
        staff.users?.role === 'doctor' || staff.users?.role === 'helper'
      ) || [];

      setDoctors(filteredStaff);

    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const getStatusColor = (status: string | null) => {
    if (!status) return 'bg-gray-100 text-gray-700 border border-gray-300';
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'no_show': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700 border border-gray-300';
    }
  };

  const getStatusText = (status: string | null) => {
    if (!status) return 'ไม่มีนัดหมาย';
    switch (status) {
      case 'scheduled': return 'นัดหมาย';
      case 'completed': return 'เสร็จสิ้น';
      case 'cancelled': return 'ยกเลิก';
      case 'no_show': return 'ผิดนัด';
      default: return status;
    }
  };

  const isPastAppointment = (appointmentDate: string) => {
    const now = new Date();
    const aptDate = new Date(appointmentDate);
    return aptDate < now;
  };

  const handleComplete = async (aptId: string) => {
    const patient = patientsWithAppointments.find(p => p.appointment_id === aptId);
    if (!patient || !patient.appointment_date) return;

    const aptDate = new Date(patient.appointment_date);
    const now = new Date();
    const isPastOrOnTime = aptDate <= now;

    if (!isPastOrOnTime) {
      const timeDiff = aptDate.getTime() - now.getTime();
      const daysLeft = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hoursLeft = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

      const confirmEarly = confirm(
        `⚠️ คำเตือน: ยังไม่ถึงวันนัดหมาย!\n\n` +
        `เวลานัด: ${aptDate.toLocaleString('th-TH')}\n` +
        `เวลาปัจจุบัน: ${now.toLocaleString('th-TH')}\n\n` +
        `เหลืออีกประมาณ ${daysLeft > 0 ? `${daysLeft} วัน ` : ''}` +
        `${hoursLeft} ชั่วโมง\n\n` +
        `ผู้ป่วยอาจมาล่วงหน้าและต้องการเสร็จสิ้นก่อนกำหนด\n\n` +
        `คุณต้องการเสร็จสิ้นนัดหมายนี้จริงๆ หรือไม่?`
      );

      if (!confirmEarly) return;
    } else {
      const confirmComplete = confirm('ยืนยันว่านัดหมายนี้เสร็จสิ้นแล้ว?');
      if (!confirmComplete) return;
    }

    const { error } = await supabase
      .from('appointments')
      .update({
        status: 'completed',
        updated_at: new Date().toISOString()
      })
      .eq('id', aptId);

    if (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
      alert('✅ บันทึกสำเร็จ!');
      loadData(accessibleHospitalIds);
    }
  };

  const handleNoShow = async (aptId: string) => {
    if (confirm('ยืนยันว่าผู้ป่วยผิดนัด (No-show)?\n\nผู้ป่วยจะไม่ได้รับการนัดหมายนี้อีก และอาจต้องนัดหมายใหม่')) {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'no_show',
          updated_at: new Date().toISOString()
        })
        .eq('id', aptId);

      if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        alert('✅ บันทึกสถานะผิดนัดสำเร็จ!');
        loadData(accessibleHospitalIds);
      }
    }
  };

  const handleCancel = async (aptId: string) => {
    if (confirm('ยืนยันการยกเลิกนัดหมายนี้?')) {
      const { error } = await supabase
        .from('appointments')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', aptId);

      if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
      } else {
        alert('✅ ยกเลิกนัดหมายสำเร็จ!');
        loadData(accessibleHospitalIds);
      }
    }
  };

  const handleViewDetails = (patient: PatientWithAppointment) => {
    console.log('🔍 Opening details for:', patient);
    setSelectedPatient(patient);
    setShowDetailsModal(true);
  };

  const filteredPatients = patientsWithAppointments.filter(patient => {
    if (filterPatient && patient.patient_id !== filterPatient) {
      return false;
    }

    if (filterDoctor && patient.doctor_id !== filterDoctor) {
      return false;
    }

    if (filterDate && patient.appointment_date) {
      const aptDate = new Date(patient.appointment_date).toISOString().split('T')[0];
      if (aptDate !== filterDate) return false;
    }

    if (filterStatus !== 'all') {
      if (filterStatus === 'no_appointment') {
        return !patient.hasAppointment;
      } else if (filterStatus === 'scheduled' || filterStatus === 'completed' ||
        filterStatus === 'cancelled' || filterStatus === 'no_show') {
        return patient.hasAppointment && patient.status === filterStatus;
      }
    }

    return true;
  });

  const stats = {
    total: patientsWithAppointments.length,
    hasAppointment: patientsWithAppointments.filter(p => p.hasAppointment).length,
    noAppointment: patientsWithAppointments.filter(p => !p.hasAppointment).length,
    scheduled: patientsWithAppointments.filter(p => p.status === 'scheduled').length,
  };

  const clearFilters = () => {
    setFilterDate('');
    setFilterDoctor('');
    setFilterPatient('');
    setFilterStatus('all');
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
            onClick={() => router.push('/admin/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ Dashboard
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📅 ดูนัดหมาย
              </h1>
              <p className="text-gray-600">ตรวจสอบตารางนัดหมายและผู้ป่วยที่ยังไม่มีนัดหมาย</p>
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

              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/admin/appointments/new')}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  สร้างนัดหมายใหม่
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
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
                {accessibleHospitalIds.length > 0 && accessibleHospitalIds.length < 100 && (
                  <p className="text-xs text-gray-400 mt-1">
                    🔒 จาก {accessibleHospitalIds.length} รพ.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">มีนัดหมาย</p>
                <p className="text-2xl font-bold text-gray-800">{stats.hasAppointment}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <CalendarX className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ไม่มีนัดหมาย</p>
                <p className="text-2xl font-bold text-gray-800">{stats.noAppointment}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">รอดำเนินการ</p>
                <p className="text-2xl font-bold text-gray-800">{stats.scheduled}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-800">ตัวกรอง</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">แพทย์</label>
              <select
                value={filterDoctor}
                onChange={(e) => {
                  console.log('🎯 Selected doctor:', e.target.value);
                  setFilterDoctor(e.target.value);
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {doctors.map((doctor: any) => {
                  const doctorId = doctor.id;
                  const doctorName = doctor.full_name_th || doctor.full_name || '-';
                  const hospitalName = doctor.users?.hospitals?.name || '-';
                  return (
                    <option key={doctorId} value={doctorId}>
                      {doctorName} ({hospitalName})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ป่วย</label>
              <select
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {allPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.first_name} {patient.last_name} ({patient.hospital_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด</option>
                <option value="no_appointment">ไม่มีนัดหมาย</option>
                <option value="scheduled">รอดำเนินการ</option>
                <option value="completed">เสร็จสิ้น</option>
                <option value="cancelled">ยกเลิก</option>
                <option value="no_show">ผิดนัด</option>
              </select>
            </div>
          </div>

          {(filterDate || filterDoctor || filterPatient || filterStatus !== 'all') && (
            <div className="mt-4">
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all"
              >
                ล้างตัวกรอง
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ผู้ป่วย</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">แพทย์</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">ประเภท</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่/เวลา</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">สถานะ</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>ไม่พบข้อมูล</p>
                    {(filterDate || filterDoctor || filterPatient || filterStatus !== 'all') && (
                      <p className="text-sm mt-2 text-gray-400">ลองปรับแต่งตัวกรอง</p>
                    )}
                    {accessibleHospitalIds.length > 0 && (
                      <p className="text-xs text-gray-400 mt-2">
                        🔒 คุณมีสิทธิ์เข้าถึงเฉพาะโรงพยาบาลที่สังกัด
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => (
                  <tr key={patient.patient_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/admin/patients/${patient.patient_id}?from=appointments`)}
                        className="text-left group"
                        title="ไปหน้ารายละเอียดผู้ป่วย"
                      >
                        <p className="font-medium text-gray-800 group-hover:text-blue-600 group-hover:underline transition-colors">
                          {patient.patient_name}
                        </p>
                        <p className="text-sm text-gray-500">{patient.hospital_number}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {patient.hasAppointment ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Stethoscope className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700">
                              {patient.doctor_name || '-'}
                            </span>
                          </div>
                          {/* ✅ แสดงโรงพยาบาลของแพทย์ */}
                          {patient.doctor_hospital && (
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Hospital className="w-3 h-3" />
                              <span>
                                {patient.doctor_hospital.name}
                                {patient.doctor_hospital.type === 'main' ? ' (แม่ข่าย)' : ' (ลูกข่าย)'}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {patient.appointment_type || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {patient.appointment_date ? (
                        <>
                          <p className="text-gray-800">{new Date(patient.appointment_date).toLocaleDateString('th-TH')}</p>
                          <p className="text-gray-500">
                            {new Date(patient.appointment_date).toLocaleTimeString('th-TH', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(patient.status)}`}>
                        {getStatusText(patient.status)}
                      </span>
                      {patient.hasFollowup && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          <span>บันทึกติดตามแล้ว</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 flex-wrap">
                        <button
                          onClick={() => handleViewDetails(patient)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1"
                          title="ดูรายละเอียด"
                        >
                          <Eye className="w-3 h-3" />
                          ดูรายละเอียด
                        </button>

                        {!patient.hasAppointment && (
                          <button
                            onClick={() => router.push(`/admin/appointments/new?patient_id=${patient.patient_id}`)}
                            className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all flex items-center gap-1"
                            title="สร้างนัดหมายใหม่"
                          >
                            <Plus className="w-3 h-3" />
                            สร้างนัดหมาย
                          </button>
                        )}

                        {patient.hasAppointment && patient.appointment_id && (
                          <>
                            {patient.status === 'scheduled' && (
                              <>
                                <button
                                  onClick={() => router.push(`/admin/appointments/edit/${patient.appointment_id}`)}
                                  className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600 transition-all"
                                  title="แก้ไขนัดหมาย"
                                >
                                  แก้ไข
                                </button>
                                <button
                                  onClick={() => handleComplete(patient.appointment_id!)}
                                  className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all"
                                  title={isPastAppointment(patient.appointment_date!) ? 'เสร็จสิ้นนัดหมาย' : 'เสร็จสิ้นก่อนกำหนด'}
                                >
                                  เสร็จสิ้น
                                </button>
                                {isPastAppointment(patient.appointment_date!) && (
                                  <button
                                    onClick={() => handleNoShow(patient.appointment_id!)}
                                    className="px-3 py-1 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 transition-all"
                                    title="บันทึกว่าผิดนัด"
                                  >
                                    ผิดนัด
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCancel(patient.appointment_id!)}
                                  className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-all"
                                  title="ยกเลิกนัดหมาย"
                                >
                                  ยกเลิก
                                </button>
                              </>
                            )}

                            {patient.status === 'completed' && !patient.hasFollowup && (
                              <button
                                onClick={() => router.push(`/admin/appointments/followup/${patient.appointment_id}`)}
                                className="px-3 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-all flex items-center gap-1"
                                title="บันทึกผลการติดตาม"
                              >
                                <FileText className="w-3 h-3" />
                                บันทึกติดตาม
                              </button>
                            )}

                            {patient.status === 'completed' && patient.hasFollowup && (
                              <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-lg flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                ติดตามแล้ว
                              </span>
                            )}

                            {(patient.status === 'completed' || patient.status === 'cancelled' || patient.status === 'no_show') && (
                              <span className="text-xs text-gray-500 italic">
                                ไม่สามารถแก้ไขได้
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>แสดง {filteredPatients.length} จาก {patientsWithAppointments.length} ผู้ป่วย</p>
          {accessibleHospitalIds.length > 0 && (
            <p className="text-xs text-gray-400 mt-1">
              🔒 จำกัดการแสดงผลตามโรงพยาบาลที่สังกัด ({accessibleHospitalIds.length} โรงพยาบาล)
            </p>
          )}
        </div>
      </div>

      {/* Modal รายละเอียด */}
      {showDetailsModal && selectedPatient && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                รายละเอียด
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-2">👤 ผู้ป่วย</h3>
                <p className="text-lg font-bold text-blue-900">{selectedPatient.patient_name}</p>
                <p className="text-sm text-blue-700">HN: {selectedPatient.hospital_number}</p>
              </div>

              {selectedPatient.hasAppointment ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">ประเภท</p>
                    <p className="font-medium text-gray-800">{selectedPatient.appointment_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">สถานะ</p>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedPatient.status)}`}>
                      {getStatusText(selectedPatient.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">วันที่</p>
                    <p className="font-medium text-gray-800">
                      {selectedPatient.appointment_date
                        ? new Date(selectedPatient.appointment_date).toLocaleDateString('th-TH', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">เวลา</p>
                    <p className="font-medium text-gray-800">
                      {selectedPatient.appointment_date
                        ? new Date(selectedPatient.appointment_date).toLocaleTimeString('th-TH', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })
                        : '-'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">แพทย์</p>
                    <p className="font-medium text-gray-800">{selectedPatient.doctor_name || '-'}</p>
                    {/* ✅ แสดงโรงพยาบาลของแพทย์ใน Modal */}
                    {selectedPatient.doctor_hospital && (
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <Hospital className="w-3 h-3" />
                        <span>
                          {selectedPatient.doctor_hospital.name}
                          {selectedPatient.doctor_hospital.type === 'main' ? ' (แม่ข่าย)' : ' (ลูกข่าย)'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6 text-center">
                  <CalendarX className="w-12 h-12 mx-auto mb-3 text-red-500" />
                  <h3 className="text-lg font-bold text-red-800 mb-2">ยังไม่มีนัดหมาย</h3>
                  <p className="text-red-600 mb-4">ผู้ป่วยคนนี้ยังไม่มีนัดหมายในระบบ</p>
                  <button
                    onClick={() => {
                      setShowDetailsModal(false);
                      router.push(`/admin/appointments/new?patient_id=${selectedPatient.patient_id}`);
                    }}
                    className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
                  >
                    <Plus className="w-4 h-4 inline mr-2" />
                    สร้างนัดหมายใหม่
                  </button>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 sticky bottom-0 flex justify-end">
              <button
                onClick={() => setShowDetailsModal(false)}
                className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all font-bold"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}