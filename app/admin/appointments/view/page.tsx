// app/admin/appointments/view/page.tsx
// ✅ แก้ไขล่าสุด: 23 เมษายน 2569
// ✅ การแก้ไข:
//    1. แก้ไขการดึงข้อมูลแพทย์ - ใช้ doctors.id แทน doctors.user_id
//    2. แสดงชื่อแพทย์ถูกต้อง (full_name_th)
//    3. เพิ่ม fallback สำหรับกรณีไม่มีข้อมูลแพทย์

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getStaffList } from '@/lib/supabase/queries';
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
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function ViewAppointmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // ✅ State สำหรับ Modal รายละเอียด
  const [selectedAppointment, setSelectedAppointment] = useState<any>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

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
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      console.log('📡 Loading appointments...');
      
      // ดึงข้อมูลนัดหมาย
      const {  aptData, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true });

      if (aptError) {
        console.error('❌ Error fetching appointments:', aptError);
        throw aptError;
      }

      console.log('📋 Raw appointments:', aptData?.length);

      // ดึงรายละเอียดผู้ป่วยและแพทย์ + ตรวจสอบว่ามี followup แล้วหรือไม่
      const appointmentsWithDetails = await Promise.all(
        (aptData || []).map(async (apt: any) => {
          try {
            // ดึงข้อมูลผู้ป่วย
            const {  userData } = await supabase
              .from('profiles')
              .select('first_name, last_name, hospital_number')
              .eq('id', apt.user_id)
              .single();

            // ✅ ดึงข้อมูลแพทย์ - แก้ไขแล้ว: ใช้ doctors.id แทน doctors.user_id
            let doctorData = null;
            if (apt.doctor_id) {
              console.log('🔍 Fetching doctor for ID:', apt.doctor_id);
              const {  docData, error: docError } = await supabase
                .from('doctors')
                .select('id, user_id, full_name_th, full_name, specialization_th')
                .eq('id', apt.doctor_id)  // ✅ แก้ไข: ใช้ 'id' แทน 'user_id'
                .single();
              
              if (docError) {
                console.error('❌ Error fetching doctor:', docError);
              } else {
                console.log('✅ Doctor data:', docData);
              }
              
              doctorData = docData;
            }

            // ✅ ตรวจสอบว่ามีการบันทึกติดตามแล้วหรือไม่
            const {  followupData } = await supabase
              .from('appointment_followups')
              .select('id')
              .eq('appointment_id', apt.id)
              .maybeSingle();

            return {
              ...apt,
              users: userData ? {
                full_name: userData.first_name && userData.last_name
                  ? `${userData.first_name} ${userData.last_name}`
                  : '-',
                hospital_number: userData.hospital_number || '-'
              } : null,
              doctors: doctorData || null,
              hasFollowup: !!followupData  // ✅ มี followup แล้วหรือไม่
            };
          } catch (err) {
            console.error(`❌ Error processing appointment ${apt.id}:`, err);
            return {
              ...apt,
              users: null,
              doctors: null,
              hasFollowup: false
            };
          }
        })
      );

      console.log('✅ Appointments with details:', appointmentsWithDetails.length);
      setAppointments(appointmentsWithDetails);

      // ดึงข้อมูลผู้ป่วยและแพทย์สำหรับ filter
      const [patientsData, allStaff] = await Promise.all([
        getPatientList(),
        getStaffList()
      ]);

      // กรองเอาเฉพาะ doctor และ helper (ไม่เอา admin)
      const filteredStaff = allStaff.filter(staff =>
        staff.role === 'doctor' || staff.role === 'helper'
      );

      console.log('👨‍⚕️ Doctors/Staff:', filteredStaff.length);
      setPatients(patientsData);
      setDoctors(filteredStaff);
    } catch (error) {
      console.error('❌ Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-100 text-blue-700';
      case 'completed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'no_show': return 'bg-orange-100 text-orange-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'scheduled': return 'นัดหมาย';
      case 'completed': return 'เสร็จสิ้น';
      case 'cancelled': return 'ยกเลิก';
      case 'no_show': return 'ผิดนัด';
      default: return status;
    }
  };

  // ✅ ตรวจสอบว่าเป็นนัดหมายที่ผ่านไปแล้วหรือยัง
  const isPastAppointment = (appointmentDate: string) => {
    const now = new Date();
    const aptDate = new Date(appointmentDate);
    return aptDate < now;
  };

  // ✅ ฟังก์ชันจัดการเสร็จสิ้นนัดหมาย
  const handleComplete = async (aptId: string) => {
    const apt = appointments.find(a => a.id === aptId);
    if (!apt) return;

    const aptDate = new Date(apt.appointment_date);
    const now = new Date();
    const isPastOrOnTime = aptDate <= now;

    // ถ้ายังไม่ถึงวันนัด ให้ถามยืนยันก่อน
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

      if (!confirmEarly) {
        return;
      }
    } else {
      const confirmComplete = confirm('ยืนยันว่านัดหมายนี้เสร็จสิ้นแล้ว?');
      if (!confirmComplete) {
        return;
      }
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
      loadData();
    }
  };

  // ✅ ฟังก์ชันจัดการผิดนัด
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
        loadData();
      }
    }
  };

  // ✅ ฟังก์ชันจัดการยกเลิก
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
        loadData();
      }
    }
  };

  // ✅ ฟังก์ชันเปิด Modal รายละเอียด
  const handleViewDetails = (apt: any) => {
    console.log('🔍 Opening details for:', apt);
    setSelectedAppointment(apt);
    setShowDetailsModal(true);
  };

  // Filter appointments
  const filteredAppointments = appointments.filter(apt => {
    if (!apt || !apt.appointment_date) return false;
    
    const aptDateObj = new Date(apt.appointment_date);
    const year = aptDateObj.getFullYear();
    const month = String(aptDateObj.getMonth() + 1).padStart(2, '0');
    const day = String(aptDateObj.getDate()).padStart(2, '0');
    const aptDate = `${year}-${month}-${day}`;

    // Filter by date
    if (filterDate && aptDate !== filterDate) {
      return false;
    }

    // Filter by doctor
    if (filterDoctor && apt.doctor_id !== filterDoctor) {
      return false;
    }

    // Filter by patient
    if (filterPatient && apt.user_id !== filterPatient) {
      return false;
    }

    // Filter by status
    if (filterStatus !== 'all' && apt.status !== filterStatus) {
      return false;
    }

    return true;
  });

  // วันนี้
  const today = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(apt => {
    if (!apt || !apt.appointment_date) return false;
    const aptDate = new Date(apt.appointment_date).toISOString().split('T')[0];
    return aptDate === today && apt.status === 'scheduled';
  });

  // Clear filters
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
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📅 ดูนัดหมาย
              </h1>
              <p className="text-gray-600">ตรวจสอบตารางนัดหมาย</p>
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
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        
        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">นัดหมายทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{filteredAppointments.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">นัดหมายวันนี้</p>
                <p className="text-2xl font-bold text-gray-800">{todayAppointments.length}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">รอดำเนินการ</p>
                <p className="text-2xl font-bold text-gray-800">
                  {filteredAppointments.filter(a => a.status === 'scheduled').length}
                </p>
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
            {/* Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Doctor Filter */}
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
                  const doctorRole = doctor.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่';
                  return (
                    <option key={doctorId} value={doctorId}>
                      {doctorName} ({doctorRole})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Patient Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ผู้ป่วย</label>
              <select
                value={filterPatient}
                onChange={(e) => setFilterPatient(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">ทั้งหมด</option>
                {patients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.full_name} ({patient.hospital_number})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">ทั้งหมด</option>
                <option value="scheduled">รอดำเนินการ</option>
                <option value="completed">เสร็จสิ้น</option>
                <option value="cancelled">ยกเลิก</option>
                <option value="no_show">ผิดนัด</option>
              </select>
            </div>
          </div>

          {/* Clear Filters Button */}
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
              {filteredAppointments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                    <p>ไม่พบข้อมูลนัดหมาย</p>
                    {(filterDate || filterDoctor || filterPatient || filterStatus !== 'all') && (
                      <p className="text-sm mt-2 text-gray-400">ลองปรับแต่งตัวกรอง</p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredAppointments.map((apt) => (
                  <tr key={apt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => router.push(`/admin/patients/${apt.user_id}`)}
                        className="text-left group"
                        title="ไปหน้ารายละเอียดผู้ป่วย"
                      >
                        <p className="font-medium text-gray-800 group-hover:text-blue-600 group-hover:underline transition-colors">
                          {apt.users?.full_name || '-'}
                        </p>
                        <p className="text-sm text-gray-500">{apt.users?.hospital_number}</p>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-700">
                          {/* ✅ แสดงชื่อแพทย์ - แก้ไขแล้ว */}
                          {apt.doctors?.full_name_th || 
                           apt.doctors?.full_name || 
                           '-'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{apt.appointment_type}</td>
                    <td className="px-6 py-4 text-sm">
                      <p className="text-gray-800">{new Date(apt.appointment_date).toLocaleDateString('th-TH')}</p>
                      <p className="text-gray-500">
                        {new Date(apt.appointment_date).toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(apt.status)}`}>
                        {getStatusText(apt.status)}
                      </span>
                      {/* ✅ แสดงสถานะว่าบันทึกติดตามแล้วหรือไม่ */}
                      {apt.hasFollowup && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          <span>บันทึกติดตามแล้ว</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 flex-wrap">
                        {/* ✅ ปุ่มดูรายละเอียดนัดหมาย (Modal) - แสดงทุกราย */}
                        <button
                          onClick={() => handleViewDetails(apt)}
                          className="px-3 py-1 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-all flex items-center gap-1"
                          title="ดูรายละเอียดนัดหมาย"
                        >
                          <Eye className="w-3 h-3" />
                          ดูรายละเอียด
                        </button>

                        {/* ปุ่มแก้ไข - แสดงเฉพาะ scheduled เท่านั้น */}
                        {apt.status === 'scheduled' && (
                          <button
                            onClick={() => router.push(`/admin/appointments/edit/${apt.id}`)}
                            className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600 transition-all"
                            title="แก้ไขนัดหมาย"
                          >
                            แก้ไข
                          </button>
                        )}

                        {/* ปุ่มเสร็จสิ้น - แสดงเฉพาะ scheduled */}
                        {apt.status === 'scheduled' && (
                          <button
                            onClick={() => handleComplete(apt.id)}
                            className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all"
                            title={isPastAppointment(apt.appointment_date) ? 'เสร็จสิ้นนัดหมาย' : 'เสร็จสิ้นก่อนกำหนด'}
                          >
                            เสร็จสิ้น
                          </button>
                        )}

                        {/* ✅ ปุ่มบันทึกติดตาม - แสดงเมื่อเสร็จสิ้นแล้วและยังไม่ได้ติดตาม */}
                        {apt.status === 'completed' && !apt.hasFollowup && (
                          <button
                            onClick={() => router.push(`/admin/appointments/followup/${apt.id}`)}
                            className="px-3 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-all flex items-center gap-1"
                            title="บันทึกผลการติดตาม"
                          >
                            <FileText className="w-3 h-3" />
                            บันทึกติดตาม
                          </button>
                        )}

                        {/* ✅ แสดงสถานะเมื่อติดตามแล้ว - ห้ามบันทึกซ้ำ */}
                        {apt.status === 'completed' && apt.hasFollowup && (
                          <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-lg flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            ติดตามแล้ว
                          </span>
                        )}

                        {/* ปุ่มผิดนัด (No-show) - แสดงเฉพาะ scheduled ที่ถึงเวลาแล้ว */}
                        {apt.status === 'scheduled' && isPastAppointment(apt.appointment_date) && (
                          <button
                            onClick={() => handleNoShow(apt.id)}
                            className="px-3 py-1 bg-orange-500 text-white text-xs rounded-lg hover:bg-orange-600 transition-all"
                            title="บันทึกว่าผิดนัด"
                          >
                            ผิดนัด
                          </button>
                        )}

                        {/* ปุ่มยกเลิก - แสดงเฉพาะ scheduled เท่านั้น */}
                        {apt.status === 'scheduled' && (
                          <button
                            onClick={() => handleCancel(apt.id)}
                            className="px-3 py-1 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-all"
                            title="ยกเลิกนัดหมาย"
                          >
                            ยกเลิก
                          </button>
                        )}

                        {/* แสดงสถานะสำหรับ completed, cancelled, no_show */}
                        {(apt.status === 'completed' || apt.status === 'cancelled' || apt.status === 'no_show') && (
                          <span className="text-xs text-gray-500 italic">
                            ไม่สามารถแก้ไขได้
                          </span>
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
          <p>แสดง {filteredAppointments.length} จาก {appointments.length} นัดหมาย</p>
        </div>
      </div>

      {/* ✅ Modal รายละเอียดนัดหมาย */}
      {showDetailsModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-blue-600" />
                รายละเอียดนัดหมาย
              </h2>
              <button
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* ข้อมูลผู้ป่วย */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h3 className="text-sm font-bold text-blue-800 mb-2">👤 ผู้ป่วย</h3>
                <p className="text-lg font-bold text-blue-900">{selectedAppointment.users?.full_name}</p>
                <p className="text-sm text-blue-700">HN: {selectedAppointment.users?.hospital_number}</p>
              </div>

              {/* ข้อมูลนัดหมาย */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">ประเภท</p>
                  <p className="font-medium text-gray-800">{selectedAppointment.appointment_type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">สถานะ</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedAppointment.status)}`}>
                    {getStatusText(selectedAppointment.status)}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">วันที่</p>
                  <p className="font-medium text-gray-800">
                    {new Date(selectedAppointment.appointment_date).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">เวลา</p>
                  <p className="font-medium text-gray-800">
                    {new Date(selectedAppointment.appointment_date).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">แพทย์</p>
                  <p className="font-medium text-gray-800">
                    {/* ✅ แสดงชื่อแพทย์ใน Modal */}
                    {selectedAppointment.doctors?.full_name_th || 
                     selectedAppointment.doctors?.full_name || 
                     '-'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">หมายเหตุ</p>
                  <p className="font-medium text-gray-800">{selectedAppointment.notes || '-'}</p>
                </div>
              </div>

              {/* สถานะติดตาม */}
              {selectedAppointment.status === 'completed' && (
                <div className={`rounded-lg p-4 border-2 ${
                  selectedAppointment.hasFollowup 
                    ? 'bg-green-50 border-green-300' 
                    : 'bg-yellow-50 border-yellow-300'
                }`}>
                  <div className="flex items-center gap-2">
                    {selectedAppointment.hasFollowup ? (
                      <>
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <div>
                          <p className="font-bold text-green-800">บันทึกติดตามแล้ว</p>
                          <p className="text-sm text-green-700">ไม่ต้องบันทึกติดตามซ้ำ รอจนกว่าจะมีนัดหมายรอบใหม่</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-6 h-6 text-yellow-600" />
                        <div>
                          <p className="font-bold text-yellow-800">ยังไม่ได้บันทึกติดตาม</p>
                          <p className="text-sm text-yellow-700">กรุณาบันทึกผลการทำกิจวัตรของผู้ป่วย</p>
                        </div>
                      </>
                    )}
                  </div>
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