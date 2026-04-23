// app/admin/appointments/view/page.tsx
// ✅ แก้ไขล่าสุด: 23 เมษายน 2569 (20:30)
// ✅ การแก้ไข:
//    1. แก้ไข Query ดึงข้อมูลแพทย์ - ใช้ doctors.id แทน doctors.user_id
//    2. แก้ไขช่องว่างในโค้ดทั้งหมด (typos)
//    3. แสดงชื่อแพทย์ถูกต้องจากตาราง doctors

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
  X,
  CalendarX
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ✅ Interface สำหรับข้อมูลผู้ป่วยพร้อมนัดหมาย
interface PatientWithAppointment {
  patient_id: string;
  patient_name: string;
  hospital_number: string;
  appointment_id?: string;
  appointment_date?: string;
  appointment_type?: string;
  doctor_id?: string;
  doctor_name?: string;
  status?: string;
  hasFollowup?: boolean;
  hasAppointment: boolean;
}

export default function ViewAppointmentsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
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
      console.log('📡 Loading patients and appointments...');
      
      // ✅ 1. ดึงข้อมูลผู้ป่วยทั้งหมด
      const { data: patientsData, error: patientsError } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, hospital_number')
        .order('first_name', { ascending: true });

      if (patientsError) {
        console.error('❌ Error fetching patients:', patientsError);
        throw patientsError;
      }

      console.log('📋 Total patients:', patientsData?.length);
      setAllPatients(patientsData || []);

      // ✅ 2. ดึงข้อมูลนัดหมายทั้งหมด
      const { data: aptData, error: aptError } = await supabase 
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
          doctor_name: '', // จะดึงชื่อแพทย์ทีหลัง
          status: latestAppointment?.status,
          hasFollowup: false,
          hasAppointment: !!latestAppointment,
        };
      }) || [];

      // ✅ 5. ตรวจสอบ followup และดึงชื่อแพทย์สำหรับนัดหมายที่มี
      const patientsWithFollowupStatus = await Promise.all(
        combined.map(async (patient) => {
          if (patient.hasAppointment && patient.appointment_id && patient.doctor_id) {
            // ✅ ตรวจสอบ followup
            const { data: followupData } = await supabase
              .from('appointment_followups')
              .select('id')
              .eq('appointment_id', patient.appointment_id)
              .maybeSingle();
            
            // ✅ ดึงข้อมูลแพทย์ - แก้ไขแล้ว: ใช้ doctors.id
            let doctorName = '-';
            const { data: docData } = await supabase
              .from('doctors')
              .select('id, full_name_th, full_name')
              .eq('id', patient.doctor_id)  // ✅ แก้ไข: ใช้ 'id' แทน 'user_id'
              .single();
            
            if (docData) {
              doctorName = docData.full_name_th || docData.full_name || '-';
              console.log('✅ Doctor found:', doctorName);
            } else {
              console.log('⚠️ No doctor found for ID:', patient.doctor_id);
            }
            
            return {
              ...patient,
              doctor_name: doctorName,
              hasFollowup: !!followupData,
            };
          }
          return patient;
        })
      );

      console.log('✅ Combined data:', patientsWithFollowupStatus.length);
      setPatientsWithAppointments(patientsWithFollowupStatus);

      // ✅ 6. ดึงข้อมูลแพทย์สำหรับ filter
      const allStaff = await getStaffList();
      const filteredStaff = allStaff.filter(staff =>
        staff.role === 'doctor' || staff.role === 'helper'
      );
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
      loadData();
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
        loadData();
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
        loadData();
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
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📅 ดูนัดหมาย
              </h1>
              <p className="text-gray-600">ตรวจสอบตารางนัดหมายและผู้ป่วยที่ยังไม่มีนัดหมาย</p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-4 border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">ผู้ป่วยทั้งหมด</p>
                <p className="text-2xl font-bold text-gray-800">{stats.total}</p>
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
                  const doctorRole = doctor.role === 'doctor' ? 'แพทย์' : 'เจ้าหน้าที่';
                  return (
                    <option key={doctorId} value={doctorId}>
                      {doctorName} ({doctorRole})
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
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">วันที่