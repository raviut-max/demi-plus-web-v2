// app/admin/patients/[id]/page.tsx
// ✅ แก้ไขล่าสุด: 22 เมษายน 2569
// ✅ การแก้ไข:
//    1. เพิ่มส่วนสรุปผลการประเมินล่าสุด (PAM, PROMs, Level, Zone)
//    2. เอาส่วนเป้าหมายออก (ไม่แสดงในหน้านี้)
//    3. แสดงสถานะการประเมินจาก screening ล่าสุด

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  checkSession,
  logout,
  getPatientDetail,
  getScreeningHistory
} from '@/lib/supabase/queries';
import {
  ArrowLeft,
  Target,
  TrendingUp,
  Calendar,
  CheckCircle,
  Clock,
  Edit,
  LogOut,
  Activity,
  ClipboardCheck,
  FileText,
  Heart
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;
  
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<any>(null);
  const [latestScreening, setLatestScreening] = useState<any>(null);
  
  // ✅ State สำหรับตรวจสอบการประเมิน
  const [hasBaseline, setHasBaseline] = useState(false);
  const [hasCompletedAppointment, setHasCompletedAppointment] = useState(false);
  const [hasPamAssessment, setHasPamAssessment] = useState(false);

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
      const patientData = await getPatientDetail(patientId);
      setPatient(patientData);

      // ✅ โหลด screening ล่าสุด
      await loadLatestScreening(patientId);
      
      // ✅ ตรวจสอบสถานะการประเมิน
      await checkAssessmentStatus(patientId);
    } catch (error) {
      console.error('Error loading ', error);
      alert('เกิดข้อผิดพลาดในการโหลดข้อมูล');
    } finally {
      setLoading(false);
    }
  };

  // ✅ โหลด screening ล่าสุด
  const loadLatestScreening = async (pid: string) => {
    try {
      const {  screeningData } = await supabase
        .from('screenings')
        .select('*')
        .eq('user_id', pid)
        .order('screening_date', { ascending: false })
        .limit(1)
        .single();

      if (screeningData) {
        setLatestScreening(screeningData);
        console.log('📋 Latest screening:', screeningData);
      }
    } catch (error) {
      console.error('Error loading latest screening:', error);
    }
  };

  // ✅ ฟังก์ชันตรวจสอบสถานะการประเมิน
  const checkAssessmentStatus = async (pid: string) => {
    try {
      // ตรวจสอบ Baseline
      const {  baselineData } = await supabase
        .from('baseline')
        .select('id')
        .eq('user_id', pid)
        .single();
      
      setHasBaseline(!!baselineData);

      // ตรวจสอบ Completed Appointments
      const {  appointmentsData } = await supabase
        .from('appointments')
        .select('id')
        .eq('user_id', pid)
        .eq('status', 'completed')
        .limit(1);
      
      setHasCompletedAppointment((appointmentsData?.length || 0) > 0);

      // ตรวจสอบ PAM Assessment (จาก screenings)
      const {  screeningData } = await supabase
        .from('screenings')
        .select('id, pam_total_score')
        .eq('user_id', pid)
        .not('pam_total_score', 'is', null)
        .limit(1);
      
      setHasPamAssessment((screeningData?.length || 0) > 0);
      
      console.log('📋 Assessment Status:', {
        hasBaseline,
        hasCompletedAppointment,
        hasPamAssessment
      });
    } catch (error) {
      console.error('Error checking assessment status:', error);
    }
  };

  // ✅ คำนวณคะแนน PROMs รวม
  const calculatePromsTotal = () => {
    if (!latestScreening) return 0;
    return (latestScreening.proms_q1_score || 0) +
           (latestScreening.proms_q2_score || 0) +
           (latestScreening.proms_q3_score || 0) +
           (latestScreening.proms_q4_score || 0);
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
          <button
            onClick={() => router.push('/admin/patients')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            กลับรายการผู้ป่วย
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
              
              {/* ✅ แสดงปุ่ม "มีการติดตามแล้ว" ถ้ามีการประเมินแล้ว */}
              {(hasBaseline || hasCompletedAppointment || hasPamAssessment) && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-lg border border-green-200">
                  <ClipboardCheck className="w-4 h-4" />
                  <span>มีการติดตามแล้ว</span>
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
                <p className="text-2xl font-bold">28 เม.ย.</p>
                <p className="text-xs opacity-75 mt-1">17:26</p>
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
                <p className="text-2xl font-bold">{hasPamAssessment ? 'มีการประเมิน' : 'ยังไม่ประเมิน'}</p>
                <p className="text-xs opacity-75 mt-1">{hasPamAssessment ? '1 ครั้ง' : '0 ครั้ง'}</p>
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
                <p className="text-2xl font-bold">21 เม.ย.</p>
                <p className="text-xs opacity-75 mt-1">ดี</p>
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
        ✅ สรุปผลการประเมินล่าสุด (ใหม่)
        ========================================
        */}
        {latestScreening && (
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-xl shadow-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 text-yellow-600" />
              <h2 className="text-xl font-bold text-gray-800">📊 สรุปผลการประเมินล่าสุด</h2>
              <span className="text-sm text-gray-500 ml-2">
                ({new Date(latestScreening.screening_date).toLocaleDateString('th-TH', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })})
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* คะแนน PAM */}
              <div className="bg-white bg-opacity-75 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <p className="text-sm text-gray-600">คะแนน PAM</p>
                </div>
                <p className="text-3xl font-bold text-purple-600">
                  {latestScreening.pam_total_score || 0} / 20
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  เฉลี่ย: {((latestScreening.pam_total_score || 0) / 5).toFixed(1)} / 4
                </p>
              </div>

              {/* คะแนน PROMs */}
              <div className="bg-white bg-opacity-75 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Heart className="w-5 h-5 text-green-600" />
                  <p className="text-sm text-gray-600">คะแนน PROMs</p>
                </div>
                <p className="text-3xl font-bold text-green-600">
                  {calculatePromsTotal()} / 24
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  เฉลี่ย: {(calculatePromsTotal() / 4).toFixed(1)} / 6
                </p>
              </div>

              {/* PAM Level */}
              <div className="bg-white bg-opacity-75 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  <p className="text-sm text-gray-600">PAM Level</p>
                </div>
                <p className={`text-2xl font-bold ${
                  latestScreening.pam_level_result === 'L1' ? 'text-red-600' :
                  latestScreening.pam_level_result === 'L2' ? 'text-yellow-600' :
                  latestScreening.pam_level_result === 'L3' ? 'text-blue-600' :
                  'text-green-600'
                }`}>
                  {latestScreening.pam_level_result || 'L1'}
                </p>
                <p className="text-xs text-gray-500 mt-1">ระดับความพร้อม</p>
              </div>

              {/* Zone */}
              <div className="bg-white bg-opacity-75 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-5 h-5 text-orange-600" />
                  <p className="text-sm text-gray-600">Zone</p>
                </div>
                <p className={`text-xl font-bold ${
                  latestScreening.proms_zone === 'Red Zone' ? 'text-red-600' :
                  latestScreening.proms_zone === 'Yellow Zone' ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {latestScreening.proms_zone || 'Green Zone'}
                </p>
                <p className="text-xs text-gray-500 mt-1">โซนความเสี่ยง</p>
              </div>
            </div>

            {/* คะแนนรวม */}
            <div className="mt-4 pt-4 border-t border-yellow-300">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">คะแนนรวม</p>
                <p className="text-lg font-bold text-gray-800">
                  {(latestScreening.pam_total_score || 0) + calculatePromsTotal()} / 44
                  {' '}({(((latestScreening.pam_total_score || 0) + calculatePromsTotal()) / 44) * 100).toFixed(1)}%)
                </p>
              </div>
              <div className="mt-2 w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all"
                  style={{ 
                    width: `${(((latestScreening.pam_total_score || 0) + calculatePromsTotal()) / 44) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {/* ถ้ายังไม่มี screening */}
        {!latestScreening && (
          <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-12 text-center mb-6">
            <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-bold text-gray-600 mb-2">ยังไม่มีผลการประเมิน</h3>
            <p className="text-gray-500 mb-4">ผู้ป่วยคนนี้ยังไม่ได้ทำการประเมิน PAM/PROMs</p>
            <button
              onClick={() => router.push(`/admin/screening?patient_id=${patientId}`)}
              className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all"
            >
              เริ่มการประเมินครั้งแรก
            </button>
          </div>
        )}

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
                <p className="font-semibold">{patient?.first_name} {patient?.last_name}</p>
              </div>
              <div>
                <p className="text-gray-500">วันเกิด</p>
                <p className="font-semibold">{patient?.birth_date || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อายุ</p>
                <p className="font-semibold">{patient?.age || '-'} ปี</p>
              </div>
              <div>
                <p className="text-gray-500">เพศ</p>
                <p className="font-semibold">{patient?.gender === 'male' ? 'ชาย' : 'หญิง'}</p>
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
                <p className="text-gray-500">บัตรประชาชน</p>
                <p className="font-semibold">{patient?.id_card || '-'}</p>
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
                  {patient?.current_weight && patient?.height 
                    ? (patient.current_weight / ((patient.height / 100) ** 2)).toFixed(1)
                    : '-'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">ประเภทเบาหวาน</p>
                <p className="font-semibold">{patient?.diabetes_type || 'กลุ่มเสี่ยง'}</p>
              </div>
              <div>
                <p className="text-gray-500">วันที่วินิจฉัย</p>
                <p className="font-semibold">{patient?.diagnosed_date || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">ค่า HbA1c</p>
                <p className="font-semibold">{patient?.hba1c_level || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">หมายเหตุ</p>
                <p className="font-semibold">{patient?.notes || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">อาชีพ</p>
                <p className="font-semibold">{patient?.occupation || '-'}</p>
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
                <p className="text-gray-500">ที่อยู่เดิม</p>
                <p className="font-semibold">
                  {patient?.house_number} {patient?.address_line1} {patient?.soi} {patient?.road}
                </p>
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
                <p className="text-gray-500">โรงพยาบาล</p>
                <p className="font-semibold text-red-600">{patient?.hospital_name || '-'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}