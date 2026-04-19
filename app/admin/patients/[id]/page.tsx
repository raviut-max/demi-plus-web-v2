// app/admin/patients/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getNextPatientAppointment,
  getLatestScreening,
  getLatestFollowup,
  getPatientGoalsStats,
  getScreeningCount,
  getGoalsCount
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  LogOut,
  Edit,
  FileText,
  Activity,
  MapPin,
  Phone,
  User,
  Hospital,
  Calendar,
  Target,
  TrendingUp,
  ImageIcon,
  ClipboardList,
  Archive
} from 'lucide-react';

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  // ✅ State สำหรับข้อมูลผู้ใช้และผู้ป่วย
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);

  // 📊 State สำหรับการ์ดสรุปข้อมูลสำคัญ
  const [nextAppointment, setNextAppointment] = useState<any>(null);
  const [latestScreening, setLatestScreening] = useState<any>(null);
  const [latestFollowup, setLatestFollowup] = useState<any>(null);
  const [goalsStats, setGoalsStats] = useState({ total: 0, completed: 0 });
  const [screeningCount, setScreeningCount] = useState(0);
  const [goalsCount, setGoalsCount] = useState(0);
  const [cardsLoading, setCardsLoading] = useState(true);

  // =====================================================
  // 🔐 ตรวจสอบ Session และสิทธิ์ผู้ใช้
  // =====================================================
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

  // =====================================================
  // 📥 โหลดข้อมูลผู้ป่วย
  // =====================================================
  const loadPatientData = async () => {
    try {
      console.log('🔍 Loading patient data for ID:', patientId);
      const data = await getPatientDetail(patientId);
      setPatient(data);
      
      // ✅ โหลดข้อมูลการ์ดสรุป
      await loadSummaryCards();
      
      console.log('✅ Patient data loaded successfully');
    } catch (error) {
      console.error('❌ Error loading patient data:', error);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // 📊 โหลดข้อมูลการ์ดสรุป (4 การ์ดด้านบน)
  // =====================================================
  const loadSummaryCards = async () => {
    try {
      console.log('📊 Loading summary cards for patient:', patientId);
      
      const [
        nextApt,
        latestScreen,
        latestFup,
        goalsStat,
        screenCnt,
        goalsCnt
      ] = await Promise.all([
        getNextPatientAppointment(patientId),
        getLatestScreening(patientId),
        getLatestFollowup(patientId),
        getPatientGoalsStats(patientId),
        getScreeningCount(patientId),
        getGoalsCount(patientId),
      ]);

      setNextAppointment(nextApt);
      setLatestScreening(latestScreen);
      setLatestFollowup(latestFup);
      setGoalsStats(goalsStat);
      setScreeningCount(screenCnt);
      setGoalsCount(goalsCnt);

      console.log('✅ Summary cards loaded');
    } catch (err) {
      console.error('❌ Error loading summary cards:', err);
    } finally {
      setCardsLoading(false);
    }
  };

  // =====================================================
  // 🚪 ออกจากระบบ
  // =====================================================
  const handleLogout = () => {
    logout();
    router.push('/admin/login');
  };

  // =====================================================
  // 📅 จัดรูปแบบวันที่ (DD/MM/YYYY)
  // =====================================================
  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // =====================================================
  // 🎂 คำนวณอายุจากวันเกิด
  // =====================================================
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

  // =====================================================
  // 👤 แสดงชื่อผู้ป่วย (รวม first_name + last_name)
  // =====================================================
  const getPatientName = () => {
    if (patient?.first_name && patient?.last_name) {
      return `${patient.first_name} ${patient.last_name}`;
    }
    return patient?.full_name || 'ไม่ระบุชื่อ';
  };

  // =====================================================
  // 🏠 แสดงที่อยู่เต็มรูปแบบ
  // =====================================================
  const getFullAddress = () => {
    if (!patient) return '-';
    const parts = [
      patient.house_number,
      patient.address_line1,
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

  // =====================================================
  // ⏳ แสดงหน้าโหลด
  // =====================================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // =====================================================
  // ⚠️ กรณีไม่พบข้อมูลผู้ป่วย
  // =====================================================
  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">ไม่พบข้อมูลผู้ป่วย</h1>
          <button
            onClick={() => router.push('/admin/patients')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            ← กลับรายการผู้ป่วย
          </button>
        </div>
      </div>
    );
  }

  // =====================================================
  // 🎨 แสดงหน้าข้อมูลผู้ป่วย
  // =====================================================
  return (
    <div className="min-h-screen bg-gray-50">
      
      {/* =====================================================
          Header - ส่วนหัวของหน้า
          ===================================================== */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          
          {/* ปุ่มกลับ */}
          <button
            onClick={() => router.push('/admin/patients')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับรายการผู้ป่วย
          </button>
          
          {/* ชื่อผู้ป่วยและ HN */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                รายละเอียดผู้ป่วย
              </h1>
              <p className="text-gray-600">
                HN: {patient.hospital_number} | {getPatientName()}
              </p>
            </div>

            {/* ปุ่มจัดการ */}
            <div className="flex flex-wrap gap-2">
              {/* ✅ ปุ่มแก้ไขข้อมูล */}
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/edit`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all"
              >
                <Edit className="w-4 h-4" />
                แก้ไขข้อมูล
              </button>

              {/* ✅ ปุ่มบันทึกข้อมูลเริ่มต้น (ครั้งที่ 0) - ใหม่ */}
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/baseline`)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
              >
                <FileText className="w-4 h-4" />
                บันทึกข้อมูลเริ่มต้น
              </button>

              {/* ✅ ปุ่มติดตามสถานะ */}
              <button
                onClick={() => router.push(`/admin/patients/${patientId}/status-tracking`)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-all"
              >
                <ImageIcon className="w-4 h-4" />
                ติดตามสถานะ
              </button>

              {/* ✅ ปุ่มออกจากระบบ */}
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

      {/* =====================================================
          Main Content - เนื้อหาหลัก
          ===================================================== */}
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* =====================================================
            Summary Cards - การ์ดสรุปข้อมูลสำคัญ (4 การ์ด)
            ===================================================== */}
        {!cardsLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

            {/* 📅 การ์ดที่ 1: นัดหมายครั้งถัดไป */}
            <div
              className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            >
              <div className="flex items-center justify-between mb-3">
                <Calendar className="w-8 h-8 opacity-90" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {nextAppointment ? 'มีนัด' : 'ไม่มีนัด'}
                </span>
              </div>
              <p className="text-sm opacity-75 mb-1">นัดหมายครั้งถัดไป</p>
              {nextAppointment ? (
                <>
                  <p className="text-xl font-bold">
                    {new Date(nextAppointment.appointment_date).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </p>
                  <p className="text-sm opacity-90">
                    {new Date(nextAppointment.appointment_date).toLocaleTimeString('th-TH', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                  <p className="text-xs opacity-75 mt-2">
                    {nextAppointment.doctors?.full_name_th || 'แพทย์'}
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold opacity-90">-</p>
              )}
            </div>

            {/* 📊 การ์ดที่ 2: การประเมินล่าสุด */}
            <div
              className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            >
              <div className="flex items-center justify-between mb-3">
                <FileText className="w-8 h-8 opacity-90" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {screeningCount} ครั้ง
                </span>
              </div>
              <p className="text-sm opacity-75 mb-1">การประเมินล่าสุด</p>
              {latestScreening ? (
                <>
                  <p className="text-xl font-bold">
                    {new Date(latestScreening.screening_date).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      latestScreening.pam_level_result === 'Deny' ? 'bg-red-200 text-red-800' :
                      latestScreening.pam_level_result === 'General' ? 'bg-yellow-200 text-yellow-800' :
                      latestScreening.pam_level_result === 'Intensive' ? 'bg-blue-200 text-blue-800' :
                      'bg-green-200 text-green-800'
                    }`}>
                      {latestScreening.pam_level_result || 'L1'}
                    </span>
                    <span className="text-xs opacity-90">
                      {latestScreening.proms_zone || 'Green Zone'}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-lg font-bold opacity-90">ยังไม่ประเมิน</p>
              )}
            </div>

            {/* 🏥 การ์ดที่ 3: Follow-up ล่าสุด */}
            <div
              className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              onClick={() => router.push(`/admin/patients/${patientId}/followup-history`)}
            >
              <div className="flex items-center justify-between mb-3">
                <Activity className="w-8 h-8 opacity-90" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {latestFollowup ? `ครั้งที่ ${latestFollowup.followup_round}` : '-'}
                </span>
              </div>
              <p className="text-sm opacity-75 mb-1">ติดตามล่าสุด</p>
              {latestFollowup ? (
                <>
                  <p className="text-xl font-bold">
                    {new Date(latestFollowup.followup_date).toLocaleDateString('th-TH', {
                      day: 'numeric',
                      month: 'short'
                    })}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                      latestFollowup.followup_status === 'excellent' ? 'bg-green-200 text-green-800' :
                      latestFollowup.followup_status === 'good' ? 'bg-blue-200 text-blue-800' :
                      latestFollowup.followup_status === 'fair' ? 'bg-yellow-200 text-yellow-800' :
                      latestFollowup.followup_status === 'needs_improvement' ? 'bg-orange-200 text-orange-800' :
                      'bg-red-200 text-red-800'
                    }`}>
                      {latestFollowup.followup_status === 'excellent' ? 'ดีมาก' :
                       latestFollowup.followup_status === 'good' ? 'ดี' :
                       latestFollowup.followup_status === 'fair' ? 'พอใช้' :
                       latestFollowup.followup_status === 'needs_improvement' ? 'ปรับปรุง' :
                       'เฝ้าระวัง'}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-lg font-bold opacity-90">ยังไม่ติดตาม</p>
              )}
            </div>

            {/* 🎯 การ์ดที่ 4: เป้าหมาย */}
            <div
              className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-all cursor-pointer"
              onClick={() => router.push(`/admin/patients/${patientId}/goals`)}
            >
              <div className="flex items-center justify-between mb-3">
                <Target className="w-8 h-8 opacity-90" />
                <span className="text-xs bg-white/20 px-2 py-1 rounded-full">
                  {goalsStats.total} เป้าหมาย
                </span>
              </div>
              <p className="text-sm opacity-75 mb-1">ความคืบหน้า</p>
              {goalsStats.total > 0 ? (
                <>
                  <p className="text-2xl font-bold">
                    {goalsStats.completed} / {goalsStats.total}
                  </p>
                  <div className="w-full bg-white/20 rounded-full h-2 mt-2">
                    <div
                      className="bg-white h-2 rounded-full transition-all"
                      style={{ width: `${(goalsStats.completed / goalsStats.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs opacity-90 mt-1">
                    {Math.round((goalsStats.completed / goalsStats.total) * 100)}% สำเร็จ
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold opacity-90">ยังไม่มีเป้าหมาย</p>
              )}
            </div>
          </div>
        )}

        {/* =====================================================
            Quick Actions - ปุ่มดูประวัติเพิ่มเติม
            ===================================================== */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/screening-history`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-gray-700"
          >
            <FileText className="w-4 h-4" />
            ดูประวัติการประเมิน ({screeningCount})
          </button>

          <button
            onClick={() => router.push(`/admin/patients/${patientId}/goals`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-gray-700"
          >
            <Target className="w-4 h-4" />
            ดูประวัติเป้าหมาย ({goalsCount})
          </button>

          <button
            onClick={() => router.push(`/admin/patients/${patientId}/appointments`)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-all text-gray-700"
          >
            <Calendar className="w-4 h-4" />
            ดูประวัตินัดหมาย
          </button>

          {/* ✅ ปุ่มติดตามสถานะ */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/status-tracking`)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 transition-all text-purple-700"
          >
            <ImageIcon className="w-4 h-4" />
            ติดตามสถานะ
          </button>

          {/* ✅ ปุ่มบันทึกข้อมูลเริ่มต้น (ครั้งที่ 0) - ใหม่ */}
          <button
            onClick={() => router.push(`/admin/patients/${patientId}/baseline`)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-300 rounded-lg hover:bg-purple-100 transition-all text-purple-700"
          >
            <FileText className="w-4 h-4" />
            บันทึกข้อมูลเริ่มต้น
          </button>
        </div>

        {/* =====================================================
            Patient Info Grid - ตารางข้อมูลผู้ป่วย (3 คอลัมน์)
            ===================================================== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* =====================================================
              คอลัมน์ที่ 1: ข้อมูลส่วนตัว
              ===================================================== */}
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

          {/* =====================================================
              คอลัมน์ที่ 2: ข้อมูลสุขภาพ
              ===================================================== */}
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

          {/* =====================================================
              คอลัมน์ที่ 3: ที่อยู่
              ===================================================== */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-purple-600" />
              <h2 className="text-xl font-bold text-gray-800">ที่อยู่</h2>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500">ที่อยู่เต็ม</p>
                <p className="font-semibold">{getFullAddress()}</p>
              </div>

              {patient.address_line1 && (
                <div>
                  <p className="text-sm text-gray-500">ที่อยู่เพิ่มเติม</p>
                  <p className="font-semibold">{patient.address_line1}</p>
                </div>
              )}

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

          {/* =====================================================
              แถวที่ 2: ผู้ติดต่อฉุกเฉิน
              ===================================================== */}
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

          {/* =====================================================
              แถวที่ 2: สถานะการประเมิน (กว้าง 2 คอลัมน์)
              ===================================================== */}
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-5 h-5 text-orange-600" />
              <h2 className="text-xl font-bold text-gray-800">สถานะการประเมิน</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* PAM Level */}
              <div className={`p-4 rounded-lg border-2 ${
                patient.pam_level === 'L1' ? 'bg-red-50 border-red-500' :
                patient.pam_level === 'L2' ? 'bg-yellow-50 border-yellow-500' :
                patient.pam_level === 'L3' ? 'bg-blue-50 border-blue-500' :
                'bg-green-50 border-green-500'
              }`}>
                <p className="text-sm text-gray-600 mb-1">PAM Level</p>
                <p className="text-2xl font-bold">{patient.pam_level || 'L1'}</p>
              </div>

              {/* Zone */}
              <div className={`p-4 rounded-lg border-2 ${
                patient.zone === 'Red Zone' ? 'bg-red-50 border-red-500' :
                patient.zone === 'Yellow Zone' ? 'bg-yellow-50 border-yellow-500' :
                'bg-green-50 border-green-500'
              }`}>
                <p className="text-sm text-gray-600 mb-1">Zone</p>
                <p className="text-lg font-bold">{patient.zone || 'Green Zone'}</p>
              </div>

              {/* Step */}
              <div className="p-4 rounded-lg border-2 bg-purple-50 border-purple-500">
                <p className="text-sm text-gray-600 mb-1">Step</p>
                <p className="text-lg font-bold">{patient.current_step || 'Starter'}</p>
              </div>

              {/* PAM Score */}
              <div className="p-4 rounded-lg border-2 bg-orange-50 border-orange-500">
                <p className="text-sm text-gray-600 mb-1">คะแนน PAM</p>
                <p className="text-2xl font-bold">{patient.pam_score || 18}</p>
              </div>
            </div>
          </div>

          {/* =====================================================
              แถวที่ 3: ข้อมูลอื่นๆ
              ===================================================== */}
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