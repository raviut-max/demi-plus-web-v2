// app/admin/patients/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 23 เมษายน 2569 (22:30)
// ✅ การแก้ไข:
//    1. ตรวจสอบว่ามีนัดหมายหรือไม่ก่อนคลิก
//    2. แสดง confirm dialog ถ้ายังไม่มีนัดหมาย
//    3. ส่ง returnUrl เพื่อกลับหน้าถูกต้องหลังสร้างนัดหมาย
//    4. เพิ่ม debug log ครบถ้วน

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Target,
  Calendar,
  Edit,
  LogOut,
  Activity,
  ClipboardCheck,
  FileText,
  Phone,
  User,
  Heart
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ✅ Interface สำหรับนัดหมายครั้งถัดไป
interface NextAppointment {
  id: string;
  appointment_date: string;
  appointment_type: string;
  status: string;
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const patientId = params.id as string;
  
  // ✅ ตรวจสอบว่ามาจากไหน
  const fromPage = searchParams.get('from') || 'patients';
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  
  // ✅ State สำหรับตรวจสอบสถานะ
  const [hasScreening, setHasScreening] = useState(false);
  const [hasFollowup, setHasFollowup] = useState(false);
  const [followupCount, setFollowupCount] = useState(0);
  const [latestAppointmentId, setLatestAppointmentId] = useState<string | null>(null);
  
  // ✅ State สำหรับนัดหมายครั้งถัดไป
  const [nextAppointment, setNextAppointment] = useState<NextAppointment | null>(null);

