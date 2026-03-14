'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession, logout, getPatientList, getStaffList } from '@/lib/supabase/queries';
import { Calendar, Filter, LogOut, ArrowLeft, Clock, User, Stethoscope, Plus } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ViewAppointmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [filterDate, setFilterDate] = useState('');
  const [filterDoctor, setFilterDoctor] = useState('');
  const [filterPatient, setFilterPatient] = useState('');
  const [filterStatus, setFilterStatus] = useState('scheduled');

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
      const { data: aptData, error: aptError } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true });

      if (aptError) throw aptError;

      console.log('📋 Raw appointments:', aptData?.length);

      // ดึงรายละเอียด
      const appointmentsWithDetails = await Promise.all(
        (aptData || []).map(async (apt: any) => {
          const { data: userData } = await supabase
            .from('profiles')
            .select('full_name, hospital_number')
            .eq('id', apt.user_id)
            .single();

          const { data: doctorData } = await supabase
            .from('doctors')
            .select('full_name_th, specialization_th')
            .eq('id', apt.doctor_id)
            .single();

          return {
            ...apt,
            users: userData,
            doctors: doctorData,
          };
        })
      );

      console.log('✅ Appointments with details:', appointmentsWithDetails.length);
      setAppointments(appointmentsWithDetails);

      // ดึงรายการผู้ป่วยและแพทย์
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
      console.error('Error loading data:', error);
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

  // ✅ ตรวจสอบว่าสามารถเสร็จสิ้นได้หรือไม่
  const canComplete = (apt: any) => {
    if (apt.status !== 'scheduled') return false;
    
    const now = new Date();
    const aptDate = new Date(apt.appointment_date);
    
    // อนุญาตให้เสร็จสิ้นได้เมื่อถึงวันนัดหมายแล้ว (หรือผ่านไปแล้ว)
    return aptDate <= now;
  };

  // ✅ ตรวจสอบว่าควรแสดงปุ่มแก้ไขหรือไม่
  const canEdit = (apt: any) => {
    return apt.status === 'scheduled';
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
        return; // ยกเลิกการเสร็จสิ้น
      }
    } else {
      // ถึงวันนัดหรือผ่านไปแล้ว - ถามยืนยันปกติ
      const confirmComplete = confirm('ยืนยันว่านัดหมายนี้เสร็จสิ้นแล้ว?');
      if (!confirmComplete) {
        return;
      }
    }
    
    // บันทึกสถานะเสร็จสิ้น
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
      alert('บันทึกสำเร็จ!');
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
        alert('บันทึกสถานะผิดนัดสำเร็จ!');
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
        alert('ยกเลิกนัดหมายสำเร็จ!');
        loadData();
      }
    }
  };

  // Filter appointments
  const filteredAppointments = appointments.filter(apt => {
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-sky-100 to-cyan-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">กำลังโหลด...</p>
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
                onClick={() => router.push('/admin/dashboard')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                กลับ Dashboard
              </button>
              <h1 className="text-2xl font-bold text-gray-800">ดูนัดหมาย</h1>
              <p className="text-sm text-gray-600">ตรวจสอบตารางนัดหมาย</p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin/appointments/new')}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden md:inline">สร้างนัดหมายใหม่</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">ออกจากระบบ</span>
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
                  const doctorName = doctor.doctors?.full_name_th || doctor.full_name_th || '-';
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
                <th className="px-6 py-4 text-left text-sm font-semibold">ผู้ป่วย</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">แพทย์</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">ประเภท</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">วันที่/เวลา</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">สถานะ</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">จัดการ</th>
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
                      <p className="font-medium">{apt.users?.full_name || '-'}</p>
                      <p className="text-sm text-gray-500">{apt.users?.hospital_number}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Stethoscope className="w-4 h-4 text-gray-400" />
                        <span>{apt.doctors?.full_name_th || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm">{apt.appointment_type}</td>
                    <td className="px-6 py-4 text-sm">
                      <p>{new Date(apt.appointment_date).toLocaleDateString('th-TH')}</p>
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
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2 flex-wrap">
                        {/* ปุ่มแก้ไข - แสดงเฉพาะ scheduled เท่านั้น */}
                        {canEdit(apt) && (
                          <button
                            onClick={() => router.push(`/admin/appointments/edit/${apt.id}`)}
                            className="px-3 py-1 bg-yellow-500 text-white text-xs rounded-lg hover:bg-yellow-600 transition-all"
                            title="แก้ไขนัดหมาย"
                          >
                            แก้ไข
                          </button>
                        )}
                        
                        {/* ปุ่มเสร็จสิ้น - แสดงเฉพาะ scheduled และถึงเวลาแล้ว หรือ ยังไม่ถึงแต่ต้องการเสร็จสิ้นก่อน */}
                        {apt.status === 'scheduled' && (
                          <button
                            onClick={() => handleComplete(apt.id)}
                            className="px-3 py-1 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-all"
                            title={canComplete(apt) ? 'เสร็จสิ้นนัดหมาย' : 'เสร็จสิ้นก่อนกำหนด'}
                          >
                            เสร็จสิ้น
                          </button>
                        )}
                        
                        {/* ปุ่มผิดนัด (No-show) - แสดงเฉพาะ scheduled ที่ถึงเวลาแล้ว (ผ่านไปแล้ว) */}
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
    </div>
  );
}