// app/admin/patients/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 24 เมษายน 2569
// ✅ การแก้ไข:
//    1. ลบวันที่วินิจฉัยออก (ไม่ใช้แล้ว)
//    2. เพิ่มแสดงค่าน้ำตาล (blood_sugar)
//    3. ดึงข้อมูลนัดหมาย/ประเมิน/ติดตาม จากฐานข้อมูลจริง
//    4. ✅ เพิ่มการ์ดแสดงข้อมูลผู้ใช้งานในส่วนหัว
//    5. ✅ อนุญาตให้ อสม. เข้าถึงและใช้งานได้ (ยกเว้นลบข้อมูล)
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getUserHospitalInfo,
  isSuperAdmin,
  isHospitalAdmin
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
  Heart,
  Hospital,
  Shield,
  Building2
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// เดือนภาษาไทย
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

// ✅ Interface สำหรับนัดหมายครั้งถัดไป
interface NextAppointment {
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
  const [userHospital, setUserHospital] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  
  // ✅ State สำหรับข้อมูลจริงจากฐานข้อมูล
  const [nextAppointment, setNextAppointment] = useState<NextAppointment | null>(null);
  const [screeningCount, setScreeningCount] = useState(0);
  const [followupCount, setFollowupCount] = useState(0);

  useEffect(() => {
    const userData = checkSession();
    if (!userData) {
      router.push('/admin/login');
      return;
    }
    
    // ✅ อนุญาตให้ อสม. เข้าถึงได้
    if (!['admin', 'doctor', 'helper', 'osm'].includes(userData.role)) {
      alert('ไม่มีสิทธิ์เข้าถึง');
      router.push('/admin/login');
      return;
    }
    
    setUser(userData);
    loadUserHospital(userData.id);
    loadData();
  }, [router]);

  const loadUserHospital = async (userId: string) => {
    try {
      const hospitalInfo = await getUserHospitalInfo(userId);
      setUserHospital(hospitalInfo);
    } catch (error) {
      console.error('❌ [loadUserHospital] Error:', error);
    }
  };