  useEffect(() => {
    console.log('🔍 [DEBUG] Patient Detail - from:', fromPage);
    console.log('🔍 [DEBUG] Patient ID:', patientId);
  }, [fromPage, patientId]);

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
      console.log('📡 Loading patient detail:', patientId);
      
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);
      
      // ✅ ตรวจสอบสถานะการประเมินและการติดตาม
      await checkPatientStatus(patientId);
      
      // ✅ โหลดนัดหมายครั้งถัดไป
      await loadNextAppointment(patientId);
    } catch (error) {
      console.error('❌ Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ ฟังก์ชันดึงนัดหมายครั้งถัดไป
  const loadNextAppointment = async (pid: string) => {
    try {
      console.log('📅 Fetching next appointment for:', pid);
      
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, appointment_type, status')
        .eq('user_id', pid)
        .eq('status', 'scheduled')
        .gte('appointment_date', new Date().toISOString())
        .order('appointment_date', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching next appointment:', error);
      }

      console.log('📋 Next appointment:', data);
      setNextAppointment(data || null);
    } catch (err) {
      console.error('Error in loadNextAppointment:', err);
      setNextAppointment(null);
    }
  };

  // ✅ ฟังก์ชันตรวจสอบสถานะผู้ป่วย
  const checkPatientStatus = async (pid: string) => {
    try {
      console.log('🔍 Checking patient status for:', pid);
      
      // 1. ✅ ตรวจสอบการประเมิน (Screening - PAM/PROMs)
      const {  screeningData } = await supabase
        .from('screenings')
        .select('id, pam_total_score')
        .eq('user_id', pid)
        .not('pam_total_score', 'is', null)
        .limit(1);
      
      const hasScreeningData = (screeningData?.length || 0) > 0;
      console.log('📋 Has screening:', hasScreeningData);
      setHasScreening(hasScreeningData);

      // 2. ✅ ตรวจสอบการติดตามผลจริง (Followup)
      const {  followupData } = await supabase
        .from('appointment_followups')
        .select('id, followup_round, appointment_id')
        .eq('user_id', pid)
        .order('followup_round', { ascending: false });
      
      const hasFollowupData = (followupData?.length || 0) > 0;
      console.log('📋 Has followup:', hasFollowupData, 'Count:', followupData?.length);
      setHasFollowup(hasFollowupData);
      setFollowupCount(followupData?.length || 0);

      // 3. ✅ หา appointment ล่าสุดที่ยังไม่ได้ followup
      const {  appointmentsData } = await supabase
        .from('appointments')
        .select('id, appointment_date, status')
        .eq('user_id', pid)
        .eq('status', 'completed')
        .order('appointment_date', { ascending: false })
        .limit(1);

      if (appointmentsData && appointmentsData.length > 0) {
        const latestApt = appointmentsData[0];
        
        const {  existingFollowup } = await supabase
          .from('appointment_followups')
          .select('id')
          .eq('appointment_id', latestApt.id)
          .single();

        if (!existingFollowup) {
          setLatestAppointmentId(latestApt.id);
          console.log('📅 Latest appointment without followup:', latestApt.id);
        }
      }
      
    } catch (error) {
      console.error('❌ Error checking patient status:', error);
    }
  };

  // ✅ ฟังก์ชันจัดการคลิกปุ่มติดตาม (สีม่วง)
  const handleFollowupClick = () => {
    if (!hasFollowup && latestAppointmentId) {
      const confirmFollowup = confirm(
        '📋 ผู้ป่วยคนนี้ยังไม่ได้ทำการติดตาม\n\n' +
        'คุณต้องการบันทึกผลการติดตามนัดหมายตอนนี้เลยหรือไม่?\n\n' +
        '• กด "ตกลง" → ไปหน้าบันทึกผลการติดตาม\n' +
        '• กด "ยกเลิก" → ไปหน้าประวัติการติดตาม'
      );

      if (confirmFollowup) {
        console.log('🔗 Navigating to followup form:', latestAppointmentId);
        router.push(`/admin/appointments/followup/${latestAppointmentId}`);
      } else {
        console.log('🔗 Navigating to followup history');
        router.push(`/admin/patients/${patientId}/followup-history`);
      }
    } else {
      router.push(`/admin/patients/${patientId}/followup-history`);
    }
  };

  // ✅ ฟังก์ชันจัดการคลิกปุ่มนัดหมาย (สีฟ้า)
  const handleAppointmentClick = () => {
    if (!nextAppointment) {
      // ✅ ไม่มีนัดหมาย → แสดงยืนยันก่อน
      const confirmCreate = confirm(
        '📋 ผู้ป่วยคนนี้ยังไม่มีนัดหมายในระบบ\n\n' +
        'คุณต้องการสร้างนัดหมายใหม่ตอนนี้เลยหรือไม่?\n\n' +
        '• กด "ตกลง" → ไปหน้าสร้างนัดหมายใหม่\n' +
        '• กด "ยกเลิก" → ไปหน้าประวัตินัดหมาย'
      );
      
      if (confirmCreate) {
        // ✅ ไปหน้าสร้างนัดหมายใหม่ พร้อมระบุผู้ป่วย
        const returnUrl = `/admin/patients/${patientId}?from=appointments`;
        router.push(`/admin/appointments/new?patient_id=${patientId}&returnUrl=${encodeURIComponent(returnUrl)}`);
      } else {
        // ✅ ไปหน้าประวัตินัดหมาย
        router.push(`/admin/patients/${patientId}/appointments`);
      }
    } else {
      // ✅ มีนัดหมายแล้ว → ไปหน้าประวัตินัดหมาย
      router.push(`/admin/patients/${patientId}/appointments`);
    }
  };

  // ✅ ฟังก์ชันแปลงวันที่ ค.ศ. → พ.ศ.
  const formatDateTH = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = THAI_MONTHS[date.getMonth()];
    const year = date.getFullYear() + 543;
    return `${day} ${month} ${year}`;
  };

  // ✅ ฟังก์ชันแปลงวันที่สำหรับแสดงสั้นๆ (เช่น "28 เม.ย.")
  const formatShortDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = THAI_MONTHS[date.getMonth()].substring(0, 3);
    return `${day} ${month}`;
  };

  // ✅ ฟังก์ชันแปลงเวลา (เช่น "17:26")
  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ✅ ฟังก์ชันคำนวณอายุ
  const calculateAge = (birthDate: string | null) => {
    if (!birthDate) return '-';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  // ✅ ฟังก์ชันคำนวณ BMI
  const calculateBMI = (weight: number | null, height: number | null) => {
    if (!weight || !height || height === 0) return '-';
    const heightInM = height / 100;
    return (weight / (heightInM * heightInM)).toFixed(1);
  };

  // ✅ ฟังก์ชันจัดการปุ่มกลับ
  const handleGoBack = () => {
    console.log('🔙 [DEBUG] Going back, from:', fromPage);
    if (fromPage === 'appointments') {
      router.push('/admin/appointments/view');
    } else {
      router.push('/admin/patients');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/admin/login');
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
          {/* ✅ ปุ่มกลับ - กลับไปตามที่มา */}
          <button
            onClick={handleGoBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับ{fromPage === 'appointments' ? 'หน้าดูนัดหมาย' : 'รายการผู้ป่วย'}
          </button>
          
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                📋 รายละเอียดผู้ป่วย
              </h1>
              <p className="text-gray-600">
                HN: {patient?.hospital_number} | 
                {patient?.first_name} {patient?.last_name} | 
                PAM: {patient?.pam_level || 'L1'}
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
              
              {/* ✅ แสดงปุ่ม "มีการติดตามแล้ว" เฉพาะเมื่อมี followup */}
              {hasFollowup && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>มีการติดตามแล้ว ({followupCount} ครั้ง)</span>
                </div>
              )}
              
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
        
        {/* SUMMARY CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          
          {/* 1. ปุ่มสีฟ้า - นัดหมายครั้งถัดไป (แก้ไขแล้ว) */}
          <div 
            onClick={handleAppointmentClick}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">นัดหมายครั้งถัดไป</p>
                {/* ✅ แสดงวันที่/เวลาจากฐานข้อมูล หรือ "ไม่มี" */}
                <p className="text-2xl font-bold">
                  {nextAppointment ? formatShortDate(nextAppointment.appointment_date) : 'ไม่มี'}
                </p>
                <p className="text-xs opacity-75 mt-1">
                  {nextAppointment ? formatTime(nextAppointment.appointment_date) : 'นัดหมาย'}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Calendar className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 2. ปุ่มสีเขียว - การประเมินล่าสุด */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">การประเมินล่าสุด</p>
                <p className="text-2xl font-bold">{hasScreening ? 'มีการประเมิน' : 'ยังไม่ประเมิน'}</p>
                <p className="text-xs opacity-75 mt-1">{hasScreening ? '1 ครั้ง' : '0 ครั้ง'}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 3. ปุ่มสีม่วง - ติดตามล่าสุด (แก้ไขแล้ว) */}
          <div 
            onClick={handleFollowupClick}
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">ติดตามล่าสุด</p>
                <p className="text-2xl font-bold">{hasFollowup ? `${followupCount} ครั้ง` : 'ยังไม่ติดตาม'}</p>
                <p className="text-xs opacity-75 mt-1">{hasFollowup ? 'มีข้อมูล' : 'ไม่มีข้อมูล'}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* 4. ปุ่มสีส้ม - ความคืบหน้า */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/goals`)}
            className="bg-gradient-to-br from-orange-500 to-red-500 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">ความคืบหน้า</p>
                <p className="text-2xl font-bold">0/5</p>
                <p className="text-xs opacity-75 mt-1">0% ของเป้าหมาย</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Target className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* ACTION BUTTONS */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => router.push(`/admin/screening?patient_id=${patientId}`)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
          >
            <ClipboardCheck className="w-4 h-4" />
            ทำแบบประเมิน (PAM/PROMs)
          </button>
          
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
          >
            <FileText className="w-4 h-4" />
            ดูประวัติการประเมิน
          </button>
          
          <button
            onClick={handleFollowupClick}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
          >
            <Activity className="w-4 h-4" />
            ดูประวัติการติดตาม
          </button>
          
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-all"
          >
            <Calendar className="w-4 h-4" />
            ดูประวัตินัดหมาย
          </button>
        </div>

        {/* Patient Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* ข้อมูลส่วนตัว */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              👤 ข้อมูลส่วนตัว
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">HN</p>
                <p className="font-semibold">{patient?.hospital_number || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ชื่อ-นามสกุล</p>
                <p className="font-semibold">
                  {patient?.first_name || '-'} {patient?.last_name || '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">วันเกิด</p>
                <p className="font-semibold">{formatDateTH(patient?.birth_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">อายุ</p>
                <p className="font-semibold">{calculateAge(patient?.birth_date)} ปี</p>
              </div>
              <div>
                <p className="text-gray-500">เพศ</p>
                <p className="font-semibold">
                  {patient?.gender === 'male' ? 'ชาย' : patient?.gender === 'female' ? 'หญิง' : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">เบอร์โทรศัพท์</p>
                <p className="font-semibold">{patient?.phone || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อีเมล</p>
                <p className="font-semibold">{patient?.email || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อาชีพ</p>
                <p className="font-semibold">{patient?.occupation || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ระดับการศึกษา</p>
                <p className="font-semibold">{patient?.education_level || '-'}</p>
              </div>
            </div>
          </div>

          {/* ข้อมูลสุขภาพ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              🏥 ข้อมูลสุขภาพ
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">น้ำหนัก (kg)</p>
                <p className="font-semibold">{patient?.current_weight || '-'} kg</p>
              </div>
              <div>
                <p className="text-gray-500">ส่วนสูง (cm)</p>
                <p className="font-semibold">{patient?.height || '-'} cm</p>
              </div>
              <div>
                <p className="text-gray-500">รอบเอว (cm)</p>
                <p className="font-semibold">{patient?.waist_circumference || '-'} cm</p>
              </div>
              <div>
                <p className="text-gray-500">BMI</p>
                <p className="font-semibold">
                  {patient?.bmi || calculateBMI(patient?.current_weight, patient?.height)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">ประเภทเบาหวาน</p>
                <p className="font-semibold">{patient?.diabetes_type || 'กลุ่มเสี่ยง'}</p>
              </div>
              <div>
                <p className="text-gray-500">วันที่วินิจฉัย</p>
                <p className="font-semibold">{formatDateTH(patient?.diagnosis_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">ค่า HbA1c</p>
                <p className="font-semibold">{patient?.hba1c_level || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ระดับ PAM</p>
                <p className={`font-semibold ${
                  patient?.pam_level === 'L1' ? 'text-red-600' :
                  patient?.pam_level === 'L2' ? 'text-yellow-600' :
                  patient?.pam_level === 'L3' ? 'text-blue-600' :
                  patient?.pam_level === 'L4' ? 'text-green-600' :
                  'text-gray-600'
                }`}>
                  {patient?.pam_level || 'L1'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Zone</p>
                <p className={`font-semibold ${
                  patient?.zone === 'Red Zone' ? 'text-red-600' :
                  patient?.zone === 'Yellow Zone' ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {patient?.zone || 'Green Zone'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">หมายเหตุ</p>
                <p className="font-semibold">{patient?.notes || '-'}</p>
              </div>
            </div>
          </div>

          {/* ที่อยู่ */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              📍 ที่อยู่
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">เลขที่</p>
                <p className="font-semibold">{patient?.house_number || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ที่อยู่เพิ่มเติม</p>
                <p className="font-semibold">{patient?.address_line1 || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">หมู่ที่/ชุมชน</p>
                <p className="font-semibold">{patient?.village_no || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">หมู่บ้าน</p>
                <p className="font-semibold">{patient?.village_name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ซอย</p>
                <p className="font-semibold">{patient?.soi || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ถนน</p>
                <p className="font-semibold">{patient?.road || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ตำบล</p>
                <p className="font-semibold">{patient?.subdistrict || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อำเภอ/เขต</p>
                <p className="font-semibold">{patient?.district || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">จังหวัด</p>
                <p className="font-semibold">{patient?.province || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">รหัสไปรษณีย์</p>
                <p className="font-semibold">{patient?.postal_code || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">รพสต.</p>
                <p className="font-semibold">{patient?.subdistrict_health_center || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">โรงพยาบาล</p>
                <p className="font-semibold text-red-600">{patient?.hospital_name || '-'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" />
            ผู้ติดต่อฉุกเฉิน
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-gray-800">ผู้ติดต่อฉุกเฉิน</h3>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="text-gray-500">ชื่อ-นามสกุล</p>
                  <p className="font-medium text-gray-800">
                    {patient?.emergency_contact_name || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">ความสัมพันธ์</p>
                  <p className="font-medium text-gray-800">
                    {patient?.emergency_contact_relationship || '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">เบอร์โทรศัพท์</p>
                  <p className="font-medium text-gray-800">
                    {patient?.emergency_contact_phone || '-'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}