  const loadData = async () => {
    try {
      console.log('📡 Loading patient detail:', patientId);
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      // ✅ โหลดข้อมูลจริงจากฐานข้อมูล
      await Promise.all([
        loadNextAppointment(patientId),
        loadScreeningCount(patientId),
        loadFollowupCount(patientId)
      ]);
    } catch (error) {
      console.error('❌ Error loading data:', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ 1. ดึงข้อมูลนัดหมายครั้งถัดไปจากฐานข้อมูล
  const loadNextAppointment = async (pid: string) => {
    try {
      console.log('📅 Loading next appointment for:', pid);
      const { data, error } = await supabase
        .from('appointments')
        .select('appointment_date, appointment_type, status')
        .eq('user_id', pid)
        .eq('status', 'scheduled')
        .gte('appointment_date', new Date().toISOString())
        .order('appointment_date', { ascending: true })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching next appointment:', error);
      }

      console.log('📋 Next appointment:', data);
      setNextAppointment(data || null);
    } catch (err) {
      console.error('Error in loadNextAppointment:', err);
      setNextAppointment(null);
    }
  };

  // ✅ 2. นับจำนวนครั้งการประเมินจากฐานข้อมูล
  const loadScreeningCount = async (pid: string) => {
    try {
      console.log('📊 Loading screening count for:', pid);
      const { count, error } = await supabase
        .from('screenings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', pid)
        .not('pam_total_score', 'is', null);

      if (error) {
        console.error('Error counting screenings:', error);
        setScreeningCount(0);
      } else {
        console.log('✅ Screening count:', count);
        setScreeningCount(count || 0);
      }
    } catch (err) {
      console.error('Error in loadScreeningCount:', err);
      setScreeningCount(0);
    }
  };

  // ✅ 3. นับจำนวนครั้งการติดตามจากฐานข้อมูล
  const loadFollowupCount = async (pid: string) => {
    try {
      console.log('📊 Loading followup count for:', pid);
      const { count, error } = await supabase
        .from('appointment_followups')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', pid);

      if (error) {
        console.error('Error counting followups:', error);
        setFollowupCount(0);
      } else {
        console.log('✅ Followup count:', count);
        setFollowupCount(count || 0);
      }
    } catch (err) {
      console.error('Error in loadFollowupCount:', err);
      setFollowupCount(0);
    }
  };

  // ✅ ฟังก์ชันแปลงวันที่ ค.ศ. → พ.ศ. สำหรับแสดงผล
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

  // ✅ ฟังก์ชันคำนวณอายุจากวันเกิด
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

  // ✅ ฟังก์ชันจัดการปุ่มกลับ - กลับไปตามที่มา
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

  // ✅ ฟังก์ชันตรวจสอบสิทธิ์การลบ (อสม. ลบไม่ได้)
  const canDeleteData = () => {
    return user?.role !== 'osm';
  };

  // ✅ ฟังก์ชันแสดง Badge บทบาท
  const getRoleBadge = () => {
    if (!user) return null;
    
    const roleConfig: any = {
      'osm': { 
        text: '🏘️ อสม.', 
        bg: 'bg-orange-100', 
        textCol: 'text-orange-700'
      },
      'admin': { 
        text: isSuperAdmin(user) ? '👑 Super Admin' : '🏥 Hospital Admin', 
        bg: isSuperAdmin(user) ? 'bg-purple-100' : 'bg-blue-100',
        textCol: isSuperAdmin(user) ? 'text-purple-700' : 'text-blue-700'
      },
      'doctor': { 
        text: '👨‍⚕️ แพทย์', 
        bg: 'bg-green-100', 
        textCol: 'text-green-700'
      },
      'helper': { 
        text: '👩‍⚕️ เจ้าหน้าที่', 
        bg: 'bg-yellow-100', 
        textCol: 'text-yellow-700'
      }
    };

    const config = roleConfig[user.role] || { 
      text: user.role, 
      bg: 'bg-gray-100', 
      textCol: 'text-gray-700'
    };

    return (
      <span className={`px-2 py-1 ${config.bg} ${config.textCol} rounded text-xs font-semibold`}>
        {config.text}
      </span>
    );
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
            
            {/* ✅ การ์ดแสดงข้อมูลผู้ใช้งาน */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-gray-800 text-sm">
                      {user?.full_name_th || 'ผู้ใช้งาน'}
                    </h3>
                    {getRoleBadge()}
                  </div>
                  
                  {/* ข้อมูลโรงพยาบาล */}
                  {userHospital && (
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Hospital className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                        <span className="truncate font-medium">
                          {userHospital.name}
                        </span>
                      </div>
                      
                      {/* แสดงประเภทโรงพยาบาล */}
                      {userHospital.type === 'sub' && userHospital.parent_hospital && (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">
                            ลูกข่าย: {userHospital.parent_hospital.name}
                          </span>
                        </div>
                      )}
                      
                      {userHospital.type === 'main' && (
                        <div className="flex items-center gap-1.5 text-purple-600">
                          <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span>แม่ข่าย</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
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
        
        {/* 
        ========================================
        ✅ SUMMARY CARDS - ปุ่มนำทางหลัก 4 ปุ่ม
        ========================================
        */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          
          {/* ✅ 1. ปุ่มสีฟ้า - นัดหมายครั้งถัดไป */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">นัดหมายครั้งถัดไป</p>
                {/* ✅ แสดงวันที่จากฐานข้อมูล หรือ "ไม่มี" */}
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

          {/* ✅ 2. ปุ่มสีเขียว - การประเมินล่าสุด */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">การประเมินล่าสุด</p>
                <p className="text-2xl font-bold">
                  {screeningCount > 0 ? 'มีการประเมิน' : 'ยังไม่ประเมิน'}
                </p>
                <p className="text-xs opacity-75 mt-1">
                  {screeningCount > 0 ? `${screeningCount} ครั้ง` : '0 ครั้ง'}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* ✅ 3. ปุ่มสีม่วง - ติดตามล่าสุด */}
          <div 
            onClick={() => router.push(`/admin/patients/${patientId}/followup-history`)}
            className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl shadow-lg p-6 cursor-pointer hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm opacity-90 mb-1">ติดตามล่าสุด</p>
                <p className="text-2xl font-bold">
                  {followupCount > 0 ? `${followupCount} ครั้ง` : 'ยังไม่ติดตาม'}
                </p>
                <p className="text-xs opacity-75 mt-1">
                  {followupCount > 0 ? 'มีข้อมูล' : 'ไม่มีข้อมูล'}
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* ✅ 4. ปุ่มสีส้ม - ความคืบหน้า */}
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

        {/* 
        ========================================
        ✅ ACTION BUTTONS - ปุ่มเพิ่มเติม
        ========================================
        */}
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
            onClick={() => router.push(`/admin/patients/${patientId}/followup-history`)}
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

        {/* 
        ========================================
        ✅ Patient Info Cards - ข้อมูลผู้ป่วย
        ========================================
        */}
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

          {/* ✅ ข้อมูลสุขภาพ (แก้ไขแล้ว) */}
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
              {/* ✅ เพิ่มค่าน้ำตาล (แทนวันที่วินิจฉัย) */}
              <div>
                <p className="text-gray-500">ค่าน้ำตาล (mg/dL)</p>
                <p className="font-semibold">{patient?.blood_sugar || '-'}</p>
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

          {/* ที่อยู่ + โรงพยาบาล */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              📍 ที่อยู่และโรงพยาบาล
            </h2>
            <div className="space-y-3 text-sm">
              {/* ที่อยู่ */}
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
              
              {/* ✅ แสดงข้อมูลโรงพยาบาล (แทน รพสต) */}
              <div className="border-t border-gray-200 pt-3 mt-3">
                <div className="flex items-center gap-2 mb-2">
                  <Hospital className="w-4 h-4 text-blue-600" />
                  <p className="font-bold text-gray-800">โรงพยาบาลสังกัด</p>
                </div>
                
                {patient?.hospitals ? (
                  <div className="space-y-2">
                    {/* ชื่อโรงพยาบาล */}
                    <div>
                      <p className="text-gray-500 text-xs">ชื่อโรงพยาบาล</p>
                      <p className="font-semibold text-gray-800">
                        {patient.hospitals.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        ({patient.hospitals.code})
                      </p>
                    </div>
                    
                    {/* ประเภทโรงพยาบาล */}
                    <div>
                      <p className="text-gray-500 text-xs">ประเภท</p>
                      <div className="flex items-center gap-2">
                        {patient.hospitals.type === 'main' ? (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                            🏥 แม่ข่าย
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                            🏥 ลูกข่าย
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Hospital className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-gray-500 text-sm">
                      ไม่มีข้อมูลโรงพยาบาล
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 
        ========================================
        ✅ Emergency Contact - ผู้ติดต่อฉุกเฉิน (1 คน)
        ========================================
        */}
        <div className="mt-8 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Heart className="w-6 h-6 text-red-500" />
            ผู้ติดต่อฉุกเฉิน
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* ผู้ติดต่อฉุกเฉิน (1 คน) */}
